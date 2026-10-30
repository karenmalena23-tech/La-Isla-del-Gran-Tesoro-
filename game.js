
// ==================================================
// LA ISLA DEL GRAN TESORO
// Multijugador, movimiento manual y Supabase
// ==================================================

// ---------------- SUPABASE ----------------

const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";

const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = id => document.getElementById(id);

// ---------------- CONFIGURACIÓN ----------------

const GAME_DURATION = 360;
const WORLD_WIDTH = 4200;

const PLAYER_START_X = 140;
const PLAYER_START_Y = 314;
const FINISH_X = 4050;

const GROUND_TOP = 338;
const PLAYER_HALF_HEIGHT = 24;

const GRAVITY = 0.65;
const JUMP_FORCE = -13;
const PLAYER_SPEED = 5;
const SAVE_INTERVAL = 200;
const MOVEMENT_INTERVAL = 40;

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

// ---------------- ESTADO ----------------

let currentPlayer = null;
let roomPlayers = [];
let roomClaims = [];
let roomData = null;

let roomCode = "";
let roomStatus = "waiting";
let startedAt = null;

let channel = null;

let busy = false;
let loadingRoom = false;
let savingPosition = false;
let finishing = false;

let verticalVelocity = 0;
let isGrounded = true;

let lastFrameTime = 0;
let lastSaveTime = 0;
let lastMovementTime = 0;

let pressedKeys = new Set();

let gameLoop = null;
let timerInterval = null;

// ---------------- MENSAJES ----------------

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

// ---------------- PREPARAR ESCENARIO ----------------

function prepareWorld() {
  const world = $("world");

  if (!world) {
    console.error("No se encontró #world.");
    return;
  }

  world.style.width = WORLD_WIDTH + "px";

  const ground = world.querySelector(".ground");

  if (ground) {
    ground.style.width = WORLD_WIDTH + "px";
  }

  const finish = $("finishLine");

  if (finish) {
    finish.style.left = FINISH_X + "px";
  }

  if (!$("platformArea")) {
    const area = document.createElement("div");
    area.id = "platformArea";
    area.className = "platform-area";
    world.appendChild(area);
  }
}

// ---------------- CÁMARA ----------------

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

// ---------------- TEMPORIZADOR ----------------

