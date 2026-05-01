const suits = ["♦", "♣", "♥", "♠"];
const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];

const players = [
  { id: 0, name: "You", hand: [], pickedDeck: null, isCpu: false },
  { id: 1, name: "Player 2", hand: [], pickedDeck: null, isCpu: false }
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
  soloMode: true,
  winner: null,
};

const el = {
  setup: document.getElementById("setup"), game: document.getElementById("game"), deckPick: document.getElementById("deckPick"),
  autoArrange: document.getElementById("autoArrange"), manualArrange: document.getElementById("manualArrange"), soloMode: document.getElementById("soloMode"),
  startDeal: document.getElementById("startDeal"), turnTitle: document.getElementById("turnTitle"), pileLabel: document.getElementById("pileLabel"),
  manualHint: document.getElementById("manualHint"), hand: document.getElementById("hand"), playBtn: document.getElementById("playBtn"),
  passBtn: document.getElementById("passBtn"), arrangeBtn: document.getElementById("arrangeBtn"), lastAction: document.getElementById("lastAction"), log: document.getElementById("log"),
};

const createDeck = () => suits.flatMap((s) => ranks.map((r) => ({ r, s, value: ranks.indexOf(r) * 4 + suits.indexOf(s) })));
const sortHand = (h) => h.sort((a, b) => a.value - b.value);
const cardText = (c) => `${c.r}${c.s}`;
const isRed = (s) => s === "♦" || s === "♥";

function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

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
  const unpicked = players.filter((p) => p.pickedDeck === null);
  if (!unpicked.length) return;
  const picker = unpicked[0];
  picker.pickedDeck = deckId;
  const other = players.find((p) => p.id !== picker.id);
  if (other.pickedDeck === null) other.pickedDeck = deckId === 0 ? 1 : 0;
  [...el.deckPick.children].forEach((c) => { c.classList.add("locked", "selected"); c.disabled = true; });
  el.startDeal.disabled = false;
  addLog(`${picker.name} picked ${deckId === 0 ? "Deck A" : "Deck B"}; remaining deck auto-assigned.`);
}

function deal() {
  state.soloMode = el.soloMode.checked;
  players[0].name = "You";
  players[1].name = state.soloMode ? "CPU" : "Player 2";
  players[1].isCpu = state.soloMode;

  const deck = shuffle(createDeck());
  players[0].hand = deck.slice(0, 26);
  players[1].hand = deck.slice(26);
  if (el.autoArrange.checked) players.forEach((p) => sortHand(p.hand));

  state.currentPlayer = find3DiamondOwner();
  state.openingPending = true;
  state.pile = null;
  state.lastPlayedBy = null;
  state.passCount = 0;
  state.winner = null;
  state.phase = "play";

  el.setup.classList.add("hidden");
  el.game.classList.remove("hidden");
  render();
  addLog(`Cards dealt. ${players[state.currentPlayer].name} owns 3♦ and must click Play to start.`);
  maybeCpuTurn();
}

const find3DiamondOwner = () => players.findIndex((p) => p.hand.some((c) => c.r === "3" && c.s === "♦"));

function render() {
  const p = players[state.currentPlayer];
  const isCpuTurn = p.isCpu;
  el.turnTitle.textContent = `${p.name}'s Turn`;
  el.pileLabel.textContent = `Pile: ${state.pile ? state.pile.cards.map(cardText).join(" ") : "none"}`;
  el.manualHint.textContent = state.openingPending
    ? "Opening move must include 3♦. Player must manually click Play (not automatic)."
    : "Manual pass required when you cannot beat current hand.";

  el.playBtn.disabled = isCpuTurn || !!state.winner;
  el.passBtn.disabled = isCpuTurn || !!state.winner;
  el.arrangeBtn.disabled = isCpuTurn || !!state.winner;

  el.hand.innerHTML = "";
  const handView = state.soloMode && isCpuTurn ? p.hand.map(() => ({ hidden: true })) : p.hand;
  handView.forEach((card, i) => {
    const node = document.createElement("button");
    node.className = "card";
    if (!card.hidden) {
      node.className = `card ${isRed(card.s) ? "red" : ""}`;
      if (state.selected.includes(i)) node.classList.add("selected");
      node.textContent = cardText(card);
      node.onclick = () => toggleSelect(i);
    } else {
      node.textContent = "🂠";
      node.disabled = true;
    }
    el.hand.appendChild(node);
  });
}

function toggleSelect(i) { const at = state.selected.indexOf(i); at >= 0 ? state.selected.splice(at, 1) : state.selected.push(i); render(); }
const selectedCards = () => state.selected.map((i) => players[state.currentPlayer].hand[i]).sort((a, b) => a.value - b.value);

function validatePlay(cards) {
  if (cards.length !== 1) return { ok: false, msg: "This simple version currently supports single-card plays only." };
  if (state.openingPending && !(cards[0].r === "3" && cards[0].s === "♦")) return { ok: false, msg: "Opening play must be 3♦." };
  if (!state.pile) return { ok: true };
  if (cards[0].value <= state.pile.cards[0].value) return { ok: false, msg: "Card is not higher than pile." };
  return { ok: true };
}

function applyPlay(cards) {
  const p = players[state.currentPlayer];
  const indexes = cards.map((c) => p.hand.indexOf(c)).sort((a, b) => b - a);
  indexes.forEach((i) => p.hand.splice(i, 1));
  state.pile = { cards, by: p.id };
  state.lastPlayedBy = p.id;
  state.openingPending = false;
  state.passCount = 0;
  state.selected = [];
  addLog(`${p.name} played ${cards.map(cardText).join(" ")}`);

  if (!p.hand.length) {
    state.winner = p.id;
    setAction(`${p.name} wins!`);
    addLog(`${p.name} won the game.`);
    render();
    return;
  }
  nextPlayer();
}

function playSelected() {
  const cards = selectedCards();
  const verdict = validatePlay(cards);
  if (!verdict.ok) return setAction(verdict.msg);
  applyPlay(cards);
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
    maybeCpuTurn();
    return;
  }
  nextPlayer();
}

function nextPlayer() { state.currentPlayer = (state.currentPlayer + 1) % 2; setAction("Turn changed."); render(); maybeCpuTurn(); }
function arrangeCurrent() { sortHand(players[state.currentPlayer].hand); state.selected = []; render(); setAction("Hand arranged."); }

function maybeCpuTurn() {
  const p = players[state.currentPlayer];
  if (!p.isCpu || state.winner !== null) return;
  setTimeout(() => {
    const card = chooseCpuCard(p.hand);
    if (!card) {
      passTurn();
      return;
    }
    applyPlay([card]);
  }, 500);
}

function chooseCpuCard(hand) {
  const sorted = [...hand].sort((a, b) => a.value - b.value);
  if (state.openingPending) return sorted.find((c) => c.r === "3" && c.s === "♦") || null;
  if (!state.pile) return sorted[0] || null;
  return sorted.find((c) => c.value > state.pile.cards[0].value) || null;
}

function addLog(msg) { const item = document.createElement("p"); item.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; el.log.prepend(item); }
function setAction(msg) { el.lastAction.textContent = msg; }

el.manualArrange.onclick = () => { state.manualArrange = !state.manualArrange; setAction(`Manual arrange mode ${state.manualArrange ? "enabled" : "disabled"}.`); };
el.startDeal.onclick = deal;
el.playBtn.onclick = playSelected;
el.passBtn.onclick = passTurn;
el.arrangeBtn.onclick = arrangeCurrent;

initDeckPick();
