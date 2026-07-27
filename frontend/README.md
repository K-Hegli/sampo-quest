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
