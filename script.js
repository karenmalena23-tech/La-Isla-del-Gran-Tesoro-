
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);
const canvas = $("gameCanvas");
const ctx = canvas.getContext("2d");

let user = null;
let roomId = null;
let roomCode = "";
let myPlayer = null;
let players = {};
let channel = null;
let score = 0;
let lastSync = 0;
let gameStarted = false;
let gameWon = false;

const keys = { left: false, right: false, jump: false };

const characters = {
  Nico: { color: "#258bd4", hat: "#f5b83d", face: "🙂" },
  Luna: { color: "#bd72d9", hat: "#ffcfeb", face: "😊" },
  Coco: { color: "#e58b36", hat: "#343b4c", face: "😎" },
  Chispa: { color: "#e58b42", hat: "#fff0c8", face: "🦊" }
};

const platforms = [
  { x: 0, y: 390, w: 960, h: 50 },
  { x: 160, y: 315, w: 145, h: 18 },
  { x: 390, y: 255, w: 150, h: 18 },
  { x: 640, y: 315, w: 150, h: 18 },
  { x: 810, y: 235, w: 120, h: 18 }
];

let coins = [
  { x: 205, y: 275, taken: false },
  { x: 270, y: 275, taken: false },
  { x: 435, y: 215, taken: false },
  { x: 495, y: 215, taken: false },
  { x: 685, y: 275, taken: false },
  { x: 745, y: 275, taken: false },
  { x: 855, y: 195, taken: false },
  { x: 900, y: 195, taken: false },
  { x: 350, y: 355, taken: false },
  { x: 570, y: 355, taken: false }
];

const treasure = { x: 900, y: 350 };

function show(id, text) {
  $(id).textContent = text;
}

function randomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

async function signIn() {
  const { data, error } = await db.auth.getSession();
  if (error) throw error;

  if (data.session) {
    user = data.session.user;
    return;
  }

  const { data: result, error: authError } =
    await db.auth.signInAnonymously();

  if (authError) throw authError;
  user = result.user;
}

function getNickname() {
  const name = $("nickname").value.trim();
  if (!name) throw new Error("Escribe tu nombre antes de continuar.");
  return name;
}

function getCharacter() {
  return $("character").value;
}

async function createGame() {
  try {
    $("createBtn").disabled = true;
    show("menuMessage", "Preparando tu aventura...");

    const nickname = getNickname();
    await signIn();

    roomCode = randomCode();

    const { data, error } = await db.rpc("create_game_room", {
      p_code: roomCode,
      p_nickname: nickname,
      p_character: getCharacter()
    });

    if (error) throw error;

    roomId = data;
    await startGame(nickname);
  } catch (error) {
    show("menuMessage", error.message);
  } finally {
    $("createBtn").disabled = false;
  }
}

async function joinGame() {
  try {
    $("joinBtn").disabled = true;
    show("menuMessage", "Buscando la partida...");

    const nickname = getNickname();
    const code = $("roomCode").value.trim().toUpperCase();

    if (!code) throw new Error("Escribe el código de la partida.");

    await signIn();

    const { data, error } = await db.rpc("join_game_room", {
      p_code: code,
      p_nickname: nickname,
      p_character: getCharacter()
    });

    if (error) throw error;

    roomId = data;
    roomCode = code;
    await startGame(nickname);
  } catch (error) {
    show("menuMessage", error.message);
  } finally {
    $("joinBtn").disabled = false;
  }
}

async function startGame(nickname) {
  const { data, error } = await db
    .from("game_players")
    .select("*")
    .eq("room_id", roomId);

  if (error) throw error;

  const mine = data.find((p) => p.user_id === user.id);
  if (!mine) throw new Error("No se encontró tu personaje en la sala.");

  myPlayer = {
    id: mine.id,
    user_id: mine.user_id,
    nickname,
    character: mine.character,
    x: mine.x,
    y: mine.y,
    vx: 0,
    vy: 0,
    score: mine.score || 0,
    onGround: false
  };

  players = {};
  data.forEach((p) => {
    if (p.user_id !== user.id) {
      players[p.user_id] = {
        user_id: p.user_id,
        nickname: p.nickname,
        character: p.character,
        x: p.x,
        y: p.y,
        score: p.score || 0
      };
    }
  });

  $("menu").classList.add("hidden");
  $("game").classList.remove("hidden");
  show("codeLabel", roomCode);
  show("score", score);
  updatePlayersList();
  subscribeToPlayers();

  gameStarted = true;
  requestAnimationFrame(gameLoop);
}

