
// Treasure Island - Laboratorio 4

const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

const $ = (id) => document.getElementById(id);

const TREASURES = [
  { id: 1, x: 18, y: 25 },
  { id: 2, x: 48, y: 18 },
  { id: 3, x: 76, y: 30 },
  { id: 4, x: 35, y: 72 },
  { id: 5, x: 72, y: 76 }
];

let currentPlayer = null;
let roomCode = "";
let roomPlayers = [];
let roomClaims = [];
let channel = null;
let busy = false;

function setMessage(message) {
  $("gameMessage").textContent = message;
}

function setStatus(message, connected = false) {
  $("connectionStatus").textContent = message;
  $("connectionStatus").style.color =
    connected ? "#a9e6a9" : "#f4ca70";
}

function storageKey(room) {
  return "treasure_island_player_" + room;
}

async function loadRoom() {
  const [playersResult, claimsResult] = await Promise.all([
    supabaseClient.from("treasure_players")
      .select("*").eq("room_code", roomCode),
    supabaseClient.from("treasure_claims")
      .select("*").eq("room_code", roomCode)
      .order("created_at", { ascending: false }).limit(12)
  ]);

  if (playersResult.error) throw playersResult.error;
  if (claimsResult.error) throw claimsResult.error;

  roomPlayers = playersResult.data || [];
  roomClaims = claimsResult.data || [];
  render();
}

function render() {
  const red = roomPlayers.find(p => p.role === "red");
  const blue = roomPlayers.find(p => p.role === "blue");

  $("nameA").textContent = red?.player_name || "Pirata Rojo";
  $("nameB").textContent = blue?.player_name || "Pirata Azul";
  $("scoreA").textContent = red?.score ?? 0;
  $("scoreB").textContent = blue?.score ?? 0;

  if (red) {
    $("pirateA").style.left = red.x + "%";
    $("pirateA").style.top = red.y + "%";
  }

  if (blue) {
    $("pirateB").style.left = blue.x + "%";
    $("pirateB").style.top = blue.y + "%";
  }

  const claimed = new Set(roomClaims.map(c => c.treasure_id));

  $("treasureArea").innerHTML = TREASURES
    .filter(t => !claimed.has(t.id))
    .map(t => `<span class="treasure" style="left:${t.x}%;top:${t.y}%">🧰</span>`)
    .join("");

  const activity = $("activityList");
  activity.innerHTML = "";

  if (!roomClaims.length) {
    const li = document.createElement("li");
    li.textContent = "Los tesoros aparecerán aquí.";
    activity.appendChild(li);
  } else {
    roomClaims.forEach(claim => {
      const li = document.createElement("li");
      li.textContent = claim.player_name + " encontró un tesoro.";
      activity.appendChild(li);
    });
  }
}

async function joinIsland() {
  if (busy) return;

  const playerName = $("playerName").value.trim().slice(0, 20);
  roomCode = $("roomCode").value.trim().toLowerCase()
    .replace(/[^a-z0-9-]/g, "").slice(0, 30);

  if (!playerName || !roomCode) {
    setMessage("Escribe tu nombre y el código de la isla.");
    return;
  }

  busy = true;
  $("joinButton").disabled = true;
  currentPlayer = null;

  try {
    const savedId = localStorage.getItem(storageKey(roomCode));

    if (savedId) {
      const { data, error } = await supabaseClient
        .from("treasure_players")
        .select("*").eq("id", savedId).maybeSingle();

      if (error) throw error;

      if (data) {
        const { data: updated, error: updateError } =
          await supabaseClient.from("treasure_players")
            .update({
              player_name: playerName,
              updated_at: new Date().toISOString()
            })
            .eq("id", savedId).select().single();

        if (updateError) throw updateError;
        currentPlayer = updated;
      }
    }

    if (!currentPlayer) {
      const { data: existing, error } = await supabaseClient
        .from("treasure_players")
        .select("role").eq("room_code", roomCode);

      if (error) throw error;

      const taken = new Set((existing || []).map(p => p.role));
      const role = !taken.has("red") ? "red" :
        (!taken.has("blue") ? "blue" : null);

      if (!role) {
        setMessage("La isla ya tiene dos jugadores. Usa otro código.");
        return;
      }

      const { data, error: insertError } = await supabaseClient
        .from("treasure_players")
        .insert({
          id: crypto.randomUUID(),
          room_code: roomCode,
          player_name: playerName,
          role,
          x: role === "red" ? 15 : 75,
          y: 50,
          score: 0
        }).select().single();

      if (insertError) throw insertError;

      currentPlayer = data;
      localStorage.setItem(storageKey(roomCode), data.id);
    }

    $("playerInfo").textContent =
      "Estás jugando como Pirata " +
      (currentPlayer.role === "red" ? "Rojo" : "Azul") +
      " en " + roomCode;

    await loadRoom();
    subscribeToRoom();
    setMessage("¡Aventura iniciada! Busca los tesoros.");
    setStatus("Conectado a la isla", true);

  } catch (error) {
    console.error(error);
    setStatus("Error de conexión");
    setMessage("No se pudo entrar: " + error.message);
  } finally {
    busy = false;
    $("joinButton").disabled = false;
  }
}

