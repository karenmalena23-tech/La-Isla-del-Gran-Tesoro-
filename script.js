
// ==========================================
// DETECTIVES EN DUELO
// Conexión inicial con Supabase
// ==========================================

// 1. PEGA AQUÍ TUS DATOS DE SUPABASE
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

// 2. CONECTAR CON SUPABASE
const { createClient } = supabase;

const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ==========================================
// ELEMENTOS DE LA PÁGINA
// ==========================================

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

const backRoomButton = document.getElementById("back-room-button");
const backJoinButton = document.getElementById("back-join-button");

// ==========================================
// VARIABLES
// ==========================================

let score = 0;
let timeLeft = 20;
let timer = null;
let currentQuestion = 0;
let answered = false;

let currentRoomId = null;
let currentUserId = null;
let realtimeChannel = null;

// ==========================================
// ACERTIJOS
// ==========================================

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

// ==========================================
// FUNCIONES GENERALES
// ==========================================

function showScreen(screen) {
  [homeScreen, roomScreen, joinScreen, gameScreen].forEach(item => {
    item.classList.add("hidden");
  });

  screen.classList.remove("hidden");
}

function showError(element, message) {
  if (element) element.textContent = message;
}

function generateRoomCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += characters[Math.floor(Math.random() * characters.length)];
  }

  return code;
}

// ==========================================
// INICIAR SESIÓN ANÓNIMA
// ==========================================

async function ensureLogin() {
  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError) throw sessionError;

  if (sessionData.session) {
    currentUserId = sessionData.session.user.id;
    return currentUserId;
  }

  const { data, error } =
    await supabaseClient.auth.signInAnonymously();

  if (error) throw error;

  currentUserId = data.user.id;
  return currentUserId;
}

// ==========================================
// CREAR UNA SALA REAL
// ==========================================

createButton.addEventListener("click", async () => {
  createButton.disabled = true;
  showError(homeMessage, "🔎 Creando tu sala...");

  try {
    const userId = await ensureLogin();

    const code = generateRoomCode();

    const { data: room, error: roomError } =
      await supabaseClient
        .from("rooms")
        .insert({
          code: code,
          created_by: userId
        })
        .select()
        .single();

    if (roomError) throw roomError;

    const { error: playerError } =
      await supabaseClient
        .from("players")
        .insert({
          room_id: room.id,
          user_id: userId,
          nickname: "Detective 1"
        });

    if (playerError) throw playerError;

    currentRoomId = room.id;

    roomCodeElement.textContent = code;
    showError(homeMessage, "");

    showScreen(roomScreen);

    listenToRoom();

    showRoomStatus("⏳ Esperando al segundo detective...");

  } catch (error) {
    console.error(error);
    showError(
      homeMessage,
      "❌ No se pudo crear la sala: " + error.message
    );
  } finally {
    createButton.disabled = false;
  }
});

// ==========================================
// ESTADO Y ACTUALIZACIONES DE LA SALA
// ==========================================

function showRoomStatus(message) {
  let status = document.getElementById("room-status");

  if (!status) {
    status = document.createElement("p");
    status.id = "room-status";

    const backButton = document.getElementById("back-room-button");

    if (backButton) {
      roomScreen.insertBefore(status, backButton);
    } else {
      roomScreen.appendChild(status);
    }
  }

  status.textContent = message;
}

async function listenToRoom() {
  if (!currentRoomId) return;

  if (realtimeChannel) {
    await supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel("sala-" + currentRoomId)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "players",
        filter: "room_id=eq." + currentRoomId
      },
      async () => {
        const { data, error } = await supabaseClient
          .from("players")
          .select("id")
          .eq("room_id", currentRoomId);

        if (error) {
          console.error(error);
          return;
        }

        if (data.length >= 2) {
          showRoomStatus("🕵️ ¡Ya están los dos detectives! Sala lista.");
        } else {
          showRoomStatus("⏳ Esperando al segundo detective...");
        }
      }
    )
    .subscribe();
}

// ==========================================
// COPIAR CÓDIGO
// ==========================================

copyButton.addEventListener("click", async () => {
  const code = roomCodeElement.textContent;

  try {
    await navigator.clipboard.writeText(code);
    copyButton.textContent = "✅ ¡Código copiado!";
  } catch {
    copyButton.textContent = "Código: " + code;
  }
});

