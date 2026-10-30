
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

const characters = {
  nico: { emoji: "🧭", color: "#328ac1" },
  luna: { emoji: "🌙", color: "#9463ce" },
  coco: { emoji: "🏴‍☠️", color: "#d45b43" },
  chispa: { emoji: "⚡", color: "#e9a52d" }
};

const levels = [
  { name: "Playa de los Náufragos", icon: "🏖️", mission: "Encuentra el mapa perdido y reúne 5 monedas.", item: "🗺️" },
  { name: "Selva Misteriosa", icon: "🌴", mission: "Encuentra la llave antigua y supera los puentes.", item: "🗝️" },
  { name: "Cueva de los Cristales", icon: "💎", mission: "Reúne 5 cristales mágicos.", item: "💎" },
  { name: "Volcán de Fuego", icon: "🌋", mission: "Supera las trampas y encuentra el emblema.", item: "🔥" },
  { name: "Templo del Gran Tesoro", icon: "🏛️", mission: "Encuentra el tesoro legendario.", item: "👑" }
];

let selectedCharacter = "nico";
let user = null;
let roomId = null;
let roomCode = "";
let channel = null;
let otherPlayer = null;
let running = false;
let level = 0;
let unlocked = 0;
let coins = 0;
let gems = 0;
let hearts = 3;
let collected = new Set();
let hasMissionItem = false;
let levelComplete = false;
let camera = 0;
let lastSync = 0;
let lastAction = 0;
let lastDamage = 0;
let keys = {};
let objects = [];
let enemies = [];
let platforms = [];
let particles = [];
let gameWidth = 2800;

const player = {
  x: 70, y: 300, vx: 0, vy: 0,
  w: 34, h: 48,
  onGround: false,
  facing: 1
};

document.querySelectorAll(".character").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".character")
      .forEach(b => b.classList.remove("selected"));
    button.classList.add("selected");
    selectedCharacter = button.dataset.character;
  });
});

function status(text) {
  $("status").textContent = text;
}

function say(text) {
  $("gameMessage").textContent = text;
}

