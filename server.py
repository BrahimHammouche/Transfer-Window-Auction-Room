import json
import random
import threading
import asyncio
import base64
import hashlib
import hmac
import os
import secrets
import time
from pathlib import Path
from typing import Dict, Set, Tuple
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from match_engine import simulate_match
from database import GameDatabase

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
PLAYERS_FILE = DATA / "players.json"
BUDGET = 100
SQUAD_SIZE = 11
MIN_MANAGERS = 2
MAX_MANAGERS = 8
TEST_TEAM_MIN = 4
AUCTION_CARDS = ("freeze", "scout_report", "bid_shield", "hijack")
MATCH_CARDS = ("out_of_position", "captains_gambit", "counter_attack", "park_the_bus", "team_talk")
AUTH_SECRET = os.getenv("AUTH_SECRET", "local-development-secret-change-before-deploy").encode("utf-8")
FORMATION_ROLES = {
    "4-3-3": ["GK", "LB", "CB", "CB", "RB", "CM", "CM", "CM", "LW", "ST", "RW"],
    "4-2-3-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "CDM", "LW", "CAM", "RW", "ST"],
    "4-4-2": ["GK", "LB", "CB", "CB", "RB", "LM", "CM", "CM", "RM", "ST", "ST"],
    "3-5-2": ["GK", "CB", "CB", "CB", "LWB", "CM", "CDM", "CM", "RWB", "ST", "ST"],
    "3-4-3": ["GK", "CB", "CB", "CB", "LM", "CM", "CM", "RM", "LW", "ST", "RW"],
    "4-1-4-1": ["GK", "LB", "CB", "CB", "RB", "CDM", "LM", "CM", "CM", "RM", "ST"],
}
ATTACK_ROLES = {"LW", "RW", "ST", "CF", "SS", "CAM", "LM", "RM"}
MIDFIELD_ROLES = {"CDM", "CM", "CAM", "LM", "RM"}
DEFENCE_ROLES = {"GK", "LB", "LWB", "CB", "RB", "RWB", "CDM"}

app = FastAPI(title="Transfer Auction Multiplayer")
app.mount("/data", StaticFiles(directory=DATA), name="data")
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")
_db_lock = threading.RLock()
_connections: Dict[str, Set[WebSocket]] = {}
_presence: Dict[str, Set[str]] = {}
_socket_players: Dict[WebSocket, Tuple[str, str]] = {}
_live_match_tasks: Dict[Tuple[str, str], asyncio.Task] = {}
_player_image_cache: Dict[str, str | None] = {}
game_store = GameDatabase(ROOT)


MANAGER_CHARACTERS = {"tactician", "analyst", "enforcer", "maverick", "legend", "maestro", "academy"}


def new_team(user_id=None):
    return {"budget": BUDGET, "spent": 0, "squad": [], "userId": user_id, "displayName": None, "logo": None, "character": "tactician"}


def team_names(state):
    return list((state.get("teams") or {}).keys())


def deal_cards(card_types, count, excluded=()):
    available = [card for card in card_types if card not in set(excluded)]
    return random.sample(available, min(count, len(available)))


def ensure_card_hand(state, team_name):
    cards = state.setdefault("cards", {}).setdefault("hands", {})
    if team_name not in cards:
        hand = deal_cards(AUCTION_CARDS, 2)
        squad_count = len(state.get("teams", {}).get(team_name, {}).get("squad", []))
        if squad_count >= 5:
            hand.extend(deal_cards(AUCTION_CARDS, 1, hand))
        if squad_count >= SQUAD_SIZE:
            hand.extend(deal_cards(MATCH_CARDS, 2, hand))
        cards[team_name] = hand
    return cards[team_name]


def use_card_from_hand(state, team_name, card):
    hand = ensure_card_hand(state, team_name)
    if card not in hand:
        raise HTTPException(400, "You do not own that card")
    hand.remove(card)


def grant_signing_rewards(state, team_name):
    squad_count = len(state["teams"][team_name].get("squad", []))
    hand = ensure_card_hand(state, team_name)
    rewards = state.setdefault("cards", {}).setdefault("rewards", {}).setdefault(team_name, {})
    if squad_count >= 5 and not rewards.get("five_signings"):
        hand.extend(deal_cards(AUCTION_CARDS, 1, hand))
        rewards["five_signings"] = True
    if squad_count >= SQUAD_SIZE and not rewards.get("complete_xi"):
        hand.extend(deal_cards(MATCH_CARDS, 2, hand))
        rewards["complete_xi"] = True


def supported_manager_count(names):
    """Every phase after the auction needs a real multiplayer room."""
    return MIN_MANAGERS <= len(names) <= MAX_MANAGERS


def tournament_table(tournament, names):
    """Return a deterministic league table for any room size from 2 to 8."""
    table = {name: {"points": 0, "wins": 0, "goalsFor": 0, "goalsAgainst": 0} for name in names}
    for match in tournament.get("matches", []):
        if match.get("status") != "finished":
            continue
        home, away = match.get("home"), match.get("away")
        if home not in table or away not in table:
            continue
        score = match.get("score") or {}
        home_goals, away_goals = int(score.get("home", 0)), int(score.get("away", 0))
        table[home]["goalsFor"] += home_goals
        table[home]["goalsAgainst"] += away_goals
        table[away]["goalsFor"] += away_goals
        table[away]["goalsAgainst"] += home_goals
        winner = match.get("winner")
        if winner in table:
            table[winner]["wins"] += 1
            table[winner]["points"] += 3
    return sorted(names, key=lambda name: (table[name]["points"], table[name]["goalsFor"] - table[name]["goalsAgainst"], table[name]["goalsFor"], table[name]["wins"], name.lower()), reverse=True)


def complete_tournament_if_ready(state):
    tournament = state.get("tournament") or {}
    final = next((match for match in tournament.get("matches", []) if match.get("id") == tournament.get("finalMatchId")), None)
    if final and final.get("status") in {"finished", "bye"} and final.get("winner"):
        champion = final["winner"]
        tournament["champion"] = champion
        state["finalResult"] = {"type": "tournament", "winner": champion}
        return True
    return False


def advance_bracket_winner(tournament, match):
    next_id = match.get("nextMatch")
    if not next_id and match.get("id") != tournament.get("finalMatchId"):
        try:
            round_number, match_number = (int(part[1:]) for part in match["id"].split("-"))
            next_id = f"r{round_number + 1}-m{(match_number + 1) // 2}"
            match["nextSide"] = "home" if match_number % 2 else "away"
        except (KeyError, ValueError):
            return
    if not next_id:
        return
    next_match = next((item for item in tournament["matches"] if item.get("id") == next_id), None)
    if not next_match:
        return
    next_match["home" if match.get("nextSide") == "home" else "away"] = match.get("winner")


