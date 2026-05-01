const suits = ["♦", "♣", "♥", "♠"]; // Big2 suit order
const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

const players = [
  { id: 0, name: "Player 1", hand: [], pickedDeck: null },
  { id: 1, name: "Player 2", hand: [], pickedDeck: null }
];

const state = {
  phase: "pick",
  currentPlayer: 0,
  lastPlayedBy: null,
  pile: null,
  selected: [],
  openingPending: true,
  passCount: 0,
  manualArrange: false,
};

const el = {
  setup: document.getElementById("setup"),
  game: document.getElementById("game"),
  deckPick: document.getElementById("deckPick"),
  autoArrange: document.getElementById("autoArrange"),
  manualArrange: document.getElementById("manualArrange"),
  startDeal: document.getElementById("startDeal"),
  turnTitle: document.getElementById("turnTitle"),
  pileLabel: document.getElementById("pileLabel"),
  manualHint: document.getElementById("manualHint"),
  hand: document.getElementById("hand"),
  playBtn: document.getElementById("playBtn"),
  passBtn: document.getElementById("passBtn"),
  arrangeBtn: document.getElementById("arrangeBtn"),
  lastAction: document.getElementById("lastAction"),
  log: document.getElementById("log"),
};

function createDeck() {
  return suits.flatMap((s) => ranks.map((r) => ({ r, s, value: ranks.indexOf(r) * 4 + suits.indexOf(s) })));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortHand(hand) { hand.sort((a, b) => a.value - b.value); }
function cardText(c) { return `${c.r}${c.s}`; }
function isRed(suit) { return suit === "♦" || suit === "♥"; }

function initDeckPick() {
  el.deckPick.innerHTML = "";
  ["Deck A", "Deck B"].forEach((label, i) => {
    const d = document.createElement("button");
    d.className = "deck";
    d.textContent = `${label}\n(click to assign picker)`;
    d.onclick = () => pickDeck(i);
    d.dataset.deck = i;
    el.deckPick.appendChild(d);
  });
}

function pickDeck(deckId) {
  const unpickedPlayers = players.filter((p) => p.pickedDeck === null);
  if (!unpickedPlayers.length) return;
  const picker = unpickedPlayers[0]; // simulated first click wins
  picker.pickedDeck = deckId;

  const other = players.find((p) => p.id !== picker.id);
  if (other.pickedDeck === null) other.pickedDeck = deckId === 0 ? 1 : 0;

  [...el.deckPick.children].forEach((c) => {
    const isChosen = Number(c.dataset.deck) === deckId || Number(c.dataset.deck) === (deckId === 0 ? 1 : 0);
    c.classList.toggle("selected", isChosen);
    c.classList.add("locked");
    c.disabled = true;
  });
  el.startDeal.disabled = false;
  addLog(`${picker.name} picked ${deckId === 0 ? "Deck A" : "Deck B"}; remaining deck auto-assigned.`);
}

function deal() {
  const deck = shuffle(createDeck());
  players[0].hand = deck.slice(0, 26);
  players[1].hand = deck.slice(26);
  if (el.autoArrange.checked) players.forEach((p) => sortHand(p.hand));

  state.currentPlayer = find3DiamondOwner();
  state.openingPending = true;
  state.pile = null;
  state.lastPlayedBy = null;
  state.passCount = 0;
  state.phase = "play";

  el.setup.classList.add("hidden");
  el.game.classList.remove("hidden");
  render();
  addLog(`Cards dealt. ${players[state.currentPlayer].name} owns 3♦ and must click Play to start.`);
}

function find3DiamondOwner() {
  return players.findIndex((p) => p.hand.some((c) => c.r === "3" && c.s === "♦"));
}

function render() {
  const p = players[state.currentPlayer];
  el.turnTitle.textContent = `${p.name}'s Turn`;
  el.pileLabel.textContent = `Pile: ${state.pile ? state.pile.cards.map(cardText).join(" ") : "none"}`;

  if (state.openingPending) {
    el.manualHint.textContent = "Opening move must include 3♦. Player must manually click Play (not automatic).";
  } else {
    el.manualHint.textContent = "Manual pass required when you cannot beat current hand.";
  }

  el.hand.innerHTML = "";
  p.hand.forEach((card, i) => {
    const node = document.createElement("button");
    node.className = `card ${isRed(card.s) ? "red" : ""}`;
    if (state.selected.includes(i)) node.classList.add("selected");
    node.textContent = cardText(card);
    node.onclick = () => toggleSelect(i);
    el.hand.appendChild(node);
  });
}

function toggleSelect(i) {
  const at = state.selected.indexOf(i);
  if (at >= 0) state.selected.splice(at, 1);
  else state.selected.push(i);
  render();
}

function selectedCards() {
  const p = players[state.currentPlayer];
  return state.selected.map((i) => p.hand[i]).sort((a, b) => a.value - b.value);
}

function validatePlay(cards) {
  if (cards.length !== 1) return { ok: false, msg: "This simple version currently supports single-card plays only." };
  if (state.openingPending && !(cards[0].r === "3" && cards[0].s === "♦")) return { ok: false, msg: "Opening play must be 3♦." };
  if (!state.pile) return { ok: true };
  if (cards[0].value <= state.pile.cards[0].value) return { ok: false, msg: "Card is not higher than pile." };
  return { ok: true };
}

function playSelected() {
  const cards = selectedCards();
  const verdict = validatePlay(cards);
  if (!verdict.ok) return setAction(verdict.msg);

  const p = players[state.currentPlayer];
  const indexes = [...state.selected].sort((a, b) => b - a);
  indexes.forEach((i) => p.hand.splice(i, 1));
  state.pile = { cards, by: p.id };
  state.lastPlayedBy = p.id;
  state.openingPending = false;
  state.passCount = 0;
  state.selected = [];

  addLog(`${p.name} played ${cards.map(cardText).join(" ")}`);

  if (!p.hand.length) {
    setAction(`${p.name} wins!`);
    addLog(`${p.name} won the game.`);
    el.playBtn.disabled = true;
    el.passBtn.disabled = true;
    return;
  }

  nextPlayer();
}

function passTurn() {
  if (state.openingPending) return setAction("Cannot pass opening. Must play 3♦ manually.");
  const p = players[state.currentPlayer];
  addLog(`${p.name} passed.`);
  state.selected = [];
  state.passCount += 1;
  if (state.passCount >= 1) {
    const lead = players[state.lastPlayedBy];
    state.currentPlayer = lead.id;
    state.pile = null;
    state.passCount = 0;
    setAction(`Round reset. ${lead.name} leads next.`);
    render();
    return;
  }
  nextPlayer();
}

function nextPlayer() {
  state.currentPlayer = (state.currentPlayer + 1) % 2;
  setAction("Turn changed.");
  render();
}

function arrangeCurrent() {
  const p = players[state.currentPlayer];
  sortHand(p.hand);
  state.selected = [];
  render();
  setAction("Hand arranged.");
}

function addLog(msg) {
  const item = document.createElement("p");
  item.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  el.log.prepend(item);
}
function setAction(msg) { el.lastAction.textContent = msg; }

el.manualArrange.onclick = () => {
  state.manualArrange = !state.manualArrange;
  setAction(`Manual arrange mode ${state.manualArrange ? "enabled" : "disabled"}.`);
};
el.startDeal.onclick = deal;
el.playBtn.onclick = playSelected;
el.passBtn.onclick = passTurn;
el.arrangeBtn.onclick = arrangeCurrent;

initDeckPick();
