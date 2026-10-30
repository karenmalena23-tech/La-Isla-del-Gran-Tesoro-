
// ==========================================
// TREASURE ISLAND - LABORATORIO 4
// Supabase + JavaScript Vanilla
// ==========================================

// PEGA AQUÍ TUS DATOS DE SUPABASE
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

// CONEXIÓN
const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// ESTADO DEL JUEGO
let currentPlayer = null;
let currentRoom = "isla-principal";
let players = {};
let treasures = [];
let channel = null;

const treasurePositions = [
  { id: 1, x: 48, y: 25 },
  { id: 2, x: 75, y: 30 },
  { id: 3, x: 40, y: 70 },
  { id: 4, x: 70, y: 75 },
  { id: 5, x: 18, y: 55 }
];

// ELEMENTOS HTML
const pirateA = document.getElementById("pirateA");
const pirateB = document.getElementById("pirateB");
const treasureArea = document.getElementById("treasureArea");
const joinButton = document.getElementById("joinButton");
const findButton = document.getElementById("findTreasureButton");
const message = document.getElementById("gameMessage");
const status = document.getElementById("connectionStatus");

// MENSAJES
function showMessage(text) {
  message.textContent = text;
}

// DIBUJAR TESOROS
function renderTreasures() {
  treasureArea.innerHTML = "";

  treasures.forEach(treasure => {
    if (!treasure.found) {
      const chest = document.createElement("div");
      chest.className = "treasure";
      chest.textContent = "🧰";
      chest.style.left = treasure.x + "%";
      chest.style.top = treasure.y + "%";
      treasureArea.appendChild(chest);
    }
  });
}

// DIBUJAR JUGADORES
function renderPlayers() {
  const red = players.red;
  const blue = players.blue;

  pirateA.style.display = red ? "grid" : "none";
  pirateB.style.display = blue ? "grid" : "none";

  if (red) {
    pirateA.style.left = red.x + "%";
    pirateA.style.top = red.y + "%";
    document.getElementById("nameA").textContent =
      red.player_name;
    document.getElementById("scoreA").textContent =
      red.score;
  }

  if (blue) {
    pirateB.style.left = blue.x + "%";
    pirateB.style.top = blue.y + "%";
    document.getElementById("nameB").textContent =
      blue.player_name;
    document.getElementById("scoreB").textContent =
      blue.score;
  }
}

// HISTORIAL
function addActivity(text) {
  const list = document.getElementById("activityList");
  const item = document.createElement("li");

  item.textContent = text;
  list.prepend(item);

  while (list.children.length > 6) {
    list.removeChild(list.lastChild);
  }
}

// CARGAR ESTADO GUARDADO
async function loadGameData() {
  const { data: playerData, error: playerError } =
    await db
      .from("game_players")
      .select("*")
      .eq("room_code", currentRoom);

  if (playerError) throw playerError;

  players = {};

  playerData.forEach(player => {
    players[player.role] = player;
  });

  const { data: treasureData, error: treasureError } =
    await db
      .from("game_treasures")
      .select("*")
      .eq("room_code", currentRoom);

  if (treasureError) throw treasureError;

  treasures = treasurePositions.map(treasure => ({
    ...treasure,
    found: treasureData.some(
      saved => saved.treasure_id === treasure.id
    )
  }));

  treasureData.forEach(saved => {
    addActivity(
      saved.player_name + " encontró un tesoro"
    );
  });

  renderPlayers();
  renderTreasures();
}

// CONECTAR JUGADORES EN TIEMPO REAL
async function connectRealtime() {
  channel = db.channel("isla-" + currentRoom);

  channel
    .on(
      "broadcast",
      { event: "player_update" },
      ({ payload }) => {
        if (!payload) return;

        players[payload.role] = payload;
        renderPlayers();
      }
    )
    .on(
      "broadcast",
      { event: "treasure_update" },
      ({ payload }) => {
        if (!payload) return;

        const treasure = treasures.find(
          item => item.id === payload.treasure_id
        );

        if (treasure && !treasure.found) {
          treasure.found = true;
          renderTreasures();

          addActivity(
            payload.player_name + " encontró un tesoro"
          );
        }
      }
    );

  await new Promise((resolve, reject) => {
    channel.subscribe((state) => {
      if (state === "SUBSCRIBED") resolve();

      if (state === "CHANNEL_ERROR" ||
          state === "TIMED_OUT") {
        reject(new Error("No se pudo conectar Realtime"));
      }
    });
  });
}

