const crypto = require('crypto');
const db = require('./db');
const game = require('./game');

const MAX_SEATS = 5;
const BET_TIME_MS = 20000;
const TURN_TIME_MS = 25000;
const RESULT_TIME_MS = 6000;
const MIN_BET = 10;
const MAX_BET = 500;

const rooms = new Map();

function createRoom({ name, hostId, visibility = 'public', password = '' }) {
  const id = crypto.randomBytes(4).toString('hex');
  const room = {
    id,
    name: name || 'Blackjack Tisch',
    hostId,
    visibility, // 'public' | 'friends' | 'password'
    password: password ? String(password) : '',
    players: [],
    spectators: [],
    deck: [],
    dealer: { cards: [], hiddenIndex: -1 },
    phase: 'waiting',
    activeSeat: -1,
    phaseEndsAt: 0,
    round: 0,
    timers: {},
    chat: [],
  };
  rooms.set(id, room);
  return room;
}

function listRooms({ requestingUserId, isAdmin, friendsOf } = {}) {
  return [...rooms.values()]
    .filter(r => {
      if (isAdmin) return true;
      if (r.visibility === 'public') return true;
      if (r.visibility === 'password') return true; // shown but locked
      if (r.visibility === 'friends') {
        if (r.hostId === requestingUserId) return true;
        return friendsOf && friendsOf.includes(r.hostId);
      }
      return true;
    })
    .map(r => ({
      id: r.id,
      name: r.name,
      players: r.players.length,
      phase: r.phase,
      round: r.round,
      visibility: r.visibility,
      locked: r.visibility === 'password',
    }));
}

function getRoom(id) {
  return rooms.get(id);
}

function findRoomByUserId(userId) {
  for (const r of rooms.values()) {
    if (r.players.some(p => p.userId === userId)) return r;
  }
  return null;
}

function publicRoomState(room) {
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    phase: room.phase,
    activeSeat: room.activeSeat,
    phaseEndsAt: room.phaseEndsAt,
    round: room.round,
    minBet: MIN_BET,
    maxBet: MAX_BET,
    dealer: {
      cards: room.dealer.cards.map((c, i) => (i === room.dealer.hiddenIndex ? { hidden: true } : c)),
      score: dealerVisibleScore(room),
    },
    players: room.players.map(p => ({
      userId: p.userId,
      username: p.username,
      credits: p.credits,
      avatar: p.avatar,
      cardBack: p.cardBack,
      seat: p.seat,
      bet: p.bet,
      cards: p.cards,
      score: game.handScore(p.cards),
      status: p.status,
      lastResult: p.lastResult,
      connected: p.connected,
    })),
  };
}

function dealerVisibleScore(room) {
  if (room.dealer.hiddenIndex >= 0) {
    const visible = room.dealer.cards.filter((_, i) => i !== room.dealer.hiddenIndex);
    return game.handScore(visible);
  }
  return game.handScore(room.dealer.cards);
}

function joinRoom(room, user, { password, isAdmin, friendsOfHost } = {}) {
  if (!isAdmin) {
    if (room.visibility === 'password' && String(password || '') !== room.password) {
      throw new Error('Falsches Passwort');
    }
    if (room.visibility === 'friends' && user.id !== room.hostId && !friendsOfHost?.includes(user.id)) {
      throw new Error('Nur Freunde des Hosts können beitreten');
    }
  }
  const existing = room.players.find(p => p.userId === user.id);
  if (existing) {
    existing.connected = true;
    return existing;
  }
  if (room.players.length >= MAX_SEATS) throw new Error('Tisch ist voll');
  const takenSeats = new Set(room.players.map(p => p.seat));
  let seat = 0;
  while (takenSeats.has(seat)) seat++;
  const player = {
    userId: user.id,
    username: user.username,
    credits: user.credits,
    avatar: user.avatar,
    cardBack: user.cardBack,
    seat,
    bet: 0,
    cards: [],
    status: 'idle',
    lastResult: null,
    connected: true,
  };
  room.players.push(player);
  room.players.sort((a, b) => a.seat - b.seat);
  return player;
}

function leaveRoom(room, userId) {
  const idx = room.players.findIndex(p => p.userId === userId);
  if (idx < 0) return;
  const [player] = room.players.splice(idx, 1);
  // Refund bet if betting phase
  if (room.phase === 'betting' && player.bet > 0) {
    player.credits += player.bet;
    db.updateCredits(player.userId, player.credits);
  }
  // Delete empty rooms after short delay
  if (room.players.length === 0) {
    clearAllTimers(room);
    rooms.delete(room.id);
  }
}

