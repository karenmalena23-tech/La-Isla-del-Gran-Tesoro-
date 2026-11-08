
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const WORLD_WIDTH = 4200;
const PLAYER_START_X = 140;
const PLAYER_START_Y = 296;
const FINISH_X = 4050;
const GROUND_TOP = 338;
const PLAYER_SPEED = 5;
const GRAVITY = 0.65;
const JUMP_FORCE = -13;
const GAME_DURATION = 300;
const SAVE_INTERVAL = 150;

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

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentPlayer = null;
let roomPlayers = [];
let roomData = null;
let roomCode = "";
let roomStatus = "waiting";
let channel = null;

let busy = false;
let savingPosition = false;
let finishing = false;
let endingByTime = false;
let savingMatch = false;

let velocityY = 0;
let grounded = false;
let pressedKeys = new Set();

let gameLoop = null;
let timerInterval = null;
let lastFrameTime = 0;
let lastSaveTime = 0;
let lastHistoryRaceKey = "";

// --------------------------------------------------
// MENSAJES Y UTILIDADES
// --------------------------------------------------

function setMessage(message) {
  $("gameMessage").textContent = message;
}

function setStatus(message) {
  $("connectionStatus").textContent = message;
}

function setAuthMessage(message) {
  $("authStatus").textContent = message;
}

function storageKey(code) {
  return `treasure_player_${code}`;
}

function formatDate(value) {
  return new Date(value).toLocaleString();
}

// --------------------------------------------------
// CUENTAS: REGISTRO, INICIO Y CIERRE DE SESIÓN
// --------------------------------------------------

async function updateAuthUI() {
  const loggedIn = Boolean(currentUser);

  $("loggedInArea").hidden = !loggedIn;
  $("emailInput").disabled = loggedIn;
  $("passwordInput").disabled = loggedIn;
  $("signUpButton").hidden = loggedIn;
  $("loginButton").hidden = loggedIn;

  $("accountEmail").textContent = currentUser?.email || "";

  if (loggedIn) {
    setAuthMessage("Sesión iniciada. Ya puedes entrar a la isla.");
    await loadWinHistory();
    await loadMatchHistory();
  } else {
    setAuthMessage("Inicia sesión para entrar a la isla.");
    $("totalWins").textContent = "0";
    $("historyList").innerHTML =
      "<li>Inicia sesión para consultar tu historial.</li>";
    $("matchHistoryList").innerHTML =
      "<li>Inicia sesión para consultar las carreras.</li>";
  }
}

async function signUp() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    setAuthMessage("Escribe tu correo y una contraseña.");
    return;
  }

  if (password.length < 6) {
    setAuthMessage("La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  $("signUpButton").disabled = true;
  setAuthMessage("Creando tu cuenta...");

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });

    if (error) throw error;

    if (data.session) {
      currentUser = data.user;
      await updateAuthUI();
      setAuthMessage("¡Cuenta creada! Ya puedes entrar a la isla.");
    } else {
      setAuthMessage(
        "Cuenta creada. Revisa tu correo, confirma la cuenta y luego inicia sesión."
      );
    }
  } catch (error) {
    setAuthMessage("No se pudo crear la cuenta: " + error.message);
  } finally {
    $("signUpButton").disabled = false;
  }
}

async function signIn() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    setAuthMessage("Escribe tu correo y contraseña.");
    return;
  }

  $("loginButton").disabled = true;
  setAuthMessage("Iniciando sesión...");

  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    await updateAuthUI();
    setAuthMessage("¡Bienvenido de nuevo!");
  } catch (error) {
    setAuthMessage("No se pudo iniciar sesión: " + error.message);
  } finally {
    $("loginButton").disabled = false;
  }
}

async function signOut() {
  try {
    if (currentPlayer) {
      await leaveGame(false);
    }

    const { error } = await supabaseClient.auth.signOut();
    if (error) throw error;

    currentUser = null;
    currentPlayer = null;

    await updateAuthUI();
    setMessage("Has cerrado sesión.");
    setStatus("Sesión cerrada");
  } catch (error) {
    setAuthMessage("No se pudo cerrar sesión: " + error.message);
  }
}

async function initializeAuth() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;

  currentUser = data.session?.user || null;
  await updateAuthUI();

  // Evita ejecutar consultas dentro del callback de Auth.
  supabaseClient.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;
      await updateAuthUI();
    }, 0);
  });
}

