
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

const characterInfo = {
  nico: { emoji: "🧭", color: "#2788c5", name: "Nico" },
  luna: { emoji: "🌙", color: "#9060c9", name: "Luna" },
  coco: { emoji: "🏴‍☠️", color: "#d45b43", name: "Capitán Coco" },
  chispa: { emoji: "⚡", color: "#edaa26", name: "Chispa" }
};

let selectedCharacter = "nico";
let user = null;
let roomId = null;
let roomCode = "";
let channel = null;
let otherPlayer = null;
let running = false;
let hasKey = false;
let openedChest = false;
let gems = 0;
let lastSync = 0;
let lastAction = 0;
let keys = {};

const player = {
  x: 80, y: 340, vx: 0, vy: 0,
  width: 34, height: 48,
  onGround: false
};

const platforms = [
  { x: 0, y: 405, w: 960, h: 75 },
  { x: 200, y: 330, w: 130, h: 18 },
  { x: 390, y: 275, w: 140, h: 18 },
  { x: 610, y: 325, w: 130, h: 18 },
  { x: 790, y: 265, w: 110, h: 18 }
];

const traps = [
  { x: 350, y: 390, w: 38 },
  { x: 555, y: 390, w: 38 }
];

const gemItems = [
  { x: 245, y: 295, taken: false },
  { x: 430, y: 240, taken: false },
  { x: 650, y: 290, taken: false },
  { x: 830, y: 230, taken: false }
];

const keyItem = { x: 470, y: 235, found: false };
const chest = { x: 865, y: 365 };

function say(text) {
  $("message").textContent = text;
}

document.querySelectorAll(".character-card").forEach(card => {
  card.addEventListener("click", () => {
    document.querySelectorAll(".character-card")
      .forEach(c => c.classList.remove("selected"));

    card.classList.add("selected");
    selectedCharacter = card.dataset.character;
  });
});

function setStatus(text) {
  $("status").textContent = text;
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

function getName() {
  const name = $("nickname").value.trim();
  if (!name) {
    setStatus("¡Escribe tu nombre antes de comenzar!");
    return null;
  }
  return name;
}

async function createRoom() {
  const nickname = getName();
  if (!nickname) return;

  try {
    setStatus("🌴 Preparando la isla...");
    await authenticate();

    roomCode = Math.random().toString(36).slice(2, 8).toUpperCase();

    const { data, error } = await db.rpc("create_game_room", {
      p_code: roomCode,
      p_nickname: nickname,
      p_character: characterInfo[selectedCharacter].emoji
    });

    if (error) throw error;

    roomId = data;
    await enterGame();
  } catch (error) {
    setStatus("No se pudo crear la sala: " + error.message);
  }
}

async function joinRoom() {
  const nickname = getName();
  if (!nickname) return;

  roomCode = $("roomCode").value.trim().toUpperCase();
  if (!roomCode) {
    setStatus("Escribe el código de la aventura.");
    return;
  }

  try {
    setStatus("🔎 Buscando la isla...");
    await authenticate();

    const { data, error } = await db.rpc("join_game_room", {
      p_code: roomCode,
      p_nickname: nickname,
      p_character: characterInfo[selectedCharacter].emoji
    });

    if (error) throw error;

    roomId = data;
    await enterGame();
  } catch (error) {
    setStatus("No se pudo entrar: " + error.message);
  }
}

async function enterGame() {
  $("lobby").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("roomLabel").textContent = "Código: " + roomCode;
  player.x = 80;
  player.y = 340;
  player.vy = 0;

  say("¡La isla está llena de secretos! Encuentra la llave.");

  await loadPlayers();
  subscribeToPlayers();

  running = true;
  requestAnimationFrame(loop);
}

async function loadPlayers() {
  const { data, error } = await db.from("game_players")
    .select("*")
    .eq("room_id", roomId);

  if (error) {
    say("Error cargando jugadores: " + error.message);
    return;
  }

  const others = data.filter(p => p.user_id !== user.id);

  if (others.length) {
    otherPlayer = {
      x: Number(others[0].x) || 150,
      y: Number(others[0].y) || 340,
      character: others[0].character || "🌙",
      nickname: others[0].nickname || "Explorador"
    };
  } else {
    otherPlayer = null;
  }

  $("playersLabel").textContent = "👥 " + data.length + "/2";
}

function subscribeToPlayers() {
  if (channel) db.removeChannel(channel);

  channel = db.channel("island-" + roomId)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_players",
      filter: "room_id=eq." + roomId
    }, payload => {
      if (payload.new && payload.new.user_id !== user.id) {
        otherPlayer = {
          x: Number(payload.new.x) || 150,
          y: Number(payload.new.y) || 340,
          character: payload.new.character || "🌙",
          nickname: payload.new.nickname || "Explorador"
        };
        loadPlayers();
      }
    })
    .subscribe();
}

