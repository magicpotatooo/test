const suits = ["♦", "♣", "♥", "♠"]; // ascending in Big2
const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"]; // ascending in Big2

const players = [
  { id: 0, name: "You", hand: [], pickedDeck: null, isCpu: false },
  { id: 1, name: "Player 2", hand: [], pickedDeck: null, isCpu: false }
];

const state = {
  currentPlayer: 0,
  lastPlayedBy: null,
  pile: null,
  selected: [],
  openingPending: true,
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

const createDeck = () => suits.flatMap((s) => ranks.map((r) => ({ r, s, rv: ranks.indexOf(r), sv: suits.indexOf(s), value: ranks.indexOf(r) * 4 + suits.indexOf(s) })));
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
  const picker = players.find((p) => p.pickedDeck === null);
  if (!picker) return;
  picker.pickedDeck = deckId;
  const other = players.find((p) => p.id !== picker.id);
  other.pickedDeck = deckId === 0 ? 1 : 0;
  [...el.deckPick.children].forEach((c) => { c.classList.add("locked", "selected"); c.disabled = true; });
  el.startDeal.disabled = false;
  addLog(`${picker.name} picked ${deckId === 0 ? "Deck A" : "Deck B"}; remaining deck auto-assigned.`);
}

function deal() {
  state.soloMode = el.soloMode.checked;
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
  state.winner = null;
  state.selected = [];

  el.setup.classList.add("hidden");
  el.game.classList.remove("hidden");
  render();
  addLog(`Cards dealt. ${players[state.currentPlayer].name} owns 3♦ and must click Play to start.`);
  maybeCpuTurn();
}

const find3DiamondOwner = () => players.findIndex((p) => p.hand.some((c) => c.r === "3" && c.s === "♦"));

function getCombo(cards) {
  const sorted = [...cards].sort((a, b) => a.value - b.value);
  const counts = new Map();
  sorted.forEach((c) => counts.set(c.rv, (counts.get(c.rv) || 0) + 1));
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const isFlush = sorted.every((c) => c.s === sorted[0].s);
  const rvs = sorted.map((c) => c.rv);
  const isStraight = rvs.every((v, i) => i === 0 || v === rvs[i - 1] + 1) && new Set(rvs).size === 5;

  if (cards.length === 1) return { type: "single", rank: 1, key: sorted[0].value };
  if (cards.length === 2 && groups[0][1] === 2) return { type: "pair", rank: 2, key: groups[0][0] * 4 + Math.max(...sorted.map((c) => c.sv)) };
  if (cards.length === 3 && groups[0][1] === 3) return { type: "triple", rank: 3, key: groups[0][0] };

  if (cards.length === 5) {
    if (isStraight && isFlush) return { type: "straightFlush", rank: 9, key: sorted[4].value };
    if (groups[0][1] === 4) return { type: "fourKind", rank: 8, key: groups[0][0] };
    if (groups[0][1] === 3 && groups[1][1] === 2) return { type: "fullHouse", rank: 7, key: groups[0][0] };
    if (isFlush) return { type: "flush", rank: 6, key: sorted[4].value };
    if (isStraight) return { type: "straight", rank: 5, key: sorted[4].value };
  }
  return null;
}

function canBeat(combo, pileCombo) {
  if (combo.type !== pileCombo.type && combo.rank < 5 && pileCombo.rank < 5) return false;
  if (combo.rank !== pileCombo.rank) return combo.rank > pileCombo.rank;
  return combo.key > pileCombo.key;
}

function validatePlay(cards) {
  const combo = getCombo(cards);
  if (!combo) return { ok: false, msg: "Invalid Big2 combination." };
  if (state.openingPending && !cards.some((c) => c.r === "3" && c.s === "♦")) return { ok: false, msg: "Opening play must include 3♦." };
  if (!state.pile) return { ok: true, combo };
  if (cards.length !== state.pile.cards.length) return { ok: false, msg: "Must match card count of current pile." };
  if (!canBeat(combo, state.pile.combo)) return { ok: false, msg: "Play does not beat current pile." };
  return { ok: true, combo };
}