// --------------------------------------------------
// HISTORIAL PERSONAL DE VICTORIAS
// --------------------------------------------------

async function loadWinHistory() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("treasure_wins")
    .select("id, room_code, player_name, won_at")
    .eq("user_id", currentUser.id)
    .order("won_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Error cargando victorias:", error);
    $("historyList").innerHTML =
      "<li>No se pudo cargar el historial personal.</li>";
    return;
  }

  $("totalWins").textContent = data.length;
  $("historyList").innerHTML = "";

  if (!data.length) {
    $("historyList").innerHTML =
      "<li>Aún no tienes victorias guardadas.</li>";
    return;
  }

  data.forEach((win) => {
    const li = document.createElement("li");
    li.textContent =
      `🏆 ${win.player_name} — Isla: ${win.room_code} — ${formatDate(win.won_at)}`;
    $("historyList").appendChild(li);
  });
}

// --------------------------------------------------
// HISTORIAL COMPARTIDO DE CARRERAS
// --------------------------------------------------

async function loadMatchHistory() {
  if (!currentUser) return;

  const { data, error } = await supabaseClient
    .from("treasure_match_history")
    .select(
      "room_code, red_player_name, blue_player_name, winner_name, winner_role, finished_at"
    )
    .or(
      `red_user_id.eq.${currentUser.id},blue_user_id.eq.${currentUser.id}`
    )
    .order("finished_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("Error cargando carreras:", error);
    $("matchHistoryList").innerHTML =
      "<li>No se pudo cargar el historial compartido.</li>";
    return;
  }

  $("matchHistoryList").innerHTML = "";

  if (!data.length) {
    $("matchHistoryList").innerHTML =
      "<li>Todavía no hay carreras guardadas.</li>";
    return;
  }

  data.forEach((match) => {
    const li = document.createElement("li");
    li.textContent =
      `🏆 Ganó ${match.winner_name} ` +
      `(${match.winner_role === "red" ? "Rojo" : "Azul"}). ` +
      `Participantes: ${match.red_player_name} y ${match.blue_player_name}. ` +
      `Isla: ${match.room_code}. ${formatDate(match.finished_at)}`;

    $("matchHistoryList").appendChild(li);
  });
}

async function saveMatchResult() {
  if (!currentUser || !currentPlayer || !roomData || savingMatch) return;

  const winnerId = roomData.winner_player_id;
  if (!winnerId || winnerId !== currentPlayer.id) return;

  const red = roomPlayers.find((p) => p.role === "red");
  const blue = roomPlayers.find((p) => p.role === "blue");

  if (!red || !blue || !red.user_id || !blue.user_id) {
    console.warn("No se pudo guardar: faltan datos de los dos jugadores.");
    return;
  }

  const raceStart = roomData.started_at;
  if (!raceStart) return;

  const raceKey = `${roomCode}_${raceStart}`;
  if (lastHistoryRaceKey === raceKey) return;

  savingMatch = true;

  try {
    const { error: matchError } = await supabaseClient
      .from("treasure_match_history")
      .insert({
        room_code: roomCode,
        race_started_at: raceStart,
        red_player_name: red.player_name,
        blue_player_name: blue.player_name,
        red_user_id: red.user_id,
        blue_user_id: blue.user_id,
        winner_player_id: winnerId,
        winner_user_id: currentUser.id,
        winner_name: roomData.winner_name || currentPlayer.player_name,
        winner_role: currentPlayer.role
      });

    if (matchError && matchError.code !== "23505") {
      throw matchError;
    }

    const { error: personalError } = await supabaseClient
      .from("treasure_wins")
      .insert({
        user_id: currentUser.id,
        room_code: roomCode,
        player_name: currentPlayer.player_name
      });

    if (personalError) {
      console.error("Error guardando victoria personal:", personalError);
    }

    lastHistoryRaceKey = raceKey;

    await loadWinHistory();
    await loadMatchHistory();
  } catch (error) {
    console.error("Error guardando el resultado:", error);
  } finally {
    savingMatch = false;
  }
}

// --------------------------------------------------
// SALAS Y JUGADORES
// --------------------------------------------------

