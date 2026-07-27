const CARD_JSON = '/cards/water.json'
let cards = []
let position = 0
const MAX_STEPS = 12
let ws = null
let sessionId = null
let players = []
let currentCard = null
let completedBy = []
let lastWsMessage = null
let connectionMode = 'UNKNOWN' // 'REAL' or 'MOCK' or 'NONE'
let debugCollapsed = (localStorage.getItem('sampo_debug_collapsed') === 'true')

// Lightweight mock WebSocket for offline/dev testing
class MockSocket{
  constructor(){ this._listeners = {}; this.readyState = 1; setTimeout(()=>this._trigger('open'),10); }
  addEventListener(ev, fn){ (this._listeners[ev] ||= []).push(fn) }
  _trigger(ev, arg){ const list = this._listeners[ev] || []; list.forEach(fn=>{ try{ fn(arg) }catch(e){} }) }
  send(data){ try{ const msg = JSON.parse(data); this._handle(msg) }catch(e){} }
  close(){ this.readyState = 3; this._trigger('close') }
  _handle(msg){
    // simulate server-like responses
    const type = msg.type
    if(type==='create'){
      const sid = (Math.random().toString(36).slice(2,8)).toUpperCase()
      this.sessionId = sid
      this._trigger('message', { data: JSON.stringify({ type:'created', sessionId: sid, state:{ sessionId: sid, players:[msg.name||window.playerName], position:0 } }) })
      this._trigger('message', { data: JSON.stringify({ type:'stateSync', state:{ sessionId: sid, players:[msg.name||window.playerName], position:0 } }) })
    }
    else if(type==='join'){
      const sid = msg.sessionId
      this.sessionId = sid
      this._trigger('message', { data: JSON.stringify({ type:'joined', sessionId: sid, state:{ sessionId: sid, players:[msg.name||window.playerName], position:0 } }) })
    }
    else if(type==='draw'){
      const pool = (window.cards || [])
      const card = pool[Math.floor(Math.random()*Math.max(pool.length,1))] || { id:'mock-1', title:'Mock Card', instructions:'Do a thing', successSteps:1 }
      this._trigger('message', { data: JSON.stringify({ type:'card', card }) })
    }
    else if(type==='complete'){
      // immediate resolved for mock: move by card.successSteps if available
      const delta = 1
      const newPos = (this._pos||0) + delta
      this._pos = newPos
      this._trigger('message', { data: JSON.stringify({ type:'cardComplete', completed: [window.playerName], state:{ sessionId: this.sessionId, players:[window.playerName], position: this._pos } }) })
      setTimeout(()=>{
        this._trigger('message', { data: JSON.stringify({ type:'cardResolved', result:'success', delta, position: this._pos, state:{ sessionId: this.sessionId, players:[window.playerName], position: this._pos } }) })
        this._trigger('message', { data: JSON.stringify({ type:'stateSync', state:{ sessionId: this.sessionId, players:[window.playerName], position: this._pos } }) })
      },300)
    }
    else if(type==='stateRequest'){
      this._trigger('message', { data: JSON.stringify({ type:'stateSync', state:{ sessionId: this.sessionId||null, players: [window.playerName].filter(Boolean), position: this._pos||0 } }) })
    }
  }
}

// mark mock mode when initialized
function initMockSocket(){ ws = new MockSocket(); connectionMode = 'MOCK'; ws.addEventListener('message', (e)=>{ let msg; try{ msg = JSON.parse(e.data) }catch(err){ return } handleMessage(msg) }); ws.addEventListener('open', ()=>{ console.log('mock ws open') }) }