function remainingTime() {
  if (!startedAt || roomStatus === "waiting") {
    return GAME_DURATION;
  }

  if (roomStatus === "finished") {
    return 0;
  }

  const elapsed = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000
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
    const seconds = Math.max(
      0,
      Math.ceil(
        (new Date(startedAt).getTime() - Date.now()) / 1000
      )
    );

    countdown.hidden = false;
    countdown.textContent = seconds;
    timer.textContent = "06:00";
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

  if (remaining <= 0) {
    finishByTimeout();
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  updateTimer();
  timerInterval = setInterval(updateTimer, 1000);
}

// ---------------- CARGAR SALA ----------------

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
      const updated = roomPlayers.find(
        player => player.id === currentPlayer.id
      );

      if (updated) {
        currentPlayer = {
          ...updated,
          x: currentPlayer.x,
          y: currentPlayer.y
        };

        // Si la base de datos confirma una posición más reciente,
        // se utiliza esa posición cuando no hay movimiento local.
        if (!pressedKeys.size && !savingPosition) {
          currentPlayer.x = Number(updated.x);
          currentPlayer.y = Number(updated.y);
        }

        if (updated.finished_at) {
          currentPlayer.finished_at = updated.finished_at;
        }
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

// ---------------- INICIAR CARRERA ----------------

async function advanceRoomState() {
  if (
    roomStatus !== "countdown" ||
    !startedAt ||
    Date.now() < new Date(startedAt).getTime()
  ) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("treasure_rooms")
    .update({
      status: "racing",
      started_at: new Date().toISOString()
    })
    .eq("room_code", roomCode)
    .eq("status", "countdown")
    .select()
    .maybeSingle();

  if (error) {
    console.error(error);
    return;
  }

  if (data) {
    roomData = data;
    roomStatus = "racing";
    startedAt = data.started_at;
  }

  lastFrameTime = 0;
  lastSaveTime = 0;
  lastMovementTime = 0;

  render();
  updateTimer();

  setMessage("¡La carrera comenzó! ¡Avanza y salta los obstáculos!");
}

// ---------------- DIBUJAR JUEGO ----------------

function render() {
  const red = getPlayer("red");
  const blue = getPlayer("blue");

  if ($("nameA")) {
    $("nameA").textContent =
      red?.player_name || "Pirata Rojo";
  }

  if ($("nameB")) {
    $("nameB").textContent =
      blue?.player_name || "Pirata Azul";
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
    <span
      class="obstacle"
      role="img"
      aria-label="Obstáculo"
      style="
        left:${obstacle.x}px;
        top:${obstacle.y}px;
      "
    >${obstacle.icon}</span>
  `).join("");
}

function drawPlatforms() {
  const area = $("platformArea");
  if (!area) return;

  area.innerHTML = PLATFORMS.map(platform => `
    <div
      class="game-platform"
      style="
        left:${platform.x}px;
        top:${platform.top}px;
        width:${platform.width}px;
      "
    ></div>
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
      <span
        class="treasure"
        style="
          left:${treasure.x}px;
          top:${treasure.y}px;
        "
      >🧰</span>
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

// ---------------- SALA DE ESPERA ----------------

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

  if ($("readyButton")) {
    $("readyButton").disabled =
      !currentPlayer ||
      Boolean(currentPlayer?.is_ready) ||
      roomStatus !== "waiting";

    $("readyButton").textContent =
      currentPlayer?.is_ready
        ? "✓ Ya estás listo"
        : "¡Estoy listo!";
  }

  if ($("readyMessage")) {
    if (roomStatus === "waiting") {
      $("readyMessage").textContent =
        !red || !blue
          ? "Esperando a los dos capitanes."
          : "Cuando ambos estén listos, comenzará la carrera.";
    } else if (roomStatus === "countdown") {
      $("readyMessage").textContent = "¡Prepárense!";
    } else if (roomStatus === "racing") {
      $("readyMessage").textContent = "¡La carrera está en marcha!";
    } else {
      $("readyMessage").textContent = "La carrera terminó.";
    }
  }
}

async function markReady() {
  if (!currentPlayer || busy) return;

  busy = true;

  if ($("readyButton")) {
    $("readyButton").disabled = true;
  }

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
    setMessage("Error: " + error.message);
  } finally {
    busy = false;
    renderWaitingRoom();
  }
}

// ---------------- UNIRSE ----------------

async function joinIsland() {
  if (busy) return;

  const playerName = $("playerName").value.trim().slice(0, 20);

  roomCode = $("roomCode").value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 30);

  if (!playerName || !roomCode) {
    setMessage("Escribe tu nombre y código de sala.");
    return;
  }

  busy = true;

  if ($("joinButton")) {
    $("joinButton").disabled = true;
  }

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

      const taken = new Set(
        (existing || []).map(player => player.role)
      );

      const role = !taken.has("red")
        ? "red"
        : !taken.has("blue")
          ? "blue"
          : null;

      if (!role) {
        setMessage("La sala ya tiene dos jugadores.");
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

    verticalVelocity = 0;
    isGrounded = true;
    pressedKeys.clear();
    finishing = false;

    await loadRoom();

    subscribeToRoom();

    if ($("playerInfo")) {
      $("playerInfo").textContent =
        "Estás jugando como Pirata " +
        (currentPlayer.role === "red" ? "Rojo" : "Azul");
    }

    setStatus("Conectado · " + roomCode, true);
    setMessage("¡Bienvenido! Prepárate para correr.");

  } catch (error) {
    console.error(error);
    setMessage("Error al entrar: " + error.message);
    setStatus("Error de conexión");
  } finally {
    busy = false;

    if ($("joinButton")) {
      $("joinButton").disabled = false;
    }

    renderWaitingRoom();
  }
}

// ---------------- REALTIME ----------------

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

// ---------------- SALTO Y FÍSICA ----------------

function jumpPlayer() {
  if (!currentPlayer || roomStatus !== "racing") return;
  if (!isGrounded || currentPlayer.finished_at || finishing) return;

  verticalVelocity = JUMP_FORCE;
  isGrounded = false;
}

function physicsStep() {
  if (
    !currentPlayer ||
    roomStatus !== "racing" ||
    currentPlayer.finished_at ||
    finishing
  ) return;

  const oldY = Number(currentPlayer.y);
  let newY = oldY + verticalVelocity;

  verticalVelocity += GRAVITY;

  let landed = false;

  if (verticalVelocity >= 0) {
    const oldFeet = oldY + PLAYER_HALF_HEIGHT;
    const newFeet = newY + PLAYER_HALF_HEIGHT;

    for (const platform of PLATFORMS) {
      const x = Number(currentPlayer.x);

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
}

// ---------------- MOVIMIENTO MANUAL ----------------

function movePlayer(direction) {
  if (
    !currentPlayer ||
    roomStatus !== "racing" ||
    currentPlayer.finished_at ||
    finishing ||
    busy
  ) return;

  if (direction === "right") {
    currentPlayer.x = Math.min(
      FINISH_X,
      Number(currentPlayer.x) + PLAYER_SPEED
    );
  }

  if (direction === "left") {
    currentPlayer.x = Math.max(
      PLAYER_START_X,
      Number(currentPlayer.x) - PLAYER_SPEED
    );
  }

  if (direction === "up") {
    jumpPlayer();
  }

  if (direction === "down") {
    currentPlayer.y = Math.min(
      GROUND_TOP - PLAYER_HALF_HEIGHT,
      Number(currentPlayer.y) + PLAYER_SPEED
    );
  }

  drawPirate(
    currentPlayer.role === "red" ? "pirateA" : "pirateB",
    currentPlayer
  );

  updateCamera();

  if (Number(currentPlayer.x) >= FINISH_X) {
    markFinished().catch(console.error);
  }
}

// ---------------- GUARDAR POSICIÓN ----------------

async function savePosition() {
  if (
    !currentPlayer ||
    roomStatus !== "racing" ||
    savingPosition ||
    currentPlayer.finished_at ||
    finishing
  ) return;

  savingPosition = true;

  const playerId = currentPlayer.id;
  const positionX = Number(currentPlayer.x);
  const positionY = Number(currentPlayer.y);

  try {
    const { data, error } = await supabaseClient
      .from("treasure_players")
      .update({
        x: positionX,
        y: positionY,
        updated_at: new Date().toISOString()
      })
      .eq("id", playerId)
      .select()
      .single();

    if (error) throw error;

    if (data && currentPlayer && currentPlayer.id === playerId) {
      currentPlayer = {
        ...currentPlayer,
        x: positionX,
        y: positionY
      };
    }

  } catch (error) {
    console.error("Error sincronizando posición:", error);
  } finally {
    savingPosition = false;
  }
}

// ---------------- BUCLE PRINCIPAL ----------------

function gameStep() {
  const now = performance.now();

  if (!lastFrameTime) {
    lastFrameTime = now;
    return;
  }

  lastFrameTime = now;

  if (roomStatus !== "racing" || !currentPlayer) return;

  // Movimiento continuo mientras se mantiene presionada una tecla.
  if (now - lastMovementTime >= MOVEMENT_INTERVAL) {
    if (pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD")) {
      movePlayer("right");
    } else if (
      pressedKeys.has("ArrowLeft") ||
      pressedKeys.has("KeyA")
    ) {
      movePlayer("left");
    }

    if (pressedKeys.has("ArrowDown") || pressedKeys.has("KeyS")) {
      movePlayer("down");
    }

    lastMovementTime = now;
  }

  // La física se mantiene activa durante el salto.
  physicsStep();

  // Sincronizar la posición con Supabase.
  if (now - lastSaveTime >= SAVE_INTERVAL) {
    lastSaveTime = now;
    savePosition();
  }
}

// ---------------- META Y GANADOR ----------------

async function markFinished() {
  if (
    !currentPlayer ||
    currentPlayer.finished_at ||
    finishing
  ) return;

  finishing = true;
  pressedKeys.clear();

  const playerId = currentPlayer.id;

  currentPlayer.x = FINISH_X;

  try {
    const { data, error } = await supabaseClient
      .from("treasure_players")
      .update({
        x: FINISH_X,
        finished_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", playerId)
      .is("finished_at", null)
      .select()
      .single();

    if (error) throw error;

    currentPlayer = data;

    const { data: winnerData, error: winnerError } =
      await supabaseClient.rpc("claim_race_winner", {
        p_room_code: roomCode,
        p_player_id: currentPlayer.id
      });

    if (winnerError) throw winnerError;

    roomData = {
      ...roomData,
      ...winnerData
    };

    roomStatus = "finished";
    verticalVelocity = 0;

    await loadRoom();

    setMessage("¡La carrera terminó!");

  } catch (error) {
    console.error("Error registrando llegada:", error);
    setMessage("No se pudo registrar la llegada: " + error.message);
    finishing = false;
  }
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

  pressedKeys.clear();
  await loadRoom();
}

// ---------------- PANTALLA FINAL ----------------

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
    subtitle = "Se terminaron los seis minutos de carrera.";
  } else if (currentPlayer && winnerId === currentPlayer.id) {
    heading = "WINNER!";
    subtitle = "¡Felicidades, " + winnerName + "! ¡Ganaste la carrera!";
  } else {
    heading = "PERDISTE";
    subtitle = winnerName + " llegó primero a la meta.";
  }

  overlay.hidden = false;
  overlay.replaceChildren();

  const card = document.createElement("div");
  card.className = "winner-card";

  const title = document.createElement("h1");
  title.textContent = heading;

  const paragraph = document.createElement("p");
  paragraph.textContent = subtitle;

  const button = document.createElement("button");
  button.id = "playAgainButton";
  button.textContent = "JUGAR OTRA VEZ";
  button.addEventListener("click", restartGame);

  card.append(title, paragraph, button);
  overlay.appendChild(card);

  if ($("winnerMessage")) {
    $("winnerMessage").textContent = subtitle;
  }

  if ($("finalResult")) {
    $("finalResult").hidden = false;
  }
}

// ---------------- TESOROS ----------------

async function findTreasure() {
  if (
    !currentPlayer ||
    busy ||
    roomStatus !== "racing" ||
    currentPlayer.finished_at
  ) return;

  const nearby = TREASURES.find(treasure => {
    const alreadyClaimed = roomClaims.some(
      claim => Number(claim.treasure_id) === treasure.id
    );

    return !alreadyClaimed &&
      Math.hypot(
        Number(currentPlayer.x) - treasure.x,
        Number(currentPlayer.y) - treasure.y
      ) < 70;
  });

  if (!nearby) {
    setMessage("No hay un cofre cerca.");
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
        score: Number(currentPlayer.score) + 1
      })
      .eq("id", currentPlayer.id)
      .select()
      .single();

    if (updateError) throw updateError;

    currentPlayer = data;

    await loadRoom();

    setMessage("¡Encontraste un tesoro!");

  } catch (error) {
    console.error(error);

    setMessage(
      error.code === "23505"
        ? "¡Ese cofre ya fue recogido!"
        : "Error al recoger el tesoro: " + error.message
    );

    await loadRoom().catch(console.error);

  } finally {
    busy = false;
  }
}

// ---------------- REINICIAR ----------------

async function restartGame() {
  if (!currentPlayer || busy) return;

  if (!confirm("¿Quieres reiniciar la carrera para los dos jugadores?")) {
    return;
  }

  busy = true;
  pressedKeys.clear();
  finishing = false;

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
    lastFrameTime = 0;
    lastSaveTime = 0;
    lastMovementTime = 0;

    await loadRoom();

    setMessage("¡Carrera reiniciada! Ambos deben estar listos.");

  } catch (error) {
    console.error(error);
    setMessage("Error al reiniciar: " + error.message);
  } finally {
    busy = false;
  }
}