async function ensureRoom(code) {
  const { data, error } = await supabaseClient
    .from("treasure_rooms")
    .select("*")
    .eq("room_code", code)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: insertError } = await supabaseClient
    .from("treasure_rooms")
    .insert({
      room_code: code,
      status: "waiting",
      started_at: null,
      winner_player_id: null,
      winner_name: null,
      winner_role: null
    })
    .select()
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      const retry = await supabaseClient
        .from("treasure_rooms")
        .select("*")
        .eq("room_code", code)
        .single();

      if (retry.error) throw retry.error;
      return retry.data;
    }

    throw insertError;
  }

  return created;
}

async function loadRoom() {
  if (!roomCode) return;

  const [playersResult, roomResult] = await Promise.all([
    supabaseClient
      .from("treasure_players")
      .select("*")
      .eq("room_code", roomCode)
      .order("role", { ascending: true }),

    supabaseClient
      .from("treasure_rooms")
      .select("*")
      .eq("room_code", roomCode)
      .maybeSingle()
  ]);

  if (playersResult.error) throw playersResult.error;
  if (roomResult.error) throw roomResult.error;

  roomPlayers = playersResult.data || [];
  roomData = roomResult.data;
  roomStatus = roomData?.status || "waiting";

  if (currentPlayer) {
    const updated = roomPlayers.find((p) => p.id === currentPlayer.id);
    if (updated) currentPlayer = updated;
  }

  renderWaitingRoom();
  renderPlayers();
  renderFinalResult();
  updateTimerDisplay();
}

function renderWaitingRoom() {
  const red = roomPlayers.find((p) => p.role === "red");
  const blue = roomPlayers.find((p) => p.role === "blue");

  $("readyA").textContent = red
    ? `${red.player_name} ${red.is_ready ? "✓ Listo" : "— Esperando"}`
    : "Esperando...";

  $("readyB").textContent = blue
    ? `${blue.player_name} ${blue.is_ready ? "✓ Listo" : "— Esperando"}`
    : "Esperando...";

  $("readyButton").disabled =
    !currentPlayer ||
    roomStatus !== "waiting" ||
    Boolean(currentPlayer.is_ready);

  if (roomStatus === "waiting") {
    $("readyMessage").textContent =
      roomPlayers.length < 2
        ? "Esperando al segundo capitán."
        : "Los dos jugadores deben marcar que están listos.";
  } else if (roomStatus === "countdown") {
    $("readyMessage").textContent = "¡Prepárense! La carrera está por comenzar.";
  } else if (roomStatus === "racing") {
    $("readyMessage").textContent = "¡La carrera está en marcha!";
  } else if (roomStatus === "finished") {
    $("readyMessage").textContent = "La partida ha terminado.";
  }

  $("waitingRoom").hidden = !currentPlayer;
}

function renderPlayers() {
  const red = roomPlayers.find((p) => p.role === "red");
  const blue = roomPlayers.find((p) => p.role === "blue");

  $("nameA").textContent = red?.player_name || "Pirata Rojo";
  $("nameB").textContent = blue?.player_name || "Pirata Azul";

  $("scoreA").textContent = red?.score ?? 0;
  $("scoreB").textContent = blue?.score ?? 0;

  drawPirate($("pirateA"), red);
  drawPirate($("pirateB"), blue);

  const list = $("activityList");
  list.innerHTML = "";

  if (!roomPlayers.length) {
    list.innerHTML = "<li>Esperando a los capitanes...</li>";
    return;
  }

  roomPlayers.forEach((player) => {
    const li = document.createElement("li");
    li.textContent =
      `${player.role === "red" ? "🔴" : "🔵"} ${player.player_name}: ` +
      (player.finished_at ? "Llegó a la meta" :
        player.is_ready ? "Listo" : "Esperando");
    list.appendChild(li);
  });
}

// --------------------------------------------------
// ENTRAR A LA ISLA
// --------------------------------------------------

