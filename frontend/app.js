const CARD_JSON = '../cards/water.json'
let cards = []
let position = 0
const MAX_STEPS = 12

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
    <div class="card-meta">Difficulty: ${card.difficulty} — Moves: ${card.successSteps}</div>
    <div id="completionArea" style="margin-top:12px"></div>
  `

  const completionArea = el.querySelector('#completionArea')

  if(ws && sessionId){
    // multiplayer: show Complete button (each player must click)
    const btn = document.createElement('button')
    btn.textContent = 'Complete'
    btn.className = 'success'
    btn.addEventListener('click', ()=>{
      sendWS({ type: 'complete' })
      btn.disabled = true
      btn.textContent = 'Waiting...'
    })
    completionArea.appendChild(btn)
    const list = document.createElement('div')
    list.id = 'completionList'
    list.textContent = 'Completed: 0'
    completionArea.appendChild(list)
  } else {
    // single-player fallback: immediate success/fail
    const succ = document.createElement('button')
    succ.className = 'success'
    succ.textContent = 'Success'
    succ.addEventListener('click', ()=>{ applyMove(card.successSteps); closeModal() })
    const fail = document.createElement('button')
    fail.className = 'fail'
    fail.textContent = 'Fail'
    fail.addEventListener('click', ()=>{ applyMove(card.failSteps); closeModal() })
    completionArea.appendChild(succ)
    completionArea.appendChild(fail)
  }

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
  else if(msg.type === 'cardCompletion'){
    // update completion list in modal
    const list = document.getElementById('completionList')
    if(list){
      list.textContent = `Completed: ${msg.completed.length}`
    }
  }
  else if(msg.type === 'cardResolved'){
    // card resolved (all completed) — close modal and update position
    position = msg.position || position
    renderStatus()
    closeModal()
    // show brief notice
    alert(`Card resolved: ${msg.result}. Moved ${msg.delta} steps.`)
  }
  else if(msg.type === 'realmComplete'){
    position = msg.position || position
    renderStatus()
    closeModal()
    // disable draw button
    const draw = document.getElementById('drawBtn')
    if(draw) draw.disabled = true
    // show final modal
    showModal((()=>{ const d=document.createElement('div'); d.innerHTML = `<h2>Water Realm Complete</h2><p>Väinämöinen has reached the final segment.</p><p>Well done!</p>`; return d })())
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
  vain.style.left = `${x}px`
  vain.style.top = `${y}px`
  vain.style.transform = `translate(-50%,-50%)`
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