function subscribeToPlayers() {
  if (channel) db.removeChannel(channel);

  channel = db
    .channel("island-" + roomId)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_players",
        filter: "room_id=eq." + roomId
      },
      (payload) => {
        const p = payload.new;

        if (payload.eventType === "DELETE") {
          delete players[payload.old.user_id];
        } else if (p.user_id !== user.id) {
          players[p.user_id] = {
            user_id: p.user_id,
            nickname: p.nickname,
            character: p.character,
            x: p.x,
            y: p.y,
            score: p.score || 0
          };
        }

        updatePlayersList();
      }
    )
    .subscribe();

  setTimeout(refreshPlayers, 800);
}

async function refreshPlayers() {
  if (!roomId) return;

  const { data, error } = await db
    .from("game_players")
    .select("*")
    .eq("room_id", roomId);

  if (error) return;

  players = {};
  data.forEach((p) => {
    if (p.user_id !== user.id) {
      players[p.user_id] = {
        user_id: p.user_id,
        nickname: p.nickname,
        character: p.character,
        x: p.x,
        y: p.y,
        score: p.score || 0
      };
    }
  });

  updatePlayersList();
}

function updatePlayersList() {
  const all = [
    ...(myPlayer ? [{
      nickname: myPlayer.nickname,
      character: myPlayer.character,
      score
    }] : []),
    ...Object.values(players)
  ];

  $("playersList").innerHTML = "";

  all.forEach((p) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.textContent =
      `${characters[p.character]?.face || "🧑"} ${p.nickname} — ${p.score || 0} monedas`;
    $("playersList").appendChild(chip);
  });

  show(
    "playerStatus",
    all.length >= 2 ? "¡Tu compañero está conectado!" : "Esperando compañero..."
  );
}

function syncPlayer() {
  const now = Date.now();
  if (now - lastSync < 140 || !myPlayer) return;

  lastSync = now;

  db.from("game_players")
    .update({
      x: myPlayer.x,
      y: myPlayer.y,
      score,
      updated_at: new Date().toISOString()
    })
    .eq("id", myPlayer.id)
    .then(({ error }) => {
      if (error) console.warn("No se pudo sincronizar:", error.message);
    });
}

function movePlayer() {
  if (!myPlayer || gameWon) return;

  const speed = 4;
  myPlayer.vx = 0;

  if (keys.left) myPlayer.vx = -speed;
  if (keys.right) myPlayer.vx = speed;

  myPlayer.x += myPlayer.vx;
  myPlayer.x = Math.max(12, Math.min(930, myPlayer.x));

  if (keys.jump && myPlayer.onGround) {
    myPlayer.vy = -12;
    myPlayer.onGround = false;
  }

  myPlayer.vy += 0.55;
  myPlayer.y += myPlayer.vy;
  myPlayer.onGround = false;

  for (const p of platforms) {
    const overlapsX =
      myPlayer.x + 18 > p.x && myPlayer.x - 18 < p.x + p.w;
    const wasAbove = myPlayer.y + 27 - myPlayer.vy <= p.y;
    const isLanding = myPlayer.y + 27 >= p.y;

    if (overlapsX && wasAbove && isLanding && myPlayer.vy >= 0) {
      myPlayer.y = p.y - 27;
      myPlayer.vy = 0;
      myPlayer.onGround = true;
    }
  }

  if (myPlayer.y > 460) {
    myPlayer.x = 80;
    myPlayer.y = 300;
    myPlayer.vy = 0;
  }

  coins.forEach((coin) => {
    if (!coin.taken &&
      Math.abs(myPlayer.x - coin.x) < 25 &&
      Math.abs(myPlayer.y - coin.y) < 30) {
      coin.taken = true;
      score += 1;
      show("score", score);
      show("gameMessage", "¡Encontraste una moneda! 🪙");
      updatePlayersList();
      syncPlayer();
    }
  });

  if (
    score >= 5 &&
    Math.abs(myPlayer.x - treasure.x) < 45 &&
    Math.abs(myPlayer.y - treasure.y) < 55
  ) {
    gameWon = true;
    show("gameMessage", "🎉 ¡Encontraste el gran tesoro! ¡Aventura completada!");
  }

  syncPlayer();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, 440);
  sky.addColorStop(0, "#7bdcf4");
  sky.addColorStop(1, "#d1f4d0");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 960, 440);

  // Sol
  ctx.fillStyle = "#ffe36b";
  ctx.beginPath();
  ctx.arc(820, 75, 38, 0, Math.PI * 2);
  ctx.fill();

  // Nubes
  drawCloud(130, 75);
  drawCloud(480, 95);
  drawCloud(690, 145);

  // Mar
  ctx.fillStyle = "#48c7d8";
  ctx.fillRect(0, 360, 960, 80);

  // Isla
  ctx.fillStyle = "#e8ca81";
  ctx.fillRect(0, 380, 960, 60);
}

