const suits = ["♦", "♣", "♥", "♠"]; // Big2 suit order
const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const cardsPerPlayer = 13;
const comboPower = {
  straight: 1,
  flush: 2,
  fullHouse: 3,
  fourKind: 4,
  straightFlush: 5,
  royalFlush: 6,
};
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

const players = [
  { id: 0, name: "Player 1", hand: [], pickedDeck: null },
  { id: 1, name: "Player 2", hand: [], pickedDeck: null }
];

const state = {
  phase: "deal",
  currentPlayer: 0,
  lastPlayedBy: null,
  pile: null,
  selected: [],
  openingPending: true,
  passCount: 0,
};

const el = {
  setup: document.getElementById("setup"),
  game: document.getElementById("game"),
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
};

function createDeck() {
  return suits.flatMap((s) => ranks.map((r) => ({ r, s, value: ranks.indexOf(r) * 4 + suits.indexOf(s) })));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomInt(max) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.getRandomValues) return Math.floor(Math.random() * max);

  const limit = Math.floor(0x100000000 / max) * max;
  const value = new Uint32Array(1);
  do {
    cryptoApi.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % max;
}

function sortHand(hand) { hand.sort((a, b) => a.value - b.value); }
function cardText(c) { return `${c.r}${c.s}`; }
function isRed(suit) { return suit === "♦" || suit === "♥"; }
function isBlack(suit) { return suit === "♣" || suit === "♠"; }
function rankValue(card) { return ranks.indexOf(card.r); }
function compareCards(a, b) { return a.value - b.value; }
function highestCard(cards) { return [...cards].sort(compareCards).at(-1); }
function rankGroups(cards) {
  return cards.reduce((groups, card) => {
    groups[card.r] = groups[card.r] || [];
    groups[card.r].push(card);
    return groups;
  }, {});
}
function straightHigh(cards) {
  const values = [...new Set(cards.map(rankValue))].sort((a, b) => a - b);
  if (values.length !== 5) return null;
  const lowAce = ["3", "4", "5", "A", "2"].map((r) => ranks.indexOf(r));
  const isLowAceStraight = lowAce.every((v) => values.includes(v));
  if (isLowAceStraight) return highestCard(cards.filter((card) => ["3", "4", "5"].includes(card.r)));

  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) return null;
  }
  return highestCard(cards.filter((card) => rankValue(card) === values.at(-1)));
}
function groupTieCard(groups, size) {
  return highestCard(Object.values(groups).find((group) => group.length === size) || []);
}
function classifyPlay(cards) {
  const sorted = [...cards].sort(compareCards);
  const groups = rankGroups(sorted);
  const counts = Object.values(groups).map((group) => group.length).sort((a, b) => b - a);
  const flush = sorted.length === 5 && sorted.every((card) => card.s === sorted[0].s);
  const highStraightCard = sorted.length === 5 ? straightHigh(sorted) : null;

  if (sorted.length === 1) return { type: "single", size: 1, power: 0, tie: sorted[0] };
  if (sorted.length === 2 && counts[0] === 2) return { type: "pair", size: 2, power: 0, tie: highestCard(sorted) };
  if (sorted.length === 3 && counts[0] === 3) return { type: "triple", size: 3, power: 0, tie: highestCard(sorted) };
  if ((sorted.length === 4 || sorted.length === 5) && counts[0] === 4) {
    return { type: "fourKind", size: sorted.length, power: comboPower.fourKind, tie: groupTieCard(groups, 4) };
  }
  if (sorted.length !== 5) return null;

  const royalRanks = ["10", "J", "Q", "K", "A"];
  const isRoyal = flush && royalRanks.every((rank) => sorted.some((card) => card.r === rank));
  if (isRoyal) return { type: "royalFlush", size: 5, power: comboPower.royalFlush, tie: highestCard(sorted) };
  if (flush && highStraightCard) return { type: "straightFlush", size: 5, power: comboPower.straightFlush, tie: highStraightCard };
  if (counts[0] === 3 && counts[1] === 2) return { type: "fullHouse", size: 5, power: comboPower.fullHouse, tie: groupTieCard(groups, 3) };
  if (flush) return { type: "flush", size: 5, power: comboPower.flush, tie: highestCard(sorted) };
  if (highStraightCard) return { type: "straight", size: 5, power: comboPower.straight, tie: highStraightCard };

  return null;
}
function beatsPlay(play, pilePlay) {
  if (!pilePlay) return true;
  const incomingIsCombo = play.power > 0;
  const pileIsCombo = pilePlay.power > 0;

  if (incomingIsCombo && !pileIsCombo) return true;
  if (incomingIsCombo && pileIsCombo) {
    if (play.power !== pilePlay.power) return play.power > pilePlay.power;
    return play.tie.value > pilePlay.tie.value;
  }
  if (play.type !== pilePlay.type || play.size !== pilePlay.size) return false;
  return play.tie.value > pilePlay.tie.value;
}

