
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const WORLD_WIDTH = 4200;
const FINISH_X = 4050;
const GROUND_TOP = 328;
const PLAYER_HEIGHT = 46;
const SPEED = 5;
const GRAVITY = 0.65;
const JUMP_FORCE = -13;
const GAME_SECONDS = 300;

const PLATFORMS = [
  { x: 430, top: 245, width: 180 },
  { x: 1050, top: 200, width: 190 },
  { x: 1720, top: 255, width: 220 },
  { x: 2250, top: 225, width: 190 },
  { x: 2750, top: 190, width: 200 },
  { x: 3300, top: 245, width: 210 },
  { x: 3750, top: 210, width: 190 }
];

const OBSTACLES = [
  { x: 700, y: 300, icon: "🪨" },
  { x: 1350, y: 300, icon: "🪵" },
  { x: 2050, y: 300, icon: "🌳" },
  { x: 2600, y: 300, icon: "🪨" },
  { x: 3150, y: 300, icon: "🪵" },
  { x: 3650, y: 300, icon: "🌳" }
];

const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentPlayer = null;
let players = [];
let room = null;
let roomCode = "";
let channel = null;

let keys = new Set();
let velocityY = 0;
let grounded = false;
let loopId = null;
let timerId = null;
let lastFrame = 0;
let lastPositionSave = 0;
let busy = false;
let finishing = false;
let savingResult = false;
let lastSavedRace = "";

// --------------------------------------------------
// MENSAJES
// --------------------------------------------------

function message(text) {
  $("gameMessage").textContent = text;
}

function playerMessage(text) {
  $("playerInfo").textContent = text;
}

function status(text) {
  $("connectionStatus").textContent = text;
}

function authMessage(text) {
  $("authStatus").textContent = text;
}

function getRoleName(role) {
  return role === "red" ? "Pirata Rojo 🔴" : "Pirata Azul 🔵";
}

function getStartPosition(role) {
  return role === "red" ? 140 : 200;
}

// --------------------------------------------------
// AUTENTICACIÓN
// --------------------------------------------------

async function refreshAuthUI() {
  const logged = Boolean(currentUser);

  $("loggedInArea").hidden = !logged;
  $("emailInput").disabled = logged;
  $("passwordInput").disabled = logged;
  $("signUpButton").hidden = logged;
  $("loginButton").hidden = logged;

  $("accountEmail").textContent = currentUser?.email || "";

  if (logged) {
    authMessage("Sesión iniciada correctamente.");
    await loadWinHistory();
    await loadMatchHistory();
  } else {
    authMessage("Inicia sesión para jugar.");
    $("totalWins").textContent = "0";
    $("historyList").innerHTML = "<li>Inicia sesión para ver tus victorias.</li>";
    $("matchHistoryList").innerHTML = "<li>Inicia sesión para ver las carreras.</li>";
  }
}

async function register() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    authMessage("Escribe tu correo y contraseña.");
    return;
  }

  if (password.length < 6) {
    authMessage("La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  $("signUpButton").disabled = true;

  try {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
      currentUser = data.user;
      await refreshAuthUI();
      authMessage("¡Cuenta creada correctamente!");
    } else {
      authMessage("Cuenta creada. Revisa tu correo para confirmar el registro.");
    }
  } catch (error) {
    authMessage("Error al crear la cuenta: " + error.message);
  } finally {
    $("signUpButton").disabled = false;
  }
}

async function login() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    authMessage("Escribe tu correo y contraseña.");
    return;
  }

  $("loginButton").disabled = true;

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    await refreshAuthUI();
    authMessage("¡Bienvenido!");
  } catch (error) {
    authMessage("Error al iniciar sesión: " + error.message);
  } finally {
    $("loginButton").disabled = false;
  }
}