function render() {
  const turnP = players[state.currentPlayer];
  el.turnTitle.textContent = `${turnP.name}'s Turn`;
  el.pileLabel.textContent = `Pile: ${state.pile ? state.pile.cards.map(cardText).join(" ") + ` (${state.pile.combo.type})` : "none"}`;
  el.manualHint.textContent = state.openingPending ? "Opening move must include 3♦ and be played manually." : "Manual pass required if you choose not to or cannot beat the pile.";

  const userTurn = state.currentPlayer === 0;
  const disabled = !userTurn || !!state.winner;
  el.playBtn.disabled = disabled;
  el.passBtn.disabled = disabled;
  el.arrangeBtn.disabled = disabled;

  el.hand.innerHTML = "";
  players[0].hand.forEach((card, i) => {
    const node = document.createElement("button");
    node.className = `card ${isRed(card.s) ? "red" : ""}`;
    node.style.zIndex = `${i}`;
    if (state.selected.includes(i)) node.classList.add("selected");
    node.textContent = cardText(card);
    node.onclick = () => { if (userTurn) toggleSelect(i); };
    el.hand.appendChild(node);
  });
}

function toggleSelect(i) { const at = state.selected.indexOf(i); at >= 0 ? state.selected.splice(at, 1) : state.selected.push(i); render(); }
const selectedCards = () => state.selected.map((i) => players[0].hand[i]).sort((a, b) => a.value - b.value);

function applyPlay(playerId, cards, combo) {
  const p = players[playerId];
  const indexes = cards.map((c) => p.hand.indexOf(c)).sort((a, b) => b - a);
  indexes.forEach((i) => p.hand.splice(i, 1));
  state.pile = { cards, by: p.id, combo };
  state.lastPlayedBy = p.id;
  state.openingPending = false;
  state.selected = [];
  addLog(`${p.name} played ${cards.map(cardText).join(" ")} (${combo.type})`);

  if (!p.hand.length) {
    state.winner = p.id;
    setAction(`${p.name} wins!`);
    render();
    return;
  }
  state.currentPlayer = (state.currentPlayer + 1) % 2;
  setAction("Turn changed.");
  render();
  maybeCpuTurn();
}

function playSelected() {
  const cards = selectedCards();
  const verdict = validatePlay(cards);
  if (!verdict.ok) return setAction(verdict.msg);
  applyPlay(0, cards, verdict.combo);
}

function passTurn() {
  if (state.openingPending) return setAction("Cannot pass opening. Must play containing 3♦.");
  const p = players[state.currentPlayer];
  addLog(`${p.name} passed.`);
  state.selected = [];
  const lead = players[state.lastPlayedBy];
  state.currentPlayer = lead.id;
  state.pile = null;
  setAction(`Round reset. ${lead.name} leads next.`);
  render();
  maybeCpuTurn();
}

function arrangeCurrent() { sortHand(players[0].hand); state.selected = []; render(); setAction("Hand arranged."); }

function chooseCpuCards(hand) {
  const sorted = [...hand].sort((a, b) => a.value - b.value);
  const targetLen = state.pile ? state.pile.cards.length : null;

  const candidates = [];
  const comb = (arr, k, idx = 0, out = []) => {
    if (out.length === k) { candidates.push([...out]); return; }
    for (let i = idx; i < arr.length; i++) { out.push(arr[i]); comb(arr, k, i + 1, out); out.pop(); }
  };

  const lens = targetLen ? [targetLen] : [1, 2, 3, 5];
  for (const l of lens) comb(sorted, l);

  const valid = candidates
    .map((cards) => ({ cards, v: validatePlay(cards) }))
    .filter((x) => x.v.ok)
    .map((x) => ({ cards: x.cards, combo: x.v.combo }))
    .sort((a, b) => a.combo.rank - b.combo.rank || a.combo.key - b.combo.key);

  return valid[0] || null;
}

function maybeCpuTurn() {
  const p = players[state.currentPlayer];
  if (!p.isCpu || state.winner !== null) return;
  setTimeout(() => {
    const move = chooseCpuCards(p.hand);
    if (!move) return passTurn();
    applyPlay(1, move.cards, move.combo);
  }, 500);
}

function addLog(msg) { const item = document.createElement("p"); item.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`; el.log.prepend(item); }
function setAction(msg) { el.lastAction.textContent = msg; }

el.manualArrange.onclick = () => setAction("Manual arrange mode enabled (drag-drop not implemented in this prototype). ");
el.startDeal.onclick = deal;
el.playBtn.onclick = playSelected;
el.passBtn.onclick = passTurn;
el.arrangeBtn.onclick = arrangeCurrent;

initDeckPick();
