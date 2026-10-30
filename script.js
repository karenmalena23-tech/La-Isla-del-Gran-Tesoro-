// ========================================
// TREASURE ISLAND - LABORATORIO 4
// ========================================

// CONFIGURACIÓN DE SUPABASE
// Más adelante colocaremos aquí la URL y la clave publicable.
const SUPABASE_URL = "TU_SUPABASE_URL";
const SUPABASE_KEY = "TU_SUPABASE_PUBLISHABLE_KEY";

let supabase = null;
let currentPlayer = null;
let currentRoom = "isla-principal";
let players = {};
let treasures = [];
let score = 0;
let playerPosition = { x: 25, y: 45 };
let channel = null;

const island = document.getElementById("island");
const pirateA = document.getElementById("pirateA");
const pirateB = document.getElementById("pirateB");
const treasureArea = document.getElementById("treasureArea");

const joinButton = document.getElementById("joinButton");
const findButton = document.getElementById("findTreasureButton");
const message = document.getElementById("gameMessage");
const status = document.getElementById("connectionStatus");

const treasurePositions = [
  { x: 48, y: 25 },
  { x: 75, y: 30 },
  { x: 40, y: 70 },
  { x: 70, y: 75 },
  { x: 18, y: 55 }
];

// CREAR TESOROS INICIALES
function createTreasures() {
  treasures = treasurePositions.map((position, index) => ({
    id: index + 1,
    x: position.x,
    y: position.y,
    found: false
  }));

  renderTreasures();
}

// MOSTRAR TESOROS
function renderTreasures() {
  treasureArea.innerHTML = "";

  treasures.forEach(treasure => {
    if (!treasure.found) {
      const chest = document.createElement("div");
      chest.className = "treasure";
      chest.textContent = "🧰";
      chest.style.left = treasure.x + "%";
      chest.style.top = treasure.y + "%";
      chest.title = "Tesoro escondido";
      treasureArea.appendChild(chest);
    }
  });
}

// ACTUALIZAR MENSAJE
function showMessage(text) {
  message.textContent = text;
}

// ACTUALIZAR JUGADORES
function renderPlayers() {
  const playerList = Object.values(players);

  const red = playerList.find(player => player.role === "red");
  const blue = playerList.find(player => player.role === "blue");

  pirateA.style.display = red ? "grid" : "none";
  pirateB.style.display = blue ? "grid" : "none";

  if (red) {
    pirateA.style.left = red.x + "%";
    pirateA.style.top = red.y + "%";
    document.getElementById("nameA").textContent = red.name;
    document.getElementById("scoreA").textContent = red.score;
  }

  if (blue) {
    pirateB.style.left = blue.x + "%";
    pirateB.style.top = blue.y + "%";
    document.getElementById("nameB").textContent = blue.name;
    document.getElementById("scoreB").textContent = blue.score;
  }
}

// ENTRAR A LA PARTIDA
async function joinGame() {
  const name = document.getElementById("playerName").value.trim();
  const room = document.getElementById("roomCode").value.trim();

  if (!name || !room) {
    showMessage("Escribe tu nombre y el código de la isla.");
    return;
  }

  if (!window.supabase || !SUPABASE_URL.startsWith("https://") ||
      SUPABASE_KEY.includes("TU_SUPABASE")) {
    showMessage("Todavía falta configurar Supabase. Puedes preparar la partida después de configurarlo.");
    status.textContent = "Falta configurar Supabase";
    return;
  }

  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  currentRoom = room;

  try {
    const { data, error } = await supabase
      .from("game_players")
      .select("*")
      .eq("room_code", currentRoom);

    if (error) throw error;

    players = {};
    data.forEach(player => {
      players[player.role] = player;
    });

    let role = data.some(player => player.role === "red") ? "blue" : "red";

    const existing = data.find(player => player.role === role);

    if (existing) {
      showMessage("La isla ya tiene dos jugadores. Prueba otra sala.");
      return;
    }

    currentPlayer = {
      id: crypto.randomUUID(),
      name,
      role,
      x: role === "red" ? 25 : 65,
      y: 45,
      score: 0
    };

    const { error: insertError } = await supabase
      .from("game_players")
      .insert({
        id: currentPlayer.id,
        room_code: currentRoom,
        player_name: currentPlayer.name,
        role: currentPlayer.role,
        x: currentPlayer.x,
        y: currentPlayer.y,
        score: 0
      });

    if (insertError) throw insertError;

    players[role] = {
      ...currentPlayer,
      name: currentPlayer.name
    };

    // Reemplazar los campos que devuelve la base de datos
    players[role].name = currentPlayer.name;

    // Guardar y sincronizar las acciones
    await connectRealtime();

    renderPlayers();

    joinButton.disabled = true;
    status.textContent = "Conectado a la isla";
    showMessage("¡Bienvenido, " + name + "! Eres el pirata " + role + ".");

  } catch (error) {
    console.error(error);
    showMessage("No se pudo entrar. Revisa la configuración de Supabase.");
    status.textContent = "Error de conexión";
  }
}

