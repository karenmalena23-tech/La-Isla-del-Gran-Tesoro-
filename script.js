
// ==========================================
// TREASURE ISLAND - LABORATORIO 4
// Supabase + JavaScript Vanilla
// ==========================================
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const ROOM = "isla-principal";
const TREASURES = [
  { id: 1, x: 20, y: 25 },
  { id: 2, x: 75, y: 30 },
  { id: 3, x: 45, y: 70 },
  { id: 4, x: 85, y: 80 }
];

let player = null;
let players = [];
let treasures = [];

const $ = (id) => document.getElementById(id);

function message(text) {
  const el = $("message") || $("status");
  if (el) el.textContent = text;
}

function render() {
  const map = $("gameMap") || $("island") || $("map");
  if (!map) return;

  map.querySelectorAll(".game-player, .game-treasure").forEach(el => el.remove());

  treasures.forEach(t => {
    const item = document.createElement("div");
    item.className = "game-treasure";
    item.textContent = "💎";
    item.style.position = "absolute";
    item.style.left = `${TREASURES.find(x => x.id === t.treasure_id)?.x || 50}%`;
    item.style.top = `${TREASURES.find(x => x.id === t.treasure_id)?.y || 50}%`;
    map.appendChild(item);
  });

  players.forEach(p => {
    const item = document.createElement("div");
    item.className = "game-player";
    item.textContent = p.role === "red" ? "🏴‍☠️" : "⛵";
    item.title = p.player_name;
    item.style.position = "absolute";
    item.style.left = `${p.x}%`;
    item.style.top = `${p.y}%`;
    map.appendChild(item);
  });

  const score = $("score");
  if (score && player) score.textContent = `Puntos: ${player.score}`;
}

async function loadData() {
  const { data: p, error: pe } = await supabaseClient
    .from("game_players")
    .select("*")
    .eq("room_code", ROOM);

  if (pe) throw pe;
  players = p || [];

  const { data: t, error: te } = await supabaseClient
    .from("game_treasures")
    .select("*")
    .eq("room_code", ROOM);

  if (te) throw te;
  treasures = t || [];
  render();
}

async function joinGame() {
  try {
    const nameInput = $("playerName") || $("player-name") || $("name");
    const name = nameInput?.value.trim() || "Pirata";

    message("Conectando...");

    const savedId = localStorage.getItem("treasure_player_id");

    if (savedId) {
      const { data } = await supabaseClient
        .from("game_players")
        .select("*")
        .eq("id", savedId)
        .maybeSingle();

      if (data) player = data;
    }

    if (!player) {
      const { data: existing, error } = await supabaseClient
        .from("game_players")
        .select("role")
        .eq("room_code", ROOM);

      if (error) throw error;

      const used = (existing || []).map(p => p.role);
      const role = !used.includes("red") ? "red" : "blue";

      if (used.includes("red") && used.includes("blue")) {
        throw new Error("La partida ya tiene dos jugadores. Usa otro navegador o recupera tu partida.");
      }

      const newPlayer = {
        id: crypto.randomUUID(),
        room_code: ROOM,
        player_name: name,
        role,
        x: role === "red" ? 15 : 80,
        y: 50,
        score: 0
      };

      const { data, error: insertError } = await supabaseClient
        .from("game_players")
        .insert(newPlayer)
        .select()
        .single();

      if (insertError) throw insertError;

      player = data;
      localStorage.setItem("treasure_player_id", player.id);
    } else {
      const { data, error } = await supabaseClient
        .from("game_players")
        .update({ player_name: name })
        .eq("id", player.id)
        .select()
        .single();

      if (error) throw error;
      player = data;
    }

    await loadData();
    await subscribeToChanges();

    message(`¡Bienvenido, ${player.player_name}! Eres el jugador ${player.role}.`);
    showControls();
  } catch (error) {
    console.error(error);
    message("Error: " + error.message);
  }
}

function showControls() {
  const controls = $("controls");
  if (controls) controls.style.display = "block";
}

async function move(dx, dy) {
  if (!player) return;

  const updated = {
    x: Math.max(0, Math.min(95, Number(player.x) + dx)),
    y: Math.max(0, Math.min(90, Number(player.y) + dy))
  };

  const { data, error } = await supabaseClient
    .from("game_players")
    .update(updated)
    .eq("id", player.id)
    .select()
    .single();

  if (error) {
    message(error.message);
    return;
  }

  player = data;
  await loadData();
}

async function collectTreasure() {
  if (!player) return;

  const available = TREASURES.find(t =>
    !treasures.some(found => found.treasure_id === t.id) &&
    Math.abs(t.x - Number(player.x)) < 16 &&
    Math.abs(t.y - Number(player.y)) < 16
  );

  if (!available) {
    message("Acércate a un tesoro para recogerlo.");
    return;
  }

  const { error } = await supabaseClient
    .from("game_treasures")
    .insert({
      room_code: ROOM,
      treasure_id: available.id,
      player_role: player.role,
      player_name: player.player_name
    });

  if (error) {
    message("Ese tesoro ya fue encontrado.");
    await loadData();
    return;
  }

  const { data, error: updateError } = await supabaseClient
    .from("game_players")
    .update({ score: Number(player.score) + 1 })
    .eq("id", player.id)
    .select()
    .single();

  if (updateError) {
    message(updateError.message);
    return;
  }

  player = data;
  await loadData();
  message("¡Encontraste un tesoro!");
}

async function subscribeToChanges() {
  supabaseClient
    .channel("isla-principal")
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_players",
      filter: `room_code=eq.${ROOM}`
    }, loadData)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "game_treasures",
      filter: `room_code=eq.${ROOM}`
    }, loadData)
    .subscribe();
}

function connectButton(id, callback) {
  const el = $(id);
  if (el) el.addEventListener("click", callback);
}

document.addEventListener("DOMContentLoaded", () => {
  connectButton("joinBtn", joinGame);
  connectButton("join-button", joinGame);
  connectButton("joinGame", joinGame);
  connectButton("up", () => move(0, -5));
  connectButton("down", () => move(0, 5));
  connectButton("left", () => move(-5, 0));
  connectButton("right", () => move(5, 0));
  connectButton("collectBtn", collectTreasure);
  connectButton("collect", collectTreasure);
});