function subscribeToRoom() {
  if (channel) supabaseClient.removeChannel(channel);

  channel = supabaseClient.channel("treasure-room-" + roomCode)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "treasure_players",
      filter: "room_code=eq." + roomCode
    }, () => loadRoom().catch(console.error))
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "treasure_claims",
      filter: "room_code=eq." + roomCode
    }, () => loadRoom().catch(console.error))
    .subscribe(status => {
      if (status === "SUBSCRIBED") {
        setStatus("En línea · " + roomCode, true);
      }
    });
}

async function movePlayer(direction) {
  if (!currentPlayer || busy) {
    if (!currentPlayer) setMessage("Primero entra a la isla.");
    return;
  }

  const steps = {
    up: [0, -8],
    down: [0, 8],
    left: [-8, 0],
    right: [8, 0]
  };

  const delta = steps[direction];
  const x = Math.max(5, Math.min(90, Number(currentPlayer.x) + delta[0]));
  const y = Math.max(8, Math.min(82, Number(currentPlayer.y) + delta[1]));

  busy = true;

  try {
    const { data, error } = await supabaseClient
      .from("treasure_players")
      .update({ x, y, updated_at: new Date().toISOString() })
      .eq("id", currentPlayer.id).select().single();

    if (error) throw error;

    currentPlayer = data;
    await loadRoom();
    setMessage("¡Movimiento guardado!");
  } catch (error) {
    setMessage("Error al mover: " + error.message);
  } finally {
    busy = false;
  }
}

async function findTreasure() {
  if (!currentPlayer || busy) {
    if (!currentPlayer) setMessage("Primero entra a la isla.");
    return;
  }

  const available = TREASURES.filter(
    t => !roomClaims.some(c => c.treasure_id === t.id)
  );

  const nearby = available.find(t =>
    Math.hypot(
      Number(currentPlayer.x) - t.x,
      Number(currentPlayer.y) - t.y
    ) < 17
  );

  if (!nearby) {
    setMessage("No hay un cofre cerca. Sigue explorando.");
    return;
  }

  busy = true;

  try {
    const { error } = await supabaseClient
      .from("treasure_claims")
      .insert({
        room_code: roomCode,
        treasure_id: nearby.id,
        player_role: currentPlayer.role,
        player_name: currentPlayer.player_name
      });

    if (error) throw error;

    const { data, error: updateError } = await supabaseClient
      .from("treasure_players")
      .update({
        score: Number(currentPlayer.score) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("id", currentPlayer.id).select().single();

    if (updateError) throw updateError;

    currentPlayer = data;
    await loadRoom();
    setMessage("¡Encontraste un tesoro! Ganaste un punto.");

  } catch (error) {
    setMessage("Error al guardar tesoro: " + error.message);
  } finally {
    busy = false;
  }
}

$("joinButton").addEventListener("click", joinIsland);
$("findTreasureButton").addEventListener("click", findTreasure);

document.querySelectorAll("[data-move]").forEach(button => {
  button.addEventListener("click", () => {
    movePlayer(button.dataset.move);
  });
});

setStatus("Listo para comenzar");
