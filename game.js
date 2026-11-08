
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);

const WIDTH = 4200;
const FINISH = 4050;
const GAME_TIME = 300;
const FLOOR = 55;

const CHEST_POSITIONS = [450, 850, 1250, 1700, 2150, 2600, 3100, 3600];
const OBSTACLE_POSITIONS = [650, 1050, 1500, 1950, 2400, 2850, 3350, 3850];

let user = null;
let me = null;
let players = [];
let room = null;
let code = "";
let channel = null;
let keys = new Set();
let jumping = false;
let jumpHeight = 0;
let timer = null;
let frame = null;
let lastSave = 0;
let ending = false;
let saving = false;

let collectedChests = new Set();
let chestElements = [];

function say(id, text) {
  $(id).textContent = text;
}

/* AUTENTICACIÓN */

async function authUI() {
  $("loggedInArea").hidden = !user;
  $("accountEmail").textContent = user?.email || "";
  $("signUpButton").hidden = !!user;
  $("loginButton").hidden = !!user;
  $("emailInput").disabled = !!user;
  $("passwordInput").disabled = !!user;

  if (user) {
    say("authStatus", "Sesión iniciada.");
    await loadPersonalWins();
  } else {
    say("authStatus", "Inicia sesión para jugar.");
  }
}

async function register() {
  const email = $("emailInput").value.trim();
  const password = $("passwordInput").value;

  if (!email || password.length < 6) {
    say("authStatus", "Escribe tu correo y una contraseña de 6 caracteres o más.");
    return;
  }

  const { data, error } = await db.auth.signUp({ email, password });

  if (error) return say("authStatus", error.message);

  if (data.session) {
    user = data.user;
    await authUI();
  } else {
    say("authStatus", "Revisa tu correo para confirmar la cuenta. Después inicia sesión.");
  }
}

async function login() {
  const { data, error } = await db.auth.signInWithPassword({
    email: $("emailInput").value.trim(),
    password: $("passwordInput").value
  });

  if (error) return say("authStatus", error.message);

  user = data.user;
  await authUI();
}

async function logout() {
  if (me) await leave();

  await db.auth.signOut();
  user = null;
  await authUI();
}

/* VICTORIAS PERSONALES */

async function loadPersonalWins() {
  if (!user) return;

  const { data, error } = await db.from("treasure_wins")
    .select("room_code,player_name,won_at")
    .eq("user_id", user.id)
    .order("won_at", { ascending: false })
    .limit(30);

  if (error) return say("historyList", "No se pudo cargar el historial.");

  say("totalWins", data.length);
  $("historyList").innerHTML = "";

  data.forEach(w => {
    const li = document.createElement("li");
    li.textContent = `🏆 ${w.player_name} · ${w.room_code} · ${new Date(w.won_at).toLocaleString()}`;
    $("historyList").appendChild(li);
  });

  if (!data.length) {
    $("historyList").textContent = "Aún no tienes victorias.";
  }
}

/* HISTORIAL Y CLASIFICACIÓN */

async function loadHistory() {
  if (!user) return;

  const { data, error } = await db.from("treasure_match_history")
    .select("*")
    .or(`red_user_id.eq.${user.id},blue_user_id.eq.${user.id}`)
    .order("finished_at", { ascending: false })
    .limit(50);

  if (error) {
    $("matchHistoryList").textContent = "No se pudo cargar el historial.";
    return;
  }

  $("matchHistoryList").innerHTML = "";
  $("leaderboardList").innerHTML = "";

  const wins = {};

  data.forEach(m => {
    const li = document.createElement("li");
    li.textContent = `${m.red_player_name} vs ${m.blue_player_name}: ganó ${m.winner_name} (${m.room_code})`;
    $("matchHistoryList").appendChild(li);

    wins[m.winner_name] = (wins[m.winner_name] || 0) + 1;
  });

  if (!data.length) {
    $("matchHistoryList").textContent = "Todavía no hay carreras.";
  }

  Object.entries(wins).sort((a,b) => b[1]-a[1]).forEach(([name,n],i) => {
    const li = document.createElement("li");
    li.textContent = `${i+1}. ${name}: ${n} victorias`;
    $("leaderboardList").appendChild(li);
  });
}

/* ISLAS */

async function ensureRoom() {
  let { data, error } = await db.from("treasure_rooms")
    .select("*")
    .eq("room_code", code)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const result = await db.from("treasure_rooms")
    .insert({ room_code: code, status: "waiting" })
    .select()
    .single();

  if (result.error && result.error.code === "23505") {
    const retry = await db.from("treasure_rooms")
      .select("*")
      .eq("room_code", code)
      .single();

    if (retry.error) throw retry.error;
    return retry.data;
  }

  if (result.error) throw result.error;
  return result.data;
}

