
/* ==========================================
   LA ISLA DEL GRAN TESORO
   Juego multijugador con plataformas y saltos
   ========================================== */

const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

// ==========================================
// CONFIGURACIÓN
// ==========================================

const GAME_DURATION = 360; // 6 minutos de juego
const COUNTDOWN_DURATION = 5;

const WORLD_WIDTH = 4200;
const PLAYER_START_X = 140;
const PLAYER_START_Y = 314;
const FINISH_X = 4050;

const GROUND_TOP = 338;
const PLAYER_HALF_HEIGHT = 24;

const GRAVITY = 0.65;
const JUMP_FORCE = -13;
const MOVE_X = 45;

const TREASURES = [
  { id: 1, x: 350, y: 300 },
  { id: 2, x: 800, y: 240 },
  { id: 3, x: 1250, y: 300 },
  { id: 4, x: 1700, y: 190 },
  { id: 5, x: 2150, y: 300 },
  { id: 6, x: 2650, y: 220 },
  { id: 7, x: 3150, y: 300 },
  { id: 8, x: 3700, y: 230 }
];

const OBSTACLES = [
  { x: 580, y: 300, icon: "🪨" },
  { x: 960, y: 300, icon: "🌳" },
  { x: 1430, y: 300, icon: "🪵" },
  { x: 1900, y: 300, icon: "🪨" },
  { x: 2450, y: 300, icon: "🌳" },
  { x: 2900, y: 300, icon: "🪵" },
  { x: 3400, y: 300, icon: "🪨" },
  { x: 3850, y: 300, icon: "🌳" }
];

const PLATFORMS = [
  { x: 430, top: 270, width: 190 },
  { x: 850, top: 225, width: 180 },
  { x: 1300, top: 265, width: 220 },
  { x: 1750, top: 210, width: 190 },
  { x: 2250, top: 255, width: 220 },
  { x: 2750, top: 205, width: 200 },
  { x: 3250, top: 255, width: 220 },
  { x: 3700, top: 220, width: 190 }
];

// ==========================================
// VARIABLES DEL JUEGO
// ==========================================

const $ = id => document.getElementById(id);

let currentPlayer = null;
let roomPlayers = [];
let roomClaims = [];
let roomData = null;

let roomCode = "";
let roomStatus = "waiting";
let startedAt = null;

let channel = null;
let busy = false;

let timerInterval = null;
let physicsInterval = null;

let verticalVelocity = 0;
let isGrounded = true;
let physicsSaveBusy = false;
let lastPhysicsSave = 0;

let loadingRoom = false;

// ==========================================
// MENSAJES Y ESTADO
// ==========================================

function setMessage(message) {
  if ($("gameMessage")) {
    $("gameMessage").textContent = message;
  }
}

function setStatus(message, connected = false) {
  if (!$("connectionStatus")) return;

  $("connectionStatus").textContent = message;
  $("connectionStatus").style.color =
    connected ? "#a9e6a9" : "#f4ca70";
}

function storageKey(room) {
  return "treasure_island_player_" + room;
}

function getPlayer(role) {
  return roomPlayers.find(player => player.role === role);
}

// ==========================================
// PREPARAR EL MUNDO
// ==========================================

function prepareWorld() {
  const world = $("world");

  if (!world) {
    console.error("No se encontró el elemento #world.");
    return;
  }

  world.style.width = WORLD_WIDTH + "px";

  const ground = world.querySelector(".ground");
  if (ground) ground.style.width = WORLD_WIDTH + "px";

  const finish = $("finishLine");
  if (finish) finish.style.left = FINISH_X + "px";

  if (!$("platformArea")) {
    const area = document.createElement("div");
    area.id = "platformArea";
    area.className = "platform-area";
    world.appendChild(area);
  }
}

// ==========================================
// CÁMARA INDIVIDUAL
// ==========================================

function updateCamera() {
  if (!currentPlayer) return;

  const island = $("island");
  const world = $("world");

  if (!island || !world) return;

  const screenWidth = island.clientWidth;

  let cameraX =
    Number(currentPlayer.x) - screenWidth * 0.42;

  cameraX = Math.max(
    0,
    Math.min(WORLD_WIDTH - screenWidth, cameraX)
  );

  world.style.transform =
    `translate3d(${-cameraX}px, 0, 0)`;
}

