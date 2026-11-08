// CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "TU_SUPABASE_URL_AQUI";
const SUPABASE_KEY = "TU_SUPABASE_ANON_KEY_AQUI";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

// Elementos DOM
const authSection = document.getElementById('authSection');
const lobbySection = document.getElementById('lobbySection');
const gameSection = document.getElementById('gameSection');
const authStatus = document.getElementById('authStatus');
const connectionStatus = document.getElementById('connectionStatus');
const userWelcome = document.getElementById('userWelcome');
const currentRoomCode = document.getElementById('currentRoomCode');
const roomLobby = document.getElementById('roomLobby');
const p1Name = document.getElementById('p1Name');
const p2Name = document.getElementById('p2Name');
const p1Status = document.getElementById('p1Status');
const p2Status = document.getElementById('p2Status');
const readyBtn = document.getElementById('readyBtn');
const countdownDisplay = document.getElementById('countdownDisplay');
const timerDisplay = document.getElementById('timerDisplay');
const userWinsCount = document.getElementById('userWinsCount');
const worldTrack = document.getElementById('worldTrack');
const pirate1 = document.getElementById('pirate1');
const pirate2 = document.getElementById('pirate2');
const winOverlay = document.getElementById('winOverlay');
const loseOverlay = document.getElementById('loseOverlay');
const timeOutOverlay = document.getElementById('timeOutOverlay');

// Variables de Estado
let currentUser = null;
let currentWins = 0;
let roomChannel = null;
let roomCode = 'ISLA1';
let playerRole = null; // 'p1' o 'p2'
let isReady = false;
let gameState = 'idle'; // 'idle', 'countdown', 'playing', 'ended'

let posX1 = 100, posY1 = 0, isJumping1 = false;
let posX2 = 140, posY2 = 0, isJumping2 = false;
let timeLeft = 150; // 2 min y medio (150s)
let timerInterval = null;

const obstacles = [500, 1100, 1600, 2200, 2700, 3300, 3700];
const chests = [350, 900, 1400, 2000, 2500, 3100, 3600];
let collectedChests = new Set();

// 1. AUTENTICACIÓN
document.getElementById('loginBtn').addEventListener('click', () => handleAuth('login'));
document.getElementById('signupBtn').addEventListener('click', () => handleAuth('signup'));

async function handleAuth(type) {
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();

  if (!email || !password) {
    authStatus.textContent = "Ingresa correo y contraseña.";
    return;
  }

  authStatus.textContent = "Procesando...";
  let error = null, data = null;

  if (type === 'signup') {
    ({ data, error } = await supabaseClient.auth.signUp({ email, password }));
  } else {
    ({ data, error } = await supabaseClient.auth.signInWithPassword({ email, password }));
  }

  if (error) {
    authStatus.textContent = "Error: " + error.message;
  } else if (data && data.user) {
    currentUser = data.user;
    connectionStatus.textContent = "🟢 Conectado: " + currentUser.email;
    authSection.hidden = true;
    lobbySection.hidden = false;
    userWelcome.textContent = `Bienvenido Capitán: ${currentUser.email}`;
    await loadUserWins();
  }
}

// Cargar victorias guardadas desde Supabase
async function loadUserWins() {
  if (!currentUser) return;
  const { data } = await supabaseClient.from('profiles').select('wins').eq('id', currentUser.id).single();
  if (data) {
    currentWins = data.wins || 0;
  } else {
    // Insertar perfil por primera vez
    await supabaseClient.from('profiles').insert([{ id: currentUser.id, email: currentUser.email, wins: 0 }]);
    currentWins = 0;
  }
  userWinsCount.textContent = currentWins;
}

async function saveWin() {
  currentWins += 1;
  userWinsCount.textContent = currentWins;
  if (currentUser) {
    await supabaseClient.from('profiles').update({ wins: currentWins }).eq('id', currentUser.id);
  }
}