def resolve_bracket(tournament):
    """Turn empty first-round slots into byes and unlock downstream fixtures."""
    changed = True
    while changed:
        changed = False
        for match in tournament.get("matches", []):
            if match.get("status") not in {"locked", "void"}:
                continue
            sources = match.get("sources", [])
            if sources and not all(next(item for item in tournament["matches"] if item["id"] == source).get("status") in {"finished", "bye", "void"} for source in sources):
                continue
            home, away = match.get("home"), match.get("away")
            if home and away:
                if match.get("status") != "ready":
                    match["status"] = "ready"; changed = True
            elif home or away:
                match["status"] = "bye"; match["winner"] = home or away; advance_bracket_winner(tournament, match); changed = True
            elif sources or match.get("id", "").startswith("r1-"):
                match["status"] = "void"; advance_bracket_winner(tournament, match); changed = True


def team_for_match(state, team_name, effects):
    """Apply the cards assigned to this fixture without changing the saved squad."""
    team = json.loads(json.dumps(state["teams"][team_name]))
    tactics = team.setdefault("tactics", {})
    roles = tactics.setdefault("roles", {})
    active = [effect for effect in effects or [] if effect.get("targetTeam") == team_name]
    tactics["cardEffects"] = [effect.get("type") for effect in active]
    for effect in active:
        if effect.get("type") == "out_of_position":
            roles[str(effect["playerId"])] = effect["role"]
        elif effect.get("type") == "captains_gambit":
            captain = next((player for player in team.get("squad", []) if str(player.get("id") or player.get("name")) == str(effect.get("playerId"))), None)
            if captain:
                tactics["captainName"] = captain.get("name")
    return team


def default_state(host=None, host_user_id=None):
    teams = {host: new_team(host_user_id)} if host else {}
    return {
        "teams": teams,
        "usedPlayers": [],
        "positionCounts": {},
        "currentOffer": None,
        "finalResult": None,
        "evaluation": None,
        "results": None,
        "tournament": None,
        "cards": {"hands": {host: deal_cards(AUCTION_CARDS, 2)} if host else {}, "rewards": {}},
        "music": {"track": 0, "playing": False, "progress": 0},
        "host": host,
        "hostUserId": host_user_id,
        "phase": "auction",
        "updatedAt": 0,
    }


def normalize_state(state, host=None):
    if not isinstance(state, dict):
        state = default_state(host)
    state.setdefault("teams", {})
    for t in state["teams"].values():
        t.setdefault("budget", BUDGET)
        t.setdefault("spent", 0)
        t.setdefault("squad", [])
        t.setdefault("userId", None)
        t.setdefault("displayName", None)
        t.setdefault("logo", None)
        t.setdefault("character", "tactician")
    state.setdefault("usedPlayers", [])
    state.setdefault("positionCounts", {})
    state.setdefault("currentOffer", None)
    state.setdefault("finalResult", None)
    state.setdefault("evaluation", None)
    state.setdefault("results", None)
    state.setdefault("tournament", None)
    state.setdefault("cards", {"hands": {}})
    state["cards"].setdefault("hands", {})
    state["cards"].setdefault("rewards", {})
    state.setdefault("music", {"track": 0, "playing": False, "progress": 0})
    state["music"]["track"] = max(0, min(8, int(state["music"].get("track", 0) or 0)))
    state["music"]["playing"] = bool(state["music"].get("playing", False))
    state["music"]["progress"] = max(0, min(1, float(state["music"].get("progress", 0) or 0)))
    for name in state["teams"]:
        ensure_card_hand(state, name)
        grant_signing_rewards(state, name)
    state.setdefault("host", host)
    state.setdefault("hostUserId", None)
    state.setdefault("phase", "auction")
    state.setdefault("updatedAt", 0)
    if state.get("currentOffer"):
        o = state["currentOffer"]
        o.setdefault("currentBid", 0)
        o.setdefault("highestBidder", None)
        o.setdefault("dropped", [])
        o.setdefault("passed", [])
    if (state.get("tournament") or {}).get("format") == "knockout":
        for match in state["tournament"].get("matches", []):
            if match.get("status") in {"finished", "bye"} and match.get("winner"):
                advance_bracket_winner(state["tournament"], match)
        resolve_bracket(state["tournament"])
    return state


def load_players():
    data = json.loads(PLAYERS_FILE.read_text(encoding="utf-8"))
    return data if isinstance(data, list) else data.get("players", [])


def room_state(room):
    record = game_store.get_room(room)
    return normalize_state(record["state"]) if record else None


def persist_room(room, state):
    with _db_lock:
        state["updatedAt"] = int(time.time() * 1000)
        game_store.save_room(room, state.get("hostUserId") or "legacy", state, state["updatedAt"])
    return state


def public_state(room, state, viewer=None):
    out = json.loads(json.dumps(state))
    for match in (out.get("tournament") or {}).get("matches", []):
        match.pop("simulation", None)
    out["profiles"] = {}
    users = game_store.get_users_by_ids(team.get("userId") for team in out.get("teams", {}).values())
    for name, team in out.get("teams", {}).items():
        user_id = team.get("userId")
        user = users.get(user_id)
        if user:
            out["profiles"][name] = public_user(user)
    out["online"] = sorted(_presence.get(room, set()))
    cards = out.get("cards") or {}
    hands = cards.get("hands") or {}
    cards["hands"] = {name: hand if name == viewer else ["hidden"] * len(hand) for name, hand in hands.items()}
    if (cards.get("lastScout") or {}).get("owner") != viewer:
        cards.pop("lastScout", None)
    out["cards"] = cards
    return out


async def run_live_match(room, match_id):
    """Reveal a precomputed authoritative match timeline one event at a time."""
    task_key = (room, match_id)
    try:
        while True:
            with _db_lock:
                current_state = room_state(room)
                current_tournament = current_state.get("tournament") if current_state else None
                speed = float((current_tournament or {}).get("liveSpeed", 1))
            await asyncio.sleep(1 / max(0.5, min(3, speed)))
            finished = False
            with _db_lock:
                state = room_state(room)
                tournament = state.get("tournament") if state else None
                match = next((item for item in (tournament or {}).get("matches", []) if item.get("id") == match_id), None)
                simulation = match.get("simulation") if match else None
                if not match or match.get("status") != "live" or not simulation:
                    return
                index = int(match.get("liveIndex", 0))
                events = simulation.get("events", [])
                if index < len(events):
                    event = events[index]
                    match.setdefault("events", []).append(event)
                    match["liveIndex"] = index + 1
                    match["currentMinute"] = event.get("minute", 0)
                    if event.get("type") == "goal":
                        side = event.get("side") or ("away" if event.get("team") == match.get("away") else "home")
                        match.setdefault("score", {"home": 0, "away": 0})[side] += int(event.get("goalValue", 1))
                else:
                    round_name = match.get("round")
                    bracket_meta = {key: match.get(key) for key in ("sources", "nextMatch", "nextSide")}
                    match.clear()
                    match.update({"round": round_name, **bracket_meta, **simulation})
                    match.pop("simulation", None)
                    finished = True
                    advance_bracket_winner(tournament, match)
                    resolve_bracket(tournament)
                    complete_tournament_if_ready(state)
                persist_room(room, state)
            await broadcast(room, state)
            if finished:
                return
    finally:
        _live_match_tasks.pop(task_key, None)