async function logout() {
  try {
    if (currentPlayer) await leaveIsland(false);

    const { error } = await db.auth.signOut();
    if (error) throw error;

    currentUser = null;
    currentPlayer = null;
    await refreshAuthUI();
    status("Sesión cerrada");
  } catch (error) {
    authMessage("No se pudo cerrar sesión: " + error.message);
  }
}

async function initAuth() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;

  currentUser = data.session?.user || null;
  await refreshAuthUI();

  db.auth.onAuthStateChange((_event, session) => {
    setTimeout(async () => {
      currentUser = session?.user || null;
      await refreshAuthUI();
    }, 0);
  });
}

// --------------------------------------------------
// HISTORIAL PERSONAL
// --------------------------------------------------

async function loadWinHistory() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("treasure_wins")
    .select("id, room_code, player_name, won_at")
    .eq("user_id", currentUser.id)
    .order("won_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error(error);
    $("historyList").innerHTML = "<li>No se pudo cargar el historial.</li>";
    return;
  }

  $("totalWins").textContent = data.length;
  $("historyList").innerHTML = "";

  if (!data.length) {
    $("historyList").innerHTML = "<li>Aún no tienes victorias.</li>";
    return;
  }

  data.forEach((win) => {
    const li = document.createElement("li");
    li.textContent =
      `🏆 ${win.player_name} — Isla ${win.room_code} — ` +
      new Date(win.won_at).toLocaleString();
    $("historyList").appendChild(li);
  });
}

// --------------------------------------------------
// HISTORIAL COMPARTIDO
// --------------------------------------------------

async function loadMatchHistory() {
  if (!currentUser) return;

  const { data, error } = await db
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
    console.error(error);
    $("matchHistoryList").innerHTML =
      "<li>No se pudo cargar el historial compartido.</li>";
    return;
  }

  $("matchHistoryList").innerHTML = "";

  if (!data.length) {
    $("matchHistoryList").innerHTML =
      "<li>Aún no hay carreras registradas.</li>";
    return;
  }

  data.forEach((match) => {
    const li = document.createElement("li");
    li.textContent =
      `🏆 Ganó ${match.winner_name} (${match.winner_role}). ` +
      `Participaron ${match.red_player_name} y ${match.blue_player_name}. ` +
      `Isla: ${match.room_code}.`;
    $("matchHistoryList").appendChild(li);
  });
}

async function saveMatchResult() {
  if (!currentUser || !currentPlayer || !room || savingResult) return;
  if (room.winner_player_id !== currentPlayer.id) return;

  const red = players.find((p) => p.role === "red");
  const blue = players.find((p) => p.role === "blue");

  if (!red || !blue || !red.user_id || !blue.user_id || !room.started_at) {
    console.error("Faltan datos de los dos jugadores para guardar la carrera.");
    return;
  }

  const raceKey = `${roomCode}_${room.started_at}`;
  if (lastSavedRace === raceKey) return;

  savingResult = true;

  try {
    const { error } = await db
      .from("treasure_match_history")
      .insert({
        room_code: roomCode,
        race_started_at: room.started_at,
        red_player_name: red.player_name,
        blue_player_name: blue.player_name,
        red_user_id: red.user_id,
        blue_user_id: blue.user_id,
        winner_player_id: currentPlayer.id,
        winner_user_id: currentUser.id,
        winner_name: currentPlayer.player_name,
        winner_role: currentPlayer.role
      });

    if (error && error.code !== "23505") throw error;

    const { error: winError } = await db
      .from("treasure_wins")
      .insert({
        user_id: currentUser.id,
        room_code: roomCode,
        player_name: currentPlayer.player_name
      });

    if (winError) console.error("Error guardando victoria personal:", winError);

    lastSavedRace = raceKey;
    await loadWinHistory();
    await loadMatchHistory();
  } catch (error) {
    console.error("Error guardando resultado:", error);
  } finally {
    savingResult = false;
  }
}

// --------------------------------------------------
// SALA
// --------------------------------------------------

