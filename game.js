const authSection = document.getElementById('authSection');
const lobbySection = document.getElementById('lobbySection');
const gameSection = document.getElementById('gameSection');
const authStatus = document.getElementById('authStatus');
const connectionStatus = document.getElementById('connectionStatus');
const userWelcome = document.getElementById('userWelcome');
const currentRoomCode = document.getElementById('currentRoomCode');
const roomLobby = document.getElementById('roomLobby');
const p1Status = document.getElementById('p1Status');
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

let currentUserEmail = "";
let currentWins = 0;
let isReady = false;
let gameState = 'idle';

let posX1 = 100, posY1 = 0, isJumping1 = false;
let posX2 = 140, posY2 = 0;
let timeLeft = 150; // 2 min y medio (150s)
let timerInterval = null;
let botInterval = null;

const obstacles = [500, 1100, 1600, 2200, 2700, 3300, 3700];
const chests = [350, 900, 1400, 2000, 2500, 3100, 3600];
let collectedChests = new Set();

document.getElementById('loginBtn').addEventListener('click', () => handleAuth());
document.getElementById('signupBtn').addEventListener('click', () => handleAuth());

function handleAuth() {
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();

  if (!email || !password) {
    authStatus.textContent = "Por favor ingresa correo y contraseña.";
    return;
  }

  currentUserEmail = email;
  connectionStatus.textContent = "🟢 Conectado: " + email;
  authSection.hidden = true;
  lobbySection.hidden = false;
  userWelcome.textContent = `Bienvenido Capitán: ${email}`;

  currentWins = parseInt(localStorage.getItem('wins_' + email) || '0');
  userWinsCount.textContent = currentWins;
}

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase() || 'ISLA1';
  currentRoomCode.textContent = code;
  roomLobby.hidden = false;
});

readyBtn.addEventListener('click', () => {
  isReady = !isReady;
  p1Status.textContent = isReady ? "¡LISTO! 🟢" : "No listo 🔴";
  readyBtn.textContent = isReady ? "Cancelar Listo" : "¡Estoy Listo!";

  if (isReady) {
    triggerCountdown();
  }
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

function startMatch() {
  gameState = 'playing';
  lobbySection.hidden = true;
  gameSection.hidden = false;
  renderMap();

  timeLeft = 150;
  updateTimerUI();

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerUI();
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      clearInterval(botInterval);
      if (gameState === 'playing') {
        gameState = 'ended';
        timeOutOverlay.hidden = false;
      }
    }
  }, 1000);

  botInterval = setInterval(() => {
    if (gameState === 'playing') {
      posX2 = Math.min(4050, posX2 + Math.floor(Math.random() * 12) + 6);
      pirate2.style.left = posX2 + 'px';

      if (posX2 >= 4050 && gameState === 'playing') {
        gameState = 'ended';
        clearInterval(timerInterval);
        clearInterval(botInterval);
        loseOverlay.hidden = false;
      }
    }
  }, 180);
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

window.addEventListener('keydown', e => {
  if (gameState !== 'playing') return;

  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
    posX1 = Math.min(4050, posX1 + 14);
  }
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
    posX1 = Math.max(40, posX1 - 14);
  }
  if ((e.key === 'w' || e.key === 'W' || e.key === ' ' || e.key === 'ArrowUp') && !isJumping1) {
    isJumping1 = true;
    posY1 = 90;
    setTimeout(() => { posY1 = 0; isJumping1 = false; }, 400);
  }

  pirate1.style.left = posX1 + 'px';
  pirate1.style.bottom = (55 + posY1) + 'px';

  const camX = Math.max(0, posX1 - 220);
  worldTrack.style.transform = `translateX(-${camX}px)`;

  chests.forEach((cx, idx) => {
    if (!collectedChests.has(idx) && Math.abs(posX1 - cx) < 25) {
      collectedChests.add(idx);
      const chestEl = document.getElementById(`chest-${idx}`);
      if (chestEl) chestEl.classList.add('collected');
    }
  });

  if (posX1 >= 4050 && gameState === 'playing') {
    gameState = 'ended';
    clearInterval(timerInterval);
    clearInterval(botInterval);
    winOverlay.hidden = false;
    currentWins += 1;
    userWinsCount.textContent = currentWins;
    if (currentUserEmail) {
      localStorage.setItem('wins_' + currentUserEmail, currentWins);
    }
  }
});