async function init(){
  try{
    const res = await fetch(CARD_JSON)
    cards = await res.json()
  }catch(e){
    document.getElementById('cardArea').innerHTML = '<p style="color:#f66">Failed to load cards.</p>'
    console.error(e)
    return
  }

  // Router: if the URL already contains /session/<id>, auto-open session
  const path = location.pathname || '/'
  const sessionMatch = path.match(/^\/session\/(.+)/)
  // DOM refs
  const createBtn = document.getElementById('createBtn')
  const joinBtn = document.getElementById('joinBtn')
  const sessionInput = document.getElementById('sessionInput')
  const nameInput = document.getElementById('playerNameInput')
  const loginScreen = document.getElementById('loginScreen')
  const appRoot = document.getElementById('appRoot')
  const playerList = document.getElementById('playerList')
  const sessionName = document.getElementById('sessionName')
  const sessionStatus = document.getElementById('sessionStatus')
  const debugPanel = document.getElementById('debugPanel')
  const boardEl = document.getElementById('board')
  const boardImg = document.getElementById('boardImg')
  const vainImg = document.getElementById('vainamoinenImg')
  const segmentsEl = document.getElementById('segments')
  const drawBtn = document.getElementById('drawBtn')
  const ainoBtn = document.getElementById('ainoBtn')
  const resetBtn = document.getElementById('resetBtn')
  const cardModal = document.getElementById('cardModal')
  const overlayModal = document.getElementById('overlayModal')
  const modalBody = document.getElementById('modalBody')
  const closeModalBtn = document.getElementById('closeModal')
  const completeBtn = document.getElementById('completeBtn')
  const completedByList = document.getElementById('completedByList')

  if(sessionMatch){
    const sid = sessionMatch[1]
    // hide login and show app
    window.playerName = nameInput.value || 'Player'
    loginScreen.classList.add('hidden')
    appRoot.classList.remove('hidden')
    sessionId = sid.toUpperCase()
    connectWS()
    // try joining when ws opens
    setTimeout(()=>{ if(ws && ws.readyState===WebSocket.OPEN) sendWS({ type:'join', sessionId, name: window.playerName }) }, 300)
  }

  function doLogin(){
    const name = (nameInput.value || 'Player').trim()
    window.playerName = name
    document.getElementById('playerDisplay').textContent = `Player: ${name}`
    loginScreen.classList.add('hidden')
    appRoot.classList.remove('hidden')
  }

  function connectWS(){
    if(ws) return
    // Allow deployment to set the backend WebSocket via a global `BACKEND_WS_URL` env var in Vercel.
    // If not set, fall back to localhost for development.
    const envUrl = (typeof window !== 'undefined' && window.BACKEND_WS_URL) ? window.BACKEND_WS_URL : null
    const url = envUrl || ((location.hostname === 'localhost') ? 'ws://localhost:8080' : `wss://${location.hostname}:8080`)
    ws = new WebSocket(url)
    connectionMode = 'REAL'
    ws.addEventListener('open', ()=>{ console.log('ws open'); if(sessionId) sendWS({ type:'stateRequest' }) })
    ws.addEventListener('error', (err)=>{ console.warn('ws error, falling back to mock', err); try{ initMockSocket() }catch(e){ console.error(e) } })
    ws.addEventListener('message', e=>{
      let msg
      try{ msg = JSON.parse(e.data) }catch(err){return}
      handleMessage(msg)
    })
    ws.addEventListener('close', ()=>{ console.log('ws closed'); ws = null })
  }

  function sendWS(obj){ if(ws && ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj)) }

  createBtn.addEventListener('click', ()=>{
    doLogin()
    connectWS()
    // wait briefly for connection; if no WS open, create a local session fallback so creator can test alone
    setTimeout(()=>{
      if(ws && ws.readyState===WebSocket.OPEN){
        sendWS({ type:'create', name: window.playerName })
      } else {
        // local fallback session code
        sessionId = Math.random().toString(36).slice(2,8).toUpperCase()
        // update URL to session route
        history.replaceState({}, '', `/session/${sessionId}`)
        document.getElementById('playerDisplay').textContent = `Player: ${window.playerName} — Session: ${sessionId} (local)`
        alert(`Local session created: ${sessionId} (no backend connection). Invite others once backend is configured.`)
      }
    }, 400)
  })

  joinBtn.addEventListener('click', ()=>{
    const code = (sessionInput.value || '').trim().toUpperCase()
    if(!code) return alert('Enter a session code to join')
    doLogin()
    connectWS()
    setTimeout(()=>{
      if(ws && ws.readyState===WebSocket.OPEN){
        // navigate to session URL and send join
        history.replaceState({}, '', `/session/${code}`)
        sessionId = code
        sendWS({ type:'join', sessionId: code, name: window.playerName })
      } else {
        alert('Unable to join: backend WebSocket not connected. Configure BACKEND_WS_URL or run the backend and try again.')
      }
    }, 400)
  })

  nameInput.addEventListener('keypress', (e)=>{ if(e.key==='Enter') doLogin() })

  // Login music controls
  const loginMusic = document.getElementById('loginMusic')
  const musicToggle = document.getElementById('musicToggle')
  function updateMusicButton(){ if(!musicToggle || !loginMusic) return; const muted = loginMusic.muted; musicToggle.setAttribute('aria-pressed', muted ? 'true' : 'false'); musicToggle.textContent = muted ? '🔇' : '🔊' }
  function tryPlayMusic(){ if(!loginMusic) return; loginMusic.loop = true; loginMusic.volume = 0.6; const stored = localStorage.getItem('sampo_music_muted'); if(stored==='true') loginMusic.muted = true; updateMusicButton(); const p = loginMusic.play(); if(p && p.catch) p.catch(()=>{ // wait for user gesture
      const resume = ()=>{ loginMusic.play().catch(()=>{}); document.removeEventListener('click', resume) }
      document.addEventListener('click', resume)
    }) }
  if(loginScreen && !loginScreen.classList.contains('hidden')) tryPlayMusic()
  if(musicToggle){ musicToggle.addEventListener('click', ()=>{ if(!loginMusic) return; loginMusic.muted = !loginMusic.muted; localStorage.setItem('sampo_music_muted', loginMusic.muted ? 'true' : 'false'); updateMusicButton() }) }

  // Pause music when moving into the app
  const originalDoLogin = doLogin
  doLogin = function(){
    if(loginMusic){
      try{
        loginMusic.pause()
        loginMusic.currentTime = 0
        loginMusic.muted = true
      }catch(e){}
      // update UI and persist preference
      const musicToggleEl = document.getElementById('musicToggle')
      if(musicToggleEl){ musicToggleEl.setAttribute('aria-pressed','true'); musicToggleEl.textContent = '🔇' }
      try{ localStorage.setItem('sampo_music_muted','true') }catch(e){}
    }
    originalDoLogin()
  }

  // Wire main controls
  drawBtn.addEventListener('click', ()=>{ if(ws && sessionId) sendWS({ type:'draw' }) ; else drawCard() })
  ainoBtn.addEventListener('click', showAino)
  resetBtn.addEventListener('click', resetGame)
  closeModalBtn.addEventListener('click', ()=>{ overlayModal.classList.add('hidden') })
  completeBtn.addEventListener('click', ()=>{ if(ws && sessionId) sendWS({ type:'complete' }); completeBtn.disabled=true; completeBtn.textContent='Waiting...' })

  // render segments grid
  segmentsEl.innerHTML = ''
  for(let i=0;i<MAX_STEPS;i++){
    const s = document.createElement('div')
    s.className = 'segment'
    s.textContent = i+1
    segmentsEl.appendChild(s)
  }

  // debug
  updateDebug()

  renderStatus()
}

