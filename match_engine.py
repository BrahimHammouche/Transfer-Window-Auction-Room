"""Deterministic, data-driven football match simulation for the tournament phase."""

import random


ATTACKING_ROLES = {"LW", "RW", "ST", "CF", "SS", "CAM", "LM", "RM"}
MIDFIELD_ROLES = {"CDM", "CM", "CAM", "LM", "RM"}
DEFENSIVE_ROLES = {"GK", "LB", "LWB", "CB", "RB", "RWB", "CDM"}


def _number(value, default=70):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _tactics(team):
    return team.get("tactics") or {
        "formation": "4-3-3", "attackStyle": "Balanced", "defenceStyle": "Balanced",
        "pressing": 50, "tempo": 50, "width": 50, "roles": {},
    }


def team_profile(team):
    """Summarise player qualities with tactical modifiers for the match engine."""
    tactics = _tactics(team)
    roles = tactics.get("roles") or {}
    squad = team.get("squad") or []
    values = {"attack": [], "midfield": [], "defence": [], "goalkeeping": [], "pace": [], "passing": [], "physical": []}

    for index, player in enumerate(squad):
        player_id = str(player.get("id") or player.get("name") or index)
        role = roles.get(player_id, player.get("position", "CM"))
        rating = _number(player.get("rating"), 75)
        pace = _number(player.get("pace"), rating)
        shooting = _number(player.get("shooting"), rating)
        passing = _number(player.get("passing"), rating)
        dribbling = _number(player.get("dribbling"), rating)
        defending = _number(player.get("defending"), rating)
        physical = _number(player.get("physical"), rating)
        values["pace"].append(pace)
        values["passing"].append(passing)
        values["physical"].append(physical)
        if role == "GK":
            values["goalkeeping"].append(rating * 0.65 + defending * 0.2 + physical * 0.15)
        if role in ATTACKING_ROLES:
            values["attack"].append(shooting * 0.48 + dribbling * 0.25 + pace * 0.17 + rating * 0.10)
        if role in MIDFIELD_ROLES:
            values["midfield"].append(passing * 0.42 + dribbling * 0.18 + defending * 0.18 + physical * 0.12 + rating * 0.10)
        if role in DEFENSIVE_ROLES:
            values["defence"].append(defending * 0.48 + physical * 0.22 + pace * 0.12 + passing * 0.08 + rating * 0.10)

    def average(key, fallback=70):
        return sum(values[key]) / len(values[key]) if values[key] else fallback

    attack_style = tactics.get("attackStyle", "Balanced")
    defence_style = tactics.get("defenceStyle", "Balanced")
    pressing = _number(tactics.get("pressing"), 50)
    tempo = _number(tactics.get("tempo"), 50)
    width = _number(tactics.get("width"), 50)
    attack = average("attack")
    midfield = average("midfield")
    defence = average("defence")
    pace = average("pace")
    passing = average("passing")

    if attack_style == "Possession":
        midfield += 4 + (passing - 70) * 0.08
        attack += 1
    elif attack_style == "Direct":
        attack += 3 + (pace - 70) * 0.06
        midfield -= 1
    elif attack_style == "Counter-Attack":
        attack += 2 + (pace - 70) * 0.11
        defence += 2
    elif attack_style == "Wide":
        attack += 2 + (width - 50) * 0.05
        midfield += 1

    if defence_style == "High Press":
        midfield += 2 + (pressing - 50) * 0.04
        defence -= 1 + max(0, pressing - 70) * 0.04
    elif defence_style == "Counter-Press":
        midfield += 3 + (pressing - 50) * 0.05
        defence -= max(0, pressing - 70) * 0.03
    elif defence_style == "Mid Block":
        defence += 2
    elif defence_style == "Low Block":
        defence += 4
        attack -= 1

    formation = tactics.get("formation", "4-3-3")
    if formation.startswith("3-"):
        attack += 1.5
        defence -= 1
    elif formation == "4-1-4-1":
        midfield += 1
        defence += 1
    elif formation == "4-4-2":
        attack += 1

    return {
        "attack": attack, "midfield": midfield, "defence": defence,
        "goalkeeping": average("goalkeeping"), "pace": pace, "passing": passing,
        "pressing": pressing, "tempo": tempo, "width": width,
        "attackStyle": attack_style, "defenceStyle": defence_style, "squad": squad, "roles": roles,
    }


def _pick_player(profile, rng, preferred_roles, attribute):
    candidates = []
    for index, player in enumerate(profile["squad"]):
        player_id = str(player.get("id") or player.get("name") or index)
        role = profile["roles"].get(player_id, player.get("position", "CM"))
        weight = 1 if role in preferred_roles else 0.15
        weight *= max(1, _number(player.get(attribute), _number(player.get("rating"), 70)) - 45)
        candidates.extend([player] * max(1, round(weight)))
    return rng.choice(candidates or profile["squad"] or [{"name": "Unknown player"}]).get("name", "Unknown player")


def _scorer(profile, rng):
    return _pick_player(profile, rng, ATTACKING_ROLES, "shooting")


def _creator(profile, rng):
    return _pick_player(profile, rng, MIDFIELD_ROLES | {"LB", "RB", "LWB", "RWB"}, "passing")