// ENTRAR A LA ISLA
async function joinGame() {
  if (currentPlayer) return;

  const name = document
    .getElementById("playerName")
    .value.trim();

  currentRoom = document
    .getElementById("roomCode")
    .value.trim();

  if (!name || !currentRoom) {
    showMessage("Escribe tu nombre y el código de la isla.");
    return;
  }

  if (
    SUPABASE_URL.includes("PEGA_AQUI") ||
    SUPABASE_KEY.includes("PEGA_AQUI")
  ) {
    showMessage("Primero configura los datos de Supabase.");
    return;
  }

  joinButton.disabled = true;
  status.textContent = "Conectando...";

  try {
    // Identificador para recuperar al mismo jugador
    const storageKey = "treasure-player-" + currentRoom;
    let savedId = localStorage.getItem(storageKey);

    let existingPlayer = null;

    if (savedId) {
      const { data } = await db
        .from("game_players")
        .select("*")
        .eq("id", savedId)
        .eq("room_code", currentRoom)
        .maybeSingle();

      existingPlayer = data;
    }

    if (existingPlayer) {
      currentPlayer = existingPlayer;
      currentPlayer.player_name = name;

      const { error } = await db
        .from("game_players")
        .update({ player_name: name })
        .eq("id", currentPlayer.id);

      if (error) throw error;

    } else {
      // Elegir el primer puesto disponible
      const { data, error } = await db
        .from("game_players")
        .select("role")
        .eq("room_code", currentRoom);

      if (error) throw error;

      const occupied = data.map(player => player.role);

      const role = !occupied.includes("red")
        ? "red"
        : !occupied.includes("blue")
        ? "blue"
        : null;

      if (!role) {
        throw new Error("La isla ya tiene dos jugadores.");
      }

      const newPlayer = {
        id: crypto.randomUUID(),
        room_code: currentRoom,
        player_name: name,
        role,
        x: role === "red" ? 25 : 65,
        y: 45,
        score: 0
      };

      const { data: inserted, error: insertError } =
        await db
          .from("game_players")
          .insert(newPlayer)
          .select()
          .single();

      if (insertError) throw insertError;

      currentPlayer = inserted;
      localStorage.setItem(storageKey, inserted.id);
    }

    await loadGameData();
    await connectRealtime();

    status.textContent = "Conectado a la isla";
    showMessage(
      "¡Bienvenido " + name +
      "! Eres el pirata " +
      (currentPlayer.role === "red" ? "rojo" : "azul") + "."
    );

    joinButton.textContent = "¡Estás jugando!";

  } catch (error) {
    console.error(error);
    currentPlayer = null;
    joinButton.disabled = false;
    status.textContent = "Error de conexión";
    showMessage(error.message);
  }
}

// GUARDAR MOVIMIENTO Y PUNTOS
async function savePlayer() {
  if (!currentPlayer) return;

  const { error } = await db
    .from("game_players")
    .update({
      x: currentPlayer.x,
      y: currentPlayer.y,
      score: currentPlayer.score
    })
    .eq("id", currentPlayer.id);

  if (error) {
    console.error(error);
    showMessage("No se pudo guardar el movimiento.");
    return;
  }

  players[currentPlayer.role] = currentPlayer;
  renderPlayers();

  await channel.send({
    type: "broadcast",
    event: "player_update",
    payload: currentPlayer
  });
}

// MOVER PIRATA
async function movePlayer(direction) {
  if (!currentPlayer) {
    showMessage("Primero entra a la isla.");
    return;
  }

  const step = 7;

  if (direction === "up") currentPlayer.y -= step;
  if (direction === "down") currentPlayer.y += step;
  if (direction === "left") currentPlayer.x -= step;
  if (direction === "right") currentPlayer.x += step;

  currentPlayer.x = Math.max(
    5, Math.min(90, currentPlayer.x)
  );

  currentPlayer.y = Math.max(
    5, Math.min(85, currentPlayer.y)
  );

  renderPlayers();
  await savePlayer();
}

// BUSCAR TESOROS
async function findTreasure() {
  if (!currentPlayer) {
    showMessage("Primero entra a la isla.");
    return;
  }

  const nearby = treasures.find(treasure => {
    const distance = Math.hypot(
      treasure.x - currentPlayer.x,
      treasure.y - currentPlayer.y
    );

    return !treasure.found && distance < 13;
  });

  if (!nearby) {
    showMessage("No hay tesoros cerca. ¡Sigue explorando!");
    return;
  }

  // Intentar guardar el tesoro.
  // La restricción UNIQUE evita que se reclame dos veces.
  const { error } = await db
    .from("game_treasures")
    .insert({
      room_code: currentRoom,
      treasure_id: nearby.id,
      player_role: currentPlayer.role,
      player_name: currentPlayer.player_name
    });

  if (error) {
    if (error.code === "23505") {
      nearby.found = true;
      renderTreasures();
      showMessage("¡Ese tesoro ya fue encontrado!");
      return;
    }

    console.error(error);
    showMessage("No se pudo guardar el tesoro.");
    return;
  }

  nearby.found = true;
  currentPlayer.score += 10;

  renderTreasures();

  await savePlayer();

  await channel.send({
    type: "broadcast",
    event: "treasure_update",
    payload: {
      treasure_id: nearby.id,
      player_name: currentPlayer.player_name
    }
  });

  addActivity(
    currentPlayer.player_name + " encontró un tesoro (+10)"
  );

  showMessage("¡Tesoro encontrado! Ganaste 10 puntos.");
}

// BOTONES
document.querySelectorAll("[data-move]").forEach(button => {
  button.addEventListener("click", () => {
    movePlayer(button.dataset.move);
  });
});

joinButton.addEventListener("click", joinGame);
findButton.addEventListener("click", findTreasure);

// INICIO
pirateA.style.display = "none";
pirateB.style.display = "none";

treasures = treasurePositions.map(treasure => ({
  ...treasure,
  found: false
}));

renderTreasures();
showMessage("¡La isla está lista! Entra para jugar.");
