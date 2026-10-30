
const SUPABASE_URL = "https://byvfpocakysizleuzypp.supabase.co";
const SUPABASE_KEY = "sb_publishable_r3qvHV87P1PWrLjs_UfyDA_Mbcb8RYk";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = (id) => document.getElementById(id);

let currentRoom = null;
let currentNickname = "";
let currentUser = null;
let roomChannel = null;

function showMessage(id, text) {
  $(id).textContent = text;
}

function showScreen(screenId) {
  ["home-screen", "room-screen", "game-screen"].forEach((id) => {
    $(id).classList.add("hidden");
  });
  $(screenId).classList.remove("hidden");
}

function getError(error) {
  return error?.message || "Ocurrió un error inesperado.";
}

async function getUser() {
  const { data, error } = await supabaseClient.auth.getUser();
  if (error) throw error;

  if (data.user) return data.user;

  const { data: authData, error: authError } =
    await supabaseClient.auth.signInAnonymously();

  if (authError) throw authError;
  return authData.user;
}

function validateNickname() {
  const nickname = $("nickname").value.trim();

  if (!nickname) {
    showMessage("home-message", "Escribe tu nombre primero.");
    return null;
  }

  return nickname;
}

async function enterRoom(roomId, roomCode, nickname) {
  currentRoom = roomId;
  currentNickname = nickname;
  currentUser = await getUser();

  $("room-code").textContent = roomCode;
  showScreen("room-screen");

  await loadPlayers();
  await loadBoard();
  await loadMessages();

  subscribeToRoom();
}

async function createRoom() {
  const nickname = validateNickname();
  if (!nickname) return;

  try {
    showMessage("home-message", "Creando sala...");
    await getUser();

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data, error } = await supabaseClient.rpc("create_room", {
      p_code: code,
      p_nickname: nickname
    });

    if (error) throw error;

    if (!data) throw new Error("Supabase no devolvió el identificador de la sala.");

    await enterRoom(data, code, nickname);
  } catch (error) {
    showMessage("home-message", "No se pudo crear la sala: " + getError(error));
  }
}

async function joinRoom() {
  const nickname = validateNickname();
  if (!nickname) return;

  const code = $("room-input").value.trim().toUpperCase();

  if (!code) {
    showMessage("home-message", "Escribe el código de la sala.");
    return;
  }

  try {
    showMessage("home-message", "Buscando sala...");
    await getUser();

    const { data, error } = await supabaseClient.rpc("join_room", {
      p_code: code,
      p_nickname: nickname
    });

    if (error) throw error;

    if (!data) throw new Error("No se encontró la sala.");

    await enterRoom(data, code, nickname);
  } catch (error) {
    showMessage("home-message", "No se pudo entrar: " + getError(error));
  }
}

async function loadPlayers() {
  if (!currentRoom) return;

  const { data, error } = await supabaseClient
    .from("players")
    .select("id, nickname, ready, score")
    .eq("room_id", currentRoom);

  if (error) throw error;

  $("players-list").innerHTML = "";
  $("scores-list").innerHTML = "";

  (data || []).forEach((player) => {
    const playerItem = document.createElement("li");
    playerItem.textContent =
      `${player.nickname} — ${player.ready ? "Listo" : "Esperando"}`;
    $("players-list").appendChild(playerItem);

    const scoreItem = document.createElement("li");
    scoreItem.textContent =
      `${player.nickname}: ${player.score ?? 0} puntos`;
    $("scores-list").appendChild(scoreItem);
  });

  const readyCount = (data || []).filter((player) => player.ready).length;
  $("ready-status").textContent =
    `${readyCount} de 2 detectives listos.`;
}

async function setReady() {
  try {
    $("ready-button").disabled = true;

    const { error } = await supabaseClient.rpc("set_player_ready", {
      p_room_id: currentRoom
    });

    if (error) throw error;

    await loadPlayers();
  } catch (error) {
    showMessage("ready-status", "Error: " + getError(error));
  } finally {
    $("ready-button").disabled = false;
  }
}

