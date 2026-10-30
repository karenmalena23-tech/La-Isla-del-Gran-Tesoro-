
// ============================================
// TREASURE ISLAND - AVENTURA PIRATA
// CAMARA INDIVIDUAL PARA CADA JUGADOR
// LABORATORIO 4
// ============================================

const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = id => document.getElementById(id);

// ============================================
// CONFIGURACIÓN DEL MUNDO
// ============================================

const GAME_DURATION = 360;

const WORLD_WIDTH = 2600;
const PLAYER_START_X = 140;
const PLAYER_START_Y = 300;
const FINISH_X = 2440;

const MOVE_X = 35;
const MOVE_Y = 30;

const TREASURES = [
  { id: 1, x: 350, y: 300 },
  { id: 2, x: 820, y: 250 },
  { id: 3, x: 1250, y: 300 },
  { id: 4, x: 1740, y: 210 },
  { id: 5, x: 2180, y: 300 }
];

const OBSTACLES = [
  { x: 580, y: 300, icon: "🪨" },
  { x: 960, y: 300, icon: "🌳" },
  { x: 1430, y: 300, icon: "🪵" },
  { x: 1900, y: 300, icon: "🪨" }
];

// ============================================
// VARIABLES
// ============================================

let currentPlayer = null;
let roomCode = "";
let roomPlayers = [];
let roomClaims = [];
let roomStatus = "waiting";
let startedAt = null;
let channel = null;
let busy = false;
let timerInterval = null;
let advancingRoom = false;

// ============================================
// MENSAJES
// ============================================

function setMessage(message) {
  $("gameMessage").textContent = message;
}

function setStatus(message, connected = false) {
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

// ============================================
// CÁMARA INDIVIDUAL
// ============================================

function updateCamera() {
  if (!currentPlayer) return;

  const island = $("island");
  const world = $("world");

  if (!island || !world) return;

  const screenWidth = island.clientWidth;

  // La cámara intenta mantener al capitán
  // cerca del centro de la pantalla.
  let cameraX =
    Number(currentPlayer.x) - screenWidth * 0.42;

  // No permite salir de los límites del mundo.
  cameraX = Math.max(
    0,
    Math.min(
      WORLD_WIDTH - screenWidth,
      cameraX
    )
  );

  world.style.transform =
    `translate3d(${-cameraX}px, 0, 0)`;
}

// ============================================
// TIEMPO
// ============================================

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

  if (roomStatus === "waiting") {
    timer.textContent = "06:00";
    countdown.hidden = true;
    return;
  }

  if (roomStatus === "countdown") {
    const seconds = remainingTime();

    countdown.hidden = false;
    countdown.textContent = String(seconds);
    timer.textContent = "06:00";

    if (seconds <= 0) {
      countdown.hidden = true;
      advanceRoomState();
    }

    return;
  }

  countdown.hidden = true;

  const remaining = remainingTime();

  timer.textContent =
    String(Math.floor(remaining / 60))
      .padStart(2, "0") +
    ":" +
    String(remaining % 60).padStart(2, "0");

  if (remaining <= 0 && roomStatus === "racing") {
    finishRace();
  }
}

function startTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
  }

  updateTimer();

  timerInterval = setInterval(updateTimer, 1000);
}

// ============================================
// SALA DE SUPABASE
// ============================================

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
  if (!roomCode) return;

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

  if (currentPlayer) {
    const updatedPlayer = roomPlayers.find(
      player => player.id === currentPlayer.id
    );

    if (updatedPlayer) {
      currentPlayer = updatedPlayer;
    }
  }

  if (roomResult.data) {
    roomStatus = roomResult.data.status;
    startedAt = roomResult.data.started_at;
  }

  render();
  updateTimer();

  await advanceRoomState();
}

