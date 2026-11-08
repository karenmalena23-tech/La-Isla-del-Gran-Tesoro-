// Elementos DOM
const authStatus = document.getElementById('authStatus');
const playerInfo = document.getElementById('playerInfo');
const playerAStatus = document.getElementById('playerAStatus');
const playerBStatus = document.getElementById('playerBStatus');
const readyButton = document.getElementById('readyButton');
const countdownDisplay = document.getElementById('countdownDisplay');
const gameplaySection = document.getElementById('gameplaySection');
const lobbySection = document.getElementById('lobbySection');
const world = document.getElementById('world');
const pirateA = document.getElementById('pirateA');
const pirateB = document.getElementById('pirateB');
const resultOverlay = document.getElementById('resultOverlay');
const resultTitle = document.getElementById('resultTitle');
const resultDetails = document.getElementById('resultDetails');
const playAgainBtn = document.getElementById('playAgainBtn');
const resetRaceBtn = document.getElementById('resetRaceBtn');
const scoreAEl = document.getElementById('scoreA');
const scoreBEl = document.getElementById('scoreB');

// Posiciones del mapa
const obstaclesPos = [400, 800, 1300, 1800, 2300, 2800, 3300, 3700];
const chestsPos = [600, 1100, 1600, 2100, 2600, 3100, 3500, 3900];

let user = null;
let isReady = false;
let gameState = 'waiting'; // 'waiting', 'playing', 'finished'
let posXA = 100;
let posYA = 0;
let posXB = 160;
let isJumping = false;
let winsA = parseInt(localStorage.getItem('winsA') || '0');
let winsB = parseInt(localStorage.getItem('winsB') || '0');
let botInterval = null;

// Inicialización de Marcadores
scoreAEl.textContent = winsA;
scoreBEl.textContent = winsB;

// Renderizar Mapa
function initMap() {
  const obsContainer = document.getElementById('obstaclesContainer');
  const chestContainer = document.getElementById('chestsContainer');
  obsContainer.innerHTML = '';
  chestContainer.innerHTML = '';

  obstaclesPos.forEach(x => {
    const el = document.createElement('div');
    el.className = 'obstacle';
    el.style.left = x + 'px';
    el.textContent = '🪨';
    obsContainer.appendChild(el);
  });

  chestsPos.forEach(x => {
    const el = document.createElement('div');
    el.className = 'chest';
    el.style.left = x + 'px';
    el.textContent = '🧰';
    chestContainer.appendChild(el);
  });
}
initMap();

// Manejo de Autenticación Local
document.getElementById('loginBtn').addEventListener('click', () => handleAuth('login'));
document.getElementById('signupBtn').addEventListener('click', () => handleAuth('signup'));

function handleAuth(type) {
  const emailInput = document.getElementById('emailInput');
  const email = emailInput.value.trim() || 'pirata@isla.com';
  user = { email, name: email.split('@')[0] };
  
  if (type === 'signup') {
    authStatus.textContent = `¡Cuenta creada con éxito! Bienvenido, ${user.name}.`;
  } else {
    authStatus.textContent = `¡Sesión iniciada como ${user.name}!`;
  }
  playerInfo.textContent = `Pirata Activo: ${user.name}`;
}

// Botón "¡Estoy Listo!" (Activa cuenta regresiva de inmediato)
readyButton.addEventListener('click', () => {
  isReady = !isReady;
  
  if (isReady) {
    playerAStatus.textContent = '¡Listo para correr! 🟢';
    readyButton.textContent = 'Cancelar Listo';
    playerBStatus.textContent = 'Bot Rival Listo 🟢';
    startCountdown();
  } else {
    playerAStatus.textContent = 'Esperando...';
    readyButton.textContent = '¡Estoy Listo!';
    playerBStatus.textContent = 'Esperando rival...';
  }
});

// Conteo e Inicio
function startCountdown() {
  countdownDisplay.hidden = false;
  let count = 3;
  countdownDisplay.textContent = count;

  const interval = setInterval(() => {
    count--;
    if (count > 0) {
      countdownDisplay.textContent = count;
    } else if (count === 0) {
      countdownDisplay.textContent = '¡CARRERA!';
    } else {
      clearInterval(interval);
      countdownDisplay.hidden = true;
      startRace();
    }
  }, 800);
}

// Iniciar Carrera
function startRace() {
  gameState = 'playing';
  lobbySection.hidden = true;
  gameplaySection.hidden = false;
  resultOverlay.hidden = true;

  // Movimiento Automático del Bot Rival
  botInterval = setInterval(() => {
    if (gameState === 'playing') {
      posXB += Math.floor(Math.random() * 15) + 5;
      pirateB.style.left = posXB + 'px';
      checkWin();
    }
  }, 200);
}

// Controles y Movimiento del Jugador
window.addEventListener('keydown', (e) => {
  if (gameState !== 'playing') return;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') move(25);
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') move(-25);
  if ((e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') && !isJumping) jump();
});

document.getElementById('rightBtn').addEventListener('click', () => move(25));
document.getElementById('leftBtn').addEventListener('click', () => move(-25));
document.getElementById('jumpBtn').addEventListener('click', jump);

function move(dx) {
  if (gameState !== 'playing') return;
  posXA = Math.max(50, posXA + dx);
  pirateA.style.left = posXA + 'px';

  // Desplazamiento de cámara fluido
  const camX = Math.max(0, posXA - 200);
  world.style.transform = `translateX(-${camX}px)`;

  checkWin();
}

function jump() {
  if (isJumping || gameState !== 'playing') return;
  isJumping = true;
  posYA = 90;
  pirateA.style.bottom = (55 + posYA) + 'px';

  setTimeout(() => {
    posYA = 0;
    pirateA.style.bottom = '55px';
    isJumping = false;
  }, 450);
}

// Verificación de Ganador
function checkWin() {
  if (gameState !== 'playing') return;

  if (posXA >= 4050) {
    endRace('🔴 ¡Has ganado la carrera por el Tesoro!');
    winsA++;
    localStorage.setItem('winsA', winsA);
    scoreAEl.textContent = winsA;
  } else if (posXB >= 4050) {
    endRace('🔵 El Bot Rival ha llegado primero a la Meta.');
    winsB++;
    localStorage.setItem('winsB', winsB);
    scoreBEl.textContent = winsB;
  }
}

function endRace(msg) {
  gameState = 'finished';
  clearInterval(botInterval);
  resultTitle.textContent = '🏆 ¡FIN DE LA CARRERA!';
  resultDetails.textContent = msg;
  resultOverlay.hidden = false;
}

// REINICIO DE CARRERA ("JUGAR OTRA VEZ")
playAgainBtn.addEventListener('click', resetGame);
resetRaceBtn.addEventListener('click', resetGame);

function resetGame() {
  gameState = 'waiting';
  clearInterval(botInterval);
  
  posXA = 100;
  posXB = 160;
  posYA = 0;
  isReady = false;

  pirateA.style.left = posXA + 'px';
  pirateA.style.bottom = '55px';
  pirateB.style.left = posXB + 'px';
  world.style.transform = 'translateX(0px)';

  resultOverlay.hidden = true;
  gameplaySection.hidden = true;
  lobbySection.hidden = false;

  playerAStatus.textContent = 'Esperando...';
  playerBStatus.textContent = 'Esperando rival...';
  readyButton.textContent = '¡Estoy Listo!';
  initMap();
}