function initDeckPick() {
  el.deckPick.innerHTML = "";
  ["Deck A", "Deck B"].forEach((label, i) => {
    const d = document.createElement("button");
    d.className = "deck";
    d.textContent = `${label}\n(click to assign picker)`;
    d.onclick = () => pickDeck(i);
    d.dataset.deck = i;
    d.disabled = state.phase !== "pick";
    el.deckPick.appendChild(d);
  });
}

function pickDeck(deckId) {
  if (state.phase !== "pick") return setAction("Deal cards before picking a deck.");
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
  addLog(`${picker.name} picked ${deckId === 0 ? "Deck A" : "Deck B"}; remaining deck auto-assigned.`);
  startGame();
}

function deal() {
  if (state.phase !== "deal") return;
  const deck = shuffle(createDeck());
  const dealtCardCount = cardsPerPlayer * players.length;
  const threeDiamondIndex = deck.findIndex((card) => card.r === "3" && card.s === "♦");
  if (threeDiamondIndex >= dealtCardCount) {
    const swapIndex = randomInt(dealtCardCount);
    [deck[swapIndex], deck[threeDiamondIndex]] = [deck[threeDiamondIndex], deck[swapIndex]];
  }

  players[0].hand = deck.slice(0, cardsPerPlayer);
  players[1].hand = deck.slice(cardsPerPlayer, dealtCardCount);
  if (el.autoArrange.checked) players.forEach((p) => sortHand(p.hand));

  state.phase = "pick";
  el.startDeal.classList.add("hidden");
  el.deckPick.classList.remove("hidden");
  initDeckPick();
  addLog(`${cardsPerPlayer} cards dealt to each player. Pick Deck A or Deck B to start.`);
}

function startGame() {
  state.currentPlayer = find3DiamondOwner();
  state.openingPending = true;
  state.pile = null;
  state.lastPlayedBy = null;
  state.passCount = 0;
  state.phase = "play";

  el.setup.classList.add("hidden");
  el.game.classList.remove("hidden");
  el.newGameBtn.classList.add("hidden");
  el.playBtn.disabled = false;
  el.passBtn.disabled = false;
  el.arrangeBtn.disabled = false;
  render();
  addLog(`${players[state.currentPlayer].name} owns 3♦ and must click Play to start.`);
}

function find3DiamondOwner() {
  return players.findIndex((p) => p.hand.some((c) => c.r === "3" && c.s === "♦"));
}