async function loadRoom() {
  const [p,r] = await Promise.all([
    db.from("treasure_players").select("*").eq("room_code", code),
    db.from("treasure_rooms").select("*").eq("room_code", code).single()
  ]);

  if (p.error) throw p.error;
  if (r.error) throw r.error;

  players = p.data || [];
  room = r.data;
  me = players.find(p => p.id === me?.id) || me;

  render();

  if (room.status === "finished") {
    showResult();
    await saveResult();
  }
}

/* COFRES Y OBSTÁCULOS */

function createWorldItems() {
  const world = $("world");

  world.querySelectorAll(".chest, .obstacle").forEach(el => el.remove());

  chestElements = [];

  CHEST_POSITIONS.forEach((position, index) => {
    const chest = document.createElement("div");

    chest.className = "chest";
    chest.textContent = "🧰";
    chest.style.left = `${position}px`;
    chest.dataset.id = index;

    if (collectedChests.has(index)) {
      chest.classList.add("collected");
    }

    world.appendChild(chest);
    chestElements.push(chest);
  });

  OBSTACLE_POSITIONS.forEach((position, index) => {
    const obstacle = document.createElement("div");

    obstacle.className = "obstacle";
    obstacle.textContent = ["🪨", "🌳", "🪵", "🌴"][index % 4];
    obstacle.style.left = `${position}px`;

    world.appendChild(obstacle);
  });
}

async function collectChestAt(x) {
  if (!me || room?.status !== "racing") return;

  for (let i = 0; i < CHEST_POSITIONS.length; i++) {
    if (collectedChests.has(i)) continue;

    if (Math.abs(x - CHEST_POSITIONS[i]) < 35) {
      collectedChests.add(i);

      const chest = chestElements[i];

      if (chest) {
        chest.classList.add("collected");
      }

      const newScore = Number(me.score || 0) + 1;
      me.score = newScore;

      const player = players.find(p => p.id === me.id);

      if (player) {
        player.score = newScore;
      }

      const red = players.find(p => p.role === "red");
      const blue = players.find(p => p.role === "blue");

      say("scoreA", red?.score ?? 0);
      say("scoreB", blue?.score ?? 0);
      say("gameMessage", "🎁 ¡Has recogido un cofre! +1 punto");

      const { error } = await db.from("treasure_players")
        .update({ score: newScore })
        .eq("id", me.id);

      if (error) {
        console.error("Error guardando el cofre:", error);
        say("gameMessage", "No se pudo guardar el punto.");
      }
    }
  }
}

/* INTERFAZ DEL JUEGO */

function render() {
  const red = players.find(p => p.role === "red");
  const blue = players.find(p => p.role === "blue");

  say("nameA", red?.player_name || "Pirata Rojo");
  say("nameB", blue?.player_name || "Pirata Azul");

  say("scoreA", red?.score ?? 0);
  say("scoreB", blue?.score ?? 0);

  say("readyA", red
    ? `${red.player_name}: ${red.is_ready ? "✓ Listo" : "Esperando"}`
    : "Esperando jugador rojo");

  say("readyB", blue
    ? `${blue.player_name}: ${blue.is_ready ? "✓ Listo" : "Esperando"}`
    : "Esperando jugador azul");

  $("waitingRoom").hidden = !me;

  $("readyButton").disabled =
    !me || room?.status !== "waiting" || me.is_ready || players.length !== 2;

  if (me) {
    $("pirateA").hidden = !red;
    $("pirateB").hidden = !blue;

    drawPirate($("pirateA"), red);
    drawPirate($("pirateB"), blue);
  }

  $("finalResult").hidden = room?.status !== "finished";
  $("countdownDisplay").hidden = room?.status !== "countdown";

  updateCamera();
}

function drawPirate(el, p) {
  if (!p) return;

  el.style.left = `${Number(p.x)}px`;
  el.style.bottom = `${FLOOR + (p.id === me?.id ? jumpHeight : 0)}px`;
  el.title = p.player_name;
}

function updateCamera() {
  if (!me) return;

  const view = $("island").clientWidth;
  const offset = Math.max(
    0,
    Math.min(WIDTH - view, Number(me.x) - view / 2)
  );

  $("world").style.transform = `translateX(${-offset}px)`;
}

/* ENTRAR A LA ISLA */

