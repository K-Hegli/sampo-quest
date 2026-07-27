const CARD_JSON = '../cards/water.json'
let cards = []
let position = 0
const MAX_STEPS = 16

async function init(){
  try{
    const res = await fetch(CARD_JSON)
    cards = await res.json()
  }catch(e){
    document.getElementById('cardArea').innerHTML = '<p style="color:#f66">Failed to load cards.</p>'
    console.error(e)
    return
  }

  // Setup login flow: show login screen first
  const createBtn = document.getElementById('createBtn')
  const joinBtn = document.getElementById('joinBtn')
  const sessionInput = document.getElementById('sessionInput')
  const nameInput = document.getElementById('playerNameInput')
  const loginScreen = document.getElementById('loginScreen')
  const appRoot = document.getElementById('appRoot')

  function doLogin(){
    const name = (nameInput.value || 'Player').trim()
    window.playerName = name
    document.getElementById('playerDisplay').textContent = `Player: ${name}`
    loginScreen.classList.add('hidden')
    appRoot.classList.remove('hidden')
  }

  // WebSocket connection (will be created when creating/joining a session)
  let ws = null
  let sessionId = null

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
    // wait briefly for connection
    setTimeout(()=>{
      sendWS({ type:'create', name: window.playerName })
    }, 200)
  })

  joinBtn.addEventListener('click', ()=>{
    const code = (sessionInput.value || '').trim().toUpperCase()
    if(!code) return alert('Enter a session code to join')
    doLogin()
    connectWS()
    setTimeout(()=>{
      sendWS({ type:'join', sessionId: code, name: window.playerName })
    }, 200)
  })

  nameInput.addEventListener('keypress', (e)=>{ if(e.key==='Enter') doLogin() })

  // Wire main controls
  document.getElementById('drawBtn').addEventListener('click', ()=>{
    // if connected to session, ask server to draw
    if(ws && sessionId) sendWS({ type:'draw' })
    else drawCard()
  })
  document.getElementById('ainoBtn').addEventListener('click', showAino)
  document.getElementById('resetBtn').addEventListener('click', resetGame)
  document.getElementById('closeModal').addEventListener('click', closeModal)

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
  const el = document.createElement('div')
  el.innerHTML = `
    <h3 class="card-title">${card.title}</h3>
    <div class="card-instructions">${card.instructions}</div>
    <div class="card-meta">Difficulty: ${card.difficulty} — Success: ${card.successSteps} / Fail: ${card.failSteps}</div>
    <div class="card-actions" style="margin-top:12px">
      <button class="success">Success</button>
      <button class="fail">Fail</button>
    </div>
  `

  el.querySelector('.success').addEventListener('click', ()=>{
    applyMove(card.successSteps)
    closeModal()
  })
  el.querySelector('.fail').addEventListener('click', ()=>{
    applyMove(card.failSteps)
    closeModal()
  })

  showModal(el)
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
    document.getElementById('playerDisplay').textContent = `Player: ${window.playerName} — Session: ${sessionId}`
    alert(`Session created: ${sessionId} — share the code with others to join`)
  }
  else if(msg.type === 'joined'){
    sessionId = msg.sessionId
    document.getElementById('playerDisplay').textContent = `Player: ${window.playerName} — Session: ${sessionId}`
  }
  else if(msg.type === 'players'){
    document.getElementById('playerDisplay').textContent = `Players: ${msg.players.join(', ')}`
  }
  else if(msg.type === 'cardDrawn'){
    // show the same card for all
    showCard(msg.card)
  }
  else if(msg.type === 'position'){
    position = msg.position
    renderStatus()
  }
  else if(msg.type === 'error'){
    alert(msg.message)
  }
}

function renderStatus(){
  document.getElementById('position').textContent = position
  document.getElementById('progress').textContent = `${position}/${MAX_STEPS}`
  // Position marker (rough radial placement) — simple: rotate marker around center by sector
  const marker = document.getElementById('positionMarker')
  if(!marker) return
  const angle = (position / MAX_STEPS) * 360
  marker.style.transform = `translate(-50%,-50%) rotate(${angle}deg)`
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
