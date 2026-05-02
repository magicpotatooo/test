const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const suits = ["♦", "♣", "♥", "♠"];
const ranks = ["3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "2"];
const cardsPerPlayer = 13;
const comboPower = { straight: 1, flush: 2, fullHouse: 3, fourKind: 4, straightFlush: 5, royalFlush: 6 };
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
const rooms = new Map();

function createDeck() {
  return suits.flatMap((s) => ranks.map((r) => ({ r, s, value: ranks.indexOf(r) * 4 + suits.indexOf(s) })));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sortHand(hand) { hand.sort((a, b) => a.value - b.value); }
function cardText(card) { return `${card.r}${card.s}`; }
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
  if (lowAce.every((value) => values.includes(value))) {
    return highestCard(cards.filter((card) => ["3", "4", "5"].includes(card.r)));
  }

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

function createRoom() {
  const room = {
    id: crypto.randomBytes(3).toString("hex").toUpperCase(),
    phase: "deal",
    players: [
      { id: 0, name: "Player 1", hand: [], pickedDeck: null, joined: false },
      { id: 1, name: "Player 2", hand: [], pickedDeck: null, joined: false },
    ],
    decks: [[], []],
    currentPlayer: 0,
    lastPlayedBy: null,
    pile: null,
    openingCard: null,
    openingPending: true,
    passCount: 0,
    lastAction: "-",
    log: [],
    records: [],
    clients: new Set(),
  };
  rooms.set(room.id, room);
  return room;
}

function log(room, message) {
  room.lastAction = message;
  room.log.unshift(`[${new Date().toLocaleTimeString()}] ${message}`);
  room.log = room.log.slice(0, 80);
}

function findOpeningStarter(room) {
  const ownedCards = room.players.flatMap((player) => player.hand.map((card) => ({ playerId: player.id, card })));
  const threeDiamond = ownedCards.find(({ card }) => card.r === "3" && card.s === "♦");
  if (threeDiamond) return threeDiamond;

  const lowestThree = ownedCards
    .filter(({ card }) => card.r === "3")
    .sort((a, b) => a.card.value - b.card.value)[0];
  if (lowestThree) return lowestThree;

  return ownedCards.sort((a, b) => a.card.value - b.card.value)[0] || { playerId: 0, card: null };
}

function publicView(room, playerId) {
  const safePlayerId = playerId <= 1 ? playerId : 0;
  const opponent = room.players[1 - safePlayerId];
  return {
    roomId: room.id,
    playerId,
    phase: room.phase,
    players: room.players.map(({ id, name, pickedDeck, joined }) => ({ id, name, pickedDeck, joined })),
    currentPlayer: room.currentPlayer,
    pile: room.pile,
    openingCard: room.openingCard,
    openingPending: room.openingPending,
    lastAction: room.lastAction,
    log: room.log,
    records: room.records,
    hand: playerId <= 1 ? room.players[playerId].hand : [],
    opponentCardCount: opponent?.hand.length || 0,
    roomStatus: room.players.every((player) => player.joined) ? "Both players connected." : "Waiting for another player.",
  };
}

function broadcast(room) {
  for (const client of room.clients) {
    client.res.write(`data: ${JSON.stringify(publicView(room, client.playerId))}\n\n`);
  }
}

function startGame(room) {
  const opener = findOpeningStarter(room);
  room.currentPlayer = opener.playerId;
  room.openingCard = opener.card;
  room.openingPending = true;
  room.pile = null;
  room.lastPlayedBy = null;
  room.passCount = 0;
  room.phase = "play";
  log(room, `${room.players[room.currentPlayer].name} starts.`);
}

function assertPlayer(room, playerId) {
  if (playerId !== 0 && playerId !== 1) throw new Error("This room already has two players.");
  if (!room.players[playerId]) throw new Error("Player not found.");
}

function deal(room, autoArrange) {
  if (room.phase !== "deal") throw new Error("Cards were already dealt.");
  const deck = shuffle(createDeck());
  const dealtCardCount = cardsPerPlayer * 2;
  room.decks = [
    deck.slice(0, cardsPerPlayer),
    deck.slice(cardsPerPlayer, dealtCardCount),
  ];
  if (autoArrange) room.decks.forEach(sortHand);
  room.players.forEach((player) => {
    player.hand = [];
    player.pickedDeck = null;
  });
  room.phase = "pick";
  log(room, `${cardsPerPlayer} cards dealt to each player. Pick Deck A or Deck B to start.`);
}

function pickDeck(room, playerId, deckId) {
  assertPlayer(room, playerId);
  if (room.phase !== "pick") throw new Error("Deal cards before picking a deck.");
  room.players[playerId].pickedDeck = deckId;
  room.players[1 - playerId].pickedDeck = deckId === 0 ? 1 : 0;
  room.players[playerId].hand = [...room.decks[deckId]];
  room.players[1 - playerId].hand = [...room.decks[deckId === 0 ? 1 : 0]];
  log(room, `${room.players[playerId].name} picked ${deckId === 0 ? "Deck A" : "Deck B"}; the other deck was auto-assigned.`);
  startGame(room);
}

function play(room, playerId, indexes) {
  assertPlayer(room, playerId);
  if (room.phase !== "play") throw new Error("The game is not in play.");
  if (room.currentPlayer !== playerId) throw new Error("It is not your turn.");
  const player = room.players[playerId];
  const uniqueIndexes = [...new Set(indexes)].sort((a, b) => a - b);
  const cards = uniqueIndexes.map((index) => player.hand[index]).filter(Boolean).sort(compareCards);
  if (!cards.length || cards.length !== uniqueIndexes.length) throw new Error("Select valid cards.");
  const playInfo = classifyPlay(cards);
  if (!playInfo) throw new Error("Selected cards do not form a valid Big2 play.");
  if (room.openingPending && room.openingCard && !cards.some((card) => card.value === room.openingCard.value)) {
    throw new Error(`Opening play must include ${cardText(room.openingCard)}.`);
  }
  if (!beatsPlay(playInfo, room.pile?.play)) {
    throw new Error(`A ${comboNames[playInfo.type]} cannot beat the current ${comboNames[room.pile.play.type]}.`);
  }

  uniqueIndexes.sort((a, b) => b - a).forEach((index) => player.hand.splice(index, 1));
  room.pile = { cards, play: playInfo, by: playerId };
  room.lastPlayedBy = playerId;
  room.openingPending = false;
  room.passCount = 0;
  log(room, `${player.name} played ${comboNames[playInfo.type]}: ${cards.map(cardText).join(" ")}`);

  if (!player.hand.length) {
    room.phase = "ended";
    room.records.unshift({ playerId, playerName: player.name, date: new Date().toLocaleString() });
    log(room, `${player.name} won the game.`);
    return;
  }
  room.currentPlayer = 1 - room.currentPlayer;
}

function pass(room, playerId) {
  assertPlayer(room, playerId);
  if (room.phase !== "play") throw new Error("The game is not in play.");
  if (room.openingPending) throw new Error(`Cannot pass opening. You must play ${cardText(room.openingCard)}.`);
  if (room.currentPlayer !== playerId) throw new Error("It is not your turn.");
  log(room, `${room.players[playerId].name} passed.`);
  room.passCount += 1;
  if (room.passCount >= 1) {
    room.currentPlayer = room.lastPlayedBy;
    room.pile = null;
    room.passCount = 0;
    log(room, `Round reset. ${room.players[room.currentPlayer].name} leads next.`);
    return;
  }
  room.currentPlayer = 1 - room.currentPlayer;
}

function arrange(room, playerId) {
  assertPlayer(room, playerId);
  sortHand(room.players[playerId].hand);
  log(room, `${room.players[playerId].name} arranged their hand.`);
}

function reorder(room, playerId, from, to) {
  assertPlayer(room, playerId);
  const hand = room.players[playerId].hand;
  if (from === to || from < 0 || from >= hand.length) return;
  const [card] = hand.splice(from, 1);
  const insertAt = from < to ? to - 1 : to;
  hand.splice(Math.max(0, Math.min(insertAt, hand.length)), 0, card);
}

function newGame(room) {
  room.players.forEach((player) => {
    player.hand = [];
    player.pickedDeck = null;
  });
  room.decks = [[], []];
  room.phase = "deal";
  room.currentPlayer = 0;
  room.lastPlayedBy = null;
  room.pile = null;
  room.openingCard = null;
  room.openingPending = true;
  room.passCount = 0;
  log(room, "New game ready. Deal cards to begin.");
}

function joinRoom(room, requestedPlayerId) {
  let playerId = requestedPlayerId === 0 || requestedPlayerId === 1 ? requestedPlayerId : Number.NaN;
  if (playerId !== 0 && playerId !== 1) {
    playerId = room.players[0].joined ? (room.players[1].joined ? 2 : 1) : 0;
  }
  if (playerId <= 1) room.players[playerId].joined = true;
  return playerId;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function serveFile(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(root, pathname));
  if (!filePath.startsWith(root)) return sendJson(res, 403, { error: "Forbidden." });
  fs.readFile(filePath, (error, content) => {
    if (error) return sendJson(res, 404, { error: "Not found." });
    const ext = path.extname(filePath);
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" }[ext] || "text/plain";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/events") {
      const room = rooms.get(url.searchParams.get("room"));
      if (!room) return sendJson(res, 404, { error: "Room not found." });
      const playerId = Number(url.searchParams.get("player"));
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const client = { res, playerId };
      room.clients.add(client);
      res.write(`data: ${JSON.stringify(publicView(room, playerId))}\n\n`);
      req.on("close", () => room.clients.delete(client));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/rooms") {
      const room = createRoom();
      const playerId = joinRoom(room, 0);
      return sendJson(res, 200, { roomId: room.id, playerId });
    }

    const joinMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/join$/);
    if (req.method === "POST" && joinMatch) {
      const room = rooms.get(joinMatch[1]);
      if (!room) return sendJson(res, 404, { error: "Room not found." });
      const body = await readBody(req);
      const playerId = joinRoom(room, body.playerId);
      broadcast(room);
      return sendJson(res, 200, { roomId: room.id, playerId });
    }

    const actionMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/action$/);
    if (req.method === "POST" && actionMatch) {
      const room = rooms.get(actionMatch[1]);
      if (!room) return sendJson(res, 404, { error: "Room not found." });
      const { playerId, type, payload = {} } = await readBody(req);
      if (type === "deal") deal(room, payload.autoArrange);
      else if (type === "pickDeck") pickDeck(room, playerId, payload.deckId);
      else if (type === "play") play(room, playerId, payload.indexes || []);
      else if (type === "pass") pass(room, playerId);
      else if (type === "arrange") arrange(room, playerId);
      else if (type === "reorder") reorder(room, playerId, payload.from, payload.to);
      else if (type === "newGame") newGame(room);
      else if (type === "clearRecords") { room.records = []; log(room, "Win records cleared."); }
      else throw new Error("Unknown action.");
      broadcast(room);
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === "GET") return serveFile(req, res);
    sendJson(res, 404, { error: "Not found." });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Big2 server running at http://localhost:${port}`);
});