async function ensureRoom(code) {
  const { data, error } = await db
    .from("treasure_rooms")
    .select("*")
    .eq("room_code", code)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const { data: created, error: insertError } = await db
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
      const retry = await db
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
    db.from("treasure_players")
      .select("*")
      .eq("room_code", roomCode)
      .order("role"),

    db.from("treasure_rooms")
      .select("*")
      .eq("room_code", roomCode)
      .maybeSingle()
  ]);

  if (playersResult.error) throw playersResult.error;
  if (roomResult.error) throw roomResult.error;

  players = playersResult.data || [];
  room = roomResult.data;

  if (currentPlayer) {
    currentPlayer = players.find((p) => p.id === currentPlayer.id) || currentPlayer;
  }

  drawPlayers();
  drawWaitingRoom();
  drawResult();
  updateTimer();
}

function drawPlayers() {
  const red = players.find((p) => p.role === "red");
  const blue = players.find((p) => p.role === "blue");

  $("nameA").textContent = red?.player_name || "Pirata Rojo";
  $("nameB").textContent = blue?.player_name || "Pirata Azul";
  $("scoreA").textContent = red?.score ?? 0;
  $("scoreB").textContent = blue?.score ?? 0;

  drawPirate($("pirateA"), red);
  drawPirate($("pirateB"), blue);

  const list = $("activityList");
  list.innerHTML = "";

  if (!players.length) {
    list.innerHTML = "<li>Esperando a los jugadores...</li>";
    return;
  }

  players.forEach((p) => {
    const li = document.createElement("li");
    li.textContent =
      `${p.role === "red" ? "🔴" : "🔵"} ${p.player_name}: ` +
      (p.finished_at ? "Llegó a la meta" :
        p.is_ready ? "Está listo" : "Esperando");
    list.appendChild(li);
  });
}

function drawWaitingRoom() {
  const red = players.find((p) => p.role === "red");
  const blue = players.find((p) => p.role === "blue");

  $("readyA").textContent = red
    ? `${red.player_name} — ${red.is_ready ? "✓ Listo" : "Esperando"}`
    : "Esperando jugador rojo...";

  $("readyB").textContent = blue
    ? `${blue.player_name} — ${blue.is_ready ? "✓ Listo" : "Esperando"}`
    : "Esperando jugador azul...";

  $("readyA").className = red?.is_ready ? "ready" : "waiting";
  $("readyB").className = blue?.is_ready ? "ready" : "waiting";

  $("waitingRoom").hidden = !currentPlayer;

  $("readyButton").disabled =
    !currentPlayer ||
    room?.status !== "waiting" ||
    Boolean(currentPlayer.is_ready);

  if (!room) return;

  if (room.status === "waiting") {
    $("readyMessage").textContent = players.length < 2
      ? "Esperando al segundo jugador..."
      : "Los dos jugadores deben pulsar ¡Estoy listo!";
  } else if (room.status === "countdown") {
    $("readyMessage").textContent = "¡Prepárense! La carrera va a comenzar.";
  } else if (room.status === "racing") {
    $("readyMessage").textContent = "¡La carrera está en marcha!";
  } else if (room.status === "finished") {
    $("readyMessage").textContent = "La carrera terminó.";
  }
}

// --------------------------------------------------
// PIRATAS Y ESCENARIO
// --------------------------------------------------

function drawPirate(element, player) {
  if (!player) {
    element.style.display = "none";
    return;
  }

  element.style.display = "grid";
  element.style.left = `${Number(player.x)}px`;
  element.style.top = `${Number(player.y)}px`;
}