async function advanceRoomState() {
  if (
    advancingRoom ||
    !roomCode ||
    !startedAt ||
    roomStatus !== "countdown"
  ) {
    return;
  }

  if (Date.now() < new Date(startedAt).getTime()) {
    return;
  }

  advancingRoom = true;

  try {
    const { error } = await supabaseClient
      .from("treasure_rooms")
      .update({ status: "racing" })
      .eq("room_code", roomCode)
      .eq("status", "countdown");

    if (error) throw error;

    roomStatus = "racing";

    render();
    updateTimer();

    setMessage("¡La aventura comienza! ¡A buscar tesoros!");

  } catch (error) {
    console.error("Error iniciando carrera:", error);
  } finally {
    advancingRoom = false;
  }
}

// ============================================
// DIBUJAR JUGADORES Y ESCENARIO
// ============================================

function render() {
  const red = getPlayer("red");
  const blue = getPlayer("blue");

  $("nameA").textContent =
    red?.player_name || "Pirata Rojo";

  $("nameB").textContent =
    blue?.player_name || "Pirata Azul";

  $("scoreA").textContent = red?.score ?? 0;
  $("scoreB").textContent = blue?.score ?? 0;

  drawPirate("pirateA", red);
  drawPirate("pirateB", blue);

  drawObstacles();
  drawTreasures();

  renderWaitingRoom();
  renderActivity();
  renderFinalResult();

  updateCamera();
}

function drawPirate(elementId, player) {
  const pirate = $(elementId);

  if (!player) {
    pirate.style.display = "none";
    return;
  }

  pirate.style.display = "grid";

  pirate.style.left = Number(player.x) + "px";
  pirate.style.top = Number(player.y) + "px";
}

function drawObstacles() {
  $("obstacleArea").innerHTML = OBSTACLES.map(
    obstacle => `
      <span class="obstacle"
        style="left:${obstacle.x}px;top:${obstacle.y}px">
        ${obstacle.icon}
      </span>
    `
  ).join("");
}

function drawTreasures() {
  const claimed = new Set(
    roomClaims.map(claim => Number(claim.treasure_id))
  );

  $("treasureArea").innerHTML = TREASURES
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
  activity.innerHTML = "";

  if (!roomClaims.length) {
    const li = document.createElement("li");
    li.textContent = "¡Los tesoros esperan a los capitanes!";
    activity.appendChild(li);
    return;
  }

  roomClaims.slice(0, 12).forEach(claim => {
    const li = document.createElement("li");

    li.textContent =
      claim.player_name + " encontró un tesoro.";

    activity.appendChild(li);
  });
}

// ============================================
// SALA DE ESPERA
// ============================================

function renderWaitingRoom() {
  const red = getPlayer("red");
  const blue = getPlayer("blue");

  $("readyA").textContent =
    red?.is_ready ? "✓ ¡Listo!" : "Esperando...";

  $("readyB").textContent =
    blue?.is_ready ? "✓ ¡Listo!" : "Esperando...";

  $("readyA").className =
    red?.is_ready ? "ready" : "waiting";

  $("readyB").className =
    blue?.is_ready ? "ready" : "waiting";

  const readyButton = $("readyButton");

  readyButton.disabled =
    !currentPlayer ||
    Boolean(currentPlayer?.is_ready) ||
    roomStatus !== "waiting";

  readyButton.textContent =
    currentPlayer?.is_ready
      ? "✓ Ya estás listo"
      : "¡Estoy listo!";

  if (roomStatus === "waiting") {
    if (!red || !blue) {
      $("readyMessage").textContent =
        "Esperando a los dos capitanes.";
    } else {
      $("readyMessage").textContent =
        "Cuando los dos estén listos, comenzará la aventura.";
    }
  } else if (roomStatus === "countdown") {
    $("readyMessage").textContent =
      "¡Prepárense! La aventura está por comenzar.";
  } else if (roomStatus === "racing") {
    $("readyMessage").textContent =
      "¡La aventura está en marcha!";
  } else {
    $("readyMessage").textContent =
      "La partida ha terminado.";
  }
}

