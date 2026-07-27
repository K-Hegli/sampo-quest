const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const WebSocket = require('ws')

const PORT = process.env.PORT || 8080

const wss = new WebSocket.Server({ port: PORT })

// Load water cards (English only)
const cardsPath = path.join(__dirname, '..', 'cards', 'water.json')
let waterCards = []
try{
  waterCards = JSON.parse(fs.readFileSync(cardsPath, 'utf8')).filter(c=>c.type!=='quest_giver')
}catch(e){
  console.error('Failed to load water cards:', e)
}

const sessions = new Map() // sessionId => { players: Map<playerId, {name,ws}>, position }
const sessions = new Map() // sessionId => { players: Map<playerId, {name,ws}>, position, currentCard, completions:Set }

function makeSessionId(){
  return Math.random().toString(36).slice(2,8).toUpperCase()
}

function broadcastSession(sessionId, msg){
  const s = sessions.get(sessionId)
  if(!s) return
  const data = JSON.stringify(msg)
  for(const [pid, p] of s.players.entries()){
    try{ p.ws.send(data) }catch(e){}
  }
}

wss.on('connection', function connection(ws){
  ws.id = uuidv4()
  ws.on('message', function incoming(message){
    let msg
    try{ msg = JSON.parse(message) }catch(e){ return }

    if(msg.type === 'create'){
      const sessionId = makeSessionId()
      const s = { players: new Map(), position: 0 }
      sessions.set(sessionId, s)
      s.players.set(ws.id, { name: msg.name || 'Player', ws })
      ws.sessionId = sessionId
      ws.playerName = msg.name
      // reply with created
      ws.send(JSON.stringify({ type:'created', sessionId, players: Array.from(s.players.values()).map(p=>p.name), position: s.position }))
    }

    else if(msg.type === 'join'){
      const sessionId = msg.sessionId
      const s = sessions.get(sessionId)
      if(!s){ ws.send(JSON.stringify({ type:'error', message:'Session not found' })); return }
      if(s.players.size >= 4){ ws.send(JSON.stringify({ type:'error', message:'Session full' })); return }
      s.players.set(ws.id, { name: msg.name || 'Player', ws })
      ws.sessionId = sessionId
      ws.playerName = msg.name
      // broadcast players
      broadcastSession(sessionId, { type:'players', players: Array.from(s.players.values()).map(p=>p.name) })
      // send session state to joined
      ws.send(JSON.stringify({ type:'joined', sessionId, position: s.position }))
    }

    else if(msg.type === 'draw'){
      // select random card and broadcast; initialize completion tracking
      const sessionId = ws.sessionId
      const s = sessions.get(sessionId)
      if(!s) return
      const card = waterCards[Math.floor(Math.random()*waterCards.length)]
      s.currentCard = card
      s.completions = new Set()
      broadcastSession(sessionId, { type:'cardDrawn', card })
        else if(msg.type === 'complete'){
          // mark this player as completed for current card; when all players complete, apply successSteps
          const sessionId = ws.sessionId
          const s = sessions.get(sessionId)
          if(!s || !s.currentCard) return
          s.completions.add(ws.id)
          // build list of completed player names
          const completedNames = Array.from(s.completions).map(id => {
            const p = s.players.get(id)
            return p ? p.name : id
          })
          broadcastSession(sessionId, { type:'cardCompletion', completed: completedNames })
          if(s.completions.size === s.players.size){
            // all players completed — apply successSteps
            const delta = Number(s.currentCard.successSteps) || 0
            s.position += delta
            if(s.position < 0) s.position = 0
            // broadcast resolved and new position
            broadcastSession(sessionId, { type:'cardResolved', result: 'success', delta, position: s.position })
            s.currentCard = null
            s.completions = new Set()
          }
        }
    }

    else if(msg.type === 'move'){
      const sessionId = ws.sessionId
      const s = sessions.get(sessionId)
      if(!s) return
      const delta = Number(msg.delta) || 0
      s.position += delta
      if(s.position < 0) s.position = 0
      // broadcast new position
      broadcastSession(sessionId, { type:'position', position: s.position })
    }

  })

  ws.on('close', function(){
    const sessionId = ws.sessionId
    if(!sessionId) return
    const s = sessions.get(sessionId)
    if(!s) return
    s.players.delete(ws.id)
    if(s.players.size === 0) sessions.delete(sessionId)
    else broadcastSession(sessionId, { type:'players', players: Array.from(s.players.values()).map(p=>p.name) })
  })
})

console.log('WebSocket server running on port', PORT)