def simulate_match(home_name, home_team, away_name, away_team, seed, match_id):
    """Create a reproducible 90-minute result, stats and commentary timeline."""
    rng = random.Random(f"{seed}:{match_id}")
    home = team_profile(home_team)
    away = team_profile(away_team)
    possession_edge = (home["midfield"] - away["midfield"]) * 0.72 + (home["passing"] - away["passing"]) * 0.12
    home_possession = max(35, min(65, round(50 + possession_edge + rng.uniform(-3.5, 3.5))))
    away_possession = 100 - home_possession
    home_chances = max(7, round(11 + (home["attack"] - away["defence"]) * 0.17 + (home["tempo"] - 50) * 0.035 + rng.uniform(-2, 2)))
    away_chances = max(7, round(11 + (away["attack"] - home["defence"]) * 0.17 + (away["tempo"] - 50) * 0.035 + rng.uniform(-2, 2)))
    stats = {key: {"home": 0, "away": 0} for key in ("shots", "shotsOnTarget", "xg", "saves", "corners", "fouls", "yellowCards", "redCards", "offsides")}
    score = {"home": 0, "away": 0}
    events = []

    chances = [("home", minute) for minute in sorted(rng.sample(range(3, 90), min(home_chances, 30)))]
    chances += [("away", minute) for minute in sorted(rng.sample(range(3, 90), min(away_chances, 30)))]
    chances.sort(key=lambda item: (item[1], rng.random()))
    for side, minute in chances:
        attack, defence = (home, away) if side == "home" else (away, home)
        opponent = "away" if side == "home" else "home"
        quality = max(0.035, min(0.34, 0.11 + (attack["attack"] - defence["defence"]) * 0.005 + (attack["pace"] - 70) * 0.0012 + rng.uniform(-0.04, 0.05)))
        stats["shots"][side] += 1
        stats["xg"][side] += quality
        scorer = _scorer(attack, rng)
        creator = _creator(attack, rng)
        team_name = home_name if side == "home" else away_name
        events.append({"minute": minute, "type": "pass", "side": side, "team": team_name, "player": creator, "target": scorer, "text": f"{creator} finds {scorer} with a pass"})
        if rng.random() < 0.42:
            events.append({"minute": minute, "type": "dribble", "side": side, "team": team_name, "player": scorer, "text": f"{scorer} drives forward"})
        if rng.random() < min(0.8, 0.31 + quality * 1.4):
            stats["shotsOnTarget"][side] += 1
            goal_probability = max(0.04, min(0.5, quality * (1.3 - (defence["goalkeeping"] - 70) * 0.008)))
            if rng.random() < goal_probability:
                score[side] += 1
                events.append({"minute": minute, "type": "goal", "side": side, "team": team_name, "player": scorer, "assist": creator, "text": f"GOAL! {scorer} finishes the move"})
            else:
                stats["saves"][opponent] += 1
                events.append({"minute": minute, "type": "save", "side": side, "team": team_name, "player": scorer, "text": f"{scorer} shoots — saved"})
        elif rng.random() < 0.26:
            stats["corners"][side] += 1
            events.append({"minute": minute, "type": "corner", "side": side, "team": team_name, "player": creator, "target": scorer, "text": f"Corner: {creator} swings it in for {scorer}"})
        else:
            events.append({"minute": minute, "type": "miss", "side": side, "team": team_name, "player": scorer, "text": f"{scorer} shoots wide"})

    for side, profile in (("home", home), ("away", away)):
        foul_count = max(4, round(8 + profile["pressing"] * 0.045 + rng.uniform(-2, 2)))
        stats["fouls"][side] = foul_count
        stats["offsides"][side] = max(0, round(1 + profile["tempo"] * 0.018 + rng.uniform(-1, 1)))
        yellows = 1 if rng.random() < min(0.7, 0.2 + foul_count * 0.025) else 0
        stats["yellowCards"][side] = yellows
        if yellows:
            events.append({"minute": rng.randint(18, 84), "type": "yellow", "team": home_name if side == "home" else away_name, "text": "Yellow card"})
        if rng.random() < 0.025:
            stats["redCards"][side] = 1
            events.append({"minute": rng.randint(35, 86), "type": "red", "team": home_name if side == "home" else away_name, "text": "Red card"})

    events.sort(key=lambda event: event["minute"])
    for key in ("xg",):
        stats[key]["home"] = round(stats[key]["home"], 2)
        stats[key]["away"] = round(stats[key]["away"], 2)
    penalties = None
    if score["home"] == score["away"]:
        home_penalties = rng.randint(3, 5)
        away_penalties = rng.randint(3, 5)
        while home_penalties == away_penalties:
            if rng.random() < 0.5:
                home_penalties += 1
            else:
                away_penalties += 1
        penalties = {"home": home_penalties, "away": away_penalties}
        events.append({"minute": 90, "type": "penalties", "text": f"Penalties: {home_penalties}-{away_penalties}"})
    winner = home_name if score["home"] > score["away"] or (score["home"] == score["away"] and penalties["home"] > penalties["away"]) else away_name
    return {"id": match_id, "home": home_name, "away": away_name, "status": "finished", "seed": seed, "score": score, "penalties": penalties, "winner": winner, "stats": {"possession": {"home": home_possession, "away": away_possession}, **stats}, "events": events}