function buildWorld() {
  $("world").style.width = WORLD_WIDTH + "px";

  const finish = $("finishLine");
  finish.style.left = FINISH_X + "px";

  const obstacleArea = $("obstacleArea");
  obstacleArea.innerHTML = "";

  OBSTACLES.forEach((item) => {
    const obstacle = document.createElement("div");
    obstacle.className = "obstacle";
    obstacle.textContent = item.icon;
    obstacle.style.left = `${item.x}px`;
    obstacle.style.top = `${item.y}px`;
    obstacleArea.appendChild(obstacle);
  });

  const treasureArea = $("treasureArea");
  treasureArea.innerHTML = "";

  PLATFORMS.forEach((item) => {
    const platform = document.createElement("div");
    platform.className = "platform";
    platform.style.left = `${item.x}px`;
    platform.style.top = `${item.top}px`;
    platform.style.width = `${item.width}px`;
    treasureArea.appendChild(platform);
  });
}

function updateCamera() {
  if (!currentPlayer) return;

  const viewportWidth = $("island").clientWidth;
  const camera = Math.max(
    0,
    Math.min(
      WORLD_WIDTH - viewportWidth,
      Number(currentPlayer.x) - viewportWidth / 2
    )
  );

  $("world").style.transform = `translateX(${-camera}px)`;
}

// --------------------------------------------------
// ENTRAR A LA ISLA Y ASIGNAR COLOR
// --------------------------------------------------

async function joinIsland() {
  if (!currentUser) {
    playerMessage("Primero inicia sesión.");
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
      playerMessage("Ya estás dentro de una isla.");
      return;
    }

    roomCode = code;
    await ensureRoom(roomCode);

    const { data: existing, error: existingError } = await db
      .from("treasure_players")
      .select("*")
      .eq("room_code", roomCode)
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      currentPlayer = existing;
      playerMessage(`Volviste a entrar como ${getRoleName(existing.role)}.`);
      await loadRoom();
      connectRealtime();
      startLoop();
      startTimer();
      status("Conectado a la isla");
      return;
    }

    const { data: roomPlayers, error: roomPlayersError } = await db
      .from("treasure_players")
      .select("*")
      .eq("room_code", roomCode);

    if (roomPlayersError) throw roomPlayersError;

    const occupied = roomPlayers || [];

    if (occupied.length >= 2) {
      throw new Error("La isla ya tiene dos jugadores.");
    }

    if (room.status !== "waiting") {
      throw new Error("La partida ya comenzó. Reinicia la isla para entrar.");
    }

    const role = occupied.some((p) => p.role === "red") ? "blue" : "red";

    const player = {
      id: crypto.randomUUID(),
      room_code: roomCode,
      player_name: name,
      role,
      x: getStartPosition(role),
      y: GROUND_TOP - PLAYER_HEIGHT / 2,
      score: 0,
      is_ready: false,
      finished_at: null,
      user_id: currentUser.id
    };

    const { data, error } = await db
      .from("treasure_players")
      .insert(player)
      .select()
      .single();

    if (error) throw error;

    currentPlayer = data;

    playerMessage(`¡Eres ${getRoleName(role)}! Tu pirata ya está en la isla.`);
    message(`Bienvenido, ${name}. Eres ${getRoleName(role)}.`);

    await loadRoom();
    connectRealtime();
    startLoop();
    startTimer();

    status("Conectado a la isla");
  } catch (error) {
    console.error(error);
    playerMessage(error.message);
  } finally {
    busy = false;
    $("joinButton").disabled = false;
  }
}

// --------------------------------------------------
// BOTÓN ESTOY LISTO
// --------------------------------------------------

async function markReady() {
  if (!currentPlayer || !roomCode || room?.status !== "waiting") return;

  $("readyButton").disabled = true;

  try {
    const { error } = await db.rpc("set_player_ready", {
      p_room_code: roomCode,
      p_player_id: currentPlayer.id,
      p_ready: true
    });

    if (error) throw error;

    await loadRoom();

    message("¡Estás listo! Esperando al otro capitán.");

  } catch (error) {
    console.error(error);
    message("No se pudo marcar como listo: " + error.message);
    $("readyButton").disabled = false;
  }
}

