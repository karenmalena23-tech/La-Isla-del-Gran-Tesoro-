const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;

const authSection = document.getElementById('authSection');
const lobbySection = document.getElementById('lobbySection');
const gameSection = document.getElementById('gameSection');
const authStatus = document.getElementById('authStatus');
const connectionStatus = document.getElementById('connectionStatus');
const userWelcome = document.getElementById('userWelcome');
const currentRoomCode = document.getElementById('currentRoomCode');
const roomLobby = document.getElementById('roomLobby');
const p1Info = document.getElementById('p1Info');
const p2Info = document.getElementById('p2Info');
const readyBtn = document.getElementById('readyBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const countdownDisplay = document.getElementById('countdownDisplay');
const timerDisplay = document.getElementById('timerDisplay');
const userWinsCount = document.getElementById('userWinsCount');
const worldTrack = document.getElementById('worldTrack');
const pirate1 = document.getElementById('pirate1');
const pirate2 = document.getElementById('pirate2');
const winOverlay = document.getElementById('winOverlay');
const loseOverlay = document.getElementById('loseOverlay');
const timeOutOverlay = document.getElementById('timeOutOverlay');
const scoreboardBody = document.getElementById('scoreboardBody');

let currentUser = null;
let playerName = "Pirata";
let currentWins = 0;
let roomChannel = null;
let roomCode = 'ISLA1';
let myRole = null; 
let isReady = false;
let gameState = 'idle';

let posX1 = 100, posY1 = 0, isJumping1 = false;
let posX2 = 100, posY2 = 0, isJumping2 = false;
let timeLeft = 150; 
let timerInterval = null;

const obstacles = [400, 950, 1400, 1900, 2450, 2900, 3450, 3800];
const chests = [300, 800, 1250, 1750, 2200, 2750, 3200, 3650];
let collectedChests = new Set();

document.getElementById('loginBtn').addEventListener('click', () => handleAuth('login'));
document.getElementById('signupBtn').addEventListener('click', () => handleAuth('signup'));

async function handleAuth(type) {
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();

  if (!email || !password) {
    authStatus.textContent = "Ingresa correo y contraseña.";
    return;
  }

  authStatus.textContent = "Conectando...";
  let res;
  if (type === 'signup') {
    res = await supabaseClient.auth.signUp({ email, password });
  } else {
    res = await supabaseClient.auth.signInWithPassword({ email, password });
  }

  if (res.error) {
    authStatus.textContent = "Error: " + res.error.message;
  } else {
    currentUser = res.data.user;
    connectionStatus.textContent = "🟢 Conectado";
    authSection.hidden = true;
    lobbySection.hidden = false;
    userWelcome.textContent = `Cuenta: ${currentUser.email}`;
    await loadWinsAndScoreboard();
  }
}

async function loadWinsAndScoreboard() {
  const { data } = await supabaseClient.from('profiles').select('wins').eq('id', currentUser.id).single();
  if (data) {
    currentWins = data.wins || 0;
  } else {
    await supabaseClient.from('profiles').insert([{ id: currentUser.id, email: currentUser.email, wins: 0, last_win_time: 'Nunca' }]);
    currentWins = 0;
  }
  userWinsCount.textContent = currentWins;
  await fetchGlobalScoreboard();
}

async function fetchGlobalScoreboard() {
  const { data } = await supabaseClient.from('profiles').select('email, wins, last_win_time').order('wins', { ascending: false }).limit(5);
  if (data && data.length > 0) {
    scoreboardBody.innerHTML = '';
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>🏴‍☠️ ${row.email.split('@')[0]}</td><td>${row.last_win_time || 'Sin registro'}</td><td>🏆 <strong>${row.wins}</strong></td>`;
      scoreboardBody.appendChild(tr);
    });
  } else {
    scoreboardBody.innerHTML = `<tr><td colspan="3" style="text-align:center;">Aún no hay victorias registradas.</td></tr>`;
  }
}

async function saveWin() {
  currentWins += 1;
  userWinsCount.textContent = currentWins;
  const now = new Date().toLocaleString();
  await supabaseClient.from('profiles').update({ wins: currentWins, last_win_time: now }).eq('id', currentUser.id);
  await fetchGlobalScoreboard();
}

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  roomCode = document.getElementById('roomCodeInput').value.trim().toUpperCase() || 'ISLA1';
  playerName = document.getElementById('playerNameInput').value.trim() || currentUser.email.split('@')[0];
  currentRoomCode.textContent = roomCode;
  roomLobby.hidden = false;
  connectRealtimeRoom();
});

leaveRoomBtn.addEventListener('click', () => {
  if (roomChannel) supabaseClient.removeChannel(roomChannel);
  roomLobby.hidden = true;
  isReady = false;
  readyBtn.textContent = "¡Estoy Listo!";
  readyBtn.style.background = "#e5b653";
});

function connectRealtimeRoom() {
  if (roomChannel) supabaseClient.removeChannel(roomChannel);

  roomChannel = supabaseClient.channel(`room_${roomCode}`, {
    config: { presence: { key: currentUser.id } }
  });

  roomChannel
    .on('presence', { event: 'sync' }, () => {
      const state = roomChannel.presenceState();
      const usersInRoom = Object.keys(state);

      usersInRoom.sort();
      const myIndex = usersInRoom.indexOf(currentUser.id);
      myRole = (myIndex === 0) ? 'p1' : 'p2';

      p1Info.textContent = usersInRoom[0] ? "Conectado 🟢" : "Esperando...";
      p2Info.textContent = usersInRoom[1] ? "Conectado 🟢" : "Esperando...";
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

      const localX = (myRole === 'p1') ? posX1 : posX2;
      const camX = Math.max(0, localX - 220);
      worldTrack.style.transform = `translateX(-${camX}px)`;
    })
    .on('broadcast', { event: 'chest_taken' }, payload => {
      collectedChests.add(payload.payload.chestId);
      const chestEl = document.getElementById(`chest-${payload.payload.chestId}`);
      if (chestEl) chestEl.classList.add('collected');
    })
    .on('broadcast', { event: 'start_countdown' }, () => {
      triggerCountdown();
    })
    .on('broadcast', { event: 'game_over' }, payload => {
      endGameRemote(payload.payload.winnerRole);
    })
    .subscribe(async status => {
      if (status === 'SUBSCRIBED') {
        await roomChannel.track({ name: playerName, onlineAt: new Date().toISOString() });
      }
    });
}

readyBtn.addEventListener('click', async () => {
  isReady = !isReady;
  readyBtn.textContent = isReady ? "Cancelar Listo" : "¡Estoy Listo!";
  readyBtn.style.background = isReady ? "#529e72" : "#e5b653";

  if (roomChannel) {
    roomChannel.send({ 
      type: 'broadcast', 
      event: 'start_countdown', 
      payload: {} 
    });
  }
});

function triggerCountdown() {
  gameState = 'countdown';
  countdownDisplay.hidden = false;
  let count = 5;
  countdownDisplay.textContent = count;
  roomLobby.hidden = true;
  lobbySection.hidden = true; // Oculta el lobby en ambos dispositivos simultáneamente

  const t = setInterval(() => {
    count--;
    if (count > 0) {
      countdownDisplay.textContent = count;
    } else {
      clearInterval(t);
      countdownDisplay.hidden = true;
      startMatch();
    }
  }, 1000);
}

function startMatch() {
  gameState = 'playing';
  lobbySection.hidden = true;
  roomLobby.hidden = true;
  gameSection.hidden = false; // Fuerza la apertura del juego en ambos dispositivos a la vez
  renderMap();

  timeLeft = 150;
  updateTimerUI();

  if (timerInterval) clearInterval(timerInterval);
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

function renderMap() {
  const obsLayer = document.getElementById('obstaclesLayer');
  const chestLayer = document.getElementById('chestsLayer');
  obsLayer.innerHTML = '';
  chestLayer.innerHTML = '';

  obstacles.forEach(x => {
    const bush = document.createElement('div');
    bush.className = 'obstacle-bush';
    bush.style.left = x + 'px';
    bush.textContent = '🌿';
    obsLayer.appendChild(bush);
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

// CONTROLES DE MOVIMIENTO Y SALTO FLUIDO
window.addEventListener('keydown', e => {
  if (gameState !== 'playing') return;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') movePlayer('right');
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') movePlayer('left');
  if (e.key === 'w' || e.key === 'W' || e.key === ' ' || e.key === 'ArrowUp') {
    e.preventDefault();
    movePlayer('jump');
  }
});

document.getElementById('leftBtn').addEventListener('click', () => movePlayer('left'));
document.getElementById('rightBtn').addEventListener('click', () => movePlayer('right'));
document.getElementById('jumpBtn').addEventListener('click', () => movePlayer('jump'));

function movePlayer(action) {
  if (gameState !== 'playing') return;

  if (myRole === 'p1') {
    if (action === 'right') posX1 = Math.min(4050, posX1 + 16);
    if (action === 'left') posX1 = Math.max(40, posX1 - 16);
    if (action === 'jump' && !isJumping1) {
      isJumping1 = true;
      posY1 = 110;
      setTimeout(() => {
        posY1 = 0;
        isJumping1 = false;
        broadcastMove();
      }, 400);
    }
    pirate1.style.left = posX1 + 'px';
    pirate1.style.bottom = (55 + posY1) + 'px';
    broadcastMove();
    checkCollisions(posX1, 'p1');

  } else if (myRole === 'p2') {
    if (action === 'right') posX2 = Math.min(4050, posX2 + 16);
    if (action === 'left') posX2 = Math.max(40, posX2 - 16);
    if (action === 'jump' && !isJumping2) {
      isJumping2 = true;
      posY2 = 110;
      setTimeout(() => {
        posY2 = 0;
        isJumping2 = false;
        broadcastMove();
      }, 400);
    }
    pirate2.style.left = posX2 + 'px';
    pirate2.style.bottom = (55 + posY2) + 'px';
    broadcastMove();
    checkCollisions(posX2, 'p2');
  }
}

function broadcastMove() {
  if (!roomChannel) return;
  const x = myRole === 'p1' ? posX1 : posX2;
  const y = myRole === 'p1' ? posY1 : posY2;

  const camX = Math.max(0, x - 220);
  worldTrack.style.transform = `translateX(-${camX}px)`;

  roomChannel.send({
    type: 'broadcast',
    event: 'player_move',
    payload: { role: myRole, x, y }
  });
}

function checkCollisions(xPos, role) {
  chests.forEach((cx, idx) => {
    if (!collectedChests.has(idx) && Math.abs(xPos - cx) < 28) {
      collectedChests.add(idx);
      const chestEl = document.getElementById(`chest-${idx}`);
      if (chestEl) chestEl.classList.add('collected');

      roomChannel.send({
        type: 'broadcast',
        event: 'chest_taken',
        payload: { chestId: idx }
      });
    }
  });

  if (xPos >= 4050 && gameState === 'playing') {
    gameState = 'ended';
    roomChannel.send({
      type: 'broadcast',
      event: 'game_over',
      payload: { winnerRole: role }
    });
    endGameRemote(role);
  }
}

async function endGameRemote(winnerRole) {
  gameState = 'ended';
  clearInterval(timerInterval);

  if (winnerRole === myRole) {
    winOverlay.hidden = false;
    await saveWin();
  } else {
    loseOverlay.hidden = false;
  }
}
