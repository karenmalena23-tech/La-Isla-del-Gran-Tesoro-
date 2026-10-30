
// ==================================================
// LA ISLA DEL GRAN TESORO
// MULTIJUGADOR - SUPABASE
// CARRERA, SALTOS, CUENTA REGRESIVA Y CRONÓMETRO
// ==================================================

const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = id => document.getElementById(id);

// CONFIGURACIÓN
const WORLD_WIDTH = 4200;
const PLAYER_START_X = 140;
const PLAYER_START_Y = 314;
const FINISH_X = 4050;
const GROUND_TOP = 338;

const PLAYER_SPEED = 5;
const GRAVITY = 0.65;
const JUMP_FORCE = -13;

// El personaje usa coordenadas desde su centro.
const PLAYER_HALF_HEIGHT = 24;

const SAVE_INTERVAL = 150;
const GAME_DURATION = 300;

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

// ESTADO
let currentPlayer = null;
let roomPlayers = [];
let roomData = null;
let roomCode = "";
let roomStatus = "waiting";
let startedAt = null;

let channel = null;
let busy = false;
let loadingRoom = false;
let savingPosition = false;
let finishing = false;
let advancingRoom = false;

let verticalVelocity = 0;
let isGrounded = true;

let pressedKeys = new Set();

let lastMovementTime = 0;
let lastSaveTime = 0;

let gameLoop = null;
let gameTimeLeft = GAME_DURATION;

// UTILIDADES
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

// PREPARAR MUNDO
function prepareWorld() {
  const world = $("world");
  if (!world) return;

  world.style.width = WORLD_WIDTH + "px";

  const ground = world.querySelector(".ground");
  if (ground) ground.style.width = WORLD_WIDTH + "px";

  if ($("finishLine")) {
    $("finishLine").style.left = FINISH_X + "px";
  }

  if (!$("platformArea")) {
    const area = document.createElement("div");
    area.id = "platformArea";
    area.className = "platform-area";
    world.appendChild(area);
  }
}

// CÁMARA
function updateCamera() {
  if (!currentPlayer) return;

  const island = $("island");
  const world = $("world");

  if (!island || !world) return;

  const screenWidth = island.clientWidth;

  let cameraX = Number(currentPlayer.x) - screenWidth * 0.42;

  cameraX = Math.max(
    0,
    Math.min(WORLD_WIDTH - screenWidth, cameraX)
  );

  world.style.transform = `translate3d(${-cameraX}px,0,0)`;
}

// DIBUJAR
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

function drawPlatforms() {
  const area = $("platformArea");
  if (!area) return;

  area.innerHTML = PLATFORMS.map(platform => `
    <div class="game-platform"
      style="
        position:absolute;
        left:${platform.x}px;
        top:${platform.top}px;
        width:${platform.width}px;
      ">
    </div>
  `).join("");
}

function drawObstacles() {
  const area = $("obstacleArea");
  if (!area) return;

  area.innerHTML = OBSTACLES.map(obstacle => `
    <span class="obstacle"
      style="
        position:absolute;
        left:${obstacle.x}px;
        top:${obstacle.y}px;
      ">${obstacle.icon}</span>
  `).join("");
}

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

  drawPlatforms();
  drawObstacles();

  renderWaitingRoom();
  renderFinalResult();
  updateCamera();
}

// SALA DE ESPERA
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
      Boolean(currentPlayer.is_ready) ||
      roomStatus !== "waiting";

    $("readyButton").textContent =
      currentPlayer?.is_ready
        ? "✓ Ya estás listo"
        : "¡Estoy listo!";
  }

  if ($("readyMessage")) {
    if (roomStatus === "waiting") {
      $("readyMessage").textContent =
        "Los dos capitanes deben estar listos.";
    } else if (roomStatus === "countdown") {
      $("readyMessage").textContent =
        "¡Prepárense! La carrera está por comenzar.";
    } else if (roomStatus === "racing") {
      $("readyMessage").textContent =
        "¡La carrera está en marcha!";
    } else {
      $("readyMessage").textContent = "La carrera terminó.";
    }
  }
}