async function markReady() {
  if (!currentPlayer || busy) return;

  busy = true;
  $("readyButton").disabled = true;

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

// ============================================
// ENTRAR A LA ISLA
// ============================================

async function joinIsland() {
  if (busy) return;

  const playerName = $("playerName").value
    .trim()
    .slice(0, 20);

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
        // Convierte las posiciones antiguas de porcentaje
        // a las nuevas posiciones en píxeles.
        const oldPosition = Number(data.x) <= 100;

        const { data: updated, error: updateError } =
          await supabaseClient
            .from("treasure_players")
            .update({
              player_name: playerName,
              ...(oldPosition ? {
                x: PLAYER_START_X,
                y: PLAYER_START_Y,
                score: 0,
                finished_at: null
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

    $("playerInfo").textContent =
      "Estás jugando como Pirata " +
      (currentPlayer.role === "red" ? "Rojo" : "Azul");

    subscribeToRoom();

    setStatus("Conectado · " + roomCode, true);

    setMessage("¡Bienvenido! Prepárate para explorar la selva.");

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

// ============================================
// SINCRONIZACIÓN EN TIEMPO REAL
// ============================================

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

// ============================================
// OBSTÁCULOS Y MOVIMIENTO
// ============================================

function hitsObstacle(x, y) {
  return OBSTACLES.some(obstacle =>
    Math.hypot(
      x - obstacle.x,
      y - obstacle.y
    ) < 48
  );
}

async function movePlayer(direction) {
  if (!currentPlayer || busy) {
    if (!currentPlayer) {
      setMessage("Primero entra a la isla.");
    }
    return;
  }

  if (roomStatus !== "racing") {
    setMessage("Espera a que comience la aventura.");
    return;
  }

  if (currentPlayer.finished_at) {
    setMessage("¡Ya llegaste a la meta!");
    return;
  }

  if (remainingTime() <= 0) {
    setMessage("¡Se acabó el tiempo!");
    return;
  }

  const movements = {
    up: [0, -MOVE_Y],
    down: [0, MOVE_Y],
    left: [-MOVE_X, 0],
    right: [MOVE_X, 0]
  };

  const delta = movements[direction];
  if (!delta) return;

  const x = Math.max(
    35,
    Math.min(
      FINISH_X,
      Number(currentPlayer.x) + delta[0]
    )
  );

  const y = Math.max(
    105,
    Math.min(
      315,
      Number(currentPlayer.y) + delta[1]
    )
  );

  if (hitsObstacle(x, y)) {
    setMessage("¡Cuidado! Hay un obstáculo en el camino.");
    return;
  }

  busy = true;

  try {
    const { data, error } = await supabaseClient
      .from("treasure_players")
      .update({
        x,
        y,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentPlayer.id)
      .select()
      .single();

    if (error) throw error;

    currentPlayer = data;

    render();
    updateCamera();

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

// ============================================
// LLEGADA A LA META
// ============================================

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

  if (error) throw error;

  currentPlayer = data;

  await loadRoom();

  setMessage("🏁 ¡Llegaste a la meta! Espera el resultado.");
}

// ============================================
// RECOGER TESOROS
// ============================================

async function findTreasure() {
  if (!currentPlayer || busy) {
    if (!currentPlayer) {
      setMessage("Primero entra a la isla.");
    }
    return;
  }

  if (roomStatus !== "racing") {
    setMessage("Espera a que comience la aventura.");
    return;
  }

  if (currentPlayer.finished_at) {
    setMessage("¡Ya llegaste a la meta!");
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
    ) < 65
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

    setMessage("🎉 ¡Encontraste un tesoro! Ganaste un punto.");

  } catch (error) {
    console.error(error);

    setMessage(
      error.code === "23505"
        ? "¡Ese cofre acaba de ser recogido por el otro capitán!"
        : "No se pudo guardar el tesoro: " + error.message
    );

    await loadRoom().catch(console.error);

  } finally {
    busy = false;
  }
}

// ============================================
// FINALIZAR PARTIDA
// ============================================

async function finishRace() {
  if (roomStatus === "finished" || !roomCode) return;

  const { error } = await supabaseClient
    .from("treasure_rooms")
    .update({ status: "finished" })
    .eq("room_code", roomCode)
    .eq("status", "racing");

  if (error) {
    console.error(error);
    return;
  }

  roomStatus = "finished";

  await loadRoom();

  setMessage("¡La aventura terminó! Aquí está el resultado.");
}

function renderFinalResult() {
  const result = $("finalResult");

  if (roomStatus !== "finished") {
    result.hidden = true;
    return;
  }

  result.hidden = false;

  const red = getPlayer("red");
  const blue = getPlayer("blue");

  const redScore = Number(red?.score || 0);
  const blueScore = Number(blue?.score || 0);

  let message;

  if (redScore > blueScore) {
    message =
      "🏆 ¡Ganó " + (red?.player_name || "el Pirata Rojo") +
      "! Puntuación: " + redScore + " a " + blueScore + ".";
  } else if (blueScore > redScore) {
    message =
      "🏆 ¡Ganó " + (blue?.player_name || "el Pirata Azul") +
      "! Puntuación: " + blueScore + " a " + redScore + ".";
  } else {
    message =
      "🤝 ¡Empate! Los dos capitanes consiguieron " +
      redScore + " tesoros.";
  }

  $("winnerMessage").textContent = message;
}

// ============================================
// REINICIAR PARTIDA
// ============================================

async function restartGame() {
  if (!currentPlayer || busy) {
    setMessage("Primero entra a la isla.");
    return;
  }

  if (!confirm("¿Quieres reiniciar la aventura para los dos capitanes?")) {
    return;
  }

  busy = true;

  try {
    const { error: claimsError } = await supabaseClient
      .from("treasure_claims")
      .delete()
      .eq("room_code", roomCode);

    if (claimsError) throw claimsError;

    for (const role of ["red", "blue"]) {
      const { error } = await supabaseClient
        .from("treasure_players")
        .update({
          score: 0,
          x: PLAYER_START_X,
          y: PLAYER_START_Y,
          is_ready: false,
          finished_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("room_code", roomCode)
        .eq("role", role);

      if (error) throw error;
    }

    const { error: roomError } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: new Date().toISOString()
      })
      .eq("room_code", roomCode);

    if (roomError) throw roomError;

    await loadRoom();

    setMessage("¡Aventura reiniciada! Los dos deben estar listos.");

  } catch (error) {
    console.error(error);
    setMessage("Error al reiniciar: " + error.message);
  } finally {
    busy = false;
  }
}

// ============================================
// ABANDONAR PARTIDA
// ============================================

async function leaveGame() {
  if (!currentPlayer || busy) {
    setMessage("No estás dentro de una partida.");
    return;
  }

  if (!confirm("¿Seguro que quieres abandonar la isla?")) {
    return;
  }

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

    const { error: resetError } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: new Date().toISOString()
      })
      .eq("room_code", roomCode);

    if (resetError) throw resetError;

    const { error: readyError } = await supabaseClient
      .from("treasure_players")
      .update({ is_ready: false })
      .eq("room_code", roomCode);

    if (readyError) throw readyError;

    await loadRoom();

    $("playerInfo").textContent = "Has salido de la isla.";

    if (channel) {
      await supabaseClient.removeChannel(channel);
      channel = null;
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

// ============================================
// BOTONES Y TECLADO
// ============================================

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
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
    D: "right"
  };

  if (
    ["INPUT", "TEXTAREA"].includes(
      document.activeElement.tagName
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

// ============================================
// AJUSTAR CÁMARA AL CAMBIAR TAMAÑO
// ============================================

window.addEventListener("resize", updateCamera);

// ============================================
// INICIO
// ============================================

$("readyButton").disabled = true;
$("finalResult").hidden = true;

setStatus("Listo para comenzar");
startTimer();