async def broadcast(room, state, snapshot=None):
    dead = []
    for ws in list(_connections.get(room, set())):
        try:
            viewer = _socket_players.get(ws, (None, None))[1]
            message = json.dumps({"type": "state", "state": public_state(room, state, viewer)}, ensure_ascii=False)
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _connections.get(room, set()).discard(ws)


class JoinBody(BaseModel):
    room: str
    token: str


class ActionBody(BaseModel):
    room: str
    actor: str | None = None
    action: str
    token: str
    amount: float | None = None
    name: str | None = None
    position: str | None = None
    result: dict | None = None
    tactics: dict | None = None
    card: str | None = None
    target: str | None = None
    target_match: str | None = None
    player_id: str | None = None
    display_name: str | None = None
    logo: str | None = None
    character: str | None = None


class AuthBody(BaseModel):
    username: str
    password: str


class TokenBody(BaseModel):
    token: str


class FriendBody(BaseModel):
    token: str
    username: str | None = None
    accept: bool = True


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 210_000)
    return salt, base64.b64encode(digest).decode("ascii")


def create_token(user_id):
    expires = int(time.time()) + 60 * 60 * 24 * 14
    payload = f"{user_id}.{expires}"
    signature = hmac.new(AUTH_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return base64.urlsafe_b64encode(f"{payload}.{signature}".encode("utf-8")).decode("ascii")


def get_user_from_token(token):
    try:
        payload = base64.urlsafe_b64decode(token.encode("ascii")).decode("utf-8")
        user_id, expires, signature = payload.rsplit(".", 2)
        signed = f"{user_id}.{expires}"
        expected = hmac.new(AUTH_SECRET, signed.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected) or int(expires) < int(time.time()):
            raise ValueError
    except Exception as error:
        raise HTTPException(401, "Your session has expired. Please sign in again.") from error
    user = game_store.get_user_by_id(user_id)
    if not user:
        raise HTTPException(401, "Account not found")
    return user


def public_user(user):
    return {"id": user["id"], "username": user["username"], "wins": user["wins"], "titles": user["titles"], "gamesPlayed": user["games_played"]}


def clean_room(room: str):
    return room.strip().lower().replace(" ", "-")[:40]


def create_room_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(20):
        code = "MATCH-" + "".join(secrets.choice(alphabet) for _ in range(6))
        if room_state(code.lower()) is None:
            return code.lower()
    raise HTTPException(500, "Could not generate a room code. Please try again.")


def require_actor(state, actor):
    if actor not in state.get("teams", {}):
        raise HTTPException(400, "Invalid player identity")


def require_host(state, actor):
    if state.get("host") != actor:
        raise HTTPException(403, "Only the room host can do that")


def number(value, default=70):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def average(values, fallback=70):
    return sum(values) / len(values) if values else fallback


def role_fit(player_role, formation_role):
    if player_role == formation_role:
        return 100
    if player_role in {"LB", "LWB"} and formation_role in {"LB", "LWB", "LM"}:
        return 82
    if player_role in {"RB", "RWB"} and formation_role in {"RB", "RWB", "RM"}:
        return 82
    if player_role in {"CM", "CDM", "CAM"} and formation_role in {"CM", "CDM", "CAM"}:
        return 78
    if player_role in {"LW", "LM"} and formation_role in {"LW", "LM"}:
        return 84
    if player_role in {"RW", "RM"} and formation_role in {"RW", "RM"}:
        return 84
    if player_role in {"ST", "CF", "SS"} and formation_role in {"ST", "CF", "SS"}:
        return 86
    return 35


def calculate_evaluation(state):
    results = {}
    for name in team_names(state):
        team = state["teams"][name]
        tactics = team.get("tactics") or {}
        squad = team.get("squad") or []
        roles = tactics.get("roles") or {}
        formation = tactics.get("formation", "4-3-3")
        expected = FORMATION_ROLES.get(formation, FORMATION_ROLES["4-3-3"])
        players = []
        for index, player in enumerate(squad):
            player_id = str(player.get("id") or player.get("name") or index)
            role = roles.get(player_id, player.get("position", "CM"))
            players.append((player, role))
        ratings = [number(player.get("rating"), 70) for player, _ in players]
        squad_quality = max(0, min(100, average(ratings)))
        positional_fit = average([role_fit(role, expected[index] if index < len(expected) else "CM") for index, (_, role) in enumerate(players)], 35)
        assigned_roles = [role for _, role in players]
        formation_coverage = average([max(role_fit(role, target) for role in assigned_roles) for target in expected], 0)

        def role_stat(role_set, key):
            selected = [number(player.get(key), number(player.get("rating"), 70)) for player, role in players if role in role_set]
            return average(selected, average([number(player.get(key), 70) for player, _ in players]))

        attack_strength = average([role_stat(ATTACK_ROLES, "shooting"), role_stat(ATTACK_ROLES, "pace"), role_stat(ATTACK_ROLES, "dribbling")])
        defence_strength = average([role_stat(DEFENCE_ROLES, "defending"), role_stat(DEFENCE_ROLES, "physical"), role_stat({"GK"}, "rating")])
        midfield_passing = role_stat(MIDFIELD_ROLES, "passing")
        pace = average([number(player.get("pace"), 70) for player, _ in players])
        pressing = number(tactics.get("pressing"), 50)
        tempo = number(tactics.get("tempo"), 50)
        width = number(tactics.get("width"), 50)
        attack_style = tactics.get("attackStyle", "Balanced")
        defence_style = tactics.get("defenceStyle", "Balanced")
        attack_plan = {"Possession": midfield_passing, "Direct": average([attack_strength, pace]), "Counter-Attack": average([attack_strength, pace, defence_strength]), "Wide": average([attack_strength, width, role_stat({"LW", "RW", "LM", "RM", "LB", "RB", "LWB", "RWB"}, "pace")]), "Balanced": average([attack_strength, midfield_passing])}.get(attack_style, attack_strength)
        defence_plan = {"High Press": average([defence_strength, pressing, pace]), "Counter-Press": average([defence_strength, pressing, midfield_passing]), "Mid Block": average([defence_strength, 78]), "Low Block": average([defence_strength, 84]), "Balanced": defence_strength}.get(defence_style, defence_strength)
        tactical_coherence = average([attack_plan, defence_plan, positional_fit, 100 - abs(tempo - 55) * 0.45])
        balance = 100 - min(45, (max(attack_strength, defence_strength, midfield_passing) - min(attack_strength, defence_strength, midfield_passing)) * 1.15)
        spent = number(team.get("spent"), 0)
        budget_efficiency = max(40, min(100, 62 + squad_quality * 0.32 + (100 - spent) * 0.08))
        overall = (squad_quality * .24 + positional_fit * .18 + formation_coverage * .10 + tactical_coherence * .16 + attack_plan * .10 + defence_plan * .10 + balance * .07 + budget_efficiency * .05)
        metrics = {"Squad Quality": squad_quality, "Positional Fit": positional_fit, "Formation Coverage": formation_coverage, "Tactical Coherence": tactical_coherence, "Attack Plan": attack_plan, "Defensive Plan": defence_plan, "Balance": balance, "Budget Efficiency": budget_efficiency}
        ordered_metrics = sorted(metrics.items(), key=lambda item: item[1], reverse=True)
        results[name] = {"overall": round(overall, 2), "formation": formation, "attackStyle": attack_style, "defenceStyle": defence_style, "pressing": round(pressing), "tempo": round(tempo), "width": round(width), "averageRating": round(average(ratings), 1), "attackStrength": round(attack_strength, 1), "defenceStrength": round(defence_strength, 1), "pace": round(pace, 1), "passing": round(midfield_passing, 1), "metrics": {key: round(value, 1) for key, value in metrics.items()}, "strengths": [key for key, _ in ordered_metrics[:2]], "risks": [key for key, value in ordered_metrics[-2:] if value < 76] or ["No critical tactical weakness"]}
    ranking = sorted(team_names(state), key=lambda team_name: results[team_name]["overall"], reverse=True)
    for index, name in enumerate(ranking, start=1):
        results[name]["rank"] = index
    return {"generatedAt": int(__import__("time").time() * 1000), "ranking": ranking, "teams": results}


def calculate_final_results(state):
    tournament = state.get("tournament") or {}
    records = {name: {"played": 0, "wins": 0, "goalsFor": 0, "goalsAgainst": 0, "xg": 0.0, "possession": []} for name in team_names(state)}
    scorers = {}
    for match in tournament.get("matches", []):
        if match.get("status") != "finished" or not match.get("home") or not match.get("away"):
            continue
        home, away = match["home"], match["away"]
        home_goals = int((match.get("score") or {}).get("home", 0))
        away_goals = int((match.get("score") or {}).get("away", 0))
        for name, goals_for, goals_against, side in ((home, home_goals, away_goals, "home"), (away, away_goals, home_goals, "away")):
            record = records[name]
            record["played"] += 1
            record["goalsFor"] += goals_for
            record["goalsAgainst"] += goals_against
            record["xg"] += number((match.get("stats") or {}).get("xg", {}).get(side), 0)
            record["possession"].append(number((match.get("stats") or {}).get("possession", {}).get(side), 50))
        winner = match.get("winner")
        if winner in records:
            records[winner]["wins"] += 1
        for event in match.get("events", []):
            if event.get("type") == "goal" and event.get("player"):
                scorers[event["player"]] = scorers.get(event["player"], 0) + 1
    for record in records.values():
        record["xg"] = round(record["xg"], 2)
        record["averagePossession"] = round(average(record.pop("possession"), 50), 1)
    champion = tournament.get("champion")
    evaluation = (state.get("evaluation") or {}).get("teams", {})
    league_order = tournament_table(tournament, team_names(state))
    league_rank = {name: index for index, name in enumerate(league_order)}
    manager_scores = {}
    for name in team_names(state):
        evaluation_score = number((evaluation.get(name) or {}).get("overall"), 70)
        # The league winner is rewarded, while every win still matters in larger rooms.
        tournament_score = 45 + records[name]["wins"] * 16 + (25 if name == champion else max(0, 10 - league_rank.get(name, 0) * 2))
        manager_scores[name] = round(evaluation_score * 0.55 + min(100, tournament_score) * 0.45, 2)
    best_manager = max(team_names(state), key=lambda name: manager_scores[name])
    best_attack = max(team_names(state), key=lambda name: (records[name]["goalsFor"], records[name]["xg"]))
    best_defence = min(team_names(state), key=lambda name: (records[name]["goalsAgainst"], -records[name]["wins"]))
    top_scorer = max(scorers, key=scorers.get) if scorers else None
    return {"champion": champion, "bestManager": best_manager, "bestManagerScore": manager_scores[best_manager], "managerScores": manager_scores, "records": records, "awards": {"topScorer": {"name": top_scorer, "goals": scorers.get(top_scorer, 0)} if top_scorer else None, "bestAttack": best_attack, "bestDefence": best_defence}, "generatedAt": int(__import__("time").time() * 1000)}


def complete_sale(state):
    offer = state.get("currentOffer")
    if not offer or not offer.get("highestBidder"):
        state["currentOffer"] = None
        return
    winner = offer["highestBidder"]
    price = float(offer.get("currentBid", 0))
    team = state["teams"][winner]
    if price > team["budget"] or len(team["squad"]) >= SQUAD_SIZE:
        raise HTTPException(400, "Winning bid can no longer be completed")
    player_record = {
        "id": offer.get("id") or f"sold-{random.randint(1000,999999)}",
        "name": offer["name"],
        "position": offer.get("position") or "?",
        "price": price,
    }
    for key in ("rating", "pace", "shooting", "passing", "dribbling", "defending", "physical"):
        if offer.get(key) is not None:
            player_record[key] = offer.get(key)
    team["squad"].append(player_record)
    team["spent"] = round(float(team.get("spent", 0)) + price, 2)
    team["budget"] = round(float(team.get("budget", BUDGET)) - price, 2)
    grant_signing_rewards(state, winner)
    state["currentOffer"] = None


def maybe_auto_award(state):
    offer = state.get("currentOffer")
    if not offer or not offer.get("highestBidder"):
        return False
    dropped = set(offer.get("dropped", []))
    eligible = [n for n in team_names(state) if n not in dropped and len(state["teams"][n]["squad"]) < SQUAD_SIZE]
    if eligible == [offer["highestBidder"]]:
        complete_sale(state)
        return True
    return False


@app.get("/")
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/tactics.css")
def tactics_css():
    return FileResponse(ROOT / "tactics.css", media_type="text/css")


@app.get("/tactics.js")
def tactics_js():
    return FileResponse(ROOT / "tactics.js", media_type="application/javascript")


@app.get("/api/player-image/{player_id}")
def player_image(player_id: str, name: str = ""):
    """Find a deploy-safe player portrait from Wikimedia and cache the result."""
    key = f"{player_id}:{name.strip().lower()}"
    if key in _player_image_cache:
        return {"url": _player_image_cache[key]}
    if not name.strip():
        _player_image_cache[key] = None
        return {"url": None}
    try:
        query = urlencode({
            "action": "query", "generator": "search", "gsrsearch": name,
            "gsrnamespace": 0, "gsrlimit": 1, "prop": "pageimages",
            "piprop": "thumbnail", "pithumbsize": 500, "format": "json",
        })
        request = Request(
            f"https://en.wikipedia.org/w/api.php?{query}",
            headers={"User-Agent": "TransferAuction/1.0 (player portrait lookup)"},
        )
        with urlopen(request, timeout=4) as response:
            pages = json.loads(response.read().decode("utf-8")).get("query", {}).get("pages", {})
        portrait = next((page.get("thumbnail", {}).get("source") for page in pages.values() if page.get("thumbnail", {}).get("source")), None)
    except Exception:
        portrait = None
    _player_image_cache[key] = portrait
    return {"url": portrait}


@app.get("/sound.js")
def sound_js():
    return FileResponse(ROOT / "sound.js", media_type="application/javascript")


@app.get("/evaluator.css")
def evaluator_css():
    return FileResponse(ROOT / "evaluator.css", media_type="text/css")


@app.get("/evaluator.js")
def evaluator_js():
    return FileResponse(ROOT / "evaluator.js", media_type="application/javascript")


@app.get("/results.css")
def results_css():
    return FileResponse(ROOT / "results.css", media_type="text/css")


@app.get("/results.js")
def results_js():
    return FileResponse(ROOT / "results.js", media_type="application/javascript")


@app.get("/tournament.css")
def tournament_css():
    return FileResponse(ROOT / "tournament.css", media_type="text/css")


@app.get("/tournament.js")
def tournament_js():
    return FileResponse(ROOT / "tournament.js", media_type="application/javascript")


@app.get("/api/state")
def get_state(room: str = "main"):
    room = clean_room(room)
    state = room_state(room)
    return public_state(room, state) if state else None


@app.post("/api/auth/register")
def register_account(body: AuthBody):
    username = body.username.strip()
    valid_username = all(character.isalnum() or character in " _-" for character in username)
    if not 3 <= len(username) <= 20 or not valid_username or not any(character.isalnum() for character in username):
        raise HTTPException(400, "Manager name must be 3-20 letters, numbers, spaces, hyphens, or underscores")
    if len(body.password) < 8:
        raise HTTPException(400, "Password must contain at least 8 characters")
    if game_store.get_user_by_username(username):
        raise HTTPException(400, "That username is already taken")
    salt, digest = password_hash(body.password)
    try:
        user = game_store.create_user(username, digest, salt, int(time.time() * 1000))
    except Exception as error:
        raise HTTPException(400, "Could not create this account") from error
    return {"token": create_token(user["id"]), "user": public_user(user)}


@app.post("/api/rooms/create")
async def create_room(body: TokenBody):
    user = get_user_from_token(body.token)
    with _db_lock:
        room = create_room_code()
        state = default_state(user["username"], user["id"])
        game_store.add_member(room, user["id"], user["username"], int(time.time() * 1000))
        persist_room(room, state)
    snapshot = public_state(room, state, user["username"])
    await broadcast(room, state, snapshot)
    return {
        "ok": True,
        "room": room,
        "state": snapshot,
        "you": user["username"],
        "host": user["username"],
        "user": public_user(user),
    }


@app.post("/api/auth/login")
def login_account(body: AuthBody):
    user = game_store.get_user_by_username(body.username.strip())
    if not user:
        raise HTTPException(401, "Invalid username or password")
    _, digest = password_hash(body.password, user["password_salt"])
    if not hmac.compare_digest(digest, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    return {"token": create_token(user["id"]), "user": public_user(user)}


@app.get("/api/auth/me")
def current_account(token: str):
    return {"user": public_user(get_user_from_token(token))}


@app.get("/api/friends")
def friends(token: str):
    user = get_user_from_token(token)
    records = game_store.friends_for(user["id"])
    return {"friends": [{"username": item["username"], "wins": item["wins"], "titles": item["titles"], "gamesPlayed": item["games_played"], "status": item["status"], "incoming": item["friend_id"] == user["id"]} for item in records]}


@app.post("/api/friends/request")
def request_friend(body: FriendBody):
    user = get_user_from_token(body.token)
    friend = game_store.get_user_by_username((body.username or "").strip())
    if not friend:
        raise HTTPException(404, "Manager not found")
    if friend["id"] == user["id"]:
        raise HTTPException(400, "You cannot add yourself")
    game_store.send_friend_request(user["id"], friend["id"], int(time.time() * 1000))
    return {"ok": True}


@app.post("/api/friends/respond")
def respond_friend(body: FriendBody):
    user = get_user_from_token(body.token)
    requester = game_store.get_user_by_username((body.username or "").strip())
    if not requester:
        raise HTTPException(404, "Manager not found")
    game_store.respond_friend_request(user["id"], requester["id"], body.accept)
    return {"ok": True}


@app.post("/api/join")
async def join(body: JoinBody):
    room = clean_room(body.room)
    user = get_user_from_token(body.token)
    if not room:
        raise HTTPException(400, "Room name is required")
    with _db_lock:
        state = room_state(room)
        if state is None:
            state = default_state(user["username"], user["id"])
            game_store.add_member(room, user["id"], user["username"], int(time.time() * 1000))
        state = normalize_state(state, user["username"])
        member = game_store.get_member(room, user["id"])
        if not member:
            if len(team_names(state)) >= MAX_MANAGERS:
                raise HTTPException(400, f"This room already has {MAX_MANAGERS} managers")
            team_name = user["username"]
            state["teams"][team_name] = new_team(user["id"])
            game_store.add_member(room, user["id"], team_name, int(time.time() * 1000))
            member = game_store.get_member(room, user["id"])
        if member["team_name"] not in state["teams"]:
            state["teams"][member["team_name"]] = new_team(user["id"])
        ensure_card_hand(state, member["team_name"])
        if not state.get("host"):
            state["host"] = member["team_name"]
            state["hostUserId"] = user["id"]
        persist_room(room, state)
    snapshot = public_state(room, state, member["team_name"])
    await broadcast(room, state, snapshot)
    return {"ok": True, "state": snapshot, "you": member["team_name"], "host": state.get("host"), "user": public_user(user)}


@app.post("/api/action")
async def action(body: ActionBody):
    room = clean_room(body.room)
    user = get_user_from_token(body.token)
    live_match_to_start = None
    with _db_lock:
        state = room_state(room)
        if state is None:
            raise HTTPException(404, "Room not found")
        member = game_store.get_member(room, user["id"])
        if not member:
            raise HTTPException(403, "Join this room before taking an action")
        actor = member["team_name"]
        require_actor(state, actor)
        act = body.action

        if act == "reset":
            require_host(state, actor)
            state = default_state(actor, user["id"])
            for room_member in game_store.members(room):
                if room_member["team_name"] != actor:
                    state["teams"][room_member["team_name"]] = new_team(room_member["user_id"])
                    ensure_card_hand(state, room_member["team_name"])

        elif act == "music_control":
            require_host(state, actor)
            control = (body.name or "").strip().lower()
            music = state.setdefault("music", {"track": 0, "playing": False, "progress": 0})
            if control == "toggle":
                music["playing"] = not bool(music.get("playing", True))
                music["progress"] = max(0, min(1, float(body.amount or 0)))
            elif control in {"play", "pause"}:
                music["playing"] = control == "play"
                music["progress"] = max(0, min(1, float(body.amount or 0)))
            elif control == "next":
                music["track"] = (int(music.get("track", 0)) + 1) % 9
                music["playing"] = True
                music["progress"] = 0
            elif control == "seek":
                music["progress"] = max(0, min(1, float(body.amount or 0)))
            else:
                raise HTTPException(400, "Unknown music control")

        elif act == "next_player":
            require_host(state, actor)
            if state.get("currentOffer"):
                raise HTTPException(400, "Finish the current auction first")
            used = {str(x).strip().lower() for x in state.get("usedPlayers", [])}
            available = [p for p in load_players() if str(p.get("name", "")).strip().lower() not in used]
            if not available:
                raise HTTPException(400, "No players left in players.json")
            scouted = state.get("cards", {}).get("scoutedQueue", [])
            if scouted:
                p = scouted.pop(0)
            else:
                by_position = {}
                for player in available:
                    by_position.setdefault(player.get("position") or "CM", []).append(player)
                position = random.choice(list(by_position))
                p = random.choice(by_position[position])
            state["usedPlayers"].append(p["name"])
            pos = p.get("position", "?")
            state["positionCounts"][pos] = state["positionCounts"].get(pos, 0) + 1
            state["currentOffer"] = {
                "id": p.get("id"), "name": p["name"], "position": pos,
                "rating": p.get("rating"), "pace": p.get("pace"), "shooting": p.get("shooting"),
                "passing": p.get("passing"), "dribbling": p.get("dribbling"),
                "defending": p.get("defending"), "physical": p.get("physical"),
                "currentBid": 0, "highestBidder": None, "dropped": [], "passed": []
            }

        elif act == "manual_offer":
            require_host(state, actor)
            if state.get("currentOffer"):
                raise HTTPException(400, "Finish the current auction first")
            name = (body.name or "").strip()
            if not name:
                raise HTTPException(400, "Player name is required")
            if name.lower() in {str(x).lower() for x in state.get("usedPlayers", [])}:
                raise HTTPException(400, "That player has already appeared")
            pos = (body.position or "?").upper()
            state["usedPlayers"].append(name)
            state["currentOffer"] = {
                "id": f"manual-{random.randint(10000,999999)}", "name": name, "position": pos,
                "currentBid": 0, "highestBidder": None, "dropped": [], "passed": []
            }

        elif act == "bid":
            offer = state.get("currentOffer")
            if not offer:
                raise HTTPException(400, "There is no active auction")
            if actor in offer.get("frozen", []):
                raise HTTPException(400, "A Freeze card blocks you from bidding on this player")
            if actor in offer.get("dropped", []):
                raise HTTPException(400, "You already dropped out of this auction")
            team = state["teams"][actor]
            if len(team["squad"]) >= SQUAD_SIZE:
                raise HTTPException(400, "Your XI is already full")
            amount = float(body.amount or 0)
            current = float(offer.get("currentBid", 0))
            if amount <= current:
                raise HTTPException(400, f"Bid must be higher than ${current:g}M")
            if amount > float(team["budget"]):
                raise HTTPException(400, f"You only have ${team['budget']:g}M remaining")
            offer["currentBid"] = round(amount, 2)
            offer["highestBidder"] = actor
            offer["passed"] = [n for n in offer.get("passed", []) if n != actor]

        elif act == "pass":
            offer = state.get("currentOffer")
            if not offer:
                raise HTTPException(400, "There is no active auction")
            if actor in offer.get("dropped", []):
                raise HTTPException(400, "You already dropped out")
            if actor not in offer.get("passed", []):
                offer.setdefault("passed", []).append(actor)

        elif act == "drop":
            offer = state.get("currentOffer")
            if not offer:
                raise HTTPException(400, "There is no active auction")
            if offer.get("highestBidder") == actor:
                raise HTTPException(400, "The current highest bidder cannot drop out")
            if actor not in offer.get("dropped", []):
                offer.setdefault("dropped", []).append(actor)
            maybe_auto_award(state)

        elif act == "end_auction":
            require_host(state, actor)
            if not state.get("currentOffer"):
                raise HTTPException(400, "There is no active auction")
            complete_sale(state)

        elif act == "no_sale":
            require_host(state, actor)
            state["currentOffer"] = None

        elif act == "use_card":
            card = (body.card or "").strip().lower()
            offer = state.get("currentOffer")
            target = (body.target or "").strip()
            if card in AUCTION_CARDS:
                if state.get("phase") != "auction":
                    raise HTTPException(400, "Auction cards can only be used during the auction")
                if card != "scout_report" and not offer:
                    raise HTTPException(400, "Open an auction before using that card")
                if card == "freeze":
                    if target not in state["teams"] or target == actor:
                        raise HTTPException(400, "Choose another manager to freeze")
                    shields = offer.setdefault("shields", [])
                    if target in shields:
                        shields.remove(target)
                        state["cards"]["notice"] = f"{target}'s Bid Shield blocked the Freeze"
                    else:
                        offer.setdefault("frozen", []).append(target)
                        state["cards"]["notice"] = f"{target} is frozen for this auction"
                    use_card_from_hand(state, actor, card)
                elif card == "bid_shield":
                    shields = offer.setdefault("shields", [])
                    if actor in shields:
                        raise HTTPException(400, "Your Bid Shield is already active")
                    shields.append(actor)
                    use_card_from_hand(state, actor, card)
                elif card == "hijack":
                    highest = offer.get("highestBidder")
                    if not highest or highest == actor:
                        raise HTTPException(400, "Hijack needs an opponent's active highest bid")
                    shields = offer.setdefault("shields", [])
                    if highest in shields:
                        shields.remove(highest)
                        use_card_from_hand(state, actor, card)
                        state["cards"]["notice"] = f"{highest}'s Bid Shield blocked the Hijack"
                    else:
                        amount = round(float(offer.get("currentBid", 0)) + 2, 2)
                        if amount > float(state["teams"][actor]["budget"]):
                            raise HTTPException(400, "You cannot afford the Hijack price")
                        offer["currentBid"] = amount
                        offer["highestBidder"] = actor
                        offer["passed"] = [name for name in offer.get("passed", []) if name != actor]
                        use_card_from_hand(state, actor, card)
                        state["cards"]["notice"] = f"{actor} hijacked the bid for ${amount:g}M"
                else:  # scout_report
                    if state.get("cards", {}).get("scoutedQueue"):
                        raise HTTPException(400, "Use the current scout report before drawing another")
                    used = {str(x).strip().lower() for x in state.get("usedPlayers", [])}
                    available = [player for player in load_players() if str(player.get("name", "")).strip().lower() not in used]
                    report = random.sample(available, min(3, len(available)))
                    state["cards"]["scoutedQueue"] = report
                    state["cards"]["lastScout"] = {"owner": actor, "players": [{"name": player.get("name"), "position": player.get("position", "?")} for player in report]}
                    use_card_from_hand(state, actor, card)

            elif card in MATCH_CARDS:
                tournament = state.get("tournament")
                match = next((item for item in (tournament or {}).get("matches", []) if item.get("id") == (body.target_match or "")), None)
                if state.get("phase") != "tournament" or not match or match.get("status") != "ready":
                    raise HTTPException(400, "Choose a ready league match for this card")
                if card == "out_of_position":
                    if target not in state["teams"] or target == actor or target not in (match.get("home"), match.get("away")):
                        raise HTTPException(400, "Choose an opponent playing in that match")
                    player_id = str(body.player_id or "")
                    target_squad = state["teams"][target].get("squad", [])
                    if not player_id or not any(str(player.get("id") or player.get("name")) == player_id for player in target_squad):
                        raise HTTPException(400, "Choose a valid opponent player")
                    role = (body.position or "").upper()
                    if role not in FORMATION_ROLES["4-3-3"] + ["CDM", "CAM", "LM", "RM", "LWB", "RWB", "CF", "SS"] or role == "GK":
                        raise HTTPException(400, "Choose a valid outfield position")
                    effect = {"type": card, "owner": actor, "targetTeam": target, "playerId": player_id, "role": role}
                else:
                    if actor not in (match.get("home"), match.get("away")):
                        raise HTTPException(400, "You can only use this card in your own match")
                    effect = {"type": card, "owner": actor, "targetTeam": actor}
                    if card == "captains_gambit":
                        player_id = str(body.player_id or "")
                        if not player_id or not any(str(player.get("id") or player.get("name")) == player_id for player in state["teams"][actor].get("squad", [])):
                            raise HTTPException(400, "Choose one of your players as captain")
                        effect["playerId"] = player_id
                match.setdefault("effects", []).append(effect)
                use_card_from_hand(state, actor, card)
            else:
                raise HTTPException(400, "Unknown card")

        elif act == "set_team_identity":
            team = state["teams"][actor]
            display_name = (body.display_name or "").strip()
            if not 2 <= len(display_name) <= 24:
                raise HTTPException(400, "Team name must be 2-24 characters")
            logo = body.logo
            if logo and (not logo.startswith("data:image/") or len(logo) > 350000):
                raise HTTPException(400, "Use an image smaller than 250 KB for the team logo")
            character = (body.character or "tactician").strip().lower()
            if character not in MANAGER_CHARACTERS:
                raise HTTPException(400, "Choose a valid manager character")
            team["displayName"] = display_name
            team["logo"] = logo or None
            team["character"] = character

        elif act == "set_tactics":
            if state.get("phase") != "tactics":
                raise HTTPException(400, "Tactics are locked outside Phase 2")
            tactics = body.tactics or {}
            formation = str(tactics.get("formation", "4-3-3"))[:20]
            attack = str(tactics.get("attackStyle", "Balanced"))[:40]
            defence = str(tactics.get("defenceStyle", "Balanced"))[:40]
            def clamp(value, default=50):
                try:
                    return max(0, min(100, int(round(float(value)))))
                except Exception:
                    return default
            positions = tactics.get("positions") if isinstance(tactics.get("positions"), dict) else {}
            roles = tactics.get("roles") if isinstance(tactics.get("roles"), dict) else {}
            clean_positions = {}
            valid_ids = {str(p.get("id") or p.get("name") or i) for i, p in enumerate(state["teams"][actor]["squad"])}
            for pid, pos in positions.items():
                pid = str(pid)
                if pid not in valid_ids or not isinstance(pos, dict):
                    continue
                try:
                    x = max(0.0, min(100.0, float(pos.get("x", 50))))
                    y = max(0.0, min(100.0, float(pos.get("y", 50))))
                except Exception:
                    continue
                clean_positions[pid] = {"x": round(x, 2), "y": round(y, 2)}
            clean_roles = {str(pid): str(role)[:10] for pid, role in roles.items() if str(pid) in valid_ids}
            state["teams"][actor]["tactics"] = {
                "formation": formation,
                "attackStyle": attack,
                "defenceStyle": defence,
                "pressing": clamp(tactics.get("pressing")),
                "tempo": clamp(tactics.get("tempo")),
                "width": clamp(tactics.get("width")),
                "positions": clean_positions,
                "roles": clean_roles,
            }
            state["evaluation"] = None

        elif act == "start_tactics":
            require_host(state, actor)
            incomplete = [n for n in team_names(state) if len(state["teams"][n]["squad"]) < SQUAD_SIZE]
            if not supported_manager_count(team_names(state)) or incomplete:
                raise HTTPException(400, f"Need {MIN_MANAGERS}-{MAX_MANAGERS} teams, each with {SQUAD_SIZE} players, before Phase 2 can start")
            if state.get("currentOffer"):
                raise HTTPException(400, "Finish the current auction first")
            state["phase"] = "tactics"
            state["evaluation"] = None

        elif act == "start_evaluation":
            require_host(state, actor)
            if state.get("phase") != "tactics":
                raise HTTPException(400, "Open evaluation from the tactics phase")
            incomplete = [n for n in team_names(state) if len(state["teams"][n]["squad"]) < SQUAD_SIZE]
            if not supported_manager_count(team_names(state)) or incomplete:
                raise HTTPException(400, f"Need {MIN_MANAGERS}-{MAX_MANAGERS} teams, each with {SQUAD_SIZE} players, before evaluation")
            state["evaluation"] = None
            state["phase"] = "evaluation"

        elif act == "calculate_evaluation":
            require_host(state, actor)
            if state.get("phase") != "evaluation":
                raise HTTPException(400, "Open the evaluation phase first")
            state["evaluation"] = calculate_evaluation(state)

        elif act == "start_tournament":
            require_host(state, actor)
            if state.get("phase") not in ("tactics", "evaluation"):
                raise HTTPException(400, "Open the tournament after tactics or evaluation")
            if state.get("phase") == "evaluation" and not state.get("evaluation"):
                raise HTTPException(400, "Calculate the team evaluation before starting the tournament")
            names = team_names(state)
            incomplete = [n for n in names if len(state["teams"][n]["squad"]) < SQUAD_SIZE]
            if not supported_manager_count(names) or incomplete:
                raise HTTPException(400, f"Need {MIN_MANAGERS}-{MAX_MANAGERS} teams, each with {SQUAD_SIZE} players, before the tournament starts")
            seed = random.SystemRandom().randint(100000, 999999999)
            bracket_size = 2
            while bracket_size < len(names):
                bracket_size *= 2
            rounds = bracket_size.bit_length() - 1
            labels = {1: "Final", 2: "Semi-final", 3: "Quarter-final"}
            matches = []
            for round_number in range(1, rounds + 1):
                count = bracket_size // (2 ** round_number)
                label = labels.get(rounds - round_number + 1, f"Round {round_number}")
                for index in range(count):
                    match_id = f"r{round_number}-m{index + 1}"
                    next_id = f"r{round_number + 1}-m{index // 2 + 1}" if round_number < rounds else None
                    matches.append({"id": match_id, "round": label, "home": None, "away": None, "status": "locked", "sources": [], "nextMatch": next_id, "nextSide": "home" if index % 2 == 0 else "away"})
            first_round = [match for match in matches if match["id"].startswith("r1-")]
            for index, name in enumerate(names):
                first_round[index // 2]["home" if index % 2 == 0 else "away"] = name
            for match in matches:
                if not match["id"].startswith("r1-"):
                    round_number = int(match["id"].split("-")[0][1:])
                    match["sources"] = [f"r{round_number - 1}-m{(int(match['id'].split('m')[1]) - 1) * 2 + 1}", f"r{round_number - 1}-m{(int(match['id'].split('m')[1]) - 1) * 2 + 2}"]
            state["tournament"] = {
                "seed": seed,
                "liveSpeed": 1,
                "format": "knockout",
                "matches": matches,
                "finalMatchId": f"r{rounds}-m1",
                "champion": None,
            }
            resolve_bracket(state["tournament"])
            state["results"] = None
            state["phase"] = "tournament"

        elif act == "simulate_match":
            require_host(state, actor)
            tournament = state.get("tournament")
            if state.get("phase") != "tournament" or not tournament:
                raise HTTPException(400, "The tournament has not started")
            match_id = (body.name or "").strip()
            match = next((item for item in tournament.get("matches", []) if item.get("id") == match_id), None)
            if not match or match.get("status") != "ready":
                raise HTTPException(400, "That match is not ready to simulate")
            effects = match.get("effects", [])
            result = simulate_match(match["home"], team_for_match(state, match["home"], effects), match["away"], team_for_match(state, match["away"], effects), tournament["seed"], match_id)
            round_name = match.get("round", "League match")
            bracket_meta = {key: match.get(key) for key in ("sources", "nextMatch", "nextSide")}
            match.clear()
            match.update({"round": round_name, **bracket_meta, **result})
            advance_bracket_winner(tournament, match)
            resolve_bracket(tournament)
            complete_tournament_if_ready(state)

        elif act == "start_live_match":
            require_host(state, actor)
            tournament = state.get("tournament")
            if state.get("phase") != "tournament" or not tournament:
                raise HTTPException(400, "The tournament has not started")
            match_id = (body.name or "").strip()
            match = next((item for item in tournament.get("matches", []) if item.get("id") == match_id), None)
            if not match or match.get("status") != "ready":
                raise HTTPException(400, "That match is not ready to start")
            effects = match.get("effects", [])
            simulation = simulate_match(match["home"], team_for_match(state, match["home"], effects), match["away"], team_for_match(state, match["away"], effects), tournament["seed"], match_id)
            round_name = match.get("round")
            match.clear()
            match.update({
                "id": match_id,
                "round": round_name,
                "home": simulation["home"],
                "away": simulation["away"],
                "status": "live",
                "score": {"home": 0, "away": 0},
                "events": [],
                "currentMinute": 0,
                "liveIndex": 0,
                "simulation": simulation,
            })
            live_match_to_start = (room, match_id)

        elif act == "set_live_speed":
            require_host(state, actor)
            tournament = state.get("tournament")
            if state.get("phase") != "tournament" or not tournament:
                raise HTTPException(400, "The tournament has not started")
            speed = float(body.amount or 1)
            allowed_speeds = {0.5, 1.0, 1.5, 2.0, 3.0}
            if speed not in allowed_speeds:
                raise HTTPException(400, "Invalid live speed")
            if not any(match.get("status") == "live" for match in tournament.get("matches", [])):
                raise HTTPException(400, "There is no live match to control")
            tournament["liveSpeed"] = speed

        elif act == "open_final_results":
            require_host(state, actor)
            tournament = state.get("tournament")
            if state.get("phase") != "tournament" or not tournament or not tournament.get("champion"):
                raise HTTPException(400, "Finish every league match before opening the results")
            state["results"] = calculate_final_results(state)
            for team_name, record in state["results"]["records"].items():
                user_id = state["teams"].get(team_name, {}).get("userId")
                if user_id:
                    game_store.update_user_record(user_id, record["wins"], 1 if team_name == state["results"]["champion"] else 0, record["played"])
            state["phase"] = "results"

        elif act == "fill_test_teams":
            require_host(state, actor)
            players = load_players()
            names = team_names(state)
            while len(names) < TEST_TEAM_MIN:
                test_name = f"Test Team {len(names) + 1}"
                state["teams"][test_name] = new_team()
                names.append(test_name)
            if len(players) < SQUAD_SIZE * len(names):
                raise HTTPException(400, "players.json does not contain enough players for the test fill")
            keep = []
            goalkeepers = [p for p in players if p.get("position") == "GK"]
            others = [p for p in players if p.get("position") != "GK"]
            if len(goalkeepers) < len(names):
                raise HTTPException(400, f"Need at least {len(names)} goalkeepers for the test fill")
            for i, name in enumerate(names):
                squad_source = [goalkeepers[i]]
                # Deterministic, unique round-robin allocation from the remaining pool.
                squad_source += others[i*10:(i+1)*10]
                if len(squad_source) < SQUAD_SIZE:
                    raise HTTPException(400, "Not enough unique players for test squads")
                squad = []
                for p in squad_source:
                    squad.append({
                        "id": p.get("id"), "name": p.get("name"), "position": p.get("position", "?"),
                        "rating": p.get("rating"), "pace": p.get("pace"), "shooting": p.get("shooting"),
                        "passing": p.get("passing"), "dribbling": p.get("dribbling"),
                        "defending": p.get("defending"), "physical": p.get("physical"),
                        "price": 0,
                    })
                existing_team = state["teams"].get(name, {})
                state["teams"][name] = {
                    "budget": BUDGET, "spent": 0, "squad": squad,
                    "userId": existing_team.get("userId"),
                    "displayName": existing_team.get("displayName"),
                    "logo": existing_team.get("logo"),
                    "character": existing_team.get("character", "tactician"),
                    "tactics": {
                        "formation": "4-3-3", "attackStyle": "Balanced", "defenceStyle": "Balanced",
                        "pressing": 50, "tempo": 50, "width": 50, "positions": {}, "roles": {}
                    }
                }
                keep.extend(p["name"] for p in squad)
            state["usedPlayers"] = keep
            # Test fill skips real auction sales, so explicitly award the same milestones.
            state["cards"] = {"hands": {}, "rewards": {}}
            for name in names:
                ensure_card_hand(state, name)
                grant_signing_rewards(state, name)
            state["positionCounts"] = {}
            state["currentOffer"] = None
            state["finalResult"] = None
            state["evaluation"] = None
            state["results"] = None
            state["tournament"] = None
            state["phase"] = "auction"

        elif act == "set_final":
            require_host(state, actor)
            state["finalResult"] = body.result

        else:
            raise HTTPException(400, "Unknown action")

        persist_room(room, state)

    snapshot = public_state(room, state, actor)
    await broadcast(room, state, snapshot)
    if live_match_to_start and live_match_to_start not in _live_match_tasks:
        _live_match_tasks[live_match_to_start] = asyncio.create_task(run_live_match(*live_match_to_start))
    return {"ok": True, "state": snapshot}


@app.websocket("/ws/{room}/{player}")
async def websocket_endpoint(websocket: WebSocket, room: str, player: str):
    room = clean_room(room)
    try:
        user = get_user_from_token(websocket.query_params.get("token", ""))
        member = game_store.get_member(room, user["id"])
    except HTTPException:
        await websocket.close(code=1008)
        return
    if not member or member["team_name"] != player:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    _connections.setdefault(room, set()).add(websocket)
    _socket_players[websocket] = (room, player)
    _presence.setdefault(room, set()).add(player)
    state = room_state(room)
    if state:
        await broadcast(room, state)
    try:
        while True:
            await websocket.receive_text()  # client pings keep the socket alive
    except WebSocketDisconnect:
        pass
    finally:
        _connections.get(room, set()).discard(websocket)
        _socket_players.pop(websocket, None)
        still_online = any(r == room and p == player for r, p in _socket_players.values())
        if not still_online:
            _presence.get(room, set()).discard(player)
        state = room_state(room)
        if state:
            await broadcast(room, state)


if __name__ == "__main__":
    import uvicorn
    print("Transfer Auction Multiplayer running at http://localhost:8000")
    print("Open the same URL in 4 browser windows and join as different players.")
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
