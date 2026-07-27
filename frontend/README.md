Playtest: Water Realm

Run a quick static server from the repo root and open the frontend in your browser.

Examples:

Python 3:

```
cd frontend
python -m http.server 3000
# then open http://localhost:3000 in your browser
```

Node (http-server):

```
npm install -g http-server
cd frontend
http-server -p 3000
```

The prototype loads `../cards/water.json` and images from `../assets/water/`.

Vercel deployment
-----------------

This frontend can be deployed to Vercel as a static site. The backend WebSocket server must be hosted separately (Render, Fly, Railway, etc.) and its `wss://` URL provided to the frontend via an environment variable.

1. On Vercel, set the project root to this repository and allow Vercel to detect the static site. Alternatively, the provided `vercel.json` routes the site to the `frontend/` directory.
2. Set an environment variable on Vercel named `BACKEND_WS_URL` with the WebSocket URL of your backend (e.g. `wss://sampo-backend.example.com`). The frontend will read `window.BACKEND_WS_URL` at runtime.
3. Deploy. After deployment, open the site URL and create/join sessions.

Backend deployment note
-----------------------
Vercel functions are not suitable for persistent WebSocket servers. Deploy `backend/server.js` to a platform that supports long-lived WebSocket connections (Render, Fly.io, Railway, or a VPS). Then add that `wss://` URL as `BACKEND_WS_URL` in Vercel.

