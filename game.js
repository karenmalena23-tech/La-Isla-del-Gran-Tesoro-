
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

const $ = id => document.getElementById(id);

let currentUser = null;
let currentPlayer = null;
let players = [];
let room = null;
let roomCode = "";
let channel = null;

let keys = new Set();
let velocityY = 0;
let grounded = true;
let loopId = null;
let timerId = null;
let lastFrame = 0;
let lastPositionSave = 0;
let busy = false;
let finishing = false;
let changingCountdown = false;
let savingResult = false;
let lastSavedRace = "";

// UTILIDADES

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

function getStartPosition(role) {
  return role === "red" ? 140 : 200;
}

function getPlayerById(id) {
  return players.find(p => p.id === id);
}

// CUENTAS: OPCIONALES PARA PODER JUGAR

async function refreshAuthUI() {
  const logged = Boolean(currentUser);

  $("loggedInArea").hidden = !logged;
  $("emailInput").disabled = logged;
  $("passwordInput").disabled = logged;
  $("signUpButton").hidden = logged;
  $("loginButton").hidden = logged;
  $("accountEmail").textContent = currentUser?.email || "";

  if (logged) {
    authMessage("Sesión iniciada.");
    await loadWinHistory();
    await loadMatchHistory();
  } else {
    authMessage("Puedes jugar como invitado o iniciar sesión.");
    $("totalWins").textContent = "0";
    $("historyList").innerHTML =
      "<li>Inicia sesión para consultar tus victorias.</li>";
    $("matchHistoryList").innerHTML =
      "<li>Inicia sesión para consultar las carreras.</li>";
    renderLeaderboard([]);
  }
}

async function register() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || password.length < 6) {
    authMessage("Escribe un correo y una contraseña de al menos 6 caracteres.");
    return;
  }

  try {
    const { data, error } = await db.auth.signUp({ email, password });
    if (error) throw error;

    if (data.session) {
      currentUser = data.user;
      await refreshAuthUI();
      authMessage("Cuenta creada correctamente.");
    } else {
      authMessage("Cuenta creada. Confirma el correo para iniciar sesión. Mientras tanto puedes jugar como invitado.");
    }
  } catch (error) {
    authMessage("Error: " + error.message);
  }
}

async function login() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || !password) {
    authMessage("Escribe tu correo y contraseña.");
    return;
  }

  try {
    const { data, error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    currentUser = data.user;
    await refreshAuthUI();
  } catch (error) {
    authMessage("Error al iniciar sesión: " + error.message);
  }
}

async function logout() {
  try {
    if (currentPlayer) await leaveIsland(false);

    const { error } = await db.auth.signOut();
    if (error) throw error;

    currentUser = null;
    await refreshAuthUI();
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
    currentUser = session?.user || null;
    refreshAuthUI().catch(console.error);
  });
}

// HISTORIAL PERSONAL

async function loadWinHistory() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("treasure_wins")
    .select("id, room_code, player_name, won_at")
    .eq("user_id", currentUser.id)
    .order("won_at", { ascending: false })
    .limit(30);

  if (error) {
    $("historyList").innerHTML = "<li>No se pudo cargar el historial.</li>";
    return;
  }

  $("totalWins").textContent = data.length;
  $("historyList").innerHTML = "";

  if (!data.length) {
    $("historyList").innerHTML = "<li>Aún no tienes victorias.</li>";
    return;
  }

  data.forEach(win => {
    const li = document.createElement("li");
    li.textContent =
      `🏆 ${win.player_name} — Isla ${win.room_code} — ` +
      new Date(win.won_at).toLocaleString();
    $("historyList").appendChild(li);
  });
}

// HISTORIAL COMPARTIDO

