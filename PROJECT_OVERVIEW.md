# Sampo Quest – Digital Prototype

This project is a multiplayer cooperative board game prototype.  
The digital version does NOT implement the mini-games — it only displays instructions for players, who perform the actions physically.

## 🎯 Goal
Build a lightweight online multiplayer system that:
- Shows a spiral board (Water → Earth → Air → Fire)
- Lets players join a shared room
- Draws realm-specific cards
- Displays instructions
- Moves Väinämöinen forward/backward based on success/fail
- Tracks realm completion and Sampo pieces

## 📁 Folder Structure

frontend/
- SvelteKit app (deployed on Vercel)
- UI components
- Board rendering (SVG)
- Card display modal
- Room creation/join screen
- WebSocket client

backend/
- Node.js WebSocket server (deployed on Render/Fly.io)
- Room/session management
- Card draw logic
- Step movement logic
- Realm progression

cards/
- JSON files containing all realm cards:
  - water.json
  - earth.json
  - air.json
  - fire.json
- Each card includes:
  - id
  - realm
  - difficulty
  - title
  - instructions
  - successSteps
  - failSteps

assets/
- Board art (spiral)
- Realm icons
- Characters
- Sampo pieces
- Card backgrounds

## 🧩 Frontend Requirements
- SvelteKit project
- Route: / (home)
- Route: /room/[id]
- Components:
  - Board.svelte
  - CardModal.svelte
  - PlayerList.svelte
  - SampoPieces.svelte

## 🔧 Backend Requirements
- WebSocket server
- Events:
  - createRoom
  - joinRoom
  - drawCard
  - stepChange
  - realmComplete
- Broadcast updates to all clients

## 🔥 Development Notes for Copilot
- Autocomplete SvelteKit components
- Autocomplete WebSocket handlers
- Autocomplete JSON card loaders
- Autocomplete board SVG rendering
- Autocomplete room logic
- Autocomplete UI layout