async function joinIsland() {
  if (!currentUser) {
    $("playerInfo").textContent =
      "Primero crea una cuenta o inicia sesión.";
    return;
  }

  if (busy) return;

  busy = true;
  $("joinButton").disabled = true;

  try {
    const name = $("playerName").value.trim();
    const code = $("roomCode").value.trim().toLowerCase();

    if (!name || !code) {
      throw new Error("Escribe tu nombre y el código de la isla.");
    }

    if (name.length > 20 || code.length > 30) {
      throw new Error("El nombre o el código son demasiado largos.");
    }

    if (currentPlayer) {
      $("playerInfo").textContent = "Ya estás dentro de una isla.";
      return;
    }

    roomCode = code;
    await ensureRoom(roomCode);

    // Recupera al jugador de esta cuenta, incluso desde otro navegador.
    const { data: existing, error: existingError } = await supabaseClient
      .from("treasure_players")
      .select("*")
      .eq("room_code", roomCode)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      currentPlayer = existing;
      localStorage.setItem(storageKey(roomCode), existing.id);

      await loadRoom();
      subscribeToRoom();
      startGameLoop();
      startTimer();

      $("playerInfo").textContent =
        `Has vuelto a entrar como ${existing.player_name}.`;
      setStatus("Conectado a la isla");
      return;
    }

    const { data: existingPlayers, error: playersError } =
      await supabaseClient
        .from("treasure_players")
        .select("*")
        .eq("room_code", roomCode);

    if (playersError) throw playersError;

    const players = existingPlayers || [];

    if (players.length >= 2) {
      throw new Error("Esta isla ya tiene dos capitanes.");
    }

    const role = players.some((p) => p.role === "red") ? "blue" : "red";

    const newPlayer = {
      id: crypto.randomUUID(),
      room_code: roomCode,
      player_name: name,
      role,
      x: PLAYER_START_X,
      y: PLAYER_START_Y,
      score: 0,
      is_ready: false,
      finished_at: null,
      user_id: currentUser.id
    };

    const { data, error: insertError } = await supabaseClient
      .from("treasure_players")
      .insert(newPlayer)
      .select()
      .single();

    if (insertError) throw insertError;

    currentPlayer = data;
    localStorage.setItem(storageKey(roomCode), data.id);

    await loadRoom();
    subscribeToRoom();
    startGameLoop();
    startTimer();

    $("playerInfo").textContent =
      `¡Entraste como Capitán ${role === "red" ? "Rojo" : "Azul"}!`;

    setMessage("¡Bienvenido a la isla, " + name + "!");
    setStatus("Conectado a la isla");

  } catch (error) {
    $("playerInfo").textContent = error.message;
    console.error(error);
  } finally {
    busy = false;
    $("joinButton").disabled = false;
  }
}

// --------------------------------------------------
// ABANDONAR LA ISLA
// --------------------------------------------------

async function leaveGame(showMessage = true) {
  if (!currentPlayer) return;

  const playerId = currentPlayer.id;
  const code = roomCode;

  try {
    if (channel) {
      await supabaseClient.removeChannel(channel);
      channel = null;
    }

    const { error: deleteError } = await supabaseClient
      .from("treasure_players")
      .delete()
      .eq("id", playerId)
      .eq("user_id", currentUser.id);

    if (deleteError) throw deleteError;

    // Si alguien abandona, la sala vuelve a esperar.
    await supabaseClient
      .from("treasure_players")
      .update({ is_ready: false })
      .eq("room_code", code);

    await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: null,
        winner_player_id: null,
        winner_name: null,
        winner_role: null
      })
      .eq("room_code", code);

    currentPlayer = null;
    roomPlayers = [];
    roomData = null;
    roomStatus = "waiting";

    localStorage.removeItem(storageKey(code));

    if (gameLoop) cancelAnimationFrame(gameLoop);
    if (timerInterval) clearInterval(timerInterval);

    $("waitingRoom").hidden = true;
    $("finalResult").hidden = true;

    if (showMessage) {
      setMessage("Has abandonado la isla.");
      $("playerInfo").textContent = "Puedes entrar de nuevo cuando quieras.";
    }

    setStatus("Fuera de la isla");
  } catch (error) {
    console.error(error);
    if (showMessage) {
      setMessage("No se pudo abandonar la isla: " + error.message);
    }
    throw error;
  }
}

// --------------------------------------------------
// JUGADORES LISTOS Y CUENTA REGRESIVA
// --------------------------------------------------

