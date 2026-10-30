
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

let user = null;
let roomId = null;
let roomCode = "";
let myPlayer = null;
let otherPlayer = null;
let channel = null;
let running = false;
let hasKey = false;
let openedChest = false;
let gems = 0;
let lastSync = 0;
let lastAction = 0;
let keys = {};

const characters = ["🧭", "🌙", "🏴‍☠️", "⚡"];

const player = {
  x: 90, y: 340, vx: 0, vy: 0,
  width: 35, height: 48,
  character: "🧭",
  onGround: false
};

const platforms = [
  { x: 0, y: 405, w: 960, h: 75 },
  { x: 230, y: 330, w: 130, h: 18 },
  { x: 440, y: 275, w: 140, h: 18 },
  { x: 665, y: 335, w: 130, h: 18 },
  { x: 805, y: 265, w: 100, h: 18 }
];

const traps = [
  { x: 380, y: 390, w: 45, h: 15 },
  { x: 610, y: 390, w: 45, h: 15 }
];

const keyItem = { x: 490, y: 235, found: false };
const chest = { x: 855, y: 365 };

let gemsList = [
  { x: 270, y: 295, taken: false },
  { x: 480, y: 240, taken: false },
  { x: 710, y: 300, taken: false },
  { x: 850, y: 230, taken: false }
];

function say(text) {
  $("message").textContent = text;
}

async function authenticate() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;

  if (data.session) {
    user = data.session.user;
  } else {
    const result = await db.auth.signInAnonymously();
    if (result.error) throw result.error;
    user = result.data.user;
  }
}

function validName() {
  const name = $("nickname").value.trim();
  if (!name) {
    $("status").textContent = "Escribe tu nombre primero.";
    return null;
  }
  return name;
}

function makeCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function createRoom() {
  const name = validName();
  if (!name) return;

  try {
    $("status").textContent = "Creando aventura...";
    await authenticate();

    roomCode = makeCode();
    const { data, error } = await db.rpc("create_game_room", {
      p_code: roomCode,
      p_nickname: name,
      p_character: $("character").value
    });

    if (error) throw error;

    roomId = data;
    myPlayer = user.id;
    player.character = $("character").value;
    await enterGame();
  } catch (error) {
    $("status").textContent = "Error: " + error.message;
  }
}

async function joinRoom() {
  const name = validName();
  if (!name) return;

  roomCode = $("roomCode").value.trim().toUpperCase();
  if (!roomCode) {
    $("status").textContent = "Escribe el código de la sala.";
    return;
  }

  try {
    $("status").textContent = "Buscando la aventura...";
    await authenticate();

    const { data, error } = await db.rpc("join_game_room", {
      p_code: roomCode,
      p_nickname: name,
      p_character: $("character").value
    });

    if (error) throw error;

    roomId = data;
    myPlayer = user.id;
    player.character = $("character").value;
    await enterGame();
  } catch (error) {
    $("status").textContent = "No se pudo entrar: " + error.message;
  }
}

async function enterGame() {
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("roomLabel").textContent = "Sala: " + roomCode;
  say("¡A explorar! Busquen la llave de la cueva.");

  await loadPlayers();
  subscribeToPlayers();
  running = true;
  requestAnimationFrame(loop);
}

async function loadPlayers() {
  const { data, error } = await db
    .from("game_players")
    .select("*")
    .eq("room_id", roomId);

  if (error) {
    say("No se pudieron cargar los jugadores: " + error.message);
    return;
  }

  const others = data.filter(p => p.user_id !== myPlayer);
  if (others.length) {
    otherPlayer = {
      x: Number(others[0].x) || 150,
      y: Number(others[0].y) || 340,
      character: others[0].character || "🌙"
    };
  }
  updatePlayerCount(data.length);
}

function updatePlayerCount(count) {
  $("playersLabel").textContent = "Jugadores: " + count + "/2";
}

function subscribeToPlayers() {
  if (channel) db.removeChannel(channel);

  channel = db.channel("room-" + roomId)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_players",
      filter: "room_id=eq." + roomId
    }, payload => {
      const p = payload.new;
      if (!p || p.user_id === myPlayer) return;

      otherPlayer = {
        x: Number(p.x) || 150,
        y: Number(p.y) || 340,
        character: p.character || "🌙"
      };
      loadPlayers();
    })
    .subscribe();
}

