const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let currentRoom = null;
let currentPlayer = null;
let currentNickname = "";
let channel = null;

const $ = (id) => document.getElementById(id);

function showScreen(screenId) {
  ["home-screen", "room-screen", "game-screen"].forEach(id => {
    $(id).classList.add("hidden");
  });
  $(screenId).classList.remove("hidden");
}

function message(id, text) {
  $(id).textContent = text;
}

async function prepareAuth() {
  const { data: { session }, error } =
    await supabaseClient.auth.getSession();

  if (error) throw error;

  if (!session) {
    const { error: signInError } =
      await supabaseClient.auth.signInAnonymously();

    if (signInError) throw signInError;
  }
}

function getNickname() {
  const name = $("nickname").value.trim();
  if (!name) throw new Error("Escribe tu nombre de detective.");
  return name;
}

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

async function enterRoom(roomId, roomCode) {
  currentRoom = roomId;
  $("room-code").textContent = roomCode;

  showScreen("room-screen");
  await loadPlayers();
  await loadBoard();
  await loadMessages();
  subscribeToRoom();
}

$("create-button").addEventListener("click", async () => {
  try {
    message("home-message", "Creando sala...");
    currentNickname = getNickname();
    await prepareAuth();

    const code = makeCode();
    const { data, error } = await supabaseClient.rpc("create_room", {
      p_code: code,
      p_nickname: currentNickname
    });

    if (error) throw error;

    await enterRoom(data, code);
    message("ready-status", "Comparte el código y espera a tu compañero.");
  } catch (error) {
    message("home-message", error.message);
  }
});

$("join-button").addEventListener("click", async () => {
  try {
    message("home-message", "Buscando sala...");
    currentNickname = getNickname();
    await prepareAuth();

    const code = $("room-input").value.trim().toUpperCase();
    if (!code) throw new Error("Escribe el código de la sala.");

    const { data, error } = await supabaseClient.rpc("join_room", {
      p_code: code,
      p_nickname: currentNickname
    });

    if (error) throw error;

    await enterRoom(data, code);
    message("ready-status", "Ya estás dentro. ¡Saluda a tu compañero!");
  } catch (error) {
    message("home-message", error.message);
  }
});

$("copy-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("room-code").textContent);
    message("ready-status", "¡Código copiado!");
  } catch {
    message("ready-status", "Copia el código manualmente.");
  }
});

async function loadPlayers() {
  const { data, error } = await supabaseClient
    .from("players")
    .select("id, nickname, ready")
    .eq("room_id", currentRoom)
    .order("joined_at");

  if (error) {
    message("ready-status", error.message);
    return;
  }

  $("players-list").innerHTML = "";
  data.forEach(player => {
    const item = document.createElement("div");
    item.className = "player";
    item.textContent =
      `${player.nickname} — ${player.ready ? "✅ Listo" : "⌛ Preparándose"}`;
    $("players-list").appendChild(item);
  });

  const myUser = (await supabaseClient.auth.getUser()).data.user;
  currentPlayer = data.find(p => p.id && p.nickname === currentNickname);

  if (data.length < 2) {
    message("ready-status", "Esperando al segundo detective...");
  } else if (data.every(p => p.ready)) {
    message("ready-status", "¡Los dos están listos! Iniciando...");
  } else {
    message("ready-status", "Cuando ambos estén listos, comenzará el caso.");
  }
}

$("ready-button").addEventListener("click", async () => {
  try {
    $("ready-button").disabled = true;
    const { error } = await supabaseClient.rpc("set_player_ready", {
      p_room_id: currentRoom
    });
    if (error) throw error;
    await loadPlayers();
  } catch (error) {
    message("ready-status", error.message);
  } finally {
    $("ready-button").disabled = false;
  }
});

async function loadBoard() {
  const { data, error } = await supabaseClient
    .from("board_items")
    .select("nickname, kind, content, created_at")
    .eq("room_id", currentRoom)
    .order("created_at");

  if (error) return;

  $("board-list").innerHTML = "";
  data.forEach(addBoardToPage);
}

function addBoardToPage(item) {
  const div = document.createElement("div");
  div.className = "board-item";

  const title = document.createElement("strong");
  title.textContent = `${item.kind.toUpperCase()} · ${item.nickname}`;

  const content = document.createElement("p");
  content.textContent = item.content;

  div.append(title, content);
  $("board-list").appendChild(div);
}

$("add-board-button").addEventListener("click", async () => {
  const content = $("board-content").value.trim();
  if (!content) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient.from("board_items").insert({
      room_id: currentRoom,
      user_id: user.id,
      nickname: currentNickname,
      kind: $("board-kind").value,
      content
    });

    if (error) throw error;
    $("board-content").value = "";
  } catch (error) {
    message("final-message", error.message);
  }
});

async function loadMessages() {
  const { data, error } = await supabaseClient
    .from("messages")
    .select("nickname, content, created_at")
    .eq("room_id", currentRoom)
    .order("created_at");

  if (error) return;

  $("chat-list").innerHTML = "";
  data.forEach(addMessageToPage);
}

function addMessageToPage(item) {
  const div = document.createElement("div");
  div.className = "chat-message";

  const name = document.createElement("strong");
  name.textContent = item.nickname + ": ";

  const content = document.createElement("span");
  content.textContent = item.content;

  div.append(name, content);
  $("chat-list").appendChild(div);
  $("chat-list").scrollTop = $("chat-list").scrollHeight;
}

$("send-button").addEventListener("click", sendMessage);
$("chat-input").addEventListener("keydown", event => {
  if (event.key === "Enter") sendMessage();
});

async function sendMessage() {
  const content = $("chat-input").value.trim();
  if (!content) return;

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient.from("messages").insert({
      room_id: currentRoom,
      user_id: user.id,
      nickname: currentNickname,
      content
    });

    if (error) throw error;
    $("chat-input").value = "";
  } catch (error) {
    message("final-message", error.message);
  }
}

$("submit-conclusion").addEventListener("click", async () => {
  const suspect = $("final-suspect").value.trim();
  const reason = $("final-reason").value.trim();

  if (!suspect || !reason) {
    message("final-message", "Completen el sospechoso y la explicación.");
    return;
  }

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();

    const { error } = await supabaseClient.from("board_items").insert({
      room_id: currentRoom,
      user_id: user.id,
      nickname: currentNickname,
      kind: "teoria",
      content: `CONCLUSIÓN DEL EQUIPO: ${suspect}. ${reason}`
    });

    if (error) throw error;
    message("final-message", "¡Conclusión enviada al tablero compartido!");
  } catch (error) {
    message("final-message", error.message);
  }
});

function subscribeToRoom() {
  if (channel) {
    supabaseClient.removeChannel(channel);
  }

  channel = supabaseClient
    .channel("room-" + currentRoom)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "players",
      filter: "room_id=eq." + currentRoom
    }, loadPlayers)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: "room_id=eq." + currentRoom
    }, event => addMessageToPage(event.new))
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "board_items",
      filter: "room_id=eq." + currentRoom
    }, event => addBoardToPage(event.new))
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "rooms",
      filter: "id=eq." + currentRoom
    }, event => {
      if (event.new.status === "playing") {
        showScreen("game-screen");
      }
    })
    .subscribe();
}