// CRONÓMETRO
function updateTimerDisplay(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if ($("timerDisplay")) {
    $("timerDisplay").textContent =
      `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  }
}

function updateCountdownDisplay() {
  if (!startedAt || !$("countdownDisplay")) return;

  const remaining = Math.max(
    0,
    Math.ceil(
      (new Date(startedAt).getTime() - Date.now()) / 1000
    )
  );

  $("countdownDisplay").textContent =
    remaining > 0 ? remaining : "¡YA!";
}

function updateGameTimer() {
  if (!startedAt || roomStatus !== "racing") return;

  const elapsed = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000
  );

  gameTimeLeft = Math.max(0, GAME_DURATION - elapsed);

  updateTimerDisplay(gameTimeLeft);

  if (gameTimeLeft <= 0) {
    finishByTime();
  }
}

// CARGAR SALA
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
    const [playersResult, roomResult] = await Promise.all([
      supabaseClient
        .from("treasure_players")
        .select("*")
        .eq("room_code", roomCode),

      supabaseClient
        .from("treasure_rooms")
        .select("*")
        .eq("room_code", roomCode)
        .maybeSingle()
    ]);

    if (playersResult.error) throw playersResult.error;
    if (roomResult.error) throw roomResult.error;

    const previousPlayer = currentPlayer;

    roomPlayers = playersResult.data || [];
    roomData = roomResult.data;

    if (previousPlayer) {
      const updated = roomPlayers.find(
        player => player.id === previousPlayer.id
      );

      if (updated) {
        currentPlayer = {
          ...updated,
          x: previousPlayer.x,
          y: previousPlayer.y
        };

        const index = roomPlayers.findIndex(
          player => player.id === previousPlayer.id
        );

        roomPlayers[index] = {
          ...updated,
          x: previousPlayer.x,
          y: previousPlayer.y
        };
      }
    }

    if (roomData) {
      roomStatus = roomData.status;
      startedAt = roomData.started_at;
    }

    render();

    if (roomStatus === "countdown") {
      advanceRoomState();
    }

    if (roomStatus === "racing") {
      updateGameTimer();
    }

  } finally {
    loadingRoom = false;
  }
}

// UNIRSE
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
  currentPlayer = null;

  if ($("joinButton")) $("joinButton").disabled = true;

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
        const { data: updated, error: updateError } =
          await supabaseClient
            .from("treasure_players")
            .update({
              player_name: playerName
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
    finishing = false;
    pressedKeys.clear();

    await loadRoom();
    subscribeToRoom();

    if ($("playerInfo")) {
      $("playerInfo").textContent =
        "Estás jugando como Pirata " +
        (currentPlayer.role === "red" ? "Rojo" : "Azul");
    }

    $("playerName").blur();
    $("roomCode").blur();

    setStatus("Conectado · " + roomCode, true);
    setMessage("¡Bienvenido! Espera al otro capitán.");

  } catch (error) {
    console.error(error);
    setMessage("Error al entrar: " + error.message);
    setStatus("Error de conexión");
  } finally {
    busy = false;
    if ($("joinButton")) $("joinButton").disabled = false;
    renderWaitingRoom();
  }
}

// MARCAR LISTO
async function markReady() {
  if (!currentPlayer || busy || roomStatus !== "waiting") return;

  busy = true;

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

    const { data: players, error: playersError } =
      await supabaseClient
        .from("treasure_players")
        .select("id,is_ready")
        .eq("room_code", roomCode);

    if (playersError) throw playersError;

    if (
      players.length === 2 &&
      players.every(player => player.is_ready)
    ) {
      const startTime =
        new Date(Date.now() + 5000).toISOString();

      const { error: roomError } = await supabaseClient
        .from("treasure_rooms")
        .update({
          status: "countdown",
          started_at: startTime
        })
        .eq("room_code", roomCode)
        .eq("status", "waiting");

      if (roomError) throw roomError;

      setMessage("¡Ambos están listos! ¡Prepárense!");
    } else {
      setMessage("¡Estás listo! Esperando al otro capitán.");
    }

    await loadRoom();

  } catch (error) {
    console.error(error);
    setMessage("Error al prepararse: " + error.message);
  } finally {
    busy = false;
    renderWaitingRoom();
  }
}

// INICIAR CARRERA
async function advanceRoomState() {
  if (
    advancingRoom ||
    roomStatus !== "countdown" ||
    !startedAt ||
    Date.now() < new Date(startedAt).getTime()
  ) return;

  advancingRoom = true;

  try {
    const { data, error } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "racing"
      })
      .eq("room_code", roomCode)
      .eq("status", "countdown")
      .select()
      .maybeSingle();

    if (error) throw error;

    if (data) {
      roomData = data;
      roomStatus = "racing";

      // Se conserva la hora de inicio de la carrera.
      startedAt = data.started_at;

      verticalVelocity = 0;
      isGrounded = true;
      pressedKeys.clear();

      gameTimeLeft = GAME_DURATION;
      updateTimerDisplay(GAME_DURATION);

      if ($("countdownDisplay")) {
        $("countdownDisplay").textContent = "";
      }

      setMessage("¡LA CARRERA COMENZÓ! ¡CORRAN!");
      render();
    } else {
      await loadRoom();
    }

  } catch (error) {
    console.error("Error iniciando carrera:", error);
  } finally {
    advancingRoom = false;
  }
}

// REALTIME
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

// SALTAR
function jumpPlayer() {
  if (
    !currentPlayer ||
    roomStatus !== "racing" ||
    !isGrounded ||
    currentPlayer.finished_at ||
    finishing
  ) return;

  verticalVelocity = JUMP_FORCE;
  isGrounded = false;
}

// FÍSICA Y PLATAFORMAS
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
  currentPlayer.y = newY;

  const index = roomPlayers.findIndex(
    player => player.id === currentPlayer.id
  );

  if (index !== -1) {
    roomPlayers[index].y = newY;
  }

  drawPirate(
    currentPlayer.role === "red" ? "pirateA" : "pirateB",
    currentPlayer
  );
}

// MOVER
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

  const index = roomPlayers.findIndex(
    player => player.id === currentPlayer.id
  );

  if (index !== -1) {
    roomPlayers[index].x = currentPlayer.x;
    roomPlayers[index].y = currentPlayer.y;
  }

  drawPirate(
    currentPlayer.role === "red" ? "pirateA" : "pirateB",
    currentPlayer
  );

  updateCamera();

  if (Number(currentPlayer.x) >= FINISH_X) {
    markFinished();
  }
}

// GUARDAR POSICIÓN
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
  const x = Number(currentPlayer.x);
  const y = Number(currentPlayer.y);

  try {
    const { error } = await supabaseClient
      .from("treasure_players")
      .update({
        x,
        y,
        updated_at: new Date().toISOString()
      })
      .eq("id", playerId);

    if (error) throw error;

  } catch (error) {
    console.error("Error guardando posición:", error);
  } finally {
    savingPosition = false;
  }
}

// BUCLE PRINCIPAL
function gameStep() {
  if (roomStatus === "countdown") {
    updateCountdownDisplay();
    advanceRoomState();
    return;
  }

  if (!currentPlayer || roomStatus !== "racing") return;

  const now = performance.now();

  if (now - lastMovementTime >= 40) {
    if (pressedKeys.has("ArrowRight") || pressedKeys.has("KeyD")) {
      movePlayer("right");
    }

    if (pressedKeys.has("ArrowLeft") || pressedKeys.has("KeyA")) {
      movePlayer("left");
    }

    if (pressedKeys.has("ArrowDown") || pressedKeys.has("KeyS")) {
      movePlayer("down");
    }

    lastMovementTime = now;
  }

  physicsStep();

  if (now - lastSaveTime >= SAVE_INTERVAL) {
    lastSaveTime = now;
    savePosition();
  }

  updateGameTimer();
}

// LLEGADA A LA META
async function markFinished() {
  if (!currentPlayer || currentPlayer.finished_at || finishing) return;

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
        p_player_id: playerId
      });

    if (winnerError) throw winnerError;

    if (winnerData) {
      roomData = {
        ...roomData,
        ...(Array.isArray(winnerData) ? winnerData[0] : winnerData)
      };
    }

    await loadRoom();
    setMessage("¡La carrera terminó!");

  } catch (error) {
    console.error(error);
    setMessage("Error registrando la llegada: " + error.message);
    finishing = false;
  }
}

// SE ACABÓ EL TIEMPO
async function finishByTime() {
  if (roomStatus !== "racing" || finishing) return;

  finishing = true;
  pressedKeys.clear();

  try {
    const { data, error } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "finished"
      })
      .eq("room_code", roomCode)
      .eq("status", "racing")
      .select()
      .maybeSingle();

    if (error) throw error;

    if (data) {
      roomData = data;
      roomStatus = "finished";
    }

    await loadRoom();
    setMessage("¡Se acabó el tiempo!");

  } catch (error) {
    console.error(error);
    finishing = false;
    setMessage("Error al terminar la partida: " + error.message);
  }
}

// RESULTADO FINAL
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
    return;
  }

  const winnerId = roomData?.winner_player_id;
  const winnerName = roomData?.winner_name;

  let heading;
  let subtitle;

  if (!winnerId) {
    heading = "¡TIEMPO TERMINADO!";
    subtitle = "La carrera terminó sin que nadie llegara a la meta.";
  } else if (currentPlayer && winnerId === currentPlayer.id) {
    heading = "¡GANASTE!";
    subtitle = "¡Felicidades, " + winnerName + "!";
  } else {
    heading = "¡PERDISTE!";
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

// REINICIAR
async function restartGame() {
  if (!currentPlayer || busy) return;

  if (!confirm("¿Reiniciar la carrera para los dos jugadores?")) return;

  busy = true;
  pressedKeys.clear();
  finishing = false;

  try {
    const { error: playersError } = await supabaseClient
      .from("treasure_players")
      .update({
        x: PLAYER_START_X,
        y: PLAYER_START_Y,
        score: 0,
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
        started_at: null,
        winner_player_id: null,
        winner_name: null,
        winner_role: null
      })
      .eq("room_code", roomCode);

    if (roomError) throw roomError;

    verticalVelocity = 0;
    isGrounded = true;
    gameTimeLeft = GAME_DURATION;
    updateTimerDisplay(GAME_DURATION);

    if ($("countdownDisplay")) {
      $("countdownDisplay").textContent = "";
    }

    await loadRoom();

    setMessage("Partida reiniciada. ¡Ambos deben estar listos!");

  } catch (error) {
    console.error(error);
    setMessage("Error reiniciando: " + error.message);
  } finally {
    busy = false;
  }
}

// SALIR
async function leaveGame() {
  if (!currentPlayer || busy) return;

  if (!confirm("¿Seguro que quieres salir de la isla?")) return;

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

    if (channel) {
      await supabaseClient.removeChannel(channel);
      channel = null;
    }

    await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: null,
        winner_player_id: null,
        winner_name: null,
        winner_role: null
      })
      .eq("room_code", roomCode);

    await loadRoom();

    setStatus("Has salido de la isla");
    setMessage("Has abandonado la partida.");

  } catch (error) {
    console.error(error);
    setMessage("Error al salir: " + error.message);
  } finally {
    busy = false;
  }
}

// CONTROLES
function setupControls() {
  $("joinButton")?.addEventListener("click", joinIsland);
  $("readyButton")?.addEventListener("click", markReady);
  $("restartButton")?.addEventListener("click", restartGame);
  $("leaveButton")?.addEventListener("click", leaveGame);

  if ($("findTreasureButton")) {
    $("findTreasureButton").hidden = true;
  }

  // Botones de movimiento para móvil.
  document.querySelectorAll("[data-move]").forEach(button => {
    const direction = button.dataset.move;

    const keyMap = {
      right: "ArrowRight",
      left: "ArrowLeft",
      up: "ArrowUp",
      down: "ArrowDown"
    };

    const key = keyMap[direction];

    button.addEventListener("pointerdown", event => {
      event.preventDefault();

      if (direction === "up") {
        jumpPlayer();
      } else {
        pressedKeys.add(key);
        movePlayer(direction);
      }

      button.setPointerCapture?.(event.pointerId);
    });

    const release = () => {
      pressedKeys.delete(key);
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  // TECLADO
  document.addEventListener("keydown", event => {
    const tag = document.activeElement?.tagName;

    if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;

    const valid = [
      "ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown",
      "KeyD", "KeyA", "KeyW", "KeyS", "Space"
    ];

    if (!valid.includes(event.code)) return;

    event.preventDefault();

    if (
      ["ArrowUp", "KeyW", "Space"].includes(event.code)
    ) {
      if (!event.repeat) jumpPlayer();
      return;
    }

    pressedKeys.add(event.code);
  });

  document.addEventListener("keyup", event => {
    pressedKeys.delete(event.code);
  });

  window.addEventListener("blur", () => {
    pressedKeys.clear();
  });
}

// INICIO
function initGame() {
  prepareWorld();
  setupControls();

  if ($("readyButton")) {
    $("readyButton").disabled = true;
  }

  if ($("finalResult")) {
    $("finalResult").hidden = true;
  }

  updateTimerDisplay(GAME_DURATION);
  setStatus("Listo para comenzar");

  if (gameLoop) clearInterval(gameLoop);

  gameLoop = setInterval(gameStep, 40);

  window.addEventListener("resize", updateCamera);
}

initGame();