function drawCard(){
  const pool = cards.filter(c => c.type !== 'quest_giver')
  const card = pool[Math.floor(Math.random() * pool.length)]
  showCard(card)
}

function updateDebug(){
  try{
    const el = document.getElementById('debugPanel')
    if(!el) return
    const backend = (typeof window.BACKEND_WS_URL==='string') ? window.BACKEND_WS_URL : (connectionMode==='MOCK' ? 'MOCK' : 'unset')
    const status = ws ? (ws.readyState===1 ? 'OPEN' : (ws.readyState===3 ? 'CLOSED' : 'CONNECTING')) : 'NONE'
    const playersList = players && players.length ? players.join(', ') : '—'
    const cc = currentCard ? `${currentCard.id || ''} ${currentCard.title || ''} (steps:${currentCard.successSteps||currentCard.steps||''})` : '—'
    const completed = (completedBy && completedBy.length) ? completedBy.join(', ') : '—'
    el.innerHTML = `
      <div class="dev-debug">
        <button id="debugToggle" class="dev-toggle">${debugCollapsed? '▶':'▼'} DEV DEBUG</button>
        <div class="dev-content" style="display:${debugCollapsed?'none':'block'}">
          <div class="dev-row"><strong>Backend:</strong> <span>${backend}</span></div>
          <div class="dev-row"><strong>Conn:</strong> <span>${status}</span></div>
          <div class="dev-row"><strong>Session:</strong> <span>${sessionId||'—'}</span></div>
          <div class="dev-row"><strong>Players:</strong> <span>${playersList}</span></div>
          <div class="dev-row"><strong>Position:</strong> <span>${position}</span></div>
          <div class="dev-row"><strong>CurrentCard:</strong> <pre>${cc}</pre></div>
          <div class="dev-row"><strong>CompletedBy:</strong> <span>${completed}</span></div>
          <div class="dev-row"><strong>Last WS:</strong> <pre>${lastWsMessage||'—'}</pre></div>
        </div>
      </div>`
    const btn = document.getElementById('debugToggle')
    if(btn){ btn.addEventListener('click', ()=>{ debugCollapsed = !debugCollapsed; localStorage.setItem('sampo_debug_collapsed', debugCollapsed?'true':'false'); updateDebug() }) }
  }catch(e){console.warn('debug update failed', e)}
}