async function loadBoard() {
  const { data, error } = await supabaseClient
    .from("board_items")
    .select("id, nickname, kind, content, created_at")
    .eq("room_id", currentRoom)
    .order("created_at", { ascending: true });

  if (error) throw error;

  $("board-list").innerHTML = "";

  (data || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `[${item.kind}] ${item.nickname}: ${item.content}`;
    $("board-list").appendChild(li);
  });
}

async function addBoardItem() {
  const content = $("board-content-input").value.trim();
  const kind = $("board-kind").value;

  if (!content) {
    alert("Escribe algo para añadir al tablero.");
    return;
  }

  try {
    const { error } = await supabaseClient.from("board_items").insert({
      room_id: currentRoom,
      user_id: currentUser.id,
      nickname: currentNickname,
      kind,
      content
    });

    if (error) throw error;

    $("board-content-input").value = "";
    await loadBoard();
  } catch (error) {
    alert("No se pudo añadir: " + getError(error));
  }
}

async function loadMessages() {
  const { data, error } = await supabaseClient
    .from("messages")
    .select("id, nickname, content, created_at")
    .eq("room_id", currentRoom)
    .order("created_at", { ascending: true });

  if (error) throw error;

  $("chat-list").innerHTML = "";

  (data || []).forEach((message) => {
    const p = document.createElement("p");
    p.textContent = `${message.nickname}: ${message.content}`;
    $("chat-list").appendChild(p);
  });

  $("chat-list").scrollTop = $("chat-list").scrollHeight;
}

async function sendMessage() {
  const content = $("chat-input").value.trim();

  if (!content) return;

  try {
    const { error } = await supabaseClient.from("messages").insert({
      room_id: currentRoom,
      user_id: currentUser.id,
      nickname: currentNickname,
      content
    });

    if (error) throw error;

    $("chat-input").value = "";
    await loadMessages();
  } catch (error) {
    alert("No se pudo enviar el mensaje: " + getError(error));
  }
}

async function submitConclusion() {
  const suspect = $("final-suspect").value;
  const reason = $("final-reason").value.trim();

  if (!suspect || !reason) {
    showMessage("final-message", "Elijan un sospechoso y expliquen su respuesta.");
    return;
  }

  try {
    const { error } = await supabaseClient.rpc("submit_guess", {
      p_room_id: currentRoom,
      p_suspect: suspect
    });

    if (error) throw error;

    const { error: boardError } = await supabaseClient
      .from("board_items")
      .insert({
        room_id: currentRoom,
        user_id: currentUser.id,
        nickname: currentNickname,
        kind: "teoria",
        content: `Conclusión del equipo: ${suspect}. ${reason}`
      });

    if (boardError) throw boardError;

    showMessage(
      "final-message",
      "¡Respuesta enviada! Actualizando puntuaciones..."
    );

    await loadBoard();
    await loadPlayers();
  } catch (error) {
    showMessage("final-message", "No se pudo enviar: " + getError(error));
  }
}

function subscribeToRoom() {
  if (roomChannel) {
    supabaseClient.removeChannel(roomChannel);
  }

  roomChannel = supabaseClient
    .channel("room-" + currentRoom)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "players",
        filter: "room_id=eq." + currentRoom
      },
      async () => {
        await loadPlayers();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "board_items",
        filter: "room_id=eq." + currentRoom
      },
      async () => {
        await loadBoard();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "messages",
        filter: "room_id=eq." + currentRoom
      },
      async () => {
        await loadMessages();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "rooms",
        filter: "id=eq." + currentRoom
      },
      (payload) => {
        if (payload.new.status === "playing") {
          showScreen("game-screen");
        }
      }
    )
    .subscribe();
}

$("create-button").addEventListener("click", createRoom);
$("join-button").addEventListener("click", joinRoom);
$("ready-button").addEventListener("click", setReady);
$("add-board-button").addEventListener("click", addBoardItem);
$("send-button").addEventListener("click", sendMessage);
$("submit-conclusion").addEventListener("click", submitConclusion);

$("copy-button").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("room-code").textContent);
    $("copy-button").textContent = "¡Código copiado!";
  } catch {
    showMessage("ready-status", "No se pudo copiar. Anota el código manualmente.");
  }
});