// ==========================================
// TIEMPO DE JUEGO
// ==========================================

function remainingTime() {
  if (!startedAt || roomStatus === "waiting") {
    return GAME_DURATION;
  }

  const start = new Date(startedAt).getTime();

  if (roomStatus === "countdown") {
    return Math.max(
      0,
      Math.ceil((start - Date.now()) / 1000)
    );
  }

  if (roomStatus === "finished") {
    return 0;
  }

  const elapsed = Math.floor(
    (Date.now() - start) / 1000
  );

  return Math.max(0, GAME_DURATION - elapsed);
}

function updateTimer() {
  const timer = $("timerDisplay");
  const countdown = $("countdownDisplay");

  if (!timer || !countdown) return;

  if (roomStatus === "waiting") {
    timer.textContent = "06:00";
    countdown.hidden = true;
    return;
  }

  if (roomStatus === "countdown") {
    const seconds = remainingTime();

    countdown.hidden = false;
    countdown.textContent = seconds;
    timer.textContent = "06:00";

    if (seconds <= 0) {
      countdown.hidden = true;
      advanceRoomState();
    }

    return;
  }

  countdown.hidden = true;

  if (roomStatus === "finished") {
    timer.textContent = "00:00";
    return;
  }

  const remaining = remainingTime();

  timer.textContent =
    String(Math.floor(remaining / 60)).padStart(2, "0") +
    ":" +
    String(remaining % 60).padStart(2, "0");

  if (remaining <= 0 && roomStatus === "racing") {
    finishByTimeout();
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// ==========================================
// CARGAR SALA
// ==========================================

async function ensureRoom() {
  const { data, error } = await supabaseClient
    .from("treasure_rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const { error: insertError } = await supabaseClient
      .from("treasure_rooms")
      .insert({
        room_code: roomCode,
        status: "waiting"
      });

    if (insertError && insertError.code !== "23505") {
      throw insertError;
    }
  }
}

async function loadRoom() {
  if (!roomCode || loadingRoom) return;

  loadingRoom = true;

  try {
    const [playersResult, claimsResult, roomResult] =
      await Promise.all([
        supabaseClient
          .from("treasure_players")
          .select("*")
          .eq("room_code", roomCode),

        supabaseClient
          .from("treasure_claims")
          .select("*")
          .eq("room_code", roomCode)
          .order("created_at", { ascending: false }),

        supabaseClient
          .from("treasure_rooms")
          .select("*")
          .eq("room_code", roomCode)
          .maybeSingle()
      ]);

    if (playersResult.error) throw playersResult.error;
    if (claimsResult.error) throw claimsResult.error;
    if (roomResult.error) throw roomResult.error;

    roomPlayers = playersResult.data || [];
    roomClaims = claimsResult.data || [];
    roomData = roomResult.data;

    if (currentPlayer) {
      const updatedPlayer = roomPlayers.find(
        player => player.id === currentPlayer.id
      );

      if (updatedPlayer) {
        currentPlayer = updatedPlayer;
      }
    }

    if (roomData) {
      roomStatus = roomData.status;
      startedAt = roomData.started_at;
    }

    render();
    updateTimer();

    if (roomStatus === "countdown") {
      await advanceRoomState();
    }
  } finally {
    loadingRoom = false;
  }
}

// ==========================================
// COMENZAR CARRERA
// ==========================================

async function advanceRoomState() {
  if (
    !roomCode ||
    roomStatus !== "countdown" ||
    !startedAt ||
    Date.now() < new Date(startedAt).getTime()
  ) {
    return;
  }

  const { error } = await supabaseClient
    .from("treasure_rooms")
    .update({ status: "racing" })
    .eq("room_code", roomCode)
    .eq("status", "countdown");

  if (error) {
    console.error(error);
    return;
  }

  roomStatus = "racing";

  render();
  updateTimer();

  setMessage("¡La carrera comenzó! ¡Corre hacia la meta!");
}

// ==========================================
// DIBUJAR TODO
// ==========================================

function render() {
  const red = getPlayer("red");
  const blue = getPlayer("blue");

  if ($("nameA")) {
    $("nameA").textContent = red?.player_name || "Pirata Rojo";
  }

  if ($("nameB")) {
    $("nameB").textContent = blue?.player_name || "Pirata Azul";
  }

  if ($("scoreA")) $("scoreA").textContent = red?.score ?? 0;
  if ($("scoreB")) $("scoreB").textContent = blue?.score ?? 0;

  drawPirate("pirateA", red);
  drawPirate("pirateB", blue);

  drawObstacles();
  drawPlatforms();
  drawTreasures();

  renderWaitingRoom();
  renderActivity();
  renderFinalResult();

  updateCamera();
}

function drawPirate(elementId, player) {
  const pirate = $(elementId);
  if (!pirate) return;

  if (!player) {
    pirate.style.display = "none";
    return;
  }

  pirate.style.display = "grid";
  pirate.style.left = Number(player.x) + "px";
  pirate.style.top = Number(player.y) + "px";
}

function drawObstacles() {
  const area = $("obstacleArea");
  if (!area) return;

  area.innerHTML = OBSTACLES.map(obstacle => `
    <span class="obstacle"
      style="left:${obstacle.x}px;top:${obstacle.y}px">
      ${obstacle.icon}
    </span>
  `).join("");
}

function drawPlatforms() {
  const area = $("platformArea");
  if (!area) return;

  area.innerHTML = PLATFORMS.map(platform => `
    <div class="game-platform"
      style="
        left:${platform.x}px;
        top:${platform.top}px;
        width:${platform.width}px;
      ">
    </div>
  `).join("");
}

function drawTreasures() {
  const area = $("treasureArea");
  if (!area) return;

  const claimed = new Set(
    roomClaims.map(claim => Number(claim.treasure_id))
  );

  area.innerHTML = TREASURES
    .filter(treasure => !claimed.has(treasure.id))
    .map(treasure => `
      <span class="treasure"
        style="left:${treasure.x}px;top:${treasure.y}px">
        🧰
      </span>
    `)
    .join("");
}

function renderActivity() {
  const activity = $("activityList");
  if (!activity) return;

  activity.innerHTML = "";

  if (!roomClaims.length) {
    const li = document.createElement("li");
    li.textContent = "¡Los tesoros esperan a los capitanes!";
    activity.appendChild(li);
    return;
  }

  roomClaims.slice(0, 12).forEach(claim => {
    const li = document.createElement("li");
    li.textContent = claim.player_name + " encontró un tesoro.";
    activity.appendChild(li);
  });
}

// ==========================================
// SALA DE ESPERA
// ==========================================

function renderWaitingRoom() {
  const red = getPlayer("red");
  const blue = getPlayer("blue");

  if ($("readyA")) {
    $("readyA").textContent =
      red?.is_ready ? "✓ ¡Listo!" : "Esperando...";
  }

  if ($("readyB")) {
    $("readyB").textContent =
      blue?.is_ready ? "✓ ¡Listo!" : "Esperando...";
  }

  const readyButton = $("readyButton");

  if (readyButton) {
    readyButton.disabled =
      !currentPlayer ||
      Boolean(currentPlayer?.is_ready) ||
      roomStatus !== "waiting";

    readyButton.textContent =
      currentPlayer?.is_ready
        ? "✓ Ya estás listo"
        : "¡Estoy listo!";
  }

  if ($("readyMessage")) {
    if (roomStatus === "waiting") {
      $("readyMessage").textContent =
        !red || !blue
          ? "Esperando a los dos capitanes."
          : "Cuando ambos estén listos, comenzará la aventura.";
    } else if (roomStatus === "countdown") {
      $("readyMessage").textContent = "¡Prepárense!";
    } else if (roomStatus === "racing") {
      $("readyMessage").textContent = "¡La carrera está en marcha!";
    } else {
      $("readyMessage").textContent = "La carrera ha terminado.";
    }
  }
}

async function markReady() {
  if (!currentPlayer || busy) return;

  busy = true;

  if ($("readyButton")) $("readyButton").disabled = true;

  try {
    const { error } = await supabaseClient.rpc(
      "set_player_ready",
      {
        p_room_code: roomCode,
        p_player_id: currentPlayer.id,
        p_ready: true
      }
    );

    if (error) throw error;

    await loadRoom();
    setMessage("¡Estás listo! Esperando al otro capitán.");
  } catch (error) {
    console.error(error);
    setMessage("No se pudo marcar como listo: " + error.message);
  } finally {
    busy = false;
    renderWaitingRoom();
  }
}

// ==========================================
// UNIRSE A LA SALA
// ==========================================

async function joinIsland() {
  if (busy) return;

  const playerName = $("playerName").value.trim().slice(0, 20);

  roomCode = $("roomCode").value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 30);

  if (!playerName || !roomCode) {
    setMessage("Escribe tu nombre y el código de la isla.");
    return;
  }

  busy = true;
  $("joinButton").disabled = true;
  currentPlayer = null;

  try {
    await ensureRoom();

    const savedId = localStorage.getItem(storageKey(roomCode));

    if (savedId) {
      const { data, error } = await supabaseClient
        .from("treasure_players")
        .select("*")
        .eq("id", savedId)
        .eq("room_code", roomCode)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const oldPosition = Number(data.x) <= 100;

        const { data: updated, error: updateError } =
          await supabaseClient
            .from("treasure_players")
            .update({
              player_name: playerName,
              ...(oldPosition ? {
                x: PLAYER_START_X,
                y: PLAYER_START_Y
              } : {}),
              updated_at: new Date().toISOString()
            })
            .eq("id", savedId)
            .select()
            .single();

        if (updateError) throw updateError;
        currentPlayer = updated;
      }
    }

    if (!currentPlayer) {
      const { data: existing, error } = await supabaseClient
        .from("treasure_players")
        .select("role")
        .eq("room_code", roomCode);

      if (error) throw error;

      const taken = new Set((existing || []).map(p => p.role));

      const role = !taken.has("red")
        ? "red"
        : !taken.has("blue")
          ? "blue"
          : null;

      if (!role) {
        setMessage("La isla ya tiene dos jugadores.");
        return;
      }

      const { data, error: insertError } = await supabaseClient
        .from("treasure_players")
        .insert({
          id: crypto.randomUUID(),
          room_code: roomCode,
          player_name: playerName,
          role,
          x: PLAYER_START_X,
          y: PLAYER_START_Y,
          score: 0,
          is_ready: false,
          finished_at: null
        })
        .select()
        .single();

      if (insertError) throw insertError;

      currentPlayer = data;
      localStorage.setItem(storageKey(roomCode), data.id);
    }

    await loadRoom();
    subscribeToRoom();

    $("playerInfo").textContent =
      "Estás jugando como Pirata " +
      (currentPlayer.role === "red" ? "Rojo" : "Azul");

    setStatus("Conectado · " + roomCode, true);
    setMessage("¡Bienvenido! Prepárate para explorar la isla.");

    updateCamera();
  } catch (error) {
    console.error(error);
    setMessage("Error al entrar: " + error.message);
    setStatus("Error de conexión");
  } finally {
    busy = false;
    $("joinButton").disabled = false;
    renderWaitingRoom();
  }
}

