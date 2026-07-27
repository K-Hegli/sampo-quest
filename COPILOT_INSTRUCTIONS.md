# Copilot Project Instructions — Multiplayer Session Rules

Summary
-------
This project implements a lightweight online cooperative prototype for the Water Realm. The important constraint for Copilot is: there is NO authentication — the login is only a name entry and a session join/create gateway. Use this document as the canonical brief when generating UI, routes, or backend handlers.

Key rules
---------
- No accounts, no passwords, no auth flows.
- Login screen = name entry + Create/Join session controls.
- Sessions: short session code (e.g. 6 alphanumeric chars), 1–4 players.
- Session creator is redirected to `/session/[code]` and becomes the first player.
- Players join by entering the session code.
- All players in a session see the same UI state: board, current card, position.
- The backend is only a WebSocket sync server. It does NOT run or validate mini-game logic.
  - Backend responsibilities: create sessions, add/remove players, broadcast events (cardDrawn, position updates, players list).
  - Backend must enforce max 4 players per session.
- Frontend responsibilities: show Water Realm art, show card instructions (English only for now), show realm icon, show difficulty, show movement steps, and send draw/move events to the backend.

Events (minimum)
-----------------
- From client → server:
  - `create` { name } → create session and make sender the first player
  - `join` { sessionId, name } → join session
  - `draw` → request server to pick a random card and broadcast it
  - `move` { delta } → broadcast position change (successSteps or failSteps)

- From server → clients:
  - `created` { sessionId, players, position }
  - `joined` { sessionId, position }
  - `players` { players }
  - `cardDrawn` { card }
  - `position` { position }
  - `error` { message }

UI guidance for Copilot
-----------------------
- Provide a simple name entry screen with `Create Game` and `Join Game` (session code field).
- After joining, show `/session/[code]` with:
  - Water Realm background art
  - Board image
  - Current position indicator
  - Card modal area showing title, instructions, difficulty (stars), and image (if present)
  - Buttons: `Draw Card`, `Success`, `Fail`, and `Talk to Aino` (quest modal)
- If backend is unavailable, the frontend should fall back to single-player local behavior (random draws + local position changes).

Answers to likely Copilot follow-ups
----------------------------------
- Q: How should sessions be created?
  - A: Generate a short session ID and redirect the creator to `/session/[id]`. Add them as the first player.

- Q: How should players join?
  - A: They enter a session code and get added to the same room. Max 4 players.

- Q: What does the backend do?
  - A: It only syncs state: players, card draws, movement, and realm progress.

- Q: What does the frontend do?
  - A: It shows the Water Realm art, the card instructions, and the shared board.

- Q: Should game logic run on the backend?
  - A: No. Players perform the mini-games physically. The backend only syncs state.

Deployment notes
----------------
- Deploy the frontend to Vercel (static) and host the WebSocket backend on a platform that supports long-lived sockets (Render, Fly, Railway). Provide the backend WebSocket `wss://` URL to the frontend via `BACKEND_WS_URL`.
