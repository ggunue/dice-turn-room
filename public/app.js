const $ = (selector) => document.querySelector(selector);

const state = {
  roomId: new URLSearchParams(location.search).get("room") || "",
  playerId: localStorage.getItem("diceTurnPlayerId") || "",
  name: localStorage.getItem("diceTurnName") || "",
  room: null,
  events: null
};

const joinForm = $("#joinForm");
const nameInput = $("#nameInput");
const roomInput = $("#roomInput");
const diceCount = $("#diceCount");
const diceCountValue = $("#diceCountValue");
const diceSides = $("#diceSides");
const rollButton = $("#rollButton");
const nextButton = $("#nextButton");
const copyLink = $("#copyLink");
const roomCodeBadge = $("#roomCodeBadge");
const joinStatusBadge = $("#joinStatusBadge");
const turnStatusBadge = $("#turnStatusBadge");
const topPlayers = $("#topPlayers");
const diceStage = $("#diceStage");
const activePlayer = $("#activePlayer");
const players = $("#players");
const log = $("#log");
const rollSummary = $("#rollSummary");

nameInput.value = state.name;
roomInput.value = state.roomId;
roomInput.title = "영문과 숫자로 된 6자리 코드를 입력하세요. 없는 방이면 첫 입장자가 방장이 됩니다.";

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  }).then(async (response) => {
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "요청에 실패했습니다.");
    return data;
  });
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp);
}

function saveIdentity(playerId, name) {
  state.playerId = playerId;
  state.name = name;
  localStorage.setItem("diceTurnPlayerId", playerId);
  localStorage.setItem("diceTurnName", name);
}

function normalizeRoomCode(code) {
  return String(code || "").trim().toUpperCase();
}

function isValidRoomCode(code) {
  return /^[A-Z0-9]{6}$/.test(code);
}

function connectEvents() {
  if (state.events) state.events.close();
  state.events = new EventSource(`/api/events?room=${encodeURIComponent(state.roomId)}`);
  state.events.onmessage = (event) => {
    state.room = JSON.parse(event.data);
    render();
  };
}

function dieText(value, sides) {
  if (!value) return "?";
  return String(value);
}

function makeFace(label, name) {
  const face = document.createElement("span");
  face.className = `face ${name}`;
  face.textContent = label;
  return face;
}

function renderDice(room) {
  const values = room.lastRoll?.values || Array.from({ length: room.diceCount }, () => null);
  diceStage.innerHTML = "";

  values.forEach((value, index) => {
    const shell = document.createElement("div");
    const die = document.createElement("div");
    const displayValue = room.rolling ? "?" : dieText(value, room.diceSides);
    const orbit = index - (values.length - 1) / 2;
    const spreadX = ((index * 131) % 560) - 280;
    const spreadY = ((index * 89) % 260) - 130;
    const bounceX = ((index * 197) % 480) - 240;
    const bounceY = ((index * 157) % 240) - 120;

    shell.className = `die-shell${room.rolling ? " rolling" : " settled"}`;
    shell.style.setProperty("--cluster-x", `${orbit * 58}px`);
    shell.style.setProperty("--cluster-y", `${Math.abs(orbit) * 8}px`);
    shell.style.setProperty("--throw-x", `${spreadX}px`);
    shell.style.setProperty("--throw-y", `${spreadY}px`);
    shell.style.setProperty("--bounce-x", `${bounceX}px`);
    shell.style.setProperty("--bounce-y", `${bounceY}px`);
    shell.style.setProperty("--delay", "0ms");

    die.className = "die";
    ["front", "back", "right", "left", "top", "bottom"].forEach((face, faceIndex) => {
      const label = room.rolling ? String(((index + faceIndex) % Math.min(room.diceSides, 6)) + 1) : displayValue;
      die.append(makeFace(label, face));
    });

    shell.append(die);
    diceStage.append(shell);
  });
}

function renderPlayers(room) {
  players.innerHTML = "";

  room.players.forEach((player, index) => {
    const item = document.createElement("li");
    item.className = index === room.activeIndex ? "active" : "";
    const tags = [
      player.id === state.playerId ? "나" : "",
      player.id === room.hostId ? "방장" : ""
    ].filter(Boolean);
    item.innerHTML = `<span class="order">${index + 1}</span><span>${player.name}${tags.length ? ` · ${tags.join(" · ")}` : ""}</span>`;
    players.append(item);
  });
}

function renderTopPlayers(room) {
  topPlayers.innerHTML = "";

  if (!room.players.length) {
    topPlayers.textContent = "입장한 사람이 없습니다.";
    return;
  }

  room.players.forEach((player) => {
    const item = document.createElement("span");
    item.className = player.id === room.activePlayerId ? "active" : "";
    item.textContent = player.name;
    topPlayers.append(item);
  });
}

function logText(entry) {
  if (entry.type === "roll") return `${entry.playerName}: ${entry.values.join(", ")} = ${entry.total}`;
  return "";
}