// --------------------------------------------------
// CUENTA REGRESIVA
// --------------------------------------------------

async function checkCountdown() {
  if (!room || room.status !== "countdown" || !room.started_at) return;

  const startTime = new Date(room.started_at).getTime();

  if (Date.now() >= startTime) {
    const actualStart = new Date().toISOString();

    const { error } = await db
      .from("treasure_rooms")
      .update({
        status: "racing",
        started_at: actualStart
      })
      .eq("room_code", roomCode)
      .eq("status", "countdown")
      .eq("started_at", room.started_at);

    if (error) console.error(error);

    await loadRoom();
    message("¡COMIENZA LA CARRERA!");
  } else {
    const seconds = Math.ceil((startTime - Date.now()) / 1000);
    $("countdownDisplay").hidden = false;
    $("countdownDisplay").textContent = seconds;
  }
}

// --------------------------------------------------
// MOVIMIENTO
// --------------------------------------------------

function jump() {
  if (!currentPlayer || room?.status !== "racing") return;
  if (!grounded) return;

  velocityY = JUMP_FORCE;
  grounded = false;
}

function movePlayer(delta) {
  if (!currentPlayer || room?.status !== "racing") return;
  if (currentPlayer.finished_at) return;

  const factor = Math.min(delta / 16.67, 2);

  let x = Number(currentPlayer.x);
  let y = Number(currentPlayer.y);

  if (keys.has("ArrowLeft") || keys.has("a")) x -= SPEED * factor;
  if (keys.has("ArrowRight") || keys.has("d")) x += SPEED * factor;

  x = Math.max(24, Math.min(WORLD_WIDTH - 24, x));

  const oldBottom = y + PLAYER_HEIGHT / 2;

  velocityY += GRAVITY * factor;
  y += velocityY * factor;

  let landed = false;

  if (velocityY >= 0) {
    for (const platform of PLATFORMS) {
      const overlaps =
        x + 20 > platform.x &&
        x - 20 < platform.x + platform.width;

      const newBottom = y + PLAYER_HEIGHT / 2;

      if (
        overlaps &&
        oldBottom <= platform.top &&
        newBottom >= platform.top
      ) {
        y = platform.top - PLAYER_HEIGHT / 2;
        velocityY = 0;
        landed = true;
        break;
      }
    }
  }

  if (!landed && y + PLAYER_HEIGHT / 2 >= GROUND_TOP) {
    y = GROUND_TOP - PLAYER_HEIGHT / 2;
    velocityY = 0;
    landed = true;
  }

  grounded = landed;

  currentPlayer.x = x;
  currentPlayer.y = y;

  const element = currentPlayer.role === "red" ? $("pirateA") : $("pirateB");
  drawPirate(element, currentPlayer);
  updateCamera();

  if (x >= FINISH_X) {
    finishRace();
  }
}

async function savePosition() {
  if (!currentPlayer || room?.status !== "racing") return;

  const { error } = await db
    .from("treasure_players")
    .update({
      x: currentPlayer.x,
      y: currentPlayer.y
    })
    .eq("id", currentPlayer.id)
    .eq("user_id", currentUser.id);

  if (error) console.error("Error guardando posición:", error);
}

function frame(timestamp) {
  if (!lastFrame) lastFrame = timestamp;

  const delta = timestamp - lastFrame;
  lastFrame = timestamp;

  if (currentPlayer && room?.status === "racing") {
    movePlayer(delta);

    if (timestamp - lastPositionSave > 120) {
      lastPositionSave = timestamp;
      savePosition();
    }
  }

  loopId = requestAnimationFrame(frame);
}

function startLoop() {
  if (loopId) cancelAnimationFrame(loopId);
  lastFrame = 0;
  loopId = requestAnimationFrame(frame);
}

// --------------------------------------------------
// FINALIZAR CARRERA
// --------------------------------------------------