async function markReady() {
  if (!currentPlayer || roomStatus !== "waiting") return;

  $("readyButton").disabled = true;

  try {
    const { error } = await supabaseClient
      .from("treasure_players")
      .update({ is_ready: true })
      .eq("id", currentPlayer.id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await loadRoom();

    if (
      roomPlayers.length === 2 &&
      roomPlayers.every((player) => player.is_ready)
    ) {
      const startTime = new Date(Date.now() + 5000).toISOString();

      const { error: roomError } = await supabaseClient
        .from("treasure_rooms")
        .update({
          status: "countdown",
          started_at: startTime,
          winner_player_id: null,
          winner_name: null,
          winner_role: null
        })
        .eq("room_code", roomCode)
        .eq("status", "waiting");

      if (roomError) throw roomError;

      await loadRoom();
      setMessage("¡La carrera comienza en 5 segundos!");
    }
  } catch (error) {
    $("readyButton").disabled = false;
    setMessage("No se pudo marcar como listo: " + error.message);
  }
}

async function advanceRoomState() {
  if (!roomData || roomStatus !== "countdown" || !roomData.started_at) {
    return;
  }

  const start = new Date(roomData.started_at).getTime();

  if (Date.now() >= start) {
    const actualStart = new Date().toISOString();

    const { error } = await supabaseClient
      .from("treasure_rooms")
      .update({
        status: "racing",
        started_at: actualStart
      })
      .eq("room_code", roomCode)
      .eq("status", "countdown")
      .eq("started_at", roomData.started_at);

    if (error) console.error(error);

    await loadRoom();
    setMessage("¡YA! ¡Corre hacia la meta!");
  }
}

// --------------------------------------------------
// MUNDO Y PERSONAJES
// --------------------------------------------------

function prepareWorld() {
  $("world").style.width = WORLD_WIDTH + "px";
  $("finishLine").style.left = FINISH_X + "px";

  const obstacleArea = $("obstacleArea");
  obstacleArea.innerHTML = "";

  OBSTACLES.forEach((obstacle) => {
    const item = document.createElement("div");
    item.textContent = obstacle.icon;
    item.style.position = "absolute";
    item.style.left = obstacle.x + "px";
    item.style.top = obstacle.y + "px";
    item.style.fontSize = "34px";
    obstacleArea.appendChild(item);
  });

  const treasureArea = $("treasureArea");
  treasureArea.innerHTML = "";

  PLATFORMS.forEach((platform) => {
    const item = document.createElement("div");
    item.className = "platform";
    item.style.position = "absolute";
    item.style.left = platform.x + "px";
    item.style.top = platform.top + "px";
    item.style.width = platform.width + "px";
    treasureArea.appendChild(item);
  });
}

function drawPirate(element, player) {
  if (!player) {
    element.style.display = "none";
    return;
  }

  element.style.display = "block";
  element.style.left = Number(player.x) + "px";
  element.style.top = Number(player.y) + "px";
}

function updateCamera() {
  if (!currentPlayer) return;

  const island = $("island");
  const x = Number(currentPlayer.x || 0);

  const cameraX = Math.max(
    0,
    Math.min(
      WORLD_WIDTH - island.clientWidth,
      x - island.clientWidth / 2
    )
  );

  $("world").style.transform = `translateX(${-cameraX}px)`;
}

function jump() {
  if (!currentPlayer || roomStatus !== "racing" || !grounded) return;

  velocityY = JUMP_FORCE;
  grounded = false;
}

function movePlayer(delta) {
  if (!currentPlayer || roomStatus !== "racing") return;
  if (currentPlayer.finished_at) return;

  const factor = Math.min(delta / 16.67, 2);

  let x = Number(currentPlayer.x);
  let y = Number(currentPlayer.y);

  if (pressedKeys.has("ArrowLeft") || pressedKeys.has("a")) {
    x -= PLAYER_SPEED * factor;
  }

  if (pressedKeys.has("ArrowRight") || pressedKeys.has("d")) {
    x += PLAYER_SPEED * factor;
  }

  x = Math.max(0, Math.min(WORLD_WIDTH - 45, x));

  const oldBottom = y + 42;

  velocityY += GRAVITY * factor;
  y += velocityY * factor;

  let landed = false;

  if (velocityY >= 0) {
    for (const platform of PLATFORMS) {
      const overlaps =
        x + 38 > platform.x &&
        x < platform.x + platform.width;

      const newBottom = y + 42;

      if (
        overlaps &&
        oldBottom <= platform.top &&
        newBottom >= platform.top
      ) {
        y = platform.top - 42;
        velocityY = 0;
        landed = true;
        break;
      }
    }
  }

  if (!landed && y + 42 >= GROUND_TOP) {
    y = GROUND_TOP - 42;
    velocityY = 0;
    landed = true;
  }

  grounded = landed;

  currentPlayer.x = x;
  currentPlayer.y = y;

  const element =
    currentPlayer.role === "red" ? $("pirateA") : $("pirateB");

  drawPirate(element, currentPlayer);
  updateCamera();

  if (x >= FINISH_X) {
    markFinished();
  }
}

async function savePosition() {
  if (
    !currentPlayer ||
    savingPosition ||
    roomStatus !== "racing"
  ) return;

  savingPosition = true;

  try {
    const { error } = await supabaseClient
      .from("treasure_players")
      .update({
        x: currentPlayer.x,
        y: currentPlayer.y
      })
      .eq("id", currentPlayer.id)
      .eq("user_id", currentUser.id);

    if (error) console.error("Error guardando posición:", error);
  } finally {
    savingPosition = false;
  }
}

function gameFrame(timestamp) {
  if (!lastFrameTime) lastFrameTime = timestamp;

  const delta = timestamp - lastFrameTime;
  lastFrameTime = timestamp;

  if (currentPlayer && roomStatus === "racing") {
    movePlayer(delta);

    if (timestamp - lastSaveTime > SAVE_INTERVAL) {
      lastSaveTime = timestamp;
      savePosition();
    }
  }

  gameLoop = requestAnimationFrame(gameFrame);
}

function startGameLoop() {
  if (gameLoop) cancelAnimationFrame(gameLoop);

  lastFrameTime = 0;
  gameLoop = requestAnimationFrame(gameFrame);
}

// --------------------------------------------------
// GANADOR Y RESULTADO PARA LOS DOS JUGADORES
// --------------------------------------------------

async function markFinished() {
  if (
    !currentPlayer ||
    finishing ||
    currentPlayer.finished_at ||
    roomStatus !== "racing"
  ) return;

  finishing = true;
  setMessage("¡Llegaste a la meta! Comprobando quién ganó...");

  try {
    const { error: playerError } = await supabaseClient
      .from("treasure_players")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", currentPlayer.id)
      .eq("user_id", currentUser.id);

    if (playerError) throw playerError;

    const { error: winnerError } = await supabaseClient.rpc(
      "claim_race_winner",
      {
        p_room_code: roomCode,
        p_player_id: currentPlayer.id
      }
    );

    if (winnerError) throw winnerError;

    await loadRoom();
    renderFinalResult();
    await saveMatchResult();

  } catch (error) {
    console.error(error);
    setMessage("Hubo un problema guardando el resultado: " + error.message);
  } finally {
    finishing = false;
  }
}

function renderFinalResult() {
  if (!roomData || roomStatus !== "finished") {
    $("finalResult").hidden = true;
    return;
  }

  $("finalResult").hidden = false;

  const winnerId = roomData.winner_player_id;

  if (!winnerId) {
    $("winnerMessage").textContent =
      "¡Se acabó el tiempo! La carrera terminó sin ganador.";
    setMessage("¡Se acabó el tiempo!");
    return;
  }

  const winner = roomPlayers.find((p) => p.id === winnerId);
  const winnerName =
    roomData.winner_name || winner?.player_name || "Un capitán";

  if (currentPlayer && winnerId === currentPlayer.id) {
    $("winnerMessage").textContent =
      "🎉 ¡GANASTE! Llegaste primero a la meta.";
    setMessage("¡GANASTE! Eres el gran capitán de la isla.");
  } else {
    $("winnerMessage").textContent =
      `¡PERDISTE! ${winnerName} llegó primero a la meta.`;
    setMessage(`¡PERDISTE! Ganó ${winnerName}.`);
  }
}

async function finishByTime() {
  if (endingByTime || roomStatus !== "racing") return;

  endingByTime = true;

  try {
    const { error } = await supabaseClient
      .from("treasure_rooms")
      .update({ status: "finished" })
      .eq("room_code", roomCode)
      .eq("status", "racing");

    if (error) throw error;

    await loadRoom();
    renderFinalResult();
  } catch (error) {
    console.error("Error al terminar por tiempo:", error);
  } finally {
    endingByTime = false;
  }
}

// --------------------------------------------------
// TEMPORIZADOR
// --------------------------------------------------

function updateTimerDisplay() {
  if (!roomData || !roomData.started_at) {
    $("timerDisplay").textContent = "05:00";
    $("countdownDisplay").hidden = true;
    return;
  }

  if (roomStatus === "countdown") {
    const seconds = Math.max(
      0,
      Math.ceil(
        (new Date(roomData.started_at).getTime() - Date.now()) / 1000
      )
    );

    $("countdownDisplay").hidden = seconds <= 0;
    $("countdownDisplay").textContent = seconds;
    return;
  }

  $("countdownDisplay").hidden = true;

  if (roomStatus !== "racing") return;

  const elapsed =
    (Date.now() - new Date(roomData.started_at).getTime()) / 1000;

  const remaining = Math.max(0, Math.ceil(GAME_DURATION - elapsed));

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  $("timerDisplay").textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (remaining <= 0) {
    finishByTime();
  }
}

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(async () => {
    if (!currentPlayer) return;

    if (roomStatus === "countdown") {
      await advanceRoomState();
    }

    updateTimerDisplay();
  }, 250);
}