// 2. UNIRSE A SALA CON CÓDIGO
document.getElementById('joinRoomBtn').addEventListener('click', joinRoom);

function joinRoom() {
  roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase() || 'ISLA1';
  const name = document.getElementById('playerNameInput').value.trim() || currentUser.email.split('@')[0];
  currentRoomCode.textContent = roomCode;

  roomLobby.hidden = false;

  // Suscribirse a Canal Realtime de Supabase
  if (roomChannel) supabaseClient.removeChannel(roomChannel);

  roomChannel = supabaseClient.channel(`room_${roomCode}`, {
    config: { presence: { key: currentUser.id } }
  });

  roomChannel
    .on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState();
      const keys = Object.keys(state);

      if (keys[0] === currentUser.id) playerRole = 'p1';
      else playerRole = 'p2';

      updateLobbyUI(state, name);
    })
    .on('broadcast', { event: 'player_move' }, payload => {
      if (payload.payload.role === 'p1') {
        posX1 = payload.payload.x;
        posY1 = payload.payload.y;
        pirate1.style.left = posX1 + 'px';
        pirate1.style.bottom = (55 + posY1) + 'px';
      } else {
        posX2 = payload.payload.x;
        posY2 = payload.payload.y;
        pirate2.style.left = posX2 + 'px';
        pirate2.style.bottom = (55 + posY2) + 'px';
      }
    })
    .on('broadcast', { event: 'chest_taken' }, payload => {
      const chestId = payload.payload.chestId;
      collectedChests.add(chestId);
      const chestEl = document.getElementById(`chest-${chestId}`);
      if (chestEl) chestEl.classList.add('collected');
    })
    .on('broadcast', { event: 'start_countdown' }, () => {
      triggerCountdown();
    })
    .on('broadcast', { event: 'game_over' }, payload => {
      handleGameOver(payload.payload.winnerRole);
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await roomChannel.track({ name, role: playerRole, ready: false });
      }
    });
}

function updateLobbyUI(state, myName) {
  const players = Object.values(state).map(arr => arr[0]);

  if (players[0]) {
    p1Name.textContent = players[0].name;
    p1Status.textContent = players[0].ready ? "¡LISTO! 🟢" : "No listo 🔴";
  }
  if (players[1]) {
    p2Name.textContent = players[1].name;
    p2Status.textContent = players[1].ready ? "¡LISTO! 🟢" : "No listo 🔴";
  }

  // Si ambos están listos, iniciar
  if (players.length >= 2 && players[0].ready && players[1].ready && playerRole === 'p1') {
    roomChannel.send({ type: 'broadcast', event: 'start_countdown' });
  }
}

// 3. ESTOY LISTO Y CONTEO 5, 4, 3, 2, 1
readyBtn.addEventListener('click', async () => {
  isReady = !isReady;
  readyBtn.textContent = isReady ? "Cancelar Listo" : "¡Estoy Listo!";
  const myName = document.getElementById('playerNameInput').value.trim() || currentUser.email.split('@')[0];
  await roomChannel.track({ name: myName, role: playerRole, ready: isReady });
});

function triggerCountdown() {
  gameState = 'countdown';
  countdownDisplay.hidden = false;
  let count = 5;
  countdownDisplay.textContent = count;

  const timer = setInterval(() => {
    count--;
    if (count > 0) {
      countdownDisplay.textContent = count;
    } else {
      clearInterval(timer);
      countdownDisplay.hidden = true;
      startMatch();
    }
  }, 1000);
}

// 4. INICIO DE CARRERA Y RELOJ DE 2:30 MINUTOS
function startMatch() {
  gameState = 'playing';
  lobbySection.hidden = true;
  gameSection.hidden = false;
  renderMap();

  // Reloj de 2 minutos y medio (150s)
  timeLeft = 150;
  updateTimerUI();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerUI();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      if (gameState === 'playing') {
        gameState = 'ended';
        timeOutOverlay.hidden = false;
      }
    }
  }, 1000);
}