function clearAllTimers(room) {
  for (const key of Object.keys(room.timers)) {
    clearTimeout(room.timers[key]);
    delete room.timers[key];
  }
}

function placeBet(room, userId, amount) {
  if (room.phase !== 'betting') throw new Error('Gerade keine Einsatz-Phase');
  const player = room.players.find(p => p.userId === userId);
  if (!player) throw new Error('Nicht am Tisch');
  amount = Math.floor(Number(amount));
  if (!Number.isFinite(amount) || amount < MIN_BET) throw new Error(`Min. Einsatz: ${MIN_BET}`);
  if (amount > MAX_BET) throw new Error(`Max. Einsatz: ${MAX_BET}`);
  // refund previous bet first
  const previous = player.bet || 0;
  const available = player.credits + previous;
  if (amount > available) throw new Error('Nicht genug Credits');
  player.credits = available - amount;
  player.bet = amount;
  player.status = 'ready';
  db.updateCredits(player.userId, player.credits);
}

function playerAction(room, userId, action) {
  if (room.phase !== 'playing') throw new Error('Gerade nicht am Zug');
  const player = room.players[room.activeSeat];
  if (!player || player.userId !== userId) throw new Error('Nicht dein Zug');
  if (action === 'hit') {
    player.cards.push(drawCard(room));
    const score = game.handScore(player.cards);
    if (score > 21) {
      player.status = 'bust';
      nextTurn(room);
    } else if (score === 21) {
      player.status = 'stand';
      nextTurn(room);
    }
  } else if (action === 'stand') {
    player.status = 'stand';
    nextTurn(room);
  } else if (action === 'double') {
    if (player.cards.length !== 2) throw new Error('Verdoppeln nur mit 2 Karten');
    if (player.credits < player.bet) throw new Error('Nicht genug Credits zum Verdoppeln');
    player.credits -= player.bet;
    player.bet *= 2;
    db.updateCredits(player.userId, player.credits);
    player.cards.push(drawCard(room));
    if (game.handScore(player.cards) > 21) player.status = 'bust';
    else player.status = 'stand';
    nextTurn(room);
  } else {
    throw new Error('Unbekannte Aktion');
  }
}

function drawCard(room) {
  if (room.deck.length < 15) room.deck = game.newDeck(4);
  return room.deck.pop();
}

// ---- Game flow ----

function startBettingPhase(room, io) {
  clearAllTimers(room);
  room.round += 1;
  room.phase = 'betting';
  room.activeSeat = -1;
  room.dealer = { cards: [], hiddenIndex: -1 };
  for (const p of room.players) {
    p.cards = [];
    p.bet = 0;
    p.status = 'idle';
    p.lastResult = null;
  }
  room.phaseEndsAt = Date.now() + BET_TIME_MS;
  broadcastState(room, io);
  room.timers.phase = setTimeout(() => startDealingPhase(room, io), BET_TIME_MS);
}

function startDealingPhase(room, io) {
  clearAllTimers(room);
  const active = room.players.filter(p => p.bet > 0);
  if (active.length === 0) {
    // No bets placed → return to betting or wait
    broadcastMessage(room, io, 'Keine Einsätze — neue Runde wird gestartet.');
    room.timers.phase = setTimeout(() => startBettingPhase(room, io), 2500);
    room.phase = 'waiting';
    broadcastState(room, io);
    return;
  }
  if (room.deck.length < 20) room.deck = game.newDeck(4);
  room.phase = 'playing';
  // Deal 2 cards to each active player, 2 to dealer (one hidden)
  for (let round = 0; round < 2; round++) {
    for (const p of active) p.cards.push(drawCard(room));
    room.dealer.cards.push(drawCard(room));
  }
  room.dealer.hiddenIndex = 1;
  // Mark blackjacks
  for (const p of active) {
    if (game.isBlackjack(p.cards)) p.status = 'blackjack';
  }
  room.activeSeat = findNextActiveSeat(room, -1);
  if (room.activeSeat === -1) {
    // Everyone has blackjack or none active
    startDealerPhase(room, io);
    return;
  }
  room.phaseEndsAt = Date.now() + TURN_TIME_MS;
  broadcastState(room, io);
  room.timers.turn = setTimeout(() => autoStand(room, io), TURN_TIME_MS);
}