async function join() {
  if (!user) return say("playerInfo", "Primero inicia sesión.");

  const name = $("playerName").value.trim();
  code = $("roomCode").value.trim().toLowerCase();

  if (!name || !code) {
    return say("playerInfo", "Escribe tu nombre y el código de isla.");
  }

  try {
    $("joinButton").disabled = true;

    await ensureRoom();

    const { data: old, error: oldError } = await db.from("treasure_players")
      .select("*")
      .eq("room_code", code)
      .eq("user_id", user.id)
      .maybeSingle();

    if (oldError) throw oldError;

    if (old) {
      me = old;
    } else {
      const { data: occupied, error } = await db.from("treasure_players")
        .select("*")
        .eq("room_code", code);

      if (error) throw error;

      if (occupied.length >= 2) {
        throw new Error("La isla ya tiene dos jugadores.");
      }

      const roomNow = await ensureRoom();

      if (roomNow.status !== "waiting") {
        throw new Error("La carrera ya comenzó. Reinicia la isla.");
      }

      const role = occupied.some(p => p.role === "red") ? "blue" : "red";

      const { data, error: insertError } = await db.from("treasure_players")
        .insert({
          id: crypto.randomUUID(),
          room_code: code,
          player_name: name,
          role,
          x: role === "red" ? 100 : 160,
          y: 50,
          score: 0,
          is_ready: false,
          user_id: user.id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      me = data;
    }

    await loadRoom();

    collectedChests = new Set();
    createWorldItems();

    connect();
    startGameLoop();

    if (timer) clearInterval(timer);
    timer = setInterval(tick, 250);

    say("playerInfo", `Entraste como pirata ${me.role === "red" ? "rojo" : "azul"}.`);
    say("gameMessage", "Comparte el código de isla con el otro jugador.");

  } catch (e) {
    say("playerInfo", "No se pudo entrar: " + e.message);
  } finally {
    $("joinButton").disabled = false;
  }
}

/* LISTOS Y CUENTA REGRESIVA */

async function ready() {
  if (!me || players.length !== 2) return;

  $("readyButton").disabled = true;

  const { error } = await db.rpc("set_player_ready", {
    p_room_code: code,
    p_player_id: me.id,
    p_ready: true
  });

  if (error) {
    say("gameMessage", error.message);
    $("readyButton").disabled = false;
  } else {
    say("gameMessage", "¡Listo! Esperando al otro pirata.");
    await loadRoom();
  }
}

async function tick() {
  if (!me || !room) return;

  if (room.status === "countdown") {
    const left = Math.max(
      0,
      Math.ceil((new Date(room.started_at).getTime() - Date.now()) / 1000)
    );

    say("countdownDisplay", left > 0 ? left : "¡YA!");

    if (left <= 0) {
      await db.from("treasure_rooms").update({
        status: "racing",
        started_at: new Date().toISOString()
      })
      .eq("room_code", code)
      .eq("status", "countdown");

      await loadRoom();
    }
  }

  if (room.status === "racing") {
    const left = Math.max(
      0,
      Math.ceil(GAME_TIME - (Date.now() - new Date(room.started_at).getTime()) / 1000)
    );

    say(
      "timerDisplay",
      `${String(Math.floor(left / 60)).padStart(2,"0")}:${String(left % 60).padStart(2,"0")}`
    );

    if (left <= 0) {
      await db.from("treasure_rooms").update({ status: "finished" })
        .eq("room_code", code)
        .eq("status", "racing")
        .is("winner_player_id", null);

      await loadRoom();
    }
  }
}

/* CONEXIÓN EN TIEMPO REAL */

function connect() {
  if (channel) db.removeChannel(channel);

  channel = db.channel("isla-" + code)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "treasure_players",
        filter: `room_code=eq.${code}`
      },
      async payload => {
        if (payload.new?.id === me?.id) return;
        await loadRoom();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "treasure_rooms",
        filter: `room_code=eq.${code}`
      },
      loadRoom
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "treasure_match_history"
      },
      loadHistory
    )
    .subscribe();
}

/* MOVIMIENTO */

function move() {
  if (!me || room?.status !== "racing" || me.finished_at) return;

  let x = Number(me.x);

  if (keys.has("ArrowRight") || keys.has("d")) x += 5;
  if (keys.has("ArrowLeft") || keys.has("a")) x -= 5;

  x = Math.max(20, Math.min(FINISH, x));

  me.x = x;

  drawPirate(
    me.role === "red" ? $("pirateA") : $("pirateB"),
    me
  );

  updateCamera();

  void collectChestAt(x);

  if (x >= FINISH) finishRace();
}

function startGameLoop() {
  if (frame) cancelAnimationFrame(frame);

  const loop = now => {
    move();

    if (me && room?.status === "racing" && now - lastSave > 150) {
      lastSave = now;

      db.from("treasure_players")
        .update({ x: me.x })
        .eq("id", me.id);
    }

    frame = requestAnimationFrame(loop);
  };

  frame = requestAnimationFrame(loop);
}