async function syncPlayer() {
  if (!roomId || !user) return;

  const now = Date.now();
  if (now - lastSync < 150) return;
  lastSync = now;

  const { error } = await db.from("game_players").upsert({
    room_id: roomId,
    user_id: user.id,
    nickname: $("nickname").value.trim(),
    character: characterInfo[selectedCharacter].emoji,
    x: Math.round(player.x),
    y: Math.round(player.y)
  }, { onConflict: "room_id,user_id" });

  if (error) console.error(error.message);
}

function roundedRect(x, y, w, h, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawSky() {
  const sky = ctx.createLinearGradient(0, 0, 0, 480);
  sky.addColorStop(0, "#59c9ed");
  sky.addColorStop(1, "#d7f4d5");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 480);

  // Sol
  ctx.fillStyle = "#ffe37b";
  ctx.beginPath();
  ctx.arc(810, 78, 42, 0, Math.PI * 2);
  ctx.fill();

  // Nubes
  for (const [x, y] of [[100, 90], [390, 65], [650, 140]]) {
    ctx.fillStyle = "#ffffffd9";
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.arc(x + 25, y - 9, 28, 0, Math.PI * 2);
    ctx.arc(x + 52, y, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  // Montañas
  ctx.fillStyle = "#75bd94";
  for (let x = -50; x < 1000; x += 230) {
    ctx.beginPath();
    ctx.moveTo(x, 405);
    ctx.lineTo(x + 110, 185);
    ctx.lineTo(x + 240, 405);
    ctx.fill();
  }

  // Palmeras
  for (const x of [75, 170, 740, 940]) {
    ctx.fillStyle = "#98613b";
    ctx.fillRect(x, 300, 13, 110);
    ctx.fillStyle = "#238a55";

    for (let a = 0; a < 5; a++) {
      ctx.save();
      ctx.translate(x + 7, 303);
      ctx.rotate(a * Math.PI * 0.4);
      ctx.beginPath();
      ctx.ellipse(0, -28, 12, 34, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Cueva
  ctx.fillStyle = "#8c6042";
  ctx.beginPath();
  ctx.arc(870, 407, 66, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(804, 407, 132, 35);

  ctx.fillStyle = "#292b48";
  ctx.beginPath();
  ctx.arc(870, 410, 43, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(827, 410, 86, 30);
}

function drawWorld() {
  drawSky();

  // Suelo y plataformas
  for (const p of platforms) {
    roundedRect(p.x, p.y, p.w, p.h, 6, "#9b633d");
    roundedRect(p.x, p.y, p.w, 9, 5, "#58b957");
    ctx.fillStyle = "#8cdb64";
    for (let x = p.x + 12; x < p.x + p.w; x += 28) {
      ctx.fillRect(x, p.y - 3, 5, 5);
    }
  }

  // Trampas
  for (const t of traps) {
    ctx.fillStyle = "#ef6464";
    for (let x = t.x; x < t.x + t.w; x += 13) {
      ctx.beginPath();
      ctx.moveTo(x, 405);
      ctx.lineTo(x + 7, 386);
      ctx.lineTo(x + 14, 405);
      ctx.fill();
    }
  }

  // Gemas
  for (const g of gemItems) {
    if (g.taken) continue;
    ctx.font = "27px serif";
    ctx.fillText("💎", g.x, g.y);
  }

  if (!keyItem.found) {
    ctx.font = "30px serif";
    ctx.fillText("🗝️", keyItem.x, keyItem.y);
  }

  ctx.font = "44px serif";
  ctx.fillText(openedChest ? "📦" : "🧰", chest.x, chest.y);
}

function drawCharacter(x, y, character, nickname, isMe) {
  const info = Object.values(characterInfo)
    .find(c => c.emoji === character) || characterInfo.nico;

  // Sombra
  ctx.fillStyle = "#245b4b55";
  ctx.beginPath();
  ctx.ellipse(x + 17, y + 46, 17, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cuerpo
  roundedRect(x + 5, y + 18, 25, 27, 9, info.color);

  // Piernas
  roundedRect(x + 7, y + 39, 8, 9, 3, "#51443a");
  roundedRect(x + 21, y + 39, 8, 9, 3, "#51443a");

  // Cabeza
  ctx.fillStyle = "#ffcf9d";
  ctx.beginPath();
  ctx.arc(x + 17, y + 14, 13, 0, Math.PI * 2);
  ctx.fill();

  // Pelo
  ctx.fillStyle = "#51352c";
  ctx.beginPath();
  ctx.arc(x + 17, y + 9, 13, Math.PI, Math.PI * 2);
  ctx.fill();

  // Accesorio del personaje
  ctx.font = "19px serif";
  ctx.textAlign = "center";
  ctx.fillText(character, x + 17, y + 12);

  // Ojos
  ctx.fillStyle = "#302b29";
  ctx.beginPath();
  ctx.arc(x + 12, y + 15, 1.8, 0, Math.PI * 2);
  ctx.arc(x + 22, y + 15, 1.8, 0, Math.PI * 2);
  ctx.fill();

  // Nombre
  ctx.font = "bold 12px Nunito";
  ctx.fillStyle = "#174c43";
  ctx.fillText(isMe ? "TÚ" : (nickname || "Compañero"), x + 17, y - 5);
}

function updatePlayer() {
  const left = keys.ArrowLeft || keys.a || keys.A;
  const right = keys.ArrowRight || keys.d || keys.D;
  const jump = keys.ArrowUp || keys.w || keys.W || keys[" "];

  player.vx = left ? -4 : right ? 4 : 0;
  player.x = Math.max(0, Math.min(925, player.x + player.vx));

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
    say("¡Ups! Vuelve a intentarlo.");
  }

  for (const t of traps) {
    if (player.x + 27 > t.x && player.x < t.x + t.w &&
        player.y + player.height > t.y) {
      player.x = 80;
      player.y = 340;
      player.vy = 0;
      say("¡Cuidado con las trampas! Salta sobre ellas.");
    }
  }

  for (const g of gemItems) {
    if (!g.taken && Math.abs(player.x - g.x) < 28 &&
        Math.abs(player.y - g.y) < 42) {
      g.taken = true;
      gems++;
      $("gemLabel").textContent = "💎 " + gems;
      say("¡Gema encontrada! Sigue buscando.");
    }
  }
}

function interact() {
  if (Date.now() - lastAction < 350) return;
  lastAction = Date.now();

  if (!keyItem.found &&
      Math.abs(player.x - keyItem.x) < 55 &&
      Math.abs(player.y - keyItem.y) < 65) {
    keyItem.found = true;
    hasKey = true;
    $("keyLabel").textContent = "🗝️ Llave encontrada";
    say("¡Encontraste la llave! Ahora ve al cofre.");
    return;
  }

  if (Math.abs(player.x - chest.x) < 65 &&
      Math.abs(player.y - chest.y) < 85) {
    if (!hasKey) {
      say("🔒 El cofre está cerrado. ¡Busca la llave dorada!");
    } else if (!openedChest) {
      openedChest = true;
      say("🎉 ¡LO LOGRARON! ¡Encontraron el Gran Tesoro!");
    } else {
      say("¡El tesoro pertenece a los dos exploradores!");
    }
    return;
  }

  if (player.x > 790 && player.y > 320) {
    say("⛏️ ¡Encontraste la entrada de la cueva!");
  } else {
    say("🔍 Aquí no hay nada. ¡Sigue explorando!");
  }
}

function loop() {
  if (!running) return;

  updatePlayer();
  drawWorld();

  drawCharacter(
    player.x, player.y,
    characterInfo[selectedCharacter].emoji,
    $("nickname").value,
    true
  );

  if (otherPlayer) {
    drawCharacter(
      otherPlayer.x, otherPlayer.y,
      otherPlayer.character,
      otherPlayer.nickname,
      false
    );
  }

  if (keys.e || keys.E) interact();

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