function renderLog(room) {
  log.innerHTML = "";
  const rolls = room.log.filter((entry) => entry.type === "roll");

  if (!rolls.length) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "아직 기록이 없습니다.";
    log.append(item);
    return;
  }

  [...rolls].reverse().forEach((entry) => {
    const item = document.createElement("li");
    item.textContent = `${entry.playerName}: ${entry.total}`;
    item.title = `${formatTime(entry.at)} · ${logText(entry)}`;
    log.append(item);
  });
}

function renderSummary(room) {
  if (room.rolling) {
    rollSummary.innerHTML = `<span>rolling</span>`;
    return;
  }

  if (!room.lastRoll) {
    rollSummary.innerHTML = `<span>sum</span><strong>-</strong>`;
    return;
  }

  rollSummary.innerHTML = `<span>${room.lastRoll.playerName}</span><strong>${room.lastRoll.total}</strong>`;
}

function render() {
  const room = state.room;
  if (!room) {
    renderDice({ diceCount: 2, diceSides: 6, rolling: false, lastRoll: null });
    roomCodeBadge.textContent = state.roomId ? `방 ${state.roomId}` : "방 없음";
    joinStatusBadge.textContent = "입장 전";
    turnStatusBadge.textContent = "턴 대기";
    copyLink.disabled = !state.roomId;
    rollButton.disabled = true;
    nextButton.disabled = true;
    topPlayers.textContent = "입장한 사람이 없습니다.";
    return;
  }

  const active = room.players[room.activeIndex];
  const me = room.players.find((player) => player.id === state.playerId);
  const isMyTurn = active?.id === state.playerId;
  const hasJoined = Boolean(me);
  const isHost = room.hostId === state.playerId;
  activePlayer.textContent = active ? active.name : "플레이어 입장 대기";
  roomCodeBadge.textContent = `방 ${room.id}`;
  joinStatusBadge.textContent = hasJoined ? `${me.name} 입장 중${isHost ? " · 방장" : ""}` : "입장 전";
  turnStatusBadge.textContent = !hasJoined ? "입장 필요" : isMyTurn ? "내 턴" : `${active?.name || "누군가"} 턴`;
  turnStatusBadge.className = isMyTurn ? "my-turn" : "";
  diceCount.value = room.diceCount;
  diceCountValue.textContent = room.diceCount;
  diceSides.value = String(room.diceSides);
  diceCount.disabled = !isHost;
  diceSides.disabled = !isHost;
  roomInput.value = room.id;
  rollButton.disabled = !isMyTurn || room.rolling;
  rollButton.textContent = room.rolling ? "굴리는 중" : isMyTurn ? "내 턴 굴리기" : "내 턴 대기";
  nextButton.disabled = !isMyTurn || room.rolling;

  renderDice(room);
  renderPlayers(room);
  renderTopPlayers(room);
  renderLog(room);
  renderSummary(room);
}

async function joinRoom(roomId) {
  const normalizedRoom = normalizeRoomCode(roomId);
  if (normalizedRoom && !isValidRoomCode(normalizedRoom)) {
    throw new Error("방 코드는 6자리 영어+숫자로 입력해주세요.");
  }

  const targetRoom = normalizedRoom || (await api("/api/rooms", { method: "POST" })).id;
  const name = nameInput.value.trim() || "Guest";
  const result = await api(`/api/rooms/${targetRoom}/join`, {
    method: "POST",
    body: JSON.stringify({ name, playerId: state.playerId })
  });

  saveIdentity(result.playerId, name);
  state.roomId = result.room.id;
  history.replaceState(null, "", `?room=${encodeURIComponent(state.roomId)}`);
  state.room = result.room;
  connectEvents();
  render();
}

joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await joinRoom(roomInput.value);
  } catch (error) {
    alert(error.message);
  }
});

roomInput.addEventListener("input", () => {
  roomInput.value = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
});

diceCount.addEventListener("input", () => {
  diceCountValue.textContent = diceCount.value;
});

diceCount.addEventListener("change", async () => {
  if (!state.roomId) return;
  await api(`/api/rooms/${state.roomId}/settings`, {
    method: "POST",
    body: JSON.stringify({ playerId: state.playerId, diceCount: diceCount.value, diceSides: diceSides.value })
  });
});

diceSides.addEventListener("change", async () => {
  if (!state.roomId) return;
  await api(`/api/rooms/${state.roomId}/settings`, {
    method: "POST",
    body: JSON.stringify({ playerId: state.playerId, diceCount: diceCount.value, diceSides: diceSides.value })
  });
});

rollButton.addEventListener("click", async () => {
  if (!state.roomId) return;
  try {
    await api(`/api/rooms/${state.roomId}/roll`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId })
    });
  } catch (error) {
    alert(error.message);
  }
});

nextButton.addEventListener("click", async () => {
  if (!state.roomId) return;
  try {
    await api(`/api/rooms/${state.roomId}/next`, {
      method: "POST",
      body: JSON.stringify({ playerId: state.playerId })
    });
  } catch (error) {
    alert(error.message);
  }
});

copyLink.addEventListener("click", async () => {
  if (!state.roomId) return;
  await navigator.clipboard.writeText(location.href);
  copyLink.textContent = "✓";
  setTimeout(() => {
    copyLink.textContent = "↗";
  }, 1200);
});

render();

if (state.roomId) {
  joinRoom(state.roomId).catch(() => render());
}