async function syncPlayer() {
  if (!roomId || !user) return;

  const now = Date.now();
  if (now - lastSync < 120) return;
  lastSync = now;

  const { error } = await db.from("game_players").upsert({
    room_id: roomId,
    user_id: myPlayer,
    nickname: $("nickname").value.trim(),
    character: player.character,
    x: Math.round(player.x),
    y: Math.round(player.y)
  }, { onConflict: "room_id,user_id" });

  if (error) console.error("Error de sincronización:", error.message);
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, 480);
  sky.addColorStop(0, "#64d5ec");
  sky.addColorStop(1, "#d0f4ce");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 480);

  // Sol
  ctx.fillStyle = "#ffe36c";
  ctx.beginPath();
  ctx.arc(820, 80, 42, 0, Math.PI * 2);
  ctx.fill();

  // Montañas
  ctx.fillStyle = "#7bc9a0";
  for (let x = -40; x < 1000; x += 220) {
    ctx.beginPath();
    ctx.moveTo(x, 405);
    ctx.lineTo(x + 110, 190);
    ctx.lineTo(x + 230, 405);
    ctx.fill();
  }

  // Palmeras
  for (let x of [90, 190, 730, 930]) {
    ctx.fillStyle = "#95613b";
    ctx.fillRect(x, 300, 13, 105);
    ctx.fillStyle = "#238b55";
    for (let a = 0; a < 5; a++) {
      ctx.beginPath();
      ctx.ellipse(x + 6, 300, 12, 40, a * 1.25, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Cueva
  ctx.fillStyle = "#76503f";
  ctx.beginPath();
  ctx.arc(870, 405, 65, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(805, 405, 130, 35);

  ctx.fillStyle = "#302d48";
  ctx.beginPath();
  ctx.arc(870, 410, 43, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(827, 410, 86, 30);
}

function drawPlatforms() {
  for (const p of platforms) {
    ctx.fillStyle = "#a76b3e";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#56b94e";
    ctx.fillRect(p.x, p.y, p.w, 8);
  }

  for (const t of traps) {
    ctx.fillStyle = "#e94f52";
    ctx.beginPath();
    ctx.moveTo(t.x, t.y + t.h);
    ctx.lineTo(t.x + t.w / 2, t.y);
    ctx.lineTo(t.x + t.w, t.y + t.h);
    ctx.fill();
  }
}

function drawPlayer(p, isMe = false) {
  if (!p) return;
  ctx.font = "36px serif";
  ctx.textAlign = "center";
  ctx.fillText(p.character, p.x + 17, p.y + 34);

  if (isMe) {
    ctx.fillStyle = "#174e43";
    ctx.font = "bold 12px Nunito";
    ctx.fillText("TÚ", p.x + 17, p.y - 5);
  }
}

function drawItems() {
  for (const g of gemsList) {
    if (g.taken) continue;
    ctx.font = "24px serif";
    ctx.fillText("💎", g.x, g.y);
  }

  if (!keyItem.found) {
    ctx.font = "29px serif";
    ctx.fillText("🗝️", keyItem.x, keyItem.y);
  }

  ctx.font = "43px serif";
  ctx.fillText(openedChest ? "📦" : "🧰", chest.x, chest.y);
}

function updatePlayer() {
  const left = keys["ArrowLeft"] || keys["a"] || keys["A"];
  const right = keys["ArrowRight"] || keys["d"] || keys["D"];
  const jump = keys["ArrowUp"] || keys["w"] || keys["W"] || keys[" "];

  player.vx = left ? -4 : right ? 4 : 0;
  player.x += player.vx;
  player.x = Math.max(0, Math.min(925, player.x));

  player.vy += 0.55;
  player.y += player.vy;
  player.onGround = false;

  for (const p of platforms) {
    const wasAbove = player.y + player.height - player.vy <= p.y;
    const overlaps = player.x + player.width > p.x &&
      player.x < p.x + p.w;

    if (overlaps && wasAbove &&
        player.y + player.height >= p.y &&
        player.vy >= 0) {
      player.y = p.y - player.height;
      player.vy = 0;
      player.onGround = true;
    }
  }

  if (jump && player.onGround) {
    player.vy = -11;
    player.onGround = false;
  }

  if (player.y > 500) {
    player.x = 80;
    player.y = 340;
    player.vy = 0;
    say("¡Cuidado! Volviste al inicio.");
  }

  for (const t of traps) {
    if (player.x + 28 > t.x && player.x < t.x + t.w &&
        player.y + player.height > t.y) {
      player.x = 80;
      player.y = 340;
      player.vy = 0;
      say("¡Una trampa! Intenta saltarla.");
    }
  }

  for (const g of gemsList) {
    if (!g.taken && Math.abs(player.x - g.x) < 30 &&
        Math.abs(player.y - g.y) < 40) {
      g.taken = true;
      gems++;
      $("gemLabel").textContent = "💎 Gemas: " + gems;
      say("¡Encontraste una gema!");
    }
  }
}

function interact() {
  const now = Date.now();
  if (now - lastAction < 350) return;
  lastAction = now;

  if (!keyItem.found &&
      Math.abs(player.x - keyItem.x) < 55 &&
      Math.abs(player.y - keyItem.y) < 65) {
    keyItem.found = true;
    hasKey = true;
    $("keyLabel").textContent = "🗝️ Llave: encontrada";
    say("¡Conseguiste la llave! Busca el cofre junto a la cueva.");
    return;
  }

  if (Math.abs(player.x - chest.x) < 65 &&
      Math.abs(player.y - chest.y) < 80) {
    if (!hasKey) {
      say("El cofre está cerrado. ¡Necesitas encontrar la llave!");
    } else if (!openedChest) {
      openedChest = true;
      say("🎉 ¡ABRISTE EL GRAN TESORO! ¡Aventura completada!");
    } else {
      say("¡El tesoro es suyo! ¡Lo lograron juntos!");
    }
    return;
  }

  if (player.x > 790 && player.y > 320) {
    say("¡La entrada de la cueva está aquí! Busquen la llave.");
  } else {
    say("No hay nada que abrir aquí. ¡Sigue explorando!");
  }
}

function draw() {
  drawBackground();
  drawPlatforms();
  drawItems();
  drawPlayer(player, true);
  drawPlayer(otherPlayer);
}

function loop() {
  if (!running) return;

  updatePlayer();
  draw();

  if (keys["e"] || keys["E"]) interact();

  syncPlayer();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", e => {
  keys[e.key] = true;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", e => {
  keys[e.key] = false;
});

$("createBtn").addEventListener("click", createRoom);
$("joinBtn").addEventListener("click", joinRoom);

$("leaveBtn").addEventListener("click", async () => {
  running = false;
  if (channel) await db.removeChannel(channel);
  channel = null;
  roomId = null;
  otherPlayer = null;
  $("game").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  say("¡Hasta la próxima aventura!");
});