function updateTimerUI() {
  const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
  const secs = (timeLeft % 60).toString().padStart(2, '0');
  timerDisplay.textContent = `${mins}:${secs}`;
}

// Renderizado de Terreno
function renderMap() {
  const obsLayer = document.getElementById('obstaclesLayer');
  const chestLayer = document.getElementById('chestsLayer');
  obsLayer.innerHTML = '';
  chestLayer.innerHTML = '';

  obstacles.forEach(x => {
    const rock = document.createElement('div');
    rock.className = 'obstacle-rock';
    rock.style.left = x + 'px';
    rock.textContent = '🪨';
    obsLayer.appendChild(rock);
  });

  chests.forEach((x, idx) => {
    const chest = document.createElement('div');
    chest.className = 'chest-item';
    chest.id = `chest-${idx}`;
    chest.style.left = x + 'px';
    chest.textContent = '🧰';
    chestLayer.appendChild(chest);
  });
}

// 5. MOVIMIENTO Y COLISIONES
window.addEventListener('keydown', e => {
  if (gameState !== 'playing') return;

  let moved = false;

  if (playerRole === 'p1') {
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') { posX1 = Math.min(4050, posX1 + 12); moved = true; }
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') { posX1 = Math.max(40, posX1 - 12); moved = true; }
    if ((e.key === 'w' || e.key === 'W' || e.key === ' ' || e.key === 'ArrowUp') && !isJumping1) {
      isJumping1 = true; posY1 = 90; moved = true;
      setTimeout(() => { posY1 = 0; isJumping1 = false; broadcastMove(); }, 400);
    }
    if (moved) broadcastMove();
    checkInteractions(posX1, 'p1');
  } else if (playerRole === 'p2') {
    if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') { posX2 = Math.min(4050, posX2 + 12); moved = true; }
    if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') { posX2 = Math.max(40, posX2 - 12); moved = true; }
    if ((e.key === 'w' || e.key === 'W' || e.key === ' ' || e.key === 'ArrowUp') && !isJumping2) {
      isJumping2 = true; posY2 = 90; moved = true;
      setTimeout(() => { posY2 = 0; isJumping2 = false; broadcastMove(); }, 400);
    }
    if (moved) broadcastMove();
    checkInteractions(posX2, 'p2');
  }
});

function broadcastMove() {
  const currentX = playerRole === 'p1' ? posX1 : posX2;
  const currentY = playerRole === 'p1' ? posY1 : posY2;

  // Cámara sigue al jugador local
  const camX = Math.max(0, currentX - 220);
  worldTrack.style.transform = `translateX(-${camX}px)`;

  roomChannel.send({
    type: 'broadcast',
    event: 'player_move',
    payload: { role: playerRole, x: currentX, y: currentY }
  });
}

function checkInteractions(playerX, role) {
  // Cofres
  chests.forEach((cx, idx) => {
    if (!collectedChests.has(idx) && Math.abs(playerX - cx) < 25) {
      collectedChests.add(idx);
      roomChannel.send({
        type: 'broadcast',
        event: 'chest_taken',
        payload: { chestId: idx }
      });
      const chestEl = document.getElementById(`chest-${idx}`);
      if (chestEl) chestEl.classList.add('collected');
    }
  });

  // Meta (4050px)
  if (playerX >= 4050 && gameState === 'playing') {
    gameState = 'ended';
    roomChannel.send({
      type: 'broadcast',
      event: 'game_over',
      payload: { winnerRole: role }
    });
    handleGameOver(role);
  }
}

// 6. RESULTADOS Y GUARDADO DE MARCADOR
async function handleGameOver(winnerRole) {
  clearInterval(timerInterval);
  gameState = 'ended';

  if (winnerRole === playerRole) {
    winOverlay.hidden = false;
    await saveWin();
  } else {
    loseOverlay.hidden = false;
  }
}