/* FINAL DE CARRERA */

async function finishRace() {

/* FINAL DE CARRERA */

async function finishRace() {
  if (ending || !me) return;

  ending = true;

  await db.from("treasure_players")
    .update({ finished_at: new Date().toISOString() })
    .eq("id", me.id);

  const { data, error } = await db.rpc("claim_race_winner", {
    p_room_code: code,
    p_player_id: me.id
  });

  if (error) {
    say("gameMessage", error.message);
    ending = false;
    return;
  }

  const result = data?.winner_player_id || data?.winner?.id;
  const iWon = result === me.id;

  document.getElementById("finalResult").hidden = false;
  document.getElementById("winnerMessage").textContent =
    iWon ? "🏆 ¡GANASTE! ¡Encontraste el gran tesoro!" :
           "😢 ¡PERDISTE! El otro pirata llegó primero.";

  say("gameMessage", iWon ? "¡Eres el campeón de la isla!" : "¡El otro pirata ganó la carrera!");
}

/* REINICIAR */

async function restart() {
  if (!me || !confirm("¿Reiniciar la carrera para los dos jugadores?")) return;

  for (const p of players) {
    const { error } = await db.from("treasure_players").update({
      x: p.role === "red" ? 100 : 160,
      y: 50,
      is_ready: false,
      finished_at: null,
      score: 0
    }).eq("id", p.id);

    if (error) return say("gameMessage", error.message);
  }

  const { error } = await db.from("treasure_rooms").update({
    status: "waiting",
    started_at: new Date().toISOString(),
    winner_player_id: null,
    winner_name: null,
    winner_role: null
  }).eq("room_code", code);

  if (error) return say("gameMessage", error.message);

  collectedChests = new Set();
  createWorldItems();

  $("finalResult").hidden = true;
  say("timerDisplay", "05:00");
  say("gameMessage", "Carrera reiniciada. ¡Los dos deben marcar listo!");

  await loadRoom();
}

/* SALIR */

async function leave() {
  if (!me) return;

  if (channel) await db.removeChannel(channel);
  if (frame) cancelAnimationFrame(frame);
  if (timer) clearInterval(timer);

  const { error } = await db.from("treasure_players")
    .delete()
    .eq("id", me.id);

  if (error) return say("gameMessage", error.message);

  me = null;
  players = [];
  room = null;
  collectedChests = new Set();
  chestElements = [];

  $("waitingRoom").hidden = true;
  $("pirateA").hidden = true;
  $("pirateB").hidden = true;
  $("finalResult").hidden = true;

  say("playerInfo", "Has salido de la isla.");
}

/* CONTROLES */

function controls() {
  $("signUpButton").onclick = register;
  $("loginButton").onclick = login;
  $("logoutButton").onclick = logout;
  $("joinButton").onclick = join;
  $("readyButton").onclick = ready;
  $("restartButton").onclick = restart;
  $("leaveButton").onclick = leave;

  window.addEventListener("keydown", e => {
    if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(e.key)) {
      e.preventDefault();
    }

    keys.add(e.key);

    if ((e.key === "ArrowUp" || e.key === " ") && !jumping) {
      jumping = true;
      jumpHeight = 45;

      setTimeout(() => {
        jumpHeight = 0;
        jumping = false;
      }, 350);
    }
  });

  window.addEventListener("keyup", e => keys.delete(e.key));
  window.addEventListener("blur", () => keys.clear());

  document.querySelectorAll("[data-move]").forEach(btn => {
    const dir = btn.dataset.move;

    btn.addEventListener("pointerdown", e => {
      e.preventDefault();

      if (dir === "left") keys.add("ArrowLeft");
      if (dir === "right") keys.add("ArrowRight");

      if (dir === "up" && !jumping) {
        jumping = true;
        jumpHeight = 45;

        setTimeout(() => {
          jumpHeight = 0;
          jumping = false;
        }, 350);
      }
    });

    const stop = () => {
      keys.delete("ArrowLeft");
      keys.delete("ArrowRight");
    };

    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointerleave", stop);
    btn.addEventListener("pointercancel", stop);
  });
}

/* INICIO */

async function start() {
  controls();

  const { data, error } = await db.auth.getSession();

  if (error) say("authStatus", error.message);

  user = data.session?.user || null;

  await authUI();

  db.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    authUI();
  });

  say("connectionStatus", "Supabase conectado");
}

document.addEventListener("DOMContentLoaded", start);