function nameValue() {
  const name = $("nickname").value.trim();
  if (!name) {
    status("Escribe tu nombre para comenzar.");
    return null;
  }
  return name;
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

async function createRoom() {
  const nickname = nameValue();
  if (!nickname) return;

  try {
    status("🌴 Creando tu aventura...");
    await authenticate();

    roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const { data, error } = await db.rpc("create_game_room", {
      p_code: roomCode,
      p_nickname: nickname,
      p_character: characters[selectedCharacter].emoji
    });

    if (error) throw error;
    roomId = data;
    await enterRoom();
  } catch (error) {
    status("No se pudo crear: " + error.message);
  }
}

async function joinRoom() {
  const nickname = nameValue();
  if (!nickname) return;

  roomCode = $("roomCode").value.trim().toUpperCase();
  if (!roomCode) {
    status("Escribe el código de la sala.");
    return;
  }

  try {
    status("🔎 Buscando la aventura...");
    await authenticate();

    const { data, error } = await db.rpc("join_game_room", {
      p_code: roomCode,
      p_nickname: nickname,
      p_character: characters[selectedCharacter].emoji
    });

    if (error) throw error;
    roomId = data;
    await enterRoom();
  } catch (error) {
    status("No se pudo entrar: " + error.message);
  }
}

async function enterRoom() {
  $("lobby").classList.add("hidden");
  $("mapScreen").classList.remove("hidden");
  $("mapRoom").textContent = "Código de sala: " + roomCode;

  await loadPlayers();
  await connectRealtime();
  updateMap();
}

async function loadPlayers() {
  const { data, error } = await db.from("game_players")
    .select("*").eq("room_id", roomId);

  if (error) {
    $("mapPlayers").textContent = "👥 Error";
    return;
  }

  $("mapPlayers").textContent = "👥 " + data.length + "/2";

  const other = data.find(p => p.user_id !== user.id);
  if (other) {
    otherPlayer = {
      x: Number(other.x) || 100,
      y: Number(other.y) || 300,
      level: Number(other.level) || 0,
      character: other.character || "🌙",
      nickname: other.nickname || "Compañero"
    };
  }
}

async function connectRealtime() {
  if (channel) await db.removeChannel(channel);

  channel = db.channel("treasure-" + roomId);

  channel
    .on("broadcast", { event: "position" }, ({ payload }) => {
      if (!payload || payload.user_id === user.id) return;
      otherPlayer = payload;
    })
    .on("broadcast", { event: "shared_progress" }, ({ payload }) => {
      if (!payload) return;
      applyProgress(payload);
    })
    .on("broadcast", { event: "player_count" }, () => {
      loadPlayers();
    })
    .subscribe(state => {
      if (state === "SUBSCRIBED") {
        broadcast("player_count", {});
        say("🟢 Conectados. ¡La aventura comienza!");
      }
    });
}

function broadcast(event, payload) {
  if (!channel) return;
  channel.send({
    type: "broadcast",
    event,
    payload
  }).catch(console.error);
}

function broadcastPosition() {
  if (!channel || !user) return;

  const now = Date.now();
  if (now - lastSync < 80) return;
  lastSync = now;

  broadcast("position", {
    user_id: user.id,
    x: Math.round(player.x),
    y: Math.round(player.y),
    level,
    character: characters[selectedCharacter].emoji,
    nickname: $("nickname").value.trim()
  });
}

function getProgress() {
  return {
    unlocked,
    coins,
    gems,
    level,
    collected: Array.from(collected),
    hasMissionItem,
    levelComplete
  };
}

function applyProgress(data) {
  if (typeof data.unlocked === "number") unlocked = Math.max(unlocked, data.unlocked);
  if (typeof data.coins === "number") coins = Math.max(coins, data.coins);
  if (typeof data.gems === "number") gems = Math.max(gems, data.gems);

  if (Array.isArray(data.collected)) {
    data.collected.forEach(id => collected.add(id));
  }

  if (data.level === level) {
    hasMissionItem = hasMissionItem || !!data.hasMissionItem;
    levelComplete = levelComplete || !!data.levelComplete;
  }

  updateHUD();
  updateMap();
}

function shareProgress() {
  broadcast("shared_progress", getProgress());
}

function updateMap() {
  $("mapCoins").textContent = "🪙 " + coins;
  $("mapGems").textContent = "💎 " + gems;

  document.querySelectorAll(".island-card").forEach(card => {
    const index = Number(card.dataset.level);
    card.classList.toggle("unlocked", index <= unlocked);
    card.classList.toggle("locked", index > unlocked);
    card.querySelector("small").textContent =
      index <= unlocked ? levels[index].mission : "🔒 Bloqueada";
  });

  $("mapMessage").textContent =
    "Islas desbloqueadas: " + (unlocked + 1) + " de 5.";
}

document.querySelectorAll(".island-card").forEach(card => {
  card.addEventListener("click", () => {
    const index = Number(card.dataset.level);

    if (index > unlocked) {
      $("mapMessage").textContent = "🔒 Completa la isla anterior primero.";
      return;
    }

    startLevel(index);
  });
});

function startLevel(index) {
  level = index;
  player.x = 70;
  player.y = 300;
  player.vx = 0;
  player.vy = 0;
  camera = 0;
  hearts = 3;
  levelComplete = false;
  hasMissionItem = false;
  collected = new Set();

  generateLevel(index);

  $("mapScreen").classList.add("hidden");
  $("gameScreen").classList.remove("hidden");
  $("levelTitle").textContent = levels[index].icon + " " + levels[index].name;
  $("roomTitle").textContent = "Sala: " + roomCode;
  $("questText").textContent = levels[index].mission;

  updateHUD();
  running = true;
  say("¡Explora, encuentra secretos y ayuda a tu compañero!");
  requestAnimationFrame(loop);
}

function generateLevel(index) {
  gameWidth = 2800;
  platforms = [{ x: 0, y: 420, w: gameWidth, h: 80 }];
  objects = [];
  enemies = [];
  particles = [];

  const platformPositions = [
    [240, 340], [500, 285], [790, 350],
    [1060, 300], [1350, 250], [1640, 340],
    [1940, 290], [2240, 330], [2520, 270]
  ];

  platformPositions.forEach(([x, y], i) => {
    platforms.push({ x, y, w: 130 + (i % 3) * 25, h: 18 });
  });

  const itemEmoji = ["🗺️", "🗝️", "💎", "🔥", "👑"][index];

  for (let i = 0; i < 14; i++) {
    objects.push({
      id: "coin-" + index + "-" + i,
      type: "coin",
      x: 180 + i * 175,
      y: 360 - (i % 3) * 55,
      emoji: "🪙"
    });
  }

  for (let i = 0; i < 5; i++) {
    objects.push({
      id: "gem-" + index + "-" + i,
      type: "gem",
      x: 350 + i * 440,
      y: 230 + (i % 2) * 50,
      emoji: "💎"
    });
  }

  objects.push({
    id: "mission-" + index,
    type: "mission",
    x: 2380,
    y: 355,
    emoji: itemEmoji
  });

  for (let i = 0; i < 7; i++) {
    enemies.push({
      x: 400 + i * 340,
      y: 385,
      start: 370 + i * 340,
      end: 540 + i * 340,
      dir: 1,
      alive: true,
      type: index === 3 ? "🔥" : index === 2 ? "🦇" : "👾"
    });
  }

  objects.push({
    id: "exit-" + index,
    type: "exit",
    x: 2670,
    y: 365,
    emoji: index === 4 ? "🏆" : "🚪"
  });
}

function updateHUD() {
  $("hearts").textContent = "❤️".repeat(Math.max(0, hearts)) +
    "🖤".repeat(Math.max(0, 3 - hearts));
  $("coins").textContent = "🪙 " + coins;
  $("gems").textContent = "💎 " + gems;
  $("keys").textContent = hasMissionItem ? "🗝️ 1" : "🗝️ 0";
}

function drawBackground() {
  const colors = [
    ["#62d3e9", "#b8edc8"],
    ["#64c9a2", "#b2df85"],
    ["#403b79", "#8a74b7"],
    ["#ff9d55", "#d95642"],
    ["#5d9ed0", "#b5b6e8"]
  ];

  const gradient = ctx.createLinearGradient(0, 0, 0, 500);
  gradient.addColorStop(0, colors[level][0]);
  gradient.addColorStop(1, colors[level][1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 960, 500);

  ctx.save();
  ctx.translate(-camera * 0.25, 0);

  for (let x = 0; x < gameWidth + 400; x += 380) {
    ctx.fillStyle = level === 3 ? "#a74d42" : "#5cae83";
    ctx.beginPath();
    ctx.moveTo(x, 420);
    ctx.lineTo(x + 170, 170 + (x % 3) * 30);
    ctx.lineTo(x + 340, 420);
    ctx.fill();
  }

  ctx.restore();

  ctx.font = "40px serif";
  ctx.fillText(levels[level].icon, 30, 75);
  ctx.fillText("☁️", 400 - camera * .1 % 100, 90);
}

function drawWorld() {
  drawBackground();
  ctx.save();
  ctx.translate(-camera, 0);

  // Suelo y plataformas
  for (const p of platforms) {
    roundedRect(p.x, p.y, p.w, p.h, 7, level === 3 ? "#914b38" : "#95613e");
    roundedRect(p.x, p.y, p.w, 9, 5, level === 3 ? "#ef7849" : "#58b957");
  }

  // Trampas
  for (let x = 650; x < gameWidth; x += 700) {
    ctx.fillStyle = "#ed6060";
    for (let n = 0; n < 4; n++) {
      ctx.beginPath();
      ctx.moveTo(x + n * 15, 420);
      ctx.lineTo(x + 7 + n * 15, 395);
      ctx.lineTo(x + 15 + n * 15, 420);
      ctx.fill();
    }
  }

  // Objetos
  for (const obj of objects) {
    if (collected.has(obj.id)) continue;
    ctx.font = obj.type === "exit" ? "52px serif" : "31px serif";
    ctx.textAlign = "center";
    ctx.fillText(obj.emoji, obj.x, obj.y);
  }

  // Enemigos
  for (const enemy of enemies) {
    if (!enemy.alive) continue;
    ctx.font = "34px serif";
    ctx.textAlign = "center";
    ctx.fillText(enemy.type, enemy.x, enemy.y);
  }

  // Otro jugador, solo si está en la misma isla
  if (otherPlayer && otherPlayer.level === level) {
    drawCharacter(otherPlayer.x, otherPlayer.y,
      otherPlayer.character, otherPlayer.nickname, false);
  }

  drawCharacter(player.x, player.y,
    characters[selectedCharacter].emoji,
    $("nickname").value, true);

  ctx.restore();
}

function roundedRect(x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawCharacter(x, y, emoji, nickname, isMe) {
  const info = Object.values(characters).find(c => c.emoji === emoji) || characters.nico;

  ctx.fillStyle = "#244d4b55";
  ctx.beginPath();
  ctx.ellipse(x + 17, y + 46, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  roundedRect(x + 5, y + 18, 25, 27, 9, info.color);
  roundedRect(x + 7, y + 39, 8, 9, 3, "#51443a");
  roundedRect(x + 21, y + 39, 8, 9, 3, "#51443a");

  ctx.fillStyle = "#ffcf9d";
  ctx.beginPath();
  ctx.arc(x + 17, y + 14, 13, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "18px serif";
  ctx.textAlign = "center";
  ctx.fillText(emoji, x + 17, y + 12);

  ctx.fillStyle = "#302b29";
  ctx.beginPath();
  ctx.arc(x + 12, y + 15, 1.7, 0, Math.PI * 2);
  ctx.arc(x + 22, y + 15, 1.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "bold 12px Nunito";
  ctx.fillStyle = "#173f39";
  ctx.fillText(isMe ? "TÚ" : nickname, x + 17, y - 6);
}

function movePlayer() {
  const left = keys.ArrowLeft || keys.a || keys.A;
  const right = keys.ArrowRight || keys.d || keys.D;
  const jump = keys.ArrowUp || keys.w || keys.W || keys[" "];

  player.vx = left ? -4.5 : right ? 4.5 : 0;
  if (player.vx !== 0) player.facing = Math.sign(player.vx);

  player.x = Math.max(0, Math.min(gameWidth - player.w, player.x + player.vx));

  player.vy += .58;
  player.y += player.vy;
  player.onGround = false;

  for (const p of platforms) {
    const wasAbove = player.y + player.h - player.vy <= p.y;
    const overlaps = player.x + player.w > p.x && player.x < p.x + p.w;

    if (overlaps && wasAbove &&
        player.y + player.h >= p.y && player.vy >= 0) {
      player.y = p.y - player.h;
      player.vy = 0;
      player.onGround = true;
    }
  }

  if (jump && player.onGround) {
    player.vy = -12;
    player.onGround = false;
  }

  if (player.y > 550) {
    loseHeart("¡Caíste! Intenta de nuevo.");
  }

  // Recoger objetos
  for (const obj of objects) {
    if (collected.has(obj.id)) continue;

    if (Math.abs(player.x - obj.x) < 35 &&
        Math.abs(player.y - obj.y) < 55) {
      if (obj.type === "coin") {
        collected.add(obj.id);
        coins++;
        say("🪙 ¡Moneda encontrada!");
        updateHUD();
        shareProgress();
      } else if (obj.type === "gem") {
        collected.add(obj.id);
        gems++;
        say("💎 ¡Cristal mágico encontrado!");
        updateHUD();
        shareProgress();
      } else if (obj.type === "mission") {
        hasMissionItem = true;
        collected.add(obj.id);
        say("✨ ¡Encontraste el objeto de la misión!");
        shareProgress();
        updateHUD();
      }
    }
  }

  // Enemigos
  for (const enemy of enemies) {
    if (!enemy.alive) continue;

    enemy.x += enemy.dir * 1.1;
    if (enemy.x < enemy.start || enemy.x > enemy.end) {
      enemy.dir *= -1;
    }

    if (Math.abs(player.x - enemy.x) < 30 &&
        Math.abs(player.y - enemy.y) < 40) {
      if (keys.x || keys.X) {
        enemy.alive = false;
        say("✨ ¡Superaste al guardián!");
      } else if (Date.now() - lastDamage > 1200) {
        loseHeart("¡Un guardián te tocó! Evítalo o pulsa X.");
      }
    }
  }

  // Cámara que sigue al jugador
  camera = Math.max(0, Math.min(gameWidth - canvas.width,
    player.x - canvas.width * .42));
}

function loseHeart(message) {
  if (Date.now() - lastDamage < 1200) return;
  lastDamage = Date.now();
  hearts--;
  player.x = Math.max(30, player.x - 100);
  player.y = 300;
  player.vy = 0;
  updateHUD();
  say(message);

  if (hearts <= 0) {
    hearts = 3;
    player.x = 70;
    player.y = 300;
    updateHUD();
    say("💫 Te recuperaste en el punto de inicio. ¡Sigue intentando!");
  }
}

function interact() {
  if (Date.now() - lastAction < 350) return;
  lastAction = Date.now();

  const exit = objects.find(o => o.type === "exit");
  if (!exit || Math.abs(player.x - exit.x) > 65) {
    say("🔍 Sigue explorando. ¡Busca el final de la isla!");
    return;
  }

  if (!hasMissionItem) {
    say("🔒 Todavía falta el objeto de la misión. ¡Explora la isla!");
    return;
  }

  if (!levelComplete) {
    levelComplete = true;
    unlocked = Math.max(unlocked, Math.min(4, level + 1));
    say(level === 4
      ? "🏆 ¡ENCONTRARON EL GRAN TESORO! ¡Aventura completada!"
      : "🎉 ¡Isla completada! ¡La siguiente isla está desbloqueada!");

    shareProgress();
    setTimeout(() => {
      running = false;
      $("gameScreen").classList.add("hidden");
      $("mapScreen").classList.remove("hidden");
      updateMap();
    }, 1700);
  }
}

function loop() {
  if (!running) return;

  movePlayer();
  drawWorld();

  if (keys.e || keys.E) interact();

  broadcastPosition();
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

function returnToMap() {
  running = false;
  $("gameScreen").classList.add("hidden");
  $("mapScreen").classList.remove("hidden");
  updateMap();
}

$("createBtn").addEventListener("click", createRoom);
$("joinBtn").addEventListener("click", joinRoom);
$("mapBtn").addEventListener("click", returnToMap);

async function leaveRoom() {
  running = false;
  if (channel) await db.removeChannel(channel);

  channel = null;
  roomId = null;
  otherPlayer = null;

  $("gameScreen").classList.add("hidden");
  $("mapScreen").classList.add("hidden");
  $("lobby").classList.remove("hidden");
  status("¡Puedes crear otra aventura!");
}

$("exitBtn").addEventListener("click", leaveRoom);
$("backLobby").addEventListener("click", leaveRoom);