function render() {
  const p = players[state.currentPlayer];
  el.turnTitle.textContent = `${p.name}'s Turn`;
  el.pileLabel.textContent = `Pile: ${state.pile ? `${comboNames[state.pile.play.type]} - ${state.pile.cards.map(cardText).join(" ")}` : "none"}`;

  if (state.openingPending) {
    el.manualHint.textContent = "Opening move must include 3♦. Player must manually click Play (not automatic).";
  } else {
    el.manualHint.textContent = "Manual pass required when you cannot beat current hand.";
  }

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
    if (Number.isInteger(from)) moveCard(from, p.hand.length);
  };
  p.hand.forEach((card, i) => {
    const node = document.createElement("button");
    node.className = `card ${isRed(card.s) ? "red" : ""} ${isBlack(card.s) ? "black" : ""}`;
    if (state.selected.includes(i)) node.classList.add("selected");
    node.innerHTML = `<span class="card-corner"><span>${card.r}</span><span>${card.s}</span></span>`;
    node.draggable = true;
    node.dataset.index = i;
    node.onclick = () => toggleSelect(i);
    node.ondragstart = (event) => {
      node.classList.add("dragging");
      el.hand.classList.add("drag-active");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(i));
    };
    node.ondragend = () => {
      node.classList.remove("dragging");
      clearDropHints();
    };
    node.ondragover = (event) => {
      event.preventDefault();
      showDropHint(i);
    };
    node.ondrop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const from = Number(event.dataTransfer.getData("text/plain"));
      clearDropHints();
      if (Number.isInteger(from)) moveCard(from, i);
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

function moveCard(from, to) {
  const p = players[state.currentPlayer];
  if (from === to || from < 0 || from >= p.hand.length) return;
  const [card] = p.hand.splice(from, 1);
  const insertAt = from < to ? to - 1 : to;
  p.hand.splice(Math.max(0, Math.min(insertAt, p.hand.length)), 0, card);
  state.selected = [];
  render();
  setAction("Hand arranged.");
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
  if (!cards.length) return { ok: false, msg: "Select at least one card." };
  const play = classifyPlay(cards);
  if (!play) return { ok: false, msg: "Selected cards do not form a valid Big2 play." };
  if (state.openingPending && !cards.some((card) => card.r === "3" && card.s === "♦")) {
    return { ok: false, msg: "Opening play must include 3♦." };
  }
  if (!beatsPlay(play, state.pile?.play)) {
    const pileType = comboNames[state.pile.play.type];
    const playType = comboNames[play.type];
    return { ok: false, msg: `A ${playType} cannot beat the current ${pileType}.` };
  }
  return { ok: true, play };
}

function playSelected() {
  const cards = selectedCards();
  const verdict = validatePlay(cards);
  if (!verdict.ok) return setAction(verdict.msg);

  const p = players[state.currentPlayer];
  const indexes = [...state.selected].sort((a, b) => b - a);
  indexes.forEach((i) => p.hand.splice(i, 1));
  state.pile = { cards, play: verdict.play, by: p.id };
  state.lastPlayedBy = p.id;
  state.openingPending = false;
  state.passCount = 0;
  state.selected = [];

  addLog(`${p.name} played ${comboNames[verdict.play.type]}: ${cards.map(cardText).join(" ")}`);

  if (!p.hand.length) {
    setAction(`${p.name} wins!`);
    addLog(`${p.name} won the game.`);
    el.playBtn.disabled = true;
    el.passBtn.disabled = true;
    el.arrangeBtn.disabled = true;
    el.newGameBtn.classList.remove("hidden");
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

function newGame() {
  players.forEach((player) => {
    player.hand = [];
    player.pickedDeck = null;
  });
  state.phase = "deal";
  state.currentPlayer = 0;
  state.lastPlayedBy = null;
  state.pile = null;
  state.selected = [];
  state.openingPending = true;
  state.passCount = 0;

  el.game.classList.add("hidden");
  el.setup.classList.remove("hidden");
  el.startDeal.disabled = false;
  el.startDeal.classList.remove("hidden");
  el.deckPick.classList.add("hidden");
  el.newGameBtn.classList.add("hidden");
  el.playBtn.disabled = false;
  el.passBtn.disabled = false;
  el.arrangeBtn.disabled = false;
  el.hand.innerHTML = "";
  el.log.innerHTML = "";
  setAction("-");
  initDeckPick();
}

el.startDeal.onclick = deal;
el.playBtn.onclick = playSelected;
el.passBtn.onclick = passTurn;
el.arrangeBtn.onclick = arrangeCurrent;
el.newGameBtn.onclick = newGame;

initDeckPick();
