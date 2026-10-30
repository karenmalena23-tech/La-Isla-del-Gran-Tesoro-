
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const TREASURES = [
  { id: 1, x: 20, y: 20 },
  { id: 2, x: 75, y: 25 },
  { id: 3, x: 45, y: 65 },
  { id: 4, x: 80, y: 75 }
];

let player = null;
let players = [];
let treasures = [];
let channel = null;

const $ = id => document.getElementById(id);

function showMessage(text) {
  $("gameMessage").textContent = text;
  $("connectionStatus").textContent = text;
}

function render() {
  if (!player) return;

  const red = players.find(p => p.role === "red");
  const blue = players.find(p => p.role === "blue");

  function updatePirate(element, p) {
    if (!p) {
      element.style.display = "none";
      return;
    }
    element.style.display = "block";
    element.style.left = p.x + "%";
    element.style.top = p.y + "%";
  }

  updatePirate($("pirateA"), red);
  updatePirate($("pirateB"), blue);

  $("nameA").textContent = red?.player_name || "Pirata Rojo";
  $("nameB").textContent = blue?.player_name || "Pirata Azul";
  $("scoreA").textContent = red?.score ?? 0;
  $("scoreB").textContent = blue?.score ?? 0;

  const area = $("treasureArea");
  area.innerHTML = "";

  TREASURES.forEach(t => {
    if (treasures.some(found => found.treasure_id === t.id)) return;

    const item = document.createElement("span");
    item.textContent = "💎";
    item.style.position = "absolute";
    item.style.left = t.x + "%";
    item.style.top = t.y + "%";
    item.style.fontSize = "25px";
    area.appendChild(item);
  });

  const list = $("activityList");
  list.innerHTML = "";

  if (treasures.length === 0) {
    list.innerHTML = "<li>Los tesoros aparecerán aquí.</li>";
  } else {
    treasures.slice(-5).reverse().forEach(t => {
      const li = document.createElement("li");
      li.textContent = `${t.player_name} encontró un tesoro`;
      list.appendChild(li);
    });
  }
}

async function loadData() {
  const { data: p, error: pe } = await db
    .from("game_players")
    .select("*")
    .eq("room_code", $("roomCode").value.trim());

  if (pe) throw pe;
  players = p || [];

  const { data: t, error: te } = await db
    .from("game_treasures")
    .select("*")
    .eq("room_code", $("roomCode").value.trim());

  if (te) throw te;
  treasures = t || [];
  render();
}

async function joinGame() {
  try {
    const name = $("playerName").value.trim();
    const room = $("roomCode").value.trim();

    if (!name || !room) {
      showMessage("Escribe tu nombre y el código de la isla.");
      return;
    }

    showMessage("Conectando con la isla...");

    const savedId = localStorage.getItem("treasure_player_id");

    if (savedId) {
      const { data, error } = await db
        .from("game_players")
        .select("*")
        .eq("id", savedId)
        .eq("room_code", room)
        .maybeSingle();

      if (error) throw error;
      player = data;
    }

    if (!player) {
      const { data: occupied, error } = await db
        .from("game_players")
        .select("role")
        .eq("room_code", room);

      if (error) throw error;

      const used = (occupied || []).map(p => p.role);
      const role = !used.includes("red") ? "red" : "blue";

      if (used.includes("red") && used.includes("blue")) {
        throw new Error("Los dos puestos están ocupados. Usa el navegador donde empezaste la partida.");
      }

      const newPlayer = {
        id: crypto.randomUUID(),
        room_code: room,
        player_name: name,
        role,
        x: role === "red" ? 15 : 80,
        y: 50,
        score: 0
      };

      const { data, error: insertError } = await db
        .from("game_players")
        .insert(newPlayer)
        .select()
        .single();

      if (insertError) throw insertError;

      player = data;
      localStorage.setItem("treasure_player_id", player.id);
    } else {
      const { data, error } = await db
        .from("game_players")
        .update({ player_name: name })
        .eq("id", player.id)
        .select()
        .single();

      if (error) throw error;
      player = data;
    }

    await loadData();
    await subscribe();
    showMessage(`¡Bienvenido ${player.player_name}! Eres el pirata ${player.role}.`);
  } catch (error) {
    console.error(error);
    showMessage("Error: " + error.message);
  }
}

async function subscribe() {
  if (channel) await db.removeChannel(channel);

  channel = db.channel("isla-" + $("roomCode").value.trim())
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_players"
    }, () => loadData().catch(console.error))
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_treasures"
    }, () => loadData().catch(console.error))
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        $("connectionStatus").textContent = "Conectado a la isla";
      }
    });
}

async function move(direction) {
  if (!player) {
    showMessage("Primero entra a la isla.");
    return;
  }

  const changes = {
    up: [0, -5],
    down: [0, 5],
    left: [-5, 0],
    right: [5, 0]
  };

  const [dx, dy] = changes[direction];

  const { data, error } = await db
    .from("game_players")
    .update({
      x: Math.max(0, Math.min(95, Number(player.x) + dx)),
      y: Math.max(0, Math.min(90, Number(player.y) + dy))
    })
    .eq("id", player.id)
    .select()
    .single();

  if (error) {
    showMessage(error.message);
    return;
  }

  player = data;
  await loadData();
}

async function findTreasure() {
  if (!player) {
    showMessage("Primero entra a la isla.");
    return;
  }

  const found = TREASURES.find(t =>
    !treasures.some(item => item.treasure_id === t.id) &&
    Math.abs(t.x - Number(player.x)) < 16 &&
    Math.abs(t.y - Number(player.y)) < 16
  );

  if (!found) {
    showMessage("No hay tesoros cerca. ¡Sigue explorando!");
    return;
  }

  const { error } = await db.from("game_treasures").insert({
    room_code: player.room_code,
    treasure_id: found.id,
    player_role: player.role,
    player_name: player.player_name
  });

  if (error) {
    showMessage("Otro jugador encontró ese tesoro primero.");
    await loadData();
    return;
  }

  const { data, error: scoreError } = await db
    .from("game_players")
    .update({ score: Number(player.score) + 1 })
    .eq("id", player.id)
    .select()
    .single();

  if (scoreError) {
    showMessage(scoreError.message);
    return;
  }

  player = data;
  await loadData();
  showMessage("¡Tesoro encontrado! Ganaste un punto.");
}

document.addEventListener("DOMContentLoaded", () => {
  $("joinButton").addEventListener("click", joinGame);
  $("findTreasureButton").addEventListener("click", findTreasure);

  document.querySelectorAll("[data-move]").forEach(button => {
    button.addEventListener("click", () => move(button.dataset.move));
  });

  $("connectionStatus").textContent = "Listo para comenzar";
});