async function finishRace() {
  if (
    finishing ||
    !currentPlayer ||
    currentPlayer.finished_at ||
    room?.status !== "racing"
  ) return;

  finishing = true;

  try {
    const { error: playerError } = await db
      .from("treasure_players")
      .update({ finished_at: new Date().toISOString() })
      .eq("id", currentPlayer.id)
      .eq("user_id", currentUser.id);

    if (playerError) throw playerError;

    const { error: winnerError } = await db.rpc("claim_race_winner", {
      p_room_code: roomCode,
      p_player_id: currentPlayer.id
    });

    if (winnerError) throw winnerError;

    await loadRoom();
    await saveMatchResult();
    drawResult();

  } catch (error) {
    console.error(error);
    message("Error al guardar el ganador: " + error.message);
  } finally {
    finishing = false;
  }
}

function drawResult() {
  if (!room || room.status !== "finished") {
    $("finalResult").hidden = true;
    return;
  }

  $("finalResult").hidden = false;

  if (!room.winner_player_id) {
    $("winnerMessage").textContent =
      "Se terminó el tiempo. La carrera terminó sin ganador.";
    return;
  }

  const winner = players.find((p) => p.id === room.winner_player_id);
  const winnerName = room.winner_name || winner?.player_name || "Un jugador";

  if (currentPlayer?.id === room.winner_player_id) {
    $("winnerMessage").textContent = "🎉 ¡FELICIDADES! ¡GANASTE LA CARRERA!";
    message("¡Ganaste! Eres el gran capitán del tesoro.");
  } else {
    $("winnerMessage").textContent = `🏆 El ganador es ${winnerName}.`;
    message(`La carrera terminó. Ganó ${winnerName}.`);
  }
}

// --------------------------------------------------
// TEMPORIZADOR
// --------------------------------------------------

function updateTimer() {
  if (!room || !room.started_at) {
    $("timerDisplay").textContent = "05:00";
    $("countdownDisplay").hidden = true;
    return;
  }

  if (room.status === "countdown") {
    checkCountdown();
    return;
  }

  $("countdownDisplay").hidden = true;

  if (room.status !== "racing") return;

  const elapsed = (Date.now() - new Date(room.started_at).getTime()) / 1000;
  const remaining = Math.max(0, Math.ceil(GAME_SECONDS - elapsed));

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  $("timerDisplay").textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  if (remaining <= 0) finishByTime();
}

async function finishByTime() {
  if (room?.status !== "racing") return;

  try {
    const { error } = await db
      .from("treasure_rooms")
      .update({ status: "finished" })
      .eq("room_code", roomCode)
      .eq("status", "racing");

    if (error) throw error;

    await loadRoom();
    drawResult();
  } catch (error) {
    console.error(error);
  }
}

function startTimer() {
  if (timerId) clearInterval(timerId);

  timerId = setInterval(async () => {
    if (!currentPlayer) return;

    if (room?.status === "countdown") {
      await checkCountdown();
    }

    updateTimer();
  }, 500);
}

// --------------------------------------------------
// ACTUALIZACIÓN MULTIJUGADOR
// --------------------------------------------------

