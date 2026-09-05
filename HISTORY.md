# Project History

## Current project

Transfer Window Auction Room is a FastAPI multiplayer football transfer-auction game. The active branch is `main` and the latest pushed commit is `56617e7`.

## Completed changes

### Live match broadcast redesign

- The live match view now uses a stadium-night broadcast layout with team crests, a central live scoreboard, match-time progress rail, and a stronger pitch presentation.
- Added a real-time match pulse panel derived from the synchronized server event feed, including attacking sequences and shot counts for both teams.
- Commentary is now a clearer, typed live feed with event labels, while host speed controls and the existing authoritative match simulation remain unchanged.

### Manager count and tournament

- Rooms now support **2–8 managers**.
- Auction lock, tactics, evaluation, and tournament validation accept 2–8 completed XIs.
- Tournament format is now a single-elimination knockout bracket.
  - 2 managers: Final.
  - 3 managers: one semi-final plus a bye.
  - 4 managers: two semi-finals and a Final.
  - 5–8 managers: quarter-final/semi-final/final route with automatic byes.
- The test-fill shortcut now creates at least four teams so the full semi-final/final bracket can be tested.
- Bracket routing was repaired so semi-final winners automatically populate the Final, including repairs for old saved rooms whose Final had been marked `void`.

### Auction and match cards

- Each manager receives private game-card hands.
- Rewards:
  - 2 auction cards at the start.
  - 1 auction card after 5 signings.
  - 2 match cards after completing an XI.
- Test-filled and previously completed teams receive the appropriate milestone rewards.
- Implemented cards:
  - Freeze, Scout Report, Bid Shield, Hijack.
  - Out of Position, Captain’s Gambit, Counter Attack, Park the Bus, Team Talk.
- Out of Position can force a rival outfield player into a role such as CB for a selected match.
- Captain’s Gambit makes the chosen captain’s goals count double.
- Card effects are authoritative on the server and hands are hidden from other managers.

### Tactics and evaluation

- Tactics controls now auto-save with a short debounce to avoid editor refreshes during interaction.
- Formation, styles, sliders, roles, and dragged player positions are persisted.
- Phase 2 was restyled as a football tactical control deck with a green pitch and improved controls.
- Phase 3 uses saved tactics and tactical changes affect evaluation scores.

### Tournament presentation

- Phase 4 uses a larger connected visual bracket with round columns, route lines, and a central trophy area.
- A fixture-draw reveal is shown for fresh tournaments.
- A champion reveal, stadium ambience, trophy effects, confetti, and a final leaderboard are included.
- The trophy/anthem assets are served from the project `assets/` directory.

### Team identity

- Managers can use **Customize team** on their own team card.
- The in-game form supports a display name and a logo image smaller than 250 KB.
- Team name/logo appear on team cards and in the tournament bracket.

### Modals and audio

- Browser confirmations/prompts for auction and card actions were replaced with in-game dialogs where applicable.
- Local Champions League anthem file is used in the champion reveal, with generated fanfare fallback if autoplay is blocked.
- Resetting the room stops and rewinds the anthem.

## Assets

- `assets/champions-anthem.mp3` — user-provided anthem.
- `assets/champions-trophy.jpg` — supplied trophy artwork.
- `assets/champions-trophy.png` — supplied white trophy image used by the champion reveal.

## Important files

- `server.py` — game authority, cards, knockout bracket, team identity, persistence.
- `index.html` — primary client UI, game cards, dialogs, team identity form.
- `tactics.js` / `tactics.css` — tactical editor and auto-save behavior.
- `tournament.js` / `tournament.css` — bracket, live match UI, draw and champion presentation.
- `results.js` / `results.css` — final leaderboard and celebrations.
- `sound.js` — sound effects, anthem playback, reset handling.
- `render.yaml` — Render deployment setup.

## Validation performed

- Python compilation: `server.py`, `match_engine.py`, and `database.py`.
- JavaScript syntax checks for the standalone tournament, results, tactics, evaluator, and sound scripts.
- Verified 3-manager bye behavior.
- Verified completed-XI match-card rewards.
- Verified forced-position card effect and private card hands.
- Verified saved semi-final winners repair into a ready Final.

## Deployment

- Changes were committed and pushed to GitHub:
  - Commit `56617e7` — `Add game cards, knockout bracket, and tournament presentation`.
- Render is configured through `render.yaml` and should deploy automatically from `main`.

## Notes for future work

- A full “Road to Glory” recap video should store a permanent auction-history timeline (sales, bids, card plays) in addition to the existing match event timelines.
- For a brand-new tournament presentation, reset the room and start a fresh tournament; already-created tournament states retain their existing matches.