// --------------------------------------------------
// ACTUALIZACIONES EN TIEMPO REAL
// --------------------------------------------------

function subscribeToRoom() {
  if (channel) {
    supabaseClient.removeChannel(channel);
    channel = null;
  }

  channel = supabaseClient
    .channel("treasure-room-" + roomCode)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "treasure_players",
        filter: `room_code=eq.${roomCode}`
      },
      async () => {
        try {
          await loadRoom();
        } catch (error) {
          console.error(error);
        }
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "treasure_rooms",
        filter: `room_code=eq.${roomCode}`
      },
      async () => {
        try {
          await loadRoom();
        } catch (error) {
          console.error(error);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setStatus("Conectado · Multijugador activo");
      }
    });
}

// --------------------------------------------------
// REINICIAR LA CARRERA
// --------------------------------------------------

async function restartGame() {
  if (!currentPlayer || !roomCode) return;

  const confirmed = confirm(
    "¿Quieres reiniciar la carrera para los dos jugadores?"
  );

  if (!confirmed) return;

  try {
    const { error: playersError } = await supabaseClient
      .from("treasure_players")
      .update({
        x: PLAYER_START_X,
        y: PLAYER_START_Y,
        score: 0,
        is_ready: false,
        finished_at: null
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

    velocityY = 0;
    grounded = false;
    lastHistoryRaceKey = "";

    await loadRoom();

    $("finalResult").hidden = true;
    $("countdownDisplay").hidden = true;
    $("timerDisplay").textContent = "05:00";

    setMessage(
      "Carrera reiniciada. Los dos jugadores deben volver a estar listos."
    );
  } catch (error) {
    setMessage("No se pudo reiniciar: " + error.message);
  }
}

// --------------------------------------------------
// CONTROLES
// --------------------------------------------------

function setupControls() {
  $("joinButton").addEventListener("click", joinIsland);
  $("readyButton").addEventListener("click", markReady);
  $("restartButton").addEventListener("click", restartGame);
  $("leaveButton").addEventListener("click", () => leaveGame(true));

  $("signUpButton").addEventListener("click", signUp);
  $("loginButton").addEventListener("click", signIn);
  $("logoutButton").addEventListener("click", signOut);

  document.querySelectorAll("[data-move]").forEach((button) => {
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      const direction = button.dataset.move;

      if (direction === "up") {
        jump();
      } else if (direction === "left") {
        pressedKeys.add("ArrowLeft");
      } else if (direction === "right") {
        pressedKeys.add("ArrowRight");
      }
    });

    const release = () => {
      pressedKeys.delete("ArrowLeft");
      pressedKeys.delete("ArrowRight");
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  });

  window.addEventListener("keydown", (event) => {
    const key =
      event.key.length === 1 ? event.key.toLowerCase() : event.key;

    if (
      ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)
    ) {
      event.preventDefault();
    }

    pressedKeys.add(key);

    if (event.key === "ArrowUp" || event.key === " ") {
      jump();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key =
      event.key.length === 1 ? event.key.toLowerCase() : event.key;

    pressedKeys.delete(key);
  });

  window.addEventListener("blur", () => {
    pressedKeys.clear();
  });
}

// --------------------------------------------------
// INICIO DEL PROGRAMA
// --------------------------------------------------

async function initGame() {
  prepareWorld();
  setupControls();
  startTimer();

  setStatus("Conectando con Supabase...");

  try {
    await initializeAuth();
    setStatus("Conectado a Supabase");
  } catch (error) {
    console.error(error);
    setStatus("No se pudo conectar");
    setAuthMessage("Error al iniciar: " + error.message);
  }

  renderPlayers();
}

document.addEventListener("DOMContentLoaded", initGame);
