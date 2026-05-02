const suits = ["♦", "♣", "♥", "♠"];
const comboNames = {
  single: "single",
  pair: "pair",
  triple: "triple",
  straight: "straight",
  flush: "flush",
  fullHouse: "full house",
  fourKind: "four of a kind",
  straightFlush: "straight flush",
  royalFlush: "royal flush",
};

const el = {
  setup: document.getElementById("setup"),
  game: document.getElementById("game"),
  roomPanel: document.getElementById("roomPanel"),
  roomTitle: document.getElementById("roomTitle"),
  roomStatus: document.getElementById("roomStatus"),
  shareLink: document.getElementById("shareLink"),
  copyLinkBtn: document.getElementById("copyLinkBtn"),
  deckPick: document.getElementById("deckPick"),
  autoArrange: document.getElementById("autoArrange"),
  startDeal: document.getElementById("startDeal"),
  turnTitle: document.getElementById("turnTitle"),
  pileLabel: document.getElementById("pileLabel"),
  manualHint: document.getElementById("manualHint"),
  hand: document.getElementById("hand"),
  playBtn: document.getElementById("playBtn"),
  passBtn: document.getElementById("passBtn"),
  arrangeBtn: document.getElementById("arrangeBtn"),
  newGameBtn: document.getElementById("newGameBtn"),
  lastAction: document.getElementById("lastAction"),
  log: document.getElementById("log"),
  player1Wins: document.getElementById("player1Wins"),
  player2Wins: document.getElementById("player2Wins"),
  recordList: document.getElementById("recordList"),
  clearRecordsBtn: document.getElementById("clearRecordsBtn"),
};

const client = {
  roomId: null,
  playerId: null,
  eventSource: null,
  selected: [],
  snapshot: null,
};

function cardText(card) { return `${card.r}${card.s}`; }
function isRed(suit) { return suit === "♦" || suit === "♥"; }
function isBlack(suit) { return suit === "♣" || suit === "♠"; }
function setAction(msg) { el.lastAction.textContent = msg; }

async function request(path, body = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const roomId = params.get("room");
  const playerParam = params.get("player");
  const data = roomId
    ? await request(`/api/rooms/${roomId}/join`, { playerId: playerParam === null ? null : Number(playerParam) })
    : await request("/api/rooms");

  client.roomId = data.roomId;
  client.playerId = data.playerId;
  history.replaceState(null, "", `?room=${client.roomId}&player=${client.playerId}`);
  connectEvents();
}

function shareUrl() {
  const url = new URL(location.href);
  url.search = `?room=${client.roomId}`;
  return url.toString();
}

function connectEvents() {
  client.eventSource?.close();
  client.eventSource = new EventSource(`/events?room=${client.roomId}&player=${client.playerId}`);
  client.eventSource.onmessage = (event) => {
    const previousHand = client.snapshot?.hand || [];
    client.snapshot = JSON.parse(event.data);
    if (previousHand.length !== client.snapshot.hand.length) client.selected = [];
    else client.selected = client.selected.filter((index) => index < client.snapshot.hand.length);
    render();
  };
  client.eventSource.onerror = () => {
    el.roomStatus.textContent = "Connection lost. Reconnecting...";
  };
}

function render() {
  const data = client.snapshot;
  if (!data) return;

  const myName = data.players[client.playerId]?.name || "Spectator";
  el.roomPanel.classList.remove("hidden");
  el.roomTitle.textContent = `Room ${client.roomId} - ${myName}`;
  el.shareLink.value = shareUrl();
  el.roomStatus.textContent = data.roomStatus;
  setAction(data.lastAction || "-");
  renderRecords(data.records);
  renderLog(data.log);

  el.setup.classList.toggle("hidden", data.phase === "play" || data.phase === "ended");
  el.game.classList.toggle("hidden", data.phase !== "play" && data.phase !== "ended");
  el.startDeal.classList.toggle("hidden", data.phase !== "deal");
  el.deckPick.classList.toggle("hidden", data.phase !== "pick");
  renderDeckPick(data);

  if (data.phase === "play" || data.phase === "ended") renderGame(data);
}

function renderDeckPick(data) {
  el.deckPick.innerHTML = "";
  ["Deck A", "Deck B"].forEach((label, deckId) => {
    const button = document.createElement("button");
    button.className = "deck";
    button.textContent = `${label}\n(click to pick)`;
    button.disabled = data.phase !== "pick" || client.playerId > 1;
    button.onclick = () => sendAction("pickDeck", { deckId });
    el.deckPick.appendChild(button);
  });
}

