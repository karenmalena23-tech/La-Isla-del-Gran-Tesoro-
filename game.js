
// ============================================
// TREASURE ISLAND - CARRERA DEL GRAN TESORO
// LABORATORIO 4
// ============================================

const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

const GAME_DURATION = 360;
const COUNTDOWN_DURATION = 5;

const TREASURES = [
  { id: 1, x: 18, y: 25 },
  { id: 2, x: 48, y: 18 },
  { id: 3, x: 76, y: 30 },
  { id: 4, x: 35, y: 72 },
  { id: 5, x: 72, y: 76 }
];

const OBSTACLES = [
  { x: 25, y: 45 },
  { x: 55, y: 55 },
  { x: 82, y: 65 },
  { x: 40, y: 35 }
];

let currentPlayer = null;
let roomCode = "";
let roomPlayers = [];
let roomClaims = [];
let roomStatus = "waiting";
let startedAt = null;
let channel = null;
let busy = false;
let timerInterval = null;
let finishingPlayer = false;
let advancingRoom = false;

// ============================================
// MENSAJES Y ESTADO
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
  return roomPlayers.find(p => p.role === role);
}

// ============================================
// TIEMPO
// ============================================

function remainingTime() {
  if (!startedAt || roomStatus === "waiting") {
    return GAME_DURATION;
  }

  const difference = Math.ceil(
    (new Date(startedAt).getTime() - Date.now()) / 1000
  );

  if (roomStatus === "countdown") {
    return Math.max(0, difference);
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
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  timer.textContent =
    String(minutes).padStart(2, "0") + ":" +
    String(seconds).padStart(2, "0");

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
// SALA Y DATOS COMPARTIDOS
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

  if (roomResult.data) {
    roomStatus = roomResult.data.status;
    startedAt = roomResult.data.started_at;
  }

  render();
  updateTimer();

  await advanceRoomState();
}

async function advanceRoomState() {
  if (advancingRoom || !roomCode || !startedAt) return;

  advancingRoom = true;

  try {
    const now = Date.now();
    const start = new Date(startedAt).getTime();

    if (
      roomStatus === "countdown" &&
      now >= start
    ) {
      const { error } = await supabaseClient
        .from("treasure_rooms")
        .update({ status: "racing" })
        .eq("room_code", roomCode)
        .eq("status", "countdown");

      if (error) throw error;

      roomStatus = "racing";
      setMessage("¡La carrera ha comenzado! ¡A por los tesoros!");
      render();
    }

    if (
      roomStatus === "racing" &&
      now >= start + GAME_DURATION * 1000
    ) {
      await finishRace();
    }
  } catch (error) {
    console.error("Error actualizando la carrera:", error);
  } finally {
    advancingRoom = false;
  }
}

// ============================================
// DIBUJAR EL JUEGO
// ============================================

function render() {
  const red = getPlayer("red");
  const blue = getPlayer("blue");

  $("nameA").textContent = red?.player_name || "Pirata Rojo";
  $("nameB").textContent = blue?.player_name || "Pirata Azul";

  $("scoreA").textContent = red?.score ?? 0;
  $("scoreB").textContent = blue?.score ?? 0;

  $("pirateA").style.display = red ? "grid" : "none";
  $("pirateB").style.display = blue ? "grid" : "none";

  if (red) {
    $("pirateA").style.left = red.x + "%";
    $("pirateA").style.top = red.y + "%";
  }

  if (blue) {
    $("pirateB").style.left = blue.x + "%";
    $("pirateB").style.top = blue.y + "%";
  }

  // Cofres que todavía no han sido recogidos
  const claimed = new Set(
    roomClaims.map(c => Number(c.treasure_id))
  );

  $("treasureArea").innerHTML = TREASURES
    .filter(t => !claimed.has(t.id))
    .map(t =>
      `<span class="treasure" style="left:${t.x}%;top:${t.y}%">🧰</span>`
    ).join("");

  // Actividad
  const activity = $("activityList");
  activity.innerHTML = "";

  if (!roomClaims.length) {
    const li = document.createElement("li");
    li.textContent = "¡Los tesoros esperan a los capitanes!";
    activity.appendChild(li);
  } else {
    roomClaims.slice(0, 12).forEach(claim => {
      const li = document.createElement("li");
      li.textContent =
        claim.player_name + " encontró un tesoro.";
      activity.appendChild(li);
    });
  }

  renderWaitingRoom();
  renderFinalResult();
}

// ============================================
// SALA DE ESPERA
// ============================================

function renderWaitingRoom() {
  const red = getPlayer("red");
  const blue = getPlayer("blue");

  const readyA = $("readyA");
  const readyB = $("readyB");
  const readyButton = $("readyButton");

  readyA.textContent = red?.is_ready ? "✓ ¡Listo!" : "Esperando...";
  readyB.textContent = blue?.is_ready ? "✓ ¡Listo!" : "Esperando...";

  readyA.className = red?.is_ready ? "ready" : "waiting";
  readyB.className = blue?.is_ready ? "ready" : "waiting";

  const joined = Boolean(currentPlayer);
  const alreadyReady = Boolean(currentPlayer?.is_ready);

  readyButton.disabled =
    !joined ||
    alreadyReady ||
    roomStatus !== "waiting";

  readyButton.textContent = alreadyReady
    ? "✓ Ya estás listo"
    : "¡Estoy listo!";

  if (roomStatus === "waiting") {
    if (!red || !blue) {
      $("readyMessage").textContent =
        "Esperando a que entren los dos capitanes.";
    } else if (red.is_ready && blue.is_ready) {
      $("readyMessage").textContent =
        "¡Los dos están listos! Preparando la carrera...";
    } else {
      $("readyMessage").textContent =
        "Cuando los dos estén listos, comenzará la cuenta regresiva.";
    }
  } else if (roomStatus === "countdown") {
    $("readyMessage").textContent =
      "¡Prepárense! La carrera está por comenzar.";
  } else if (roomStatus === "racing") {
    $("readyMessage").textContent =
      "¡La carrera está en marcha!";
  } else {
    $("readyMessage").textContent =
      "La carrera ha terminado.";
  }
}

async function markReady() {
  if (!currentPlayer || busy) return;

  if (roomStatus !== "waiting") {
    setMessage("La carrera ya está en marcha o ha terminado.");
    return;
  }

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

    currentPlayer.is_ready = true;

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
        const { data: updated, error: updateError } =
          await supabaseClient
            .from("treasure_players")
            .update({
              player_name: playerName,
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
        (existing || []).map(p => p.role)
      );

      const role = !taken.has("red")
        ? "red"
        : (!taken.has("blue") ? "blue" : null);

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
          x: role === "red" ? 8 : 8,
          y: role === "red" ? 25 : 75,
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

    setMessage("¡Bienvenido! Prepárate en la sala de espera.");

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
// MOVIMIENTO Y OBSTÁCULOS
// ============================================

function hitsObstacle(x, y) {
  return OBSTACLES.some(obstacle =>
    Math.hypot(x - obstacle.x, y - obstacle.y) < 11
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
    setMessage("Espera a que comience la carrera.");
    return;
  }

  if (remainingTime() <= 0) {
    setMessage("¡Se acabó el tiempo!");
    return;
  }

  if (currentPlayer.finished_at) {
    setMessage("¡Ya llegaste a la meta!");
    return;
  }

  const steps = {
    up: [0, -6],
    down: [0, 6],
    left: [-6, 0],
    right: [6, 0]
  };

  const delta = steps[direction];
  if (!delta) return;

  const x = Math.max(
    5,
    Math.min(94, Number(currentPlayer.x) + delta[0])
  );

  const y = Math.max(
    8,
    Math.min(92, Number(currentPlayer.y) + delta[1])
  );

  if (hitsObstacle(x, y)) {
    setMessage("¡Cuidado! Hay un obstáculo en ese camino.");
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

    // Llegada a la meta
    if (x >= 88) {
      await markFinished();
      return;
    }

    await loadRoom();

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
      x: 90,
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

  setMessage("🏁 ¡Has llegado a la meta! Espera el resultado final.");
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

  if (roomStatus !== "racing" || remainingTime() <= 0) {
    setMessage("Espera a que comience la carrera.");
    return;
  }

  if (currentPlayer.finished_at) {
    setMessage("¡Ya llegaste a la meta!");
    return;
  }

  const available = TREASURES.filter(t =>
    !roomClaims.some(c => Number(c.treasure_id) === t.id)
  );

  const nearby = available.find(t =>
    Math.hypot(
      Number(currentPlayer.x) - t.x,
      Number(currentPlayer.y) - t.y
    ) < 17
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
// FINALIZAR CARRERA
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

  setMessage("¡La carrera terminó! Aquí está el resultado final.");
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

  const redFinished = red?.finished_at
    ? "Sí llegó a la meta"
    : "No llegó a la meta";

  const blueFinished = blue?.finished_at
    ? "Sí llegó a la meta"
    : "No llegó a la meta";

  $("winnerMessage").textContent =
    message + " " + redFinished + ". " + blueFinished + ".";
}

// ============================================
// REINICIAR LA PARTIDA
// ============================================

async function restartGame() {
  if (!currentPlayer || busy) {
    setMessage("Primero entra a la isla.");
    return;
  }

  if (!confirm("¿Volver a preparar la sala para los dos capitanes?")) {
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
        x: 8,
        y: 25,
        is_ready: false,
        finished_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("room_code", roomCode)
      .eq("role", "red");

    if (playersError) throw playersError;

    const { error: blueError } = await supabaseClient
      .from("treasure_players")
      .update({
        score: 0,
        x: 8,
        y: 75,
        is_ready: false,
        finished_at: null,
        updated_at: new Date().toISOString()
      })
      .eq("room_code", roomCode)
      .eq("role", "blue");

    if (blueError) throw blueError;

    const { error: roomError } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: new Date().toISOString()
      })
      .eq("room_code", roomCode);

    if (roomError) throw roomError;

    currentPlayer.is_ready = false;
    currentPlayer.finished_at = null;
    currentPlayer.score = 0;

    await loadRoom();

    setMessage("¡Sala reiniciada! Los dos deben marcar que están listos.");

  } catch (error) {
    console.error(error);
    setMessage("Error al reiniciar: " + error.message);
  } finally {
    busy = false;
    renderWaitingRoom();
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

    // Si alguien abandona, la sala vuelve a esperar
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

    setMessage("Has abandonado la partida.");

    if (channel) {
      await supabaseClient.removeChannel(channel);
      channel = null;
    }

    setStatus("Has salido de la isla");

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
// INICIO
// ============================================

$("readyButton").disabled = true;
$("finalResult").hidden = true;

setStatus("Listo para comenzar");
startTimer();