async function loadMatchHistory() {
  if (!currentUser) return;

  const { data, error } = await db
    .from("treasure_match_history")
    .select("room_code, red_player_name, blue_player_name, red_user_id, blue_user_id, winner_name, winner_role, finished_at")
    .or(`red_user_id.eq.${currentUser.id},blue_user_id.eq.${currentUser.id}`)
    .order("finished_at", { ascending: false })
    .limit(100);

  if (error) {
    $("matchHistoryList").innerHTML =
      "<li>No se pudo cargar el historial compartido.</li>";
    renderLeaderboard([]);
    return;
  }

  $("matchHistoryList").innerHTML = "";

  if (!data.length) {
    $("matchHistoryList").innerHTML =
      "<li>Aún no hay carreras registradas.</li>";
  }

  data.forEach(match => {
    const li = document.createElement("li");
    li.textContent =
      `🏆 Ganó ${match.winner_name}. Participaron ` +
      `${match.red_player_name} y ${match.blue_player_name}. ` +
      `Isla: ${match.room_code}.`;
    $("matchHistoryList").appendChild(li);
  });

  renderLeaderboard(data);
}

function renderLeaderboard(matches) {
  const list = $("leaderboardList");
  list.innerHTML = "";

  const totals = {};

  matches.forEach(match => {
    if (match.winner_name) {
      totals[match.winner_name] =
        (totals[match.winner_name] || 0) + 1;
    }
  });

  const ranking = Object.entries(totals)
    .sort((a, b) => b[1] - a[1]);

  if (!ranking.length) {
    list.innerHTML =
      "<li>El marcador aparecerá cuando termine una carrera.</li>";
    return;
  }

  ranking.forEach(([name, wins], index) => {
    const li = document.createElement("li");
    li.textContent = `${index + 1}. ${name} — ${wins} victorias`;
    list.appendChild(li);
  });
}

async function saveMatchResult() {
  if (!currentUser || !currentPlayer || !room || savingResult) return;
  if (room.winner_player_id !== currentPlayer.id) return;

  const red = players.find(p => p.role === "red");
  const blue = players.find(p => p.role === "blue");

  if (!red || !blue || !red.user_id || !blue.user_id) return;

  const raceKey = `${roomCode}_${room.started_at}`;
  if (lastSavedRace === raceKey) return;

  savingResult = true;

  try {
    const { error } = await db.from("treasure_match_history").insert({
      room_code: roomCode,
      race_started_at: room.started_at,
      red_player_name: red.player_name,
      blue_player_name: blue.player_name,
      red_user_id: red.user_id,
      blue_user_id: blue.user_id,
      winner_player_id: currentPlayer.id,
      winner_user_id: currentUser.id,
      winner_name: currentPlayer.player_name,
      winner_role: currentPlayer.role,
      finished_at: new Date().toISOString()
    });

    if (error && error.code !== "23505") throw error;

    const { error: winError } = await db.from("treasure_wins").insert({
      user_id: currentUser.id,
      room_code: roomCode,
      player_name: currentPlayer.player_name
    });

    if (winError && winError.code !== "23505") {
      console.error(winError);
    }

    lastSavedRace = raceKey;
    await loadWinHistory();
    await loadMatchHistory();
  } catch (error) {
    console.error("Error guardando resultado:", error);
  } finally {
    savingResult = false;
  }
}

// SALAS

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
    .insert({ room_code: code, status: "waiting" })
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

  const [pr, rr] = await Promise.all([
    db.from("treasure_players")
      .select("*")
      .eq("room_code", roomCode)
      .order("role"),
    db.from("treasure_rooms")
      .select("*")
      .eq("room_code", roomCode)
      .maybeSingle()
  ]);

  if (pr.error) throw pr.error;
  if (rr.error) throw rr.error;

  players = pr.data || [];
  room = rr.data;

  if (currentPlayer) {
    currentPlayer =
      players.find(p => p.id === currentPlayer.id) || currentPlayer;
  }

  drawPlayers();
  drawWaitingRoom();
  drawResult();
  updateTimer();
}

// DIBUJAR JUGADORES

function drawPlayers() {
  const red = players.find(p => p.role === "red");
  const blue = players.find(p => p.role === "blue");

  $("nameA").textContent = red?.player_name || "Pirata Rojo";
  $("nameB").textContent = blue?.player_name || "Pirata Azul";

  $("scoreA").textContent = red?.score ?? 0;
  $("scoreB").textContent = blue?.score ?? 0;

  drawPirate($("pirateA"), red);
  drawPirate($("pirateB"), blue);

  $("activityList").innerHTML = "";

  players.forEach(p => {
    const li = document.createElement("li");
    li.textContent =
      `${p.role === "red" ? "🔴" : "🔵"} ${p.player_name}: ` +
      `${p.is_ready ? "Listo" : "Esperando"}`;
    $("activityList").appendChild(li);
  });
}