function drawCloud(x, y) {
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x, y, 20, 0, Math.PI * 2);
  ctx.arc(x + 23, y - 8, 25, 0, Math.PI * 2);
  ctx.arc(x + 49, y, 20, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlatforms() {
  platforms.forEach((p) => {
    ctx.fillStyle = "#a96b3c";
    ctx.fillRect(p.x, p.y, p.w, p.h);

    ctx.fillStyle = "#5dbb61";
    ctx.fillRect(p.x, p.y, p.w, 8);

    ctx.fillStyle = "#7bd36b";
    for (let x = p.x + 10; x < p.x + p.w; x += 30) {
      ctx.fillRect(x, p.y - 4, 12, 5);
    }
  });
}

function drawCoin(coin) {
  if (coin.taken) return;

  ctx.fillStyle = "#ffcc36";
  ctx.beginPath();
  ctx.arc(coin.x, coin.y, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#e99820";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = "#fff3a5";
  ctx.fillRect(coin.x - 2, coin.y - 6, 4, 12);
}

function drawTreasure() {
  ctx.fillStyle = "#995329";
  ctx.fillRect(treasure.x - 20, treasure.y - 12, 40, 27);

  ctx.fillStyle = "#eebd32";
  ctx.fillRect(treasure.x - 20, treasure.y - 22, 40, 15);

  ctx.fillStyle = "#fff0a0";
  ctx.fillRect(treasure.x - 3, treasure.y - 8, 7, 12);

  ctx.font = "23px Arial";
  ctx.fillText("✨", treasure.x - 12, treasure.y - 28);
}

function drawCharacter(p, isMe) {
  const style = characters[p.character] || characters.Nico;

  // Sombra
  ctx.fillStyle = "rgba(0,0,0,0.15)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 26, 19, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Cuerpo
  ctx.fillStyle = style.color;
  ctx.fillRect(p.x - 13, p.y - 3, 26, 27);

  // Cabeza
  ctx.fillStyle = "#ffd2a3";
  ctx.beginPath();
  ctx.arc(p.x, p.y - 12, 15, 0, Math.PI * 2);
  ctx.fill();

  // Sombrero
  ctx.fillStyle = style.hat;
  ctx.fillRect(p.x - 17, p.y - 29, 34, 7);
  ctx.fillRect(p.x - 11, p.y - 37, 22, 10);

  // Cara
  ctx.font = "15px Arial";
  ctx.textAlign = "center";
  ctx.fillText(style.face, p.x, p.y - 7);

  // Nombre
  ctx.font = "bold 12px Arial";
  ctx.fillStyle = "#24404b";
  ctx.fillText(isMe ? p.nickname + " (tú)" : p.nickname, p.x, p.y - 43);
}

function drawScene() {
  drawBackground();
  drawPlatforms();
  coins.forEach(drawCoin);
  drawTreasure();

  Object.values(players).forEach((p) => drawCharacter(p, false));
  if (myPlayer) drawCharacter(myPlayer, true);

  ctx.textAlign = "left";
  ctx.font = "bold 15px Arial";
  ctx.fillStyle = "#245b4c";
  ctx.fillText("¡Consigue 5 monedas para abrir el tesoro!", 20, 28);
}

function gameLoop() {
  if (!gameStarted) return;

  movePlayer();
  drawScene();
  requestAnimationFrame(gameLoop);
}

function setButtonControl(buttonId, keyName) {
  const button = $(buttonId);

  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    keys[keyName] = true;
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
    button.addEventListener(eventName, () => {
      keys[keyName] = false;
    });
  });
}

window.addEventListener("keydown", (event) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(event.key)) {
    event.preventDefault();
  }

  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = true;
  }

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = true;
  }

  if (
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "w" ||
    event.key === " "
  ) {
    keys.jump = true;
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = false;
  }

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = false;
  }

  if (
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "w" ||
    event.key === " "
  ) {
    keys.jump = false;
  }
});

setButtonControl("leftBtn", "left");
setButtonControl("rightBtn", "right");
setButtonControl("jumpBtn", "jump");

$("createBtn").addEventListener("click", createGame);
$("joinBtn").addEventListener("click", joinGame);

$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(roomCode);
    $("copyBtn").textContent = "¡Copiado!";
  } catch {
    show("gameMessage", "Código de sala: " + roomCode);
  }
});