// ==========================================
// IR A UNIRSE A UNA SALA
// ==========================================

joinButton.addEventListener("click", () => {
  joinMessage.textContent = "";
  roomInput.value = "";
  showScreen(joinScreen);
});

// ==========================================
// UNIRSE A UNA SALA REAL
// ==========================================

enterButton.addEventListener("click", async () => {
  const code = roomInput.value.trim().toUpperCase();

  if (code.length !== 6) {
    showError(joinMessage, "❌ El código debe tener 6 caracteres.");
    return;
  }

  enterButton.disabled = true;
  showError(joinMessage, "🔎 Buscando la sala...");

  try {
    const userId = await ensureLogin();

    const { data: room, error: roomError } =
      await supabaseClient
        .from("rooms")
        .select("*")
        .eq("code", code)
        .eq("status", "waiting")
        .maybeSingle();

    if (roomError) throw roomError;

    if (!room) {
      showError(joinMessage, "❌ No encontramos esa sala.");
      return;
    }

    const { data: players, error: playersError } =
      await supabaseClient
        .from("players")
        .select("id, user_id")
        .eq("room_id", room.id);

    if (playersError) throw playersError;

    if (players.some(player => player.user_id === userId)) {
      showError(joinMessage, "Ya estás dentro de esta sala.");
      return;
    }

    if (players.length >= 2) {
      showError(joinMessage, "❌ Esta sala ya tiene dos detectives.");
      return;
    }

    const { error: insertError } =
      await supabaseClient
        .from("players")
        .insert({
          room_id: room.id,
          user_id: userId,
          nickname: "Detective 2"
        });

    if (insertError) throw insertError;

    currentRoomId = room.id;

    showScreen(roomScreen);
    roomCodeElement.textContent = code;

    listenToRoom();

    showRoomStatus("🎉 ¡Te has unido! Ya están los dos detectives.");

  } catch (error) {
    console.error(error);
    showError(
      joinMessage,
      "❌ Error al entrar: " + error.message
    );
  } finally {
    enterButton.disabled = false;
  }
});

// ==========================================
// VOLVER AL MENÚ
// ==========================================

backRoomButton.addEventListener("click", () => {
  showScreen(homeScreen);
});

backJoinButton.addEventListener("click", () => {
  showScreen(homeScreen);
});

// ==========================================
// INICIAR ACERTIJOS
// ==========================================

const testButton = document.createElement("button");
testButton.className = "main-button";
testButton.textContent = "🧩 Probar acertijos";

roomScreen.insertBefore(
  testButton,
  document.getElementById("back-room-button")
);

testButton.addEventListener("click", startGame);

function startGame() {
  score = 0;
  currentQuestion = 0;

  scoreElement.textContent = score;

  showScreen(gameScreen);
  loadQuestion();
}

// ==========================================
// CARGAR ACERTIJO
// ==========================================

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

// ==========================================
// TEMPORIZADOR
// ==========================================

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

function updateProgress() {
  progressBar.style.width = (timeLeft / 20) * 100 + "%";
}

// ==========================================
// COMPROBAR RESPUESTAS
// ==========================================

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

      answerMessage.textContent =
        "🔎 ¡Buen intento! La pista estaba frente a ti.";
    }

    nextButton.classList.remove("hidden");
  });
});

// ==========================================
// SIGUIENTE ACERTIJO
// ==========================================

nextButton.addEventListener("click", () => {
  currentQuestion++;
  loadQuestion();
});

// ==========================================
// TERMINAR PARTIDA
// ==========================================

function finishGame() {
  clearInterval(timer);

  clueElement.textContent = "🏆 ¡Investigación completada!";
  answerMessage.textContent =
    "Tu puntuación final: " + score + " puntos.";

  answerButtons.forEach(button => {
    button.classList.add("hidden");
  });

  nextButton.classList.add("hidden");

  const oldRestart = document.getElementById("restart-button");

  if (oldRestart) oldRestart.remove();

  const restartButton = document.createElement("button");
  restartButton.id = "restart-button";
  restartButton.className = "main-button";
  restartButton.textContent = "🔄 Jugar otra vez";

  restartButton.addEventListener("click", () => {
    answerButtons.forEach(button => button.classList.remove("hidden"));
    restartButton.remove();
    startGame();
  });

  gameScreen.appendChild(restartButton);
}