function drawWaitingRoom() {
  const red = players.find(p => p.role === "red");
  const blue = players.find(p => p.role === "blue");

  $("readyA").textContent = red
    ? `${red.player_name} — ${red.is_ready ? "✓ Listo" : "Esperando"}`
    : "Esperando jugador rojo...";

  $("readyB").textContent = blue
    ? `${blue.player_name} — ${blue.is_ready ? "✓ Listo" : "Esperando"}`
    : "Esperando jugador azul...";

  $("waitingRoom").hidden = !currentPlayer;

  $("readyButton").disabled =
    !currentPlayer ||
    room?.status !== "waiting" ||
    Boolean(currentPlayer.is_ready) ||
    players.length !== 2;

  $("readyMessage").textContent =
    players.length < 2
      ? "Esperando al segundo jugador..."
      : "Los dos jugadores deben pulsar ¡Estoy listo!";
}

function drawPirate(element, player) {
  if (!player) {
    element.style.display = "none";
    return;
  }

  if (player.x == null) player.x = getStartPosition(player.role);
  if (player.y == null) player.y = GROUND_TOP - PLAYER_HEIGHT / 2;

  element.style.display = "grid";
  element.style.left = `${Number(player.x)}px`;
  element.style.top = `${Number(player.y)}px`;

  let label = element.querySelector(".pirate-name");

  if (!label) {
    label = document.createElement("span");
    label.className = "pirate-name";
    element.appendChild(label);
  }

  label.textContent = player.player_name;
}

// ESCENARIO

function buildWorld() {
  $("world").style.width = WORLD_WIDTH + "px";
  $("finishLine").style.left = FINISH_X + "px";

  document.querySelectorAll("#world > .platform").forEach(el => el.remove());

  $("obstacleArea").innerHTML = "";
  OBSTACLES.forEach(item => {
    const el = document.createElement("div");
    el.className = "obstacle";
    el.textContent = item.icon;
    el.style.left = item.x + "px";
    el.style.top = item.y + "px";
    $("obstacleArea").appendChild(el);
  });

  $("treasureArea").innerHTML = "";
  PLATFORMS.forEach(item => {
    const el = document.createElement("div");
    el.className = "platform";
    el.style.left = item.x + "px";
    el.style.top = item.top + "px";
    el.style.width = item.width + "px";
    $("treasureArea").appendChild(el);
  });
}

function updateCamera() {
  if (!currentPlayer) return;

  const width = $("island").clientWidth;
  const camera = Math.max(
    0,
    Math.min(
      WORLD_WIDTH - width,
      Number(currentPlayer.x) - width / 2
    )
  );

  $("world").style.transform = `translateX(${-camera}px)`;
}

// ENTRAR A LA ISLA

async function joinIsland() {
  if (busy || currentPlayer) return;

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

    roomCode = code;
    room = await ensureRoom(code);

    let query = db.from("treasure_players").select("*")
      .eq("room_code", code);

    if (currentUser) query = query.eq("user_id", currentUser.id);

    const { data: existing, error: existingError } =
      await query.maybeSingle();

    if (existingError) throw existingError;

    if (existing) {
      currentPlayer = existing;
      await loadRoom();
      connectRealtime();
      startLoop();
      startTimer();
      playerMessage("Has vuelto a entrar en tu isla.");
      status("Conectado a la isla");
      return;
    }

    const { data: occupied, error: occupiedError } = await db
      .from("treasure_players")
      .select("*")
      .eq("room_code", code);

    if (occupiedError) throw occupiedError;
    if (occupied.length >= 2) {
      throw new Error("La isla ya tiene dos jugadores.");
    }

    if (room.status !== "waiting") {
      throw new Error("La partida ya comenzó. Reinicia la isla.");
    }

    const role = occupied.some(p => p.role === "red") ? "blue" : "red";

    const player = {
      id: crypto.randomUUID(),
      room_code: code,
      player_name: name,
      role,
      x: getStartPosition(role),
      y: GROUND_TOP - PLAYER_HEIGHT / 2,
      score: 0,
      is_ready: false,
      finished_at: null,
      user_id: currentUser?.id || null
    };

    const { data, error } = await db
      .from("treasure_players")
      .insert(player)
      .select()
      .single();

    if (error) throw error;

    currentPlayer = data;

    await loadRoom();
    connectRealtime();
    startLoop();
    startTimer();
    updateCamera();

    playerMessage(`¡Eres el ${role === "red" ? "Pirata Rojo" : "Pirata Azul"}!`);
    message(`¡Bienvenido, ${name}!`);
    status("Conectado a la isla");
  } catch (error) {
    console.error(error);
    playerMessage("No se pudo entrar: " + error.message);
  } finally {
    busy = false;
    $("joinButton").disabled = false;
  }
}

