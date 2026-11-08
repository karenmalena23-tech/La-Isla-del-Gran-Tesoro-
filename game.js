const world = document.getElementById('world');
const pirateA = document.getElementById('pirateA');
const pirateB = document.getElementById('pirateB');
const chestsAEl = document.getElementById('chestsA');
const chestsBEl = document.getElementById('chestsB');
const resultOverlay = document.getElementById('resultOverlay');
const resultTitle = document.getElementById('resultTitle');
const resultDetails = document.getElementById('resultDetails');

const obstaclesPos = [400, 800, 1300, 1800, 2300, 2800, 3300, 3700];
const chestsPos = [300, 700, 1200, 1700, 2200, 2700, 3200, 3600];

let gameState = 'waiting'; // 'waiting', 'playing', 'finished'
let posXA = 100, posYA = 0, jumpA = false;
let posXB = 160, posYB = 0, jumpB = false;
let scoreA = 0, scoreB = 0;
let keys = {};

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

  chestsPos.forEach((x, index) => {
    const el = document.createElement('div');
    el.className = 'chest';
    el.id = `chest-${index}`;
    el.style.left = x + 'px';
    el.textContent = '🧰';
    chestContainer.appendChild(el);
  });
}
initMap();

document.getElementById('startRaceBtn').addEventListener('click', () => {
  gameState = 'playing';
  resultOverlay.hidden = true;
  posXA = 100; posXB = 160;
  scoreA = 0; scoreB = 0;
  chestsAEl.textContent = scoreA;
  chestsBEl.textContent = scoreB;
  initMap();
});

document.getElementById('resetRaceBtn').addEventListener('click', resetGame);
document.getElementById('playAgainBtn').addEventListener('click', resetGame);

function resetGame() {
  gameState = 'waiting';
  posXA = 100; posXB = 160;
  pirateA.style.left = posXA + 'px';
  pirateA.style.bottom = '55px';
  pirateB.style.left = posXB + 'px';
  pirateB.style.bottom = '55px';
  world.style.transform = 'translateX(0px)';
  resultOverlay.hidden = true;
  initMap();
}

// Captura de Teclado Simultánea
window.addEventListener('keydown', e => { keys[e.key] = true; });
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Bucle de Juego Principal (60 FPS para suavidad y colisiones reales)
function updateGame() {
  if (gameState === 'playing') {
    // JUGADOR 1 (A, D, W / Espacio)
    if (keys['d'] || keys['D']) posXA = Math.min(4050, posXA + 6);
    if (keys['a'] || keys['A']) posXA = Math.max(50, posXA - 6);
    if ((keys['w'] || keys['W'] || keys[' ']) && !jumpA) {
      jumpA = true;
      posYA = 95;
      setTimeout(() => { posYA = 0; jumpA = false; }, 400);
    }

    // JUGADOR 2 (Flechas de dirección)
    if (keys['ArrowRight']) posXB = Math.min(4050, posXB + 6);
    if (keys['ArrowLeft']) posXB = Math.max(50, posXB - 6);
    if (keys['ArrowUp'] && !jumpB) {
      jumpB = true;
      posYB = 95;
      setTimeout(() => { posYB = 0; jumpB = false; }, 400);
    }

    // Aplicar posiciones visuales
    pirateA.style.left = posXA + 'px';
    pirateA.style.bottom = (55 + posYA) + 'px';

    pirateB.style.left = posXB + 'px';
    pirateB.style.bottom = (55 + posYB) + 'px';

    // Cámara sigue al jugador 1
    const camX = Math.max(0, posXA - 250);
    world.style.transform = `translateX(-${camX}px)`;

    // Detección de Colisión con Cofres
    chestsPos.forEach((cx, index) => {
      const chestEl = document.getElementById(`chest-${index}`);
      if (chestEl && !chestEl.classList.contains('collected')) {
        // Si J1 pasa por encima
        if (Math.abs(posXA - cx) < 25) {
          chestEl.classList.add('collected');
          scoreA += 10;
          chestsAEl.textContent = scoreA;
        }
        // Si J2 pasa por encima
        else if (Math.abs(posXB - cx) < 25) {
          chestEl.classList.add('collected');
          scoreB += 10;
          chestsBEl.textContent = scoreB;
        }
      }
    });

    // Verificación de Meta
    if (posXA >= 4050) {
      endGame('🔴 ¡El Pirata Rojo (J1) ha ganado la carrera!');
    } else if (posXB >= 4050) {
      endGame('🔵 ¡El Pirata Azul (J2) ha ganado la carrera!');
    }
  }
  requestAnimationFrame(updateGame);
}

function endGame(msg) {
  gameState = 'finished';
  resultTitle.textContent = '🏆 ¡FIN DE LA CARRERA!';
  resultDetails.textContent = `${msg}<br>Puntuación J1: ${scoreA} | Puntuación J2: ${scoreB}`;
  resultOverlay.hidden = false;
}

requestAnimationFrame(updateGame);