function showAino(){
  const aino = cards.find(c => c.npc && c.npc.name && c.npc.name.toLowerCase()==='aino')
  if(!aino) return alert('Aino not available')
  showModal(renderAino(aino))
}

function renderAino(aino){
  const q = aino.quest
  const el = document.createElement('div')
  el.innerHTML = `<h2>${aino.npc.name} — ${aino.npc.title}</h2>
    <p>${aino.npc.description}</p>
    <p><strong>Quest:</strong> ${q.title}</p>
    <p>${q.description}</p>
    <ul>${q.tasks.map(t=>`<li>${t.description}</li>`).join('')}</ul>
    <div style="margin-top:10px"><button id="startQuest">Start Quest</button></div>`

  el.querySelector('#startQuest').addEventListener('click', ()=>{
    closeModal()
    alert('Quest started — complete the listed mini-games by drawing cards.')
  })
  return el
}

function showCard(card){
  // populate card modal
  document.getElementById('cardTitle').textContent = card.title
  document.getElementById('cardInstructions').innerHTML = card.instructions
  document.getElementById('cardDifficulty').textContent = `Difficulty: ${card.difficulty} — Moves: ${card.successSteps}`
  completedByList.innerHTML = ''
  // show modal
  cardModal.classList.remove('hidden')
  // if offline single player
  if(!ws || !sessionId){
    completeBtn.textContent = 'Success'
    completeBtn.disabled = false
    completeBtn.onclick = ()=>{ applyMove(card.successSteps); cardModal.classList.add('hidden') }
  } else {
    completeBtn.textContent = 'Complete'
    completeBtn.disabled = false
    // completions will be updated via server messages
  }
}

function applyMove(delta){
  // if connected, send move to server
  if(ws && sessionId){ sendWS({ type:'move', delta }) ; return }
  position += delta
  if(position < 0) position = 0
  if(position > MAX_STEPS) position = MAX_STEPS
  renderStatus()
}