// ---------------- SALIR ----------------

async function leaveGame() {
  if (!currentPlayer || busy) return;

  if (!confirm("¿Seguro que quieres abandonar la isla?")) return;

  busy = true;
  pressedKeys.clear();

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

    if ($("playerInfo")) {
      $("playerInfo").textContent = "Has salido de la isla.";
    }

    setStatus("Has salido de la isla");
    setMessage("Has abandonado la partida.");

  } catch (error) {
    console.error(error);
    setMessage("No se pudo abandonar: " + error.message);
  } finally {
    busy = false;
  }
}

// ---------------- CONTROLES ----------------

function setupControls() {
  if ($("joinButton")) {
    $("joinButton").addEventListener("click", joinIsland);
  }

  if ($("readyButton")) {
    $("readyButton").addEventListener("click", markReady);
  }

  if ($("findTreasureButton")) {
    $("findTreasureButton").addEventListener("click", findTreasure);
  }

  if ($("restartButton")) {
    $("restartButton").addEventListener("click", restartGame);
  }

  if ($("leaveButton")) {
    $("leaveButton").addEventListener("click", leaveGame);
  }

  // Botones manuales: un movimiento por cada pulsación.
  document.querySelectorAll("[data-move]").forEach(button => {
    button.addEventListener("click", () => {
      movePlayer(button.dataset.move);
    });
  });

  // Teclado: flechas y WASD.
  document.addEventListener("keydown", event => {
    if (
      ["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement?.tagName
      )
    ) {
      return;
    }

    const validKeys = [
      "ArrowRight",
      "ArrowLeft",
      "ArrowUp",
      "ArrowDown",
      "KeyD",
      "KeyA",
      "KeyW",
      "KeyS",
      "Space"
    ];

    if (!validKeys.includes(event.code)) return;

    event.preventDefault();

    // Evita saltos repetidos mientras se mantiene pulsada la tecla.
    if (
      (event.code === "ArrowUp" ||
       event.code === "KeyW" ||
       event.code === "Space") &&
      !event.repeat
    ) {
      jumpPlayer();
      return;
    }

    pressedKeys.add(event.code);
  });

  document.addEventListener("keyup", event => {
    pressedKeys.delete(event.code);
  });

  // Evita que una tecla quede activada al cambiar de ventana.
  window.addEventListener("blur", () => {
    pressedKeys.clear();
  });
}

// ---------------- INICIO ----------------

function initGame() {
  prepareWorld();
  setupControls();

  if ($("readyButton")) {
    $("readyButton").disabled = true;
  }

  if ($("finalResult")) {
    $("finalResult").hidden = true;
  }

  setStatus("Listo para comenzar");

  startTimer();

  if (gameLoop) {
    clearInterval(gameLoop);
  }

  gameLoop = setInterval(gameStep, 40);

  window.addEventListener("resize", updateCamera);
}

initGame();