// ==========================================
// SINCRONIZACIÓN MULTIJUGADOR
// ==========================================

function subscribeToRoom() {
  if (channel) {
    supabaseClient.removeChannel(channel);
  }

  channel = supabaseClient
    .channel("treasure-room-" + roomCode)

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "treasure_players",
      filter: "room_code=eq." + roomCode
    }, () => {
      loadRoom().catch(console.error);
    })

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "treasure_claims",
      filter: "room_code=eq." + roomCode
    }, () => {
      loadRoom().catch(console.error);
    })

    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "treasure_rooms",
      filter: "room_code=eq." + roomCode
    }, () => {
      loadRoom().catch(console.error);
    })

    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        setStatus("En línea · " + roomCode, true);
      }
    });
}

// ==========================================
// OBSTÁCULOS
// ==========================================

function hitsObstacle(x, y) {
  return OBSTACLES.some(obstacle =>
    Math.hypot(x - obstacle.x, y - obstacle.y) < 48
  );
}

// ==========================================
// MOVIMIENTO HORIZONTAL
// ==========================================

async function movePlayer(direction) {
  if (!currentPlayer || busy) {
    if (!currentPlayer) setMessage("Primero entra a la isla.");
    return;
  }

  if (roomStatus !== "racing") {
    setMessage("Espera a que comience la carrera.");
    return;
  }

  if (currentPlayer.finished_at) return;

  if (direction === "up") {
    jumpPlayer();
    return;
  }

  if (direction !== "left" && direction !== "right") return;

  const amount = direction === "right" ? MOVE_X : -MOVE_X;

  const x = Math.max(
    35,
    Math.min(FINISH_X, Number(currentPlayer.x) + amount)
  );

  const y = Number(currentPlayer.y);

  if (hitsObstacle(x, y)) {
    setMessage("¡Cuidado! Salta para esquivar el obstáculo.");
    return;
  }

  busy = true;

  try {
    const { data, error } = await supabaseClient
      .from("treasure_players")
      .update({
        x,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentPlayer.id)
      .select()
      .single();

    if (error) throw error;

    currentPlayer = data;
    render();

    if (x >= FINISH_X) {
      await markFinished();
    }
  } catch (error) {
    console.error(error);
    setMessage("Error al mover: " + error.message);
  } finally {
    busy = false;
  }
}

// ==========================================
// SALTOS Y GRAVEDAD
// ==========================================

function jumpPlayer() {
  if (!currentPlayer || roomStatus !== "racing") return;
  if (!isGrounded || currentPlayer.finished_at) return;

  verticalVelocity = JUMP_FORCE;
  isGrounded = false;
}

function physicsStep() {
  if (
    !currentPlayer ||
    roomStatus !== "racing" ||
    currentPlayer.finished_at
  ) return;

  const x = Number(currentPlayer.x);
  const oldY = Number(currentPlayer.y);

  let newY = oldY + verticalVelocity;

  verticalVelocity += GRAVITY;

  let landed = false;

  if (verticalVelocity >= 0) {
    const oldFeet = oldY + PLAYER_HALF_HEIGHT;
    const newFeet = newY + PLAYER_HALF_HEIGHT;

    for (const platform of PLATFORMS) {
      const overlaps =
        x + 20 > platform.x &&
        x - 20 < platform.x + platform.width;

      if (
        overlaps &&
        oldFeet <= platform.top &&
        newFeet >= platform.top
      ) {
        newY = platform.top - PLAYER_HALF_HEIGHT;
        verticalVelocity = 0;
        landed = true;
        break;
      }
    }
  }

  if (newY + PLAYER_HALF_HEIGHT >= GROUND_TOP) {
    newY = GROUND_TOP - PLAYER_HALF_HEIGHT;
    verticalVelocity = 0;
    landed = true;
  }

  isGrounded = landed;

  if (Math.abs(newY - oldY) < 0.1) return;

  currentPlayer.y = newY;

  drawPirate(
    currentPlayer.role === "red" ? "pirateA" : "pirateB",
    currentPlayer
  );

  const now = Date.now();

  if (
    now - lastPhysicsSave >= 150 &&
    !physicsSaveBusy
  ) {
    lastPhysicsSave = now;
    physicsSaveBusy = true;

    supabaseClient
      .from("treasure_players")
      .update({
        y: newY,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentPlayer.id)
      .then(({ error }) => {
        if (error) console.error("Error guardando salto:", error);
      })
      .finally(() => {
        physicsSaveBusy = false;
      });
  }
}

// ==========================================
// LLEGADA A LA META Y GANADOR
// ==========================================

async function markFinished() {
  if (!currentPlayer || currentPlayer.finished_at) return;

  const { data, error } = await supabaseClient
    .from("treasure_players")
    .update({
      x: FINISH_X,
      finished_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", currentPlayer.id)
    .is("finished_at", null)
    .select()
    .single();

  if (error) {
    console.error(error);
    return;
  }

  currentPlayer = data;

  const { data: winnerData, error: winnerError } =
    await supabaseClient.rpc("claim_race_winner", {
      p_room_code: roomCode,
      p_player_id: currentPlayer.id
    });

  if (winnerError) {
    console.error(winnerError);
    setMessage("No se pudo registrar la victoria: " + winnerError.message);
    return;
  }

  roomData = {
    ...roomData,
    ...winnerData
  };

  roomStatus = "finished";
  verticalVelocity = 0;

  await loadRoom();

  setMessage("¡La carrera terminó!");
}

async function finishByTimeout() {
  if (roomStatus !== "racing") return;

  const { error } = await supabaseClient
    .from("treasure_rooms")
    .update({ status: "finished" })
    .eq("room_code", roomCode)
    .eq("status", "racing");

  if (error) {
    console.error(error);
    return;
  }

  await loadRoom();
}

// ==========================================
// PANTALLA WINNER / PERDISTE
// ==========================================

function renderFinalResult() {
  let overlay = $("winnerOverlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "winnerOverlay";
    overlay.className = "winner-overlay";
    document.body.appendChild(overlay);
  }

  if (roomStatus !== "finished") {
    overlay.hidden = true;

    if ($("finalResult")) {
      $("finalResult").hidden = true;
    }

    return;
  }

  const winnerId = roomData?.winner_player_id;
  const winnerName = roomData?.winner_name;

  let heading;
  let subtitle;

  if (!winnerId) {
    heading = "TIEMPO AGOTADO";
    subtitle = "Se acabaron los seis minutos. ¡La carrera terminó!";
  } else if (currentPlayer && winnerId === currentPlayer.id) {
    heading = "WINNER!";
    subtitle = "¡Felicidades, " + winnerName + "! ¡Ganaste la carrera!";
  } else {
    heading = "PERDISTE";
    subtitle = winnerName + " llegó primero a la meta.";
  }

  overlay.hidden = false;

  overlay.innerHTML = `
    <div class="winner-card">
      <h1>${heading}</h1>
      <p>${subtitle}</p>
      <button id="playAgainButton">JUGAR OTRA VEZ</button>
    </div>
  `;

  if ($("winnerMessage")) {
    $("winnerMessage").textContent = subtitle;
  }

  if ($("finalResult")) {
    $("finalResult").hidden = false;
  }

  $("playAgainButton").addEventListener("click", restartGame);
}

// ==========================================
// RECOGER TESOROS
// ==========================================

async function findTreasure() {
  if (!currentPlayer || busy) {
    if (!currentPlayer) setMessage("Primero entra a la isla.");
    return;
  }

  if (roomStatus !== "racing") {
    setMessage("Espera a que comience la carrera.");
    return;
  }

  const available = TREASURES.filter(treasure =>
    !roomClaims.some(
      claim => Number(claim.treasure_id) === treasure.id
    )
  );

  const nearby = available.find(treasure =>
    Math.hypot(
      Number(currentPlayer.x) - treasure.x,
      Number(currentPlayer.y) - treasure.y
    ) < 70
  );

  if (!nearby) {
    setMessage("No hay un cofre cerca. Sigue explorando.");
    return;
  }

  busy = true;

  try {
    const { error } = await supabaseClient
      .from("treasure_claims")
      .insert({
        room_code: roomCode,
        treasure_id: nearby.id,
        player_role: currentPlayer.role,
        player_name: currentPlayer.player_name
      });

    if (error) throw error;

    const { data, error: updateError } = await supabaseClient
      .from("treasure_players")
      .update({
        score: Number(currentPlayer.score) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentPlayer.id)
      .select()
      .single();

    if (updateError) throw updateError;

    currentPlayer = data;

    await loadRoom();
    setMessage("¡Encontraste un tesoro! Ganaste un punto.");
  } catch (error) {
    console.error(error);

    setMessage(
      error.code === "23505"
        ? "¡Ese cofre ya fue recogido!"
        : "Error al guardar el tesoro: " + error.message
    );

    await loadRoom().catch(console.error);
  } finally {
    busy = false;
  }
}

// ==========================================
// REINICIAR PARTIDA
// ==========================================

async function restartGame() {
  if (!currentPlayer || busy) return;

  if (!confirm("¿Quieres reiniciar la carrera para los dos jugadores?")) {
    return;
  }

  busy = true;

  try {
    const { error: claimsError } = await supabaseClient
      .from("treasure_claims")
      .delete()
      .eq("room_code", roomCode);

    if (claimsError) throw claimsError;

    const { error: playersError } = await supabaseClient
      .from("treasure_players")
      .update({
        score: 0,
        x: PLAYER_START_X,
        y: PLAYER_START_Y,
        is_ready: false,
        finished_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("room_code", roomCode);

    if (playersError) throw playersError;

    const { error: roomError } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: new Date().toISOString(),
        winner_player_id: null,
        winner_name: null,
        winner_role: null
      })
      .eq("room_code", roomCode);

    if (roomError) throw roomError;

    verticalVelocity = 0;
    isGrounded = true;

    await loadRoom();

    setMessage("¡Carrera reiniciada! Ambos jugadores deben estar listos.");
  } catch (error) {
    console.error(error);
    setMessage("Error al reiniciar: " + error.message);
  } finally {
    busy = false;
  }
}

// ==========================================
// SALIR DE LA PARTIDA
// ==========================================

async function leaveGame() {
  if (!currentPlayer || busy) return;

  if (!confirm("¿Seguro que quieres abandonar la isla?")) return;

  busy = true;

  try {
    const playerId = currentPlayer.id;

    const { error } = await supabaseClient
      .from("treasure_players")
      .delete()
      .eq("id", playerId);

    if (error) throw error;

    localStorage.removeItem(storageKey(roomCode));

    currentPlayer = null;

    const { error: roomError } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: new Date().toISOString(),
        winner_player_id: null,
        winner_name: null,
        winner_role: null
      })
      .eq("room_code", roomCode);

    if (roomError) throw roomError;

    const { error: readyError } = await supabaseClient
      .from("treasure_players")
      .update({ is_ready: false })
      .eq("room_code", roomCode);

    if (readyError) throw readyError;

    if (channel) {
      await supabaseClient.removeChannel(channel);
      channel = null;
    }

    await loadRoom();

    $("playerInfo").textContent = "Has salido de la isla.";

    setStatus("Has salido de la isla");
    setMessage("Has abandonado la partida.");
  } catch (error) {
    console.error(error);
    setMessage("No se pudo abandonar: " + error.message);
  } finally {
    busy = false;
  }
}

// ==========================================
// BOTONES
// ==========================================

function setupControls() {
  $("joinButton").addEventListener("click", joinIsland);
  $("readyButton").addEventListener("click", markReady);
  $("findTreasureButton").addEventListener("click", findTreasure);
  $("restartButton").addEventListener("click", restartGame);
  $("leaveButton").addEventListener("click", leaveGame);

  document.querySelectorAll("[data-move]").forEach(button => {
    button.addEventListener("click", () => {
      movePlayer(button.dataset.move);
    });
  });

  document.addEventListener("keydown", event => {
    const keys = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      w: "up",
      W: "up",
      a: "left",
      A: "left",
      d: "right",
      D: "right"
    };

    if (
      ["INPUT", "TEXTAREA"].includes(
        document.activeElement?.tagName
      )
    ) {
      return;
    }

    const movement = keys[event.key];

    if (movement) {
      event.preventDefault();
      movePlayer(movement);
    }
  });
}

// ==========================================
// INICIO DEL JUEGO
// ==========================================

function initGame() {
  prepareWorld();
  setupControls();

  if ($("readyButton")) $("readyButton").disabled = true;
  if ($("finalResult")) $("finalResult").hidden = true;

  setStatus("Listo para comenzar");

  startTimer();

  if (physicsInterval) clearInterval(physicsInterval);

  physicsInterval = setInterval(physicsStep, 40);

  window.addEventListener("resize", updateCamera);
}

initGame();