function connectRealtime() {
  if (channel) {
    db.removeChannel(channel);
    channel = null;
  }

  channel = db
    .channel("isla-" + roomCode)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "treasure_players",
        filter: `room_code=eq.${roomCode}`
      },
      async (payload) => {
        try {
          await loadRoom();

          if (payload.new?.id === currentPlayer?.id) {
            currentPlayer = players.find((p) => p.id === currentPlayer.id) || currentPlayer;
          }
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
    .subscribe((state) => {
      if (state === "SUBSCRIBED") {
        status("Multijugador conectado");
      }
    });
}

// --------------------------------------------------
// REINICIAR Y SALIR
// --------------------------------------------------

async function restartGame() {
  if (!currentPlayer) return;

  if (!confirm("¿Reiniciar la carrera para los dos jugadores?")) return;

  try {
    const { error: playerError } = await db
      .from("treasure_players")
      .update({
        x: null,
        y: null,
        score: 0,
        is_ready: false,
        finished_at: null
      })
      .eq("room_code", roomCode);

    if (playerError) throw playerError;

    // Restablecer cada posición según el color.
    for (const p of players) {
      const { error } = await db
        .from("treasure_players")
        .update({
          x: getStartPosition(p.role),
          y: GROUND_TOP - PLAYER_HEIGHT / 2
        })
        .eq("id", p.id);

      if (error) throw error;
    }

    const { error: roomError } = await db
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
    grounded = true;
    lastSavedRace = "";

    await loadRoom();
    $("finalResult").hidden = true;
    $("timerDisplay").textContent = "05:00";

    message("Partida reiniciada. Los dos jugadores deben volver a estar listos.");
  } catch (error) {
    message("No se pudo reiniciar: " + error.message);
    console.error(error);
  }
}

async function leaveIsland(showText = true) {
  if (!currentPlayer) return;

  const id = currentPlayer.id;

  try {
    if (channel) {
      await db.removeChannel(channel);
      channel = null;
    }

    const { error } = await db
      .from("treasure_players")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (error) throw error;

    await db
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: null,
        winner_player_id: null,
        winner_name: null,
        winner_role: null
      })
      .eq("room_code", roomCode);

    currentPlayer = null;
    players = [];
    room = null;

    if (loopId) cancelAnimationFrame(loopId);
    if (timerId) clearInterval(timerId);

    $("pirateA").style.display = "none";
    $("pirateB").style.display = "none";
    $("waitingRoom").hidden = true;
    $("finalResult").hidden = true;

    if (showText) {
      playerMessage("Has salido de la isla.");
      message("Puedes volver a entrar cuando quieras.");
    }

    status("Fuera de la isla");
  } catch (error) {
    console.error(error);
    if (showText) message("No se pudo salir: " + error.message);
    throw error;
  }
}

// --------------------------------------------------
// CONTROLES DEL JUEGO
// --------------------------------------------------

function setupControls() {
  $("signUpButton").addEventListener("click", register);
  $("loginButton").addEventListener("click", login);
  $("logoutButton").addEventListener("click", logout);

  $("joinButton").addEventListener("click", joinIsland);
  $("readyButton").addEventListener("click", markReady);
  $("restartButton").addEventListener("click", restartGame);
  $("leaveButton").addEventListener("click", () => leaveIsland(true));

  window.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) {
      event.preventDefault();
    }

    keys.add(key);

    if (event.key === "ArrowUp" || event.key === " ") {
      jump();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  });

  window.addEventListener("blur", () => keys.clear());

  document.querySelectorAll("[data-move]").forEach((button) => {
    const direction = button.dataset.move;

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      if (direction === "up") jump();
      if (direction === "left") keys.add("ArrowLeft");
      if (direction === "right") keys.add("ArrowRight");
    });

    const release = () => {
      keys.delete("ArrowLeft");
      keys.delete("ArrowRight");
    };

    button.addEventListener("pointerup", release);
    button.addEventListener("pointerleave", release);
    button.addEventListener("pointercancel", release);
  });
}

// --------------------------------------------------
// INICIO
// --------------------------------------------------

async function startApplication() {
  buildWorld();
  setupControls();

  // Los dos piratas empiezan ocultos hasta que entren los jugadores.
  $("pirateA").style.display = "none";
  $("pirateB").style.display = "none";
  $("waitingRoom").hidden = true;

  startTimer();

  try {
    status("Conectando...");
    await initAuth();
    status("Conectado a Supabase");
  } catch (error) {
    console.error(error);
    status("Error de conexión");
    authMessage("No se pudo iniciar la aplicación: " + error.message);
  }
}

document.addEventListener("DOMContentLoaded", startApplication);
