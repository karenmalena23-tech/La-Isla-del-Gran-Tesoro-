// DETECTIVES EN DUELO
// Primera versión: funcionamiento local de demostración.
// Las salas todavía no están conectadas entre dispositivos.

const homeScreen = document.getElementById("home-screen");
const roomScreen = document.getElementById("room-screen");
const joinScreen = document.getElementById("join-screen");
const gameScreen = document.getElementById("game-screen");

const createButton = document.getElementById("create-button");
const joinButton = document.getElementById("join-button");
const copyButton = document.getElementById("copy-button");
const enterButton = document.getElementById("enter-button");

const roomCodeElement = document.getElementById("room-code");
const roomInput = document.getElementById("room-input");
const joinMessage = document.getElementById("join-message");
const homeMessage = document.getElementById("home-message");

const scoreElement = document.getElementById("score");
const timerElement = document.getElementById("timer");
const progressBar = document.getElementById("progress-bar");
const answerMessage = document.getElementById("answer-message");
const nextButton = document.getElementById("next-button");

const clueElement = document.querySelector(".clue");
const answerButtons = document.querySelectorAll(".answer-button");

let score = 0;
let timeLeft = 20;
let timer = null;
let currentQuestion = 0;
let answered = false;

const questions = [
  {
    clue: "Tengo agujas, pero no sé coser. Tengo números, pero no sé contar. ¿Qué soy?",
    answers: [
      { text: "🐱 Un gato", value: "gato" },
      { text: "🕒 Un reloj", value: "reloj" },
      { text: "🚪 Una puerta", value: "puerta" }
    ],
    correct: "reloj"
  },
  {
    clue: "Cuanto más me quitas, más grande me vuelvo. ¿Qué soy?",
    answers: [
      { text: "🕳️ Un agujero", value: "agujero" },
      { text: "🎁 Un regalo", value: "regalo" },
      { text: "🌳 Un árbol", value: "arbol" }
    ],
    correct: "agujero"
  },
  {
    clue: "Tengo ciudades, pero no casas; tengo ríos, pero no agua. ¿Qué soy?",
    answers: [
      { text: "📖 Un libro", value: "libro" },
      { text: "🗺️ Un mapa", value: "mapa" },
      { text: "🏫 Una escuela", value: "escuela" }
    ],
    correct: "mapa"
  }
];

function showScreen(screen) {
  [homeScreen, roomScreen, joinScreen, gameScreen].forEach(item => {
    item.classList.add("hidden");
  });

  screen.classList.remove("hidden");
}

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
}

// Crear sala de demostración
createButton.addEventListener("click", () => {
  const code = generateRoomCode();

  roomCodeElement.textContent = code;
  homeMessage.textContent = "";

  showScreen(roomScreen);
});

// Botón para copiar el código
copyButton.addEventListener("click", async () => {
  const code = roomCodeElement.textContent;

  try {
    await navigator.clipboard.writeText(code);
    copyButton.textContent = "✅ ¡Código copiado!";
  } catch {
    copyButton.textContent = "Código: " + code;
  }
});

// Añadir botón para probar el acertijo
const testButton = document.createElement("button");
testButton.className = "main-button";
testButton.textContent = "🧩 Probar acertijos";
roomScreen.insertBefore(testButton, document.getElementById("back-room-button"));

testButton.addEventListener("click", startGame);

// Ir a la pantalla para unirse
joinButton.addEventListener("click", () => {
  joinMessage.textContent = "";
  roomInput.value = "";
  showScreen(joinScreen);
});

// Comprobar el código introducido
enterButton.addEventListener("click", () => {
  const code = roomInput.value.trim().toUpperCase();

  if (code.length !== 6) {
    joinMessage.textContent = "❌ El código debe tener 6 caracteres.";
    return;
  }

  joinMessage.textContent =
    "🚧 El código tiene el formato correcto, pero todavía falta conectar Supabase para encontrar salas reales desde otro dispositivo.";
});

// Volver al menú
document.getElementById("back-room-button").addEventListener("click", () => {
  showScreen(homeScreen);
});

document.getElementById("back-join-button").addEventListener("click", () => {
  showScreen(homeScreen);
});

// Iniciar el juego de acertijos
function startGame() {
  score = 0;
  currentQuestion = 0;

  scoreElement.textContent = score;

  showScreen(gameScreen);
  loadQuestion();
}

// Cargar un acertijo
function loadQuestion() {
  clearInterval(timer);

  if (currentQuestion >= questions.length) {
    finishGame();
    return;
  }

  const question = questions[currentQuestion];

  clueElement.textContent = question.clue;
  answerMessage.textContent = "";
  nextButton.classList.add("hidden");
  answered = false;

  answerButtons.forEach((button, index) => {
    button.disabled = false;
    button.classList.remove("correct", "wrong");
    button.textContent = question.answers[index].text;
    button.dataset.answer = question.answers[index].value;
  });

  startTimer();
  updateProgress();
}

// Temporizador
function startTimer() {
  timeLeft = 20;
  timerElement.textContent = timeLeft;
  updateProgress();

  timer = setInterval(() => {
    timeLeft--;
    timerElement.textContent = timeLeft;
    updateProgress();

    if (timeLeft <= 0) {
      clearInterval(timer);
      answered = true;

      answerMessage.textContent = "⏰ ¡Se acabó el tiempo!";
      answerButtons.forEach(button => button.disabled = true);
      nextButton.classList.remove("hidden");
    }
  }, 1000);
}

// Actualizar la barra de tiempo
function updateProgress() {
  progressBar.style.width = (timeLeft / 20) * 100 + "%";
}

// Comprobar respuesta
answerButtons.forEach(button => {
  button.addEventListener("click", () => {
    if (answered) return;

    answered = true;
    clearInterval(timer);

    const selectedAnswer = button.dataset.answer;
    const correctAnswer = questions[currentQuestion].correct;

    answerButtons.forEach(item => item.disabled = true);

    if (selectedAnswer === correctAnswer) {
      score += 100;
      scoreElement.textContent = score;

      button.classList.add("correct");
      answerMessage.textContent = "🎉 ¡Correcto! +100 puntos";
    } else {
      button.classList.add("wrong");

      answerButtons.forEach(item => {
        if (item.dataset.answer === correctAnswer) {
          item.classList.add("correct");
        }
      });

      answerMessage.textContent = "🔎 ¡Buen intento! La pista estaba frente a ti.";
    }

    nextButton.classList.remove("hidden");
  });
});

// Siguiente acertijo
nextButton.addEventListener("click", () => {
  currentQuestion++;
  loadQuestion();
});

// Terminar partida
function finishGame() {
  clearInterval(timer);

  clueElement.textContent = "🏆 ¡Investigación completada!";
  answerMessage.textContent = "Tu puntuación final: " + score + " puntos.";

  answerButtons.forEach(button => {
    button.classList.add("hidden");
  });

  nextButton.classList.add("hidden");

  const restartButton = document.createElement("button");
  restartButton.className = "main-button";
  restartButton.textContent = "🔄 Jugar otra vez";

  restartButton.addEventListener("click", () => {
    answerButtons.forEach(button => button.classList.remove("hidden"));
    restartButton.remove();
    startGame();
  });

  gameScreen.appendChild(restartButton);
}
