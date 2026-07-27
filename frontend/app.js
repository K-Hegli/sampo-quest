const CARD_JSON = '/cards/water.json'
let cards = []
let position = 0
const MAX_STEPS = 12
let ws = null
let sessionId = null
let players = []

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
    ws.addEventListener('open', ()=>{ console.log('ws open') })
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
  debugPanel.textContent = `Backend: ${ (typeof window.BACKEND_WS_URL==='string') ? window.BACKEND_WS_URL : 'unset' }`

  renderStatus()
}

function drawCard(){
  const pool = cards.filter(c => c.type !== 'quest_giver')
  const card = pool[Math.floor(Math.random() * pool.length)]
  showCard(card)
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
    // render players
    renderPlayers()
    renderStatus()
  }
  else if(msg.type === 'cardDrawn' || msg.type === 'card'){
    showCard(msg.card || msg.card)
  }
  else if(msg.type === 'cardCompletion'){
    // update completed list in modal
    const list = msg.completed || []
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