// BOTÓN ESTOY LISTO

async function markReady() {
  if (!currentPlayer || room?.status !== "waiting") return;

  if (players.length !== 2) {
    message("Se necesitan dos jugadores.");
    return;
  }

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
    message("Error al marcar listo: " + error.message);
    $("readyButton").disabled = false;
  }
}

// CUENTA ATRÁS

async function checkCountdown() {
  if (
    !room ||
    room.status !== "countdown" ||
    !room.started_at ||
    changingCountdown
  ) return;

  const remaining =
    new Date(room.started_at).getTime() - Date.now();

  if (remaining > 0) {
    $("countdownDisplay").hidden = false;
    $("countdownDisplay").textContent =
      Math.ceil(remaining / 1000);
    return;
  }

  changingCountdown = true;

  try {
    const { error } = await db
      .from("treasure_rooms")
      .update({
        status: "racing",
        started_at: new Date().toISOString()
      })
      .eq("room_code", roomCode)
      .eq("status", "countdown");

    if (error) throw error;

    await loadRoom();
    $("countdownDisplay").hidden = true;
    message("¡COMIENZA LA CARRERA!");
  } catch (error) {
    console.error(error);
  } finally {
    changingCountdown = false;
  }
}

// MOVIMIENTO

function jump() {
  if (!currentPlayer || room?.status !== "racing" || !grounded) return;

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
    for (const p of PLATFORMS) {
      const overlaps = x + 20 > p.x && x - 20 < p.x + p.width;
      const newBottom = y + PLAYER_HEIGHT / 2;

      if (overlaps && oldBottom <= p.top && newBottom >= p.top) {
        y = p.top - PLAYER_HEIGHT / 2;
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

  drawPirate(
    currentPlayer.role === "red" ? $("pirateA") : $("pirateB"),
    currentPlayer
  );

  updateCamera();

  if (x >= FINISH_X) finishRace();
}

async function savePosition() {
  if (!currentPlayer || room?.status !== "racing") return;

  const { error } = await db
    .from("treasure_players")
    .update({ x: currentPlayer.x, y: currentPlayer.y })
    .eq("id", currentPlayer.id);

  if (error) console.error(error);
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

// FINAL DE CARRERA

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
      .eq("id", currentPlayer.id);

    if (playerError) throw playerError;

    const { error } = await db.rpc("claim_race_winner", {
      p_room_code: roomCode,
      p_player_id: currentPlayer.id
    });

    if (error) throw error;

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
      "⏰ Se acabó el tiempo. ¡Has perdido!";
    return;
  }

  const winner = getPlayerById(room.winner_player_id);
  const name = room.winner_name || winner?.player_name || "Un jugador";

  $("winnerMessage").textContent =
    currentPlayer?.id === room.winner_player_id
      ? "🎉 ¡FELICIDADES! ¡GANASTE LA CARRERA!"
      : `😔 Lo sentimos, has perdido. Ganó ${name}.`;
}

// TEMPORIZADOR

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

  const elapsed =
    (Date.now() - new Date(room.started_at).getTime()) / 1000;

  const remaining = Math.max(0, Math.ceil(GAME_SECONDS - elapsed));

  $("timerDisplay").textContent =
    `${String(Math.floor(remaining / 60)).padStart(2, "0")}:` +
    `${String(remaining % 60).padStart(2, "0")}`;

  if (remaining <= 0) finishByTime();
}

