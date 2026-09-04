# Football Transfer Auction

Multiplayer football management game with an authoritative FastAPI server, live WebSockets, tactical setup, deterministic evaluation, live match simulation, and a four-team tournament.

## Accounts and rooms

- Create an account, then create or join a room code with up to three friends.
- The first player in a room becomes host; every member receives a personal team and $100M.
- User records persist: tournament wins, titles, and games played appear on team cards and the profile chip.
- Rooms and accounts use SQLite automatically for local development and PostgreSQL when `DATABASE_URL` is configured.

## Included phases

- **Auction:** live, server-authoritative bidding; pass/drop actions; budgets; unique player ownership; local player database.
- **Tactics:** formations, drag-and-drop pitch positions, roles, attacking/defensive styles, and pressing/tempo/width controls.
- **Evaluation:** deterministic server-side squad and tactical ranking with strengths and risks.
- **Tournament:** two semi-finals and a final, with server-side live match events, xG, possession, shots, cards, and controlled seeded randomness.
- **Final results:** champion, best manager, tournament records, winner animation, and persistent player titles.

## Development shortcut

The host can select **Fill Teams for Phase 2 Test**. It prepares four unique squads so later phases can be tested without completing an auction.

## Run locally on Windows

Double-click `start.bat`, then open `http://localhost:8000`.

Create four accounts (or use four browser profiles), then join the same room code.

## Run locally on macOS / Linux

```bash
chmod +x start.sh
./start.sh
```

## Other devices on the same Wi-Fi

The server listens on `0.0.0.0`. Find the host computer's LAN IP and open `http://HOST_LAN_IP:8000`. Your firewall may ask you to allow Python on private networks.

## Deploy on Render

1. Push this project to GitHub.
2. In Render, create a **Blueprint** from the repository. It reads `render.yaml` and creates the web service plus PostgreSQL database.
3. Keep the generated `AUTH_SECRET` private. Render passes `DATABASE_URL` to the service automatically.
4. Open the deployed URL, register accounts, and share a room code with friends.

For another host, configure:

```text
DATABASE_URL=postgresql://...
AUTH_SECRET=a-long-random-secret
```

Without `DATABASE_URL`, the game creates `data/transfer-auction.db` locally.

## Important files

- `server.py` - FastAPI server, WebSockets, auctions, phase transitions, and game authority.
- `database.py` - SQLite/PostgreSQL persistence for accounts, memberships, records, and room state.
- `match_engine.py` - deterministic server-side football match engine.
- `index.html` - main game interface and room/account client flow.
- `tactics.js`, `evaluator.js`, `tournament.js`, `results.js` - phase-specific interfaces.
- `sound.js` - browser-generated football and auction sound effects.
- `data/players.json` - local player database.

## Notes

- The game does not use `window.storage`, Anthropic, or any AI API.
- The server is authoritative for auction actions, tactics, evaluation, simulations, tournament results, accounts, and records.