function handleMessage(msg){
  try{ lastWsMessage = typeof msg === 'string' ? msg : JSON.stringify(msg) }catch(e){ lastWsMessage = String(msg) }
  if(msg.type === 'created'){
    sessionId = msg.sessionId
    history.replaceState({},'',`/session/${sessionId}`)
    document.getElementById('playerDisplay').textContent = `Player: ${window.playerName} — Session: ${sessionId}`
    sessionName.textContent = `Water Realm — ${sessionId}`
    sessionStatus.textContent = 'Session created'
    alert(`Session created: ${sessionId} — share the code with others to join`)
  }
  else if(msg.type === 'joined'){
    sessionId = msg.sessionId
    sessionName.textContent = `Water Realm — ${sessionId}`
    sessionStatus.textContent = 'Joined session'
  }
  else if(msg.type === 'stateSync'){
    // authoritative state from server
    players = msg.state.players || []
    position = msg.state.position || 0
    currentCard = msg.state.currentCard || null
    completedBy = msg.state.completedBy || msg.state.completed || []
    // render players
    renderPlayers()
    renderStatus()
  }
  else if(msg.type === 'cardDrawn' || msg.type === 'card'){
    currentCard = msg.card || msg.card
    completedBy = []
    showCard(msg.card || msg.card)
  }
  else if(msg.type === 'cardCompletion'){
    // update completed list in modal
    const list = msg.completed || msg.completedBy || []
    completedBy = list
    completedByList.innerHTML = ''
    list.forEach(n=>{
      const el = document.createElement('div')
      el.className = 'small-check'
      el.title = n
      completedByList.appendChild(el)
    })
  }
  else if(msg.type === 'cardResolved'){
    position = msg.position || position
    renderStatus()
    cardModal.classList.add('hidden')
    alert(`Card resolved: ${msg.result}. Moved ${msg.delta} steps.`)
    currentCard = null
    completedBy = []
  }
  else if(msg.type === 'realmComplete'){
    position = msg.position || position
    renderStatus()
    cardModal.classList.add('hidden')
    drawBtn.disabled = true
    overlayModal.classList.remove('hidden')
    modalBody.innerHTML = `<h2>Water Realm Complete</h2><p>Väinämöinen has reached the final segment.</p><p>Well done!</p>`
  }
  else if(msg.type === 'error'){
    alert(msg.message)
  }
  // update debug panel after handling
  updateDebug()
}

function renderPlayers(){
  const playerList = document.getElementById('playerList')
  playerList.innerHTML = ''
  players.forEach(p=>{
    const el = document.createElement('div')
    el.className = 'player'
    el.innerHTML = `<div class="avatar"></div><div class="name">${p}</div>`
    playerList.appendChild(el)
  })
  updateDebug()
}

function renderStatus(){
  document.getElementById('position').textContent = position
  document.getElementById('progress').textContent = `${position}/${MAX_STEPS}`
  // Move Väinämöinen image around the board in a circle
  const vain = document.getElementById('vainamoinenImg')
  const board = document.getElementById('boardImg')
  if(!vain || !board) return
  const rect = board.getBoundingClientRect()
  const cx = rect.width/2
  const cy = rect.height/2
  const angle = (position / MAX_STEPS) * 2 * Math.PI
  const radius = Math.min(cx, cy) * 0.45
  const x = cx + radius * Math.cos(angle - Math.PI/2)
  const y = cy + radius * Math.sin(angle - Math.PI/2)
  // position absolutely relative to board container
  const boardRect = document.getElementById('board').getBoundingClientRect()
  const relX = (x / rect.width) * boardRect.width
  const relY = (y / rect.height) * boardRect.height
  vain.style.left = `${relX}px`
  vain.style.top = `${relY}px`
  vain.style.transform = `translate(-50%,-50%)`
  // highlight current segment
  const segs = document.querySelectorAll('.segment')
  segs.forEach((s,i)=> s.classList.toggle('current', i===position))
  updateDebug()
}

function resetGame(){
  if(!confirm('Reset position and progress?')) return
  position = 0
  renderStatus()
}

function showModal(node){
  const modal = document.getElementById('modal')
  document.getElementById('modalBody').innerHTML = ''
  document.getElementById('modalBody').appendChild(node)
  modal.classList.remove('hidden')
}

function closeModal(){
  document.getElementById('modal').classList.add('hidden')
}

window.addEventListener('DOMContentLoaded', init)
