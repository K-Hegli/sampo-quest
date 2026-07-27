const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const WebSocket = require('ws')

const PORT = process.env.PORT || 8080

const http = require('http')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')
const WebSocket = require('ws')

const PORT = process.env.PORT || 8080

// Load water cards (English only)
const cardsPath = path.join(__dirname, '..', 'cards', 'water.json')
let waterCards = []
try{
  waterCards = JSON.parse(fs.readFileSync(cardsPath, 'utf8')).filter(c=>c.type!=='quest_giver')
}catch(e){
  console.error('Failed to load water cards:', e)
}

const sessions = new Map() // sessionId => { players: Map<playerId, {name,ws}>, position, currentCard, completions:Set, finished }

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

function buildState(sessionId){
  const s = sessions.get(sessionId)
  if(!s) return null
  return {
    sessionId,
    players: Array.from(s.players.values()).map(p=>p.name),
    position: s.position,
    currentCard: s.currentCard || null,
    completedBy: Array.from(s.completions || []).map(id=> { const p = s.players.get(id); return p? p.name : id }),
    finished: !!s.finished
  }
}

const server = http.createServer((req,res)=>{
  if(req.url === '/health'){
    res.writeHead(200, {'Content-Type':'application/json'})
    res.end(JSON.stringify({ status:'ok', time: Date.now() }))
    return
  }
  res.writeHead(404)
  res.end()
})

const wss = new WebSocket.Server({ server })

wss.on('connection', function connection(ws, req){
  ws.id = uuidv4()
  console.log(new Date().toISOString(), 'ws connection', ws.id, 'from', req.socket.remoteAddress)

  function send(obj){ try{ ws.send(JSON.stringify(obj)) }catch(e){} }

  ws.on('message', function incoming(message){
    let msg
    try{ msg = JSON.parse(message) }catch(e){ return }

    console.log(new Date().toISOString(), 'recv', msg.type, 'from', ws.id)

    // Accept both old and new event names
    const type = msg.type

    if(type === 'create' || type === 'createSession'){
      const sessionId = makeSessionId()
      const s = { players: new Map(), position: 0, currentCard: null, completions: new Set(), finished: false }
      sessions.set(sessionId, s)
      s.players.set(ws.id, { name: (msg.name || 'Player').slice(0,32), ws })
      ws.sessionId = sessionId
      ws.playerName = msg.name
      console.log(new Date().toISOString(), 'session created', sessionId, 'by', ws.id)
      send({ type: (type==='createSession'?'sessionCreated':'created'), sessionId, state: buildState(sessionId) })
      broadcastSession(sessionId, { type:'stateSync', state: buildState(sessionId) })
    }

    else if(type === 'join' || type === 'joinSession'){
      const sessionId = (msg.sessionId || msg.session || '').toString().toUpperCase()
      const s = sessions.get(sessionId)
      if(!s){ send({ type:'error', message:'Session not found' }); return }
      if(s.players.size >= 4){ send({ type:'error', message:'Session full' }); return }
      s.players.set(ws.id, { name: (msg.name || 'Player').slice(0,32), ws })
      ws.sessionId = sessionId
      ws.playerName = msg.name
      console.log(new Date().toISOString(), 'player joined', ws.id, '->', sessionId)
      broadcastSession(sessionId, { type:'playerJoined', name: msg.name, state: buildState(sessionId) })
      send({ type:(type==='joinSession'?'joinedSession':'joined'), sessionId, state: buildState(sessionId) })
    }

    else if(type === 'draw' || type === 'drawCard'){
      const sessionId = ws.sessionId
      const s = sessions.get(sessionId)
      if(!s) return
      if(s.finished){ send({ type:'error', message:'Realm already completed' }); return }
      const card = waterCards[Math.floor(Math.random()*waterCards.length)]
      s.currentCard = { id: card.id, title: card.title, instructions: card.instructions, successSteps: card.successSteps }
      s.completions = new Set()
      console.log(new Date().toISOString(), 'card drawn', s.currentCard.id, 'in', sessionId)
      broadcastSession(sessionId, { type:'drawCard', card: s.currentCard, state: buildState(sessionId) })
    }

    else if(type === 'complete' || type === 'playerComplete'){
      const sessionId = ws.sessionId
      const s = sessions.get(sessionId)
      if(!s || !s.currentCard) return
      s.completions.add(ws.id)
      console.log(new Date().toISOString(), 'player complete', ws.id, 'in', sessionId)
      broadcastSession(sessionId, { type:'cardComplete', completedBy: Array.from(s.completions).map(id=> { const p = s.players.get(id); return p? p.name : id }), state: buildState(sessionId) })
      // if all connected players completed
      if(s.completions.size === s.players.size){
        const delta = Number(s.currentCard.successSteps) || 0
        s.position += delta
        if(s.position < 0) s.position = 0
        console.log(new Date().toISOString(), 'card resolved, movement', delta, '-> pos', s.position)
        if(s.position > 11){
          s.finished = true
          broadcastSession(sessionId, { type:'movement', position: s.position, delta, state: buildState(sessionId) })
          broadcastSession(sessionId, { type:'realmComplete', position: s.position, state: buildState(sessionId) })
        } else {
          broadcastSession(sessionId, { type:'movement', position: s.position, delta, state: buildState(sessionId) })
        }
        s.currentCard = null
        s.completions = new Set()
        // broadcast full state
        broadcastSession(sessionId, { type:'stateSync', state: buildState(sessionId) })
      }
    }

    else if(type === 'stateRequest'){
      const sessionId = ws.sessionId
      send({ type:'stateSync', state: buildState(sessionId) })
    }

  })

  ws.on('close', function(){
    const sessionId = ws.sessionId
    console.log(new Date().toISOString(), 'ws close', ws.id, 'session', sessionId)
    if(!sessionId) return
    const s = sessions.get(sessionId)
    if(!s) return
    s.players.delete(ws.id)
    // if no players, remove session
    if(s.players.size === 0) { sessions.delete(sessionId); console.log(new Date().toISOString(),'session removed', sessionId); return }
    // remove from completions
    if(s.completions) s.completions.delete(ws.id)
    // broadcast state
    broadcastSession(sessionId, { type:'playerLeft', id: ws.id, state: buildState(sessionId) })
  })

})

server.listen(PORT, ()=>{
  console.log(new Date().toISOString(), 'Server listening on', PORT)
})

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