function findNextActiveSeat(room, fromSeat) {
  for (let i = fromSeat + 1; i < room.players.length; i++) {
    const p = room.players[i];
    if (p.bet > 0 && p.status !== 'blackjack' && p.status !== 'bust' && p.status !== 'stand') {
      return i;
    }
  }
  return -1;
}

function autoStand(room, io) {
  const p = room.players[room.activeSeat];
  if (p) {
    p.status = 'stand';
    broadcastMessage(room, io, `${p.username} wurde automatisch gepasst (Zeit abgelaufen).`);
  }
  nextTurn(room, io);
}

function nextTurn(room, io) {
  clearTimeout(room.timers.turn);
  const next = findNextActiveSeat(room, room.activeSeat);
  if (next === -1) {
    startDealerPhase(room, io || currentIo);
    return;
  }
  room.activeSeat = next;
  room.phaseEndsAt = Date.now() + TURN_TIME_MS;
  broadcastState(room, io || currentIo);
  room.timers.turn = setTimeout(() => autoStand(room, io || currentIo), TURN_TIME_MS);
}

function startDealerPhase(room, io) {
  clearAllTimers(room);
  room.phase = 'dealer';
  room.activeSeat = -1;
  room.dealer.hiddenIndex = -1; // reveal
  broadcastState(room, io);
  // Draw cards for dealer with delay for drama
  const drawStep = () => {
    const score = game.handScore(room.dealer.cards);
    const anyPlayerNotBust = room.players.some(p => p.bet > 0 && p.status !== 'bust');
    if (anyPlayerNotBust && score < 17) {
      room.dealer.cards.push(drawCard(room));
      broadcastState(room, io);
      room.timers.dealer = setTimeout(drawStep, 900);
    } else {
      settleRound(room, io);
    }
  };
  room.timers.dealer = setTimeout(drawStep, 900);
}

function settleRound(room, io) {
  clearAllTimers(room);
  room.phase = 'settling';
  for (const p of room.players) {
    if (p.bet <= 0) continue;
    const outcome = game.settleOutcome(p.cards, room.dealer.cards);
    const mult = game.payoutMultiplier(outcome);
    // credits changes: winnings = bet + bet*mult; but bet already deducted at placeBet.
    // On win: credits += bet + bet*mult (returns bet + profit)
    // On push: credits += bet (return stake)
    // On lose: nothing (bet lost)
    if (outcome === 'push') {
      p.credits += p.bet;
    } else if (mult > 0) {
      p.credits += p.bet + Math.floor(p.bet * mult);
    }
    p.lastResult = outcome;
    db.updateCredits(p.userId, p.credits);
  }
  room.phaseEndsAt = Date.now() + RESULT_TIME_MS;
  broadcastState(room, io);
  room.timers.phase = setTimeout(() => startBettingPhase(room, io), RESULT_TIME_MS);
}

// ---- I/O helpers ----

let currentIo = null;

function setIo(io) { currentIo = io; }

function broadcastState(room, io) {
  const target = io || currentIo;
  if (!target) return;
  target.to(`room:${room.id}`).emit('room:state', publicRoomState(room));
}

function broadcastMessage(room, io, text, type = 'system') {
  const msg = { type, text, at: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift();
  (io || currentIo).to(`room:${room.id}`).emit('room:message', msg);
}

function chatMessage(room, io, username, text) {
  const clean = String(text || '').slice(0, 200).trim();
  if (!clean) return;
  const msg = { type: 'chat', username, text: clean, at: Date.now() };
  room.chat.push(msg);
  if (room.chat.length > 100) room.chat.shift();
  (io || currentIo).to(`room:${room.id}`).emit('room:message', msg);
}

// Trigger auto-start when at least one player joins/bets and phase is waiting
function maybeAutoStart(room, io) {
  if (room.phase === 'waiting' && room.players.length > 0) {
    startBettingPhase(room, io);
  }
}

module.exports = {
  createRoom,
  listRooms,
  getRoom,
  findRoomByUserId,
  publicRoomState,
  joinRoom,
  leaveRoom,
  placeBet,
  playerAction,
  broadcastState,
  broadcastMessage,
  chatMessage,
  maybeAutoStart,
  setIo,
  MIN_BET,
  MAX_BET,
};