function renderGame(data) {
  const myTurn = data.currentPlayer === client.playerId && data.phase === "play";
  const currentName = data.players[data.currentPlayer]?.name || "Player";
  el.turnTitle.textContent = myTurn ? "Your Turn" : `${currentName}'s Turn`;
  el.pileLabel.textContent = `Pile: ${data.pile ? `${comboNames[data.pile.play.type]} - ${data.pile.cards.map(cardText).join(" ")}` : "none"}`;
  el.manualHint.textContent = data.openingPending
    ? `Opening move must include ${data.openingCard ? cardText(data.openingCard) : "the lowest card"}.`
    : `Opponent has ${data.opponentCardCount} cards.`;

  el.playBtn.disabled = !myTurn;
  el.passBtn.disabled = !myTurn || data.openingPending;
  el.arrangeBtn.disabled = client.playerId > 1;
  el.newGameBtn.classList.toggle("hidden", data.phase !== "ended");
  renderHand(data.hand);
}

function renderHand(hand) {
  el.hand.innerHTML = "";
  el.hand.ondragover = (event) => {
    event.preventDefault();
    if (event.target === el.hand) {
      const firstCard = el.hand.querySelector?.(".card");
      if (firstCard && event.clientX < firstCard.getBoundingClientRect().left + firstCard.offsetWidth / 2) {
        showDropHint(0);
      } else {
        showDropHint(null);
      }
    }
  };
  el.hand.ondragleave = (event) => {
    if (!el.hand.contains(event.relatedTarget)) clearDropHints();
  };
  el.hand.ondrop = (event) => {
    event.preventDefault();
    const from = Number(event.dataTransfer.getData("text/plain"));
    clearDropHints();
    if (Number.isInteger(from)) moveCard(from, hand.length);
  };

  hand.forEach((card, index) => {
    const node = document.createElement("button");
    node.className = `card ${isRed(card.s) ? "red" : ""} ${isBlack(card.s) ? "black" : ""}`;
    if (client.selected.includes(index)) node.classList.add("selected");
    node.innerHTML = `<span class="card-corner"><span>${card.r}</span><span>${card.s}</span></span>`;
    node.draggable = client.playerId <= 1;
    node.onclick = () => toggleSelect(index);
    node.ondragstart = (event) => {
      node.classList.add("dragging");
      el.hand.classList.add("drag-active");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    };
    node.ondragend = () => {
      node.classList.remove("dragging");
      clearDropHints();
    };
    node.ondragover = (event) => {
      event.preventDefault();
      showDropHint(index);
    };
    node.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const from = Number(event.dataTransfer.getData("text/plain"));
      clearDropHints();
      if (Number.isInteger(from)) moveCard(from, index);
    };
    el.hand.appendChild(node);
  });
}

function clearDropHints() {
  el.hand.classList.remove("drag-active", "drop-at-end");
  el.hand.querySelectorAll?.(".drop-gap-before").forEach((card) => card.classList.remove("drop-gap-before"));
}

function showDropHint(index) {
  clearDropHints();
  el.hand.classList.add("drag-active");
  if (index === null) {
    el.hand.classList.add("drop-at-end");
    return;
  }
  el.hand.children[index]?.classList.add("drop-gap-before");
}

function toggleSelect(index) {
  if (client.playerId > 1) return;
  const selectedIndex = client.selected.indexOf(index);
  if (selectedIndex >= 0) client.selected.splice(selectedIndex, 1);
  else client.selected.push(index);
  renderHand(client.snapshot.hand);
}

async function moveCard(from, to) {
  if (from === to || client.playerId > 1) return;
  client.selected = [];
  await sendAction("reorder", { from, to });
}

async function sendAction(type, payload = {}) {
  try {
    await request(`/api/rooms/${client.roomId}/action`, { playerId: client.playerId, type, payload });
  } catch (error) {
    setAction(error.message);
  }
}

function renderLog(log) {
  el.log.innerHTML = "";
  log.forEach((message) => {
    const item = document.createElement("p");
    item.textContent = message;
    el.log.appendChild(item);
  });
}

function renderRecords(records) {
  const totals = [0, 0];
  records.forEach((record) => { if (record.playerId <= 1) totals[record.playerId] += 1; });
  el.player1Wins.textContent = String(totals[0]);
  el.player2Wins.textContent = String(totals[1]);
  el.recordList.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No wins recorded yet.";
    el.recordList.appendChild(empty);
    return;
  }

  records.forEach((record) => {
    const item = document.createElement("p");
    item.textContent = `${record.playerName} won on ${record.date}`;
    el.recordList.appendChild(item);
  });
}

el.startDeal.onclick = () => sendAction("deal", { autoArrange: el.autoArrange.checked });
el.playBtn.onclick = () => {
  const indexes = [...client.selected];
  client.selected = [];
  renderHand(client.snapshot.hand);
  sendAction("play", { indexes });
};
el.passBtn.onclick = () => sendAction("pass");
el.arrangeBtn.onclick = () => {
  client.selected = [];
  sendAction("arrange");
};
el.newGameBtn.onclick = () => {
  client.selected = [];
  sendAction("newGame");
};
el.clearRecordsBtn.onclick = () => sendAction("clearRecords");
el.copyLinkBtn.onclick = async () => {
  el.shareLink.select();
  await navigator.clipboard?.writeText(el.shareLink.value);
};

boot().catch((error) => {
  el.roomStatus.textContent = error.message;
});