async function finishByTime() {
  if (room?.status !== "racing") return;

  try {
    const { error } = await db
      .from("treasure_rooms")
      .update({ status: "finished" })
      .eq("room_code", roomCode)
      .eq("status", "racing")
      .is("winner_player_id", null);

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
  }, 250);
}

// ACTUALIZACIÓN MULTIJUGADOR

function connectRealtime() {
  if (channel) db.removeChannel(channel);

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
      async payload => {
        const changedId = payload.new?.id || payload.old?.id;
        if (changedId === currentPlayer?.id) return;

        try {
          await loadRoom();
          updateCamera();
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
          if (room?.status === "finished") {
            await loadMatchHistory();
            drawResult();
          }
        } catch (error) {
          console.error(error);
        }
      }
    )
    .subscribe(state => {
      if (state === "SUBSCRIBED") {
        status("Multijugador conectado");
      }
    });
}

// REINICIAR

async function restartGame() {
  if (!currentPlayer) return;
  if (!confirm("¿Reiniciar la carrera para los dos jugadores?")) return;

  try {
    for (const p of players) {
      const { error } = await db
        .from("treasure_players")
        .update({
          x: getStartPosition(p.role),
          y: GROUND_TOP - PLAYER_HEIGHT / 2,
          score: 0,
          is_ready: false,
          finished_at: null
        })
        .eq("id", p.id);

      if (error) throw error;
    }

    const { error } = await db
      .from("treasure_rooms")
      .update({
        status: "waiting",
        started_at: null,
        winner_player_id: null,
        winner_name: null,
        winner_role: null
      })
      .eq("room_code", roomCode);

    if (error) throw error;

    velocityY = 0;
    grounded = true;
    finishing = false;
    lastSavedRace = "";

    await loadRoom();
    $("finalResult").hidden = true;
    $("timerDisplay").textContent = "05:00";
    message("Partida reiniciada. ¡Los dos deben volver a estar listos!");
  } catch (error) {
    message("No se pudo reiniciar: " + error.message);
  }
}

// SALIR

async function leaveIsland(showText = true) {
  if (!currentPlayer) return;

  const id = currentPlayer.id;

  if (channel) {
    await db.removeChannel(channel);
    channel = null;
  }

  let query = db.from("treasure_players").delete().eq("id", id);
  if (currentUser) query = query.eq("user_id", currentUser.id);

  const { error } = await query;
  if (error) throw error;

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
}

// CONTROLES

function setupControls() {
  $("signUpButton").addEventListener("click", register);
  $("loginButton").addEventListener("click", login);
  $("logoutButton").addEventListener("click", logout);

  $("joinButton").addEventListener("click", joinIsland);
  $("readyButton").addEventListener("click", markReady);
  $("restartButton").addEventListener("click", restartGame);
  $("leaveButton").addEventListener("click", () => leaveIsland(true));

  window.addEventListener("keydown", event => {
    const key = event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "]
      .includes(event.key)) {
      event.preventDefault();
    }

    keys.add(key);

    if (event.key === "ArrowUp" || event.key === " ") jump();
  });

  window.addEventListener("keyup", event => {
    const key = event.key.length === 1
      ? event.key.toLowerCase()
      : event.key;
    keys.delete(key);
  });

  window.addEventListener("blur", () => keys.clear());

  document.querySelectorAll("[data-move]").forEach(button => {
    const direction = button.dataset.move;

    button.addEventListener("pointerdown", event => {
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

// INICIO

async function startApplication() {
  buildWorld();
  setupControls();

  $("pirateA").style.display = "none";
  $("pirateB").style.display = "none";
  $("waitingRoom").hidden = true;

  try {
    status("Conectando...");
    await initAuth();
    status("Listo para jugar");
  } catch (error) {
    console.error(error);
    status("Modo invitado disponible");
    authMessage("Puedes jugar como invitado. Error de cuenta: " + error.message);
  }

  startTimer();
}

document.addEventListener("DOMContentLoaded", startApplication);