// CONECTAR REALTIME
async function connectRealtime() {
  channel = supabase.channel("isla-" + currentRoom);

  channel
    .on("broadcast", { event: "player_update" }, ({ payload }) => {
      if (!payload || !payload.role) return;
      players[payload.role] = payload;
      renderPlayers();
    })
    .on("broadcast", { event: "treasure_update" }, ({ payload }) => {
      if (!payload) return;
      treasures = payload.treasures;
      renderTreasures();
    })
    .subscribe();

  await new Promise(resolve => {
    const check = setInterval(() => {
      if (channel.state === "joined") {
        clearInterval(check);
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(check);
      resolve();
    }, 5000);
  });
}

// GUARDAR POSICIÓN Y PUNTOS
async function savePlayer() {
  if (!currentPlayer || !supabase) return;

  const { error } = await supabase
    .from("game_players")
    .update({
      x: currentPlayer.x,
      y: currentPlayer.y,
      score: currentPlayer.score
    })
    .eq("id", currentPlayer.id);

  if (error) console.error(error);

  await channel.send({
    type: "broadcast",
    event: "player_update",
    payload: {
      role: currentPlayer.role,
      name: currentPlayer.name,
      x: currentPlayer.x,
      y: currentPlayer.y,
      score: currentPlayer.score
    }
  });
}

// MOVER PIRATA
async function movePlayer(direction) {
  if (!currentPlayer) {
    showMessage("Primero debes entrar a la isla.");
    return;
  }

  const step = 7;

  if (direction === "up") playerPosition.y -= step;
  if (direction === "down") playerPosition.y += step;
  if (direction === "left") playerPosition.x -= step;
  if (direction === "right") playerPosition.x += step;

  playerPosition.x = Math.max(5, Math.min(90, playerPosition.x));
  playerPosition.y = Math.max(5, Math.min(85, playerPosition.y));

  currentPlayer.x = playerPosition.x;
  currentPlayer.y = playerPosition.y;

  players[currentPlayer.role] = {
    ...currentPlayer,
    name: currentPlayer.name
  };

  renderPlayers();
  await savePlayer();
}

// BUSCAR TESOROS
async function findTreasure() {
  if (!currentPlayer) {
    showMessage("Primero debes entrar a la isla.");
    return;
  }

  const nearby = treasures.find(treasure => {
    const distance = Math.sqrt(
      Math.pow(treasure.x - currentPlayer.x, 2) +
      Math.pow(treasure.y - currentPlayer.y, 2)
    );

    return !treasure.found && distance < 13;
  });

  if (!nearby) {
    showMessage("No hay tesoros cerca. ¡Sigue explorando!");
    return;
  }

  nearby.found = true;
  currentPlayer.score += 10;
  score = currentPlayer.score;

  renderTreasures();

  document.getElementById(
    currentPlayer.role === "red" ? "scoreA" : "scoreB"
  ).textContent = currentPlayer.score;

  const { error } = await supabase
    .from("game_treasures")
    .insert({
      room_code: currentRoom,
      treasure_id: nearby.id,
      player_role: currentPlayer.role,
      player_name: currentPlayer.name
    });

  if (error) {
    console.error(error);
    showMessage("No se pudo guardar el tesoro. Comprueba Supabase.");
    return;
  }

  await channel.send({
    type: "broadcast",
    event: "treasure_update",
    payload: { treasures }
  });

  addActivity(currentPlayer.name + " encontró un tesoro (+10 puntos)");
  await savePlayer();

  showMessage("¡Encontraste un tesoro! +10 puntos 🏆");
}

// HISTORIAL DE ACTIVIDAD
function addActivity(text) {
  const list = document.getElementById("activityList");
  const item = document.createElement("li");

  item.textContent = text;
  list.prepend(item);

  while (list.children.length > 6) {
    list.removeChild(list.lastChild);
  }
}

// BOTONES DE MOVIMIENTO
document.querySelectorAll("[data-move]").forEach(button => {
  button.addEventListener("click", () => {
    movePlayer(button.dataset.move);
  });
});

joinButton.addEventListener("click", joinGame);
findButton.addEventListener("click", findTreasure);

// INICIO DEL JUEGO
createTreasures();

showMessage("¡La isla está lista! Configura Supabase para comenzar.");
pirateA.style.display = "none";
pirateB.style.display = "none";
