const params = new URLSearchParams(location.search);
const roomId = params.get('room');
const roomPw = params.get('pw') || '';
if (!roomId) location.href = '/lobby.html';

const dealerCards = document.getElementById('dealer-cards');
const dealerScore = document.getElementById('dealer-score');
const playersArea = document.getElementById('players-area');
const phaseInfo = document.getElementById('phase-info');
const betControls = document.getElementById('bet-controls');
const turnActions = document.getElementById('turn-actions');
const betTotalEl = document.getElementById('bet-total');
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');

let me = null;
let socket = null;
let currentState = null;
let pendingBet = 0;
let timerHandle = null;
let lastPhase = null;

(async function () {
  me = await app.loadMe();
  if (!me) return;
  document.getElementById('me-info').innerHTML = `
    ${app.avatarHtml(me, 'sm')}
    <div style="margin-left:8px;">
      <div style="font-weight:600;font-size:0.9rem;">${app.escapeHtml(me.username)}</div>
      <div class="text-accent small">◆ <span id="me-credits">${app.formatCredits(me.credits)}</span></div>
    </div>`;
  connect();
})();

function connect() {
  socket = io({ withCredentials: true });
  socket.on('connect', () => socket.emit('room:join', { roomId, password: roomPw }));
  socket.on('connect_error', err => app.toast('Verbindungsfehler: ' + err.message, 'error'));
  socket.on('error:msg', msg => app.toast(msg, 'error'));
  socket.on('room:joined', ({ chat }) => {
    chatLog.innerHTML = '';
    (chat || []).forEach(addMessage);
  });
  socket.on('room:state', renderState);
  socket.on('room:message', addMessage);
  socket.on('credits:update', ({ credits }) => {
    me.credits = credits;
    document.getElementById('me-credits').textContent = app.formatCredits(credits);
  });
}

window.leaveRoom = function () {
  socket?.emit('room:leave');
  setTimeout(() => location.href = '/lobby.html', 100);
};

// Chip clicks
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const amount = parseInt(chip.dataset.chip, 10);
    pendingBet += amount;
    if (pendingBet > me.credits) pendingBet = me.credits;
    betTotalEl.textContent = pendingBet;
  });
});
document.getElementById('btn-clear-bet').addEventListener('click', () => { pendingBet = 0; betTotalEl.textContent = 0; });
document.getElementById('btn-place-bet').addEventListener('click', () => {
  if (pendingBet < 10) return app.toast('Min. Einsatz: 10', 'error');
  socket.emit('room:bet', { amount: pendingBet });
});

turnActions.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => socket.emit('room:action', { action: btn.dataset.action }));
});

document.getElementById('chat-send').addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const t = chatInput.value.trim();
  if (!t) return;
  socket.emit('room:chat', { text: t });
  chatInput.value = '';
}

function renderState(state) {
  const prev = currentState;
  currentState = state;
  document.getElementById('table-title').textContent = state.name || 'Blackjack';
  renderDealer(state.dealer);
  renderPlayers(state);
  renderPhase(state);
  const myP = state.players.find(p => p.userId === me.id);
  if (myP) {
    me.credits = myP.credits;
    document.getElementById('me-credits').textContent = app.formatCredits(myP.credits);
  }
  // Reset pending bet when entering new betting phase
  if (state.phase === 'betting' && lastPhase !== 'betting') {
    pendingBet = 0;
    betTotalEl.textContent = 0;
  }
  lastPhase = state.phase;
}

function renderDealer(dealer) {
  dealerCards.innerHTML = dealer.cards.map(c => cardHtml(c, 'classic')).join('');
  dealerScore.textContent = dealer.cards.length ? dealer.score : '–';
}

function renderPlayers(state) {
  playersArea.innerHTML = state.players.map(p => {
    const isActive = state.activeSeat === p.seat && state.phase === 'playing';
    const isMe = p.userId === me.id;
    const cardBack = p.cardBack || 'classic';
    const cardsHtml = p.cards.map(c => cardHtml(c, cardBack)).join('') || '<div style="height:88px;"></div>';
    return `<div class="seat ${isActive ? 'active' : ''} ${isMe ? 'me' : ''} ${p.lastResult ? 'result-' + p.lastResult : ''}">
      ${app.avatarHtml({ username: p.username, avatar: p.avatar }, 'md')}
      <div class="name">${app.escapeHtml(p.username)}${isMe ? ' (Du)' : ''}</div>
      <div class="credits-mini">◆ ${app.formatCredits(p.credits)}</div>
      <div class="cards">${cardsHtml}</div>
      <div class="hand-score">${p.cards.length ? p.score : '–'}</div>
      <div class="bet">${p.bet > 0 ? '💰 ' + p.bet : ''}</div>
      <div class="status-badge ${p.status}">${translateStatus(p.status)}</div>
    </div>`;
  }).join('');
}

function renderPhase(state) {
  const myP = state.players.find(p => p.userId === me.id);
  const sec = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
  clearInterval(timerHandle);
  betControls.classList.add('hidden');
  turnActions.classList.add('hidden');

  if (state.phase === 'betting') {
    const alreadyBet = myP && myP.bet > 0;
    phaseInfo.innerHTML = alreadyBet
      ? `Einsatz ${myP.bet} platziert · Warte auf andere <span class="timer">${sec}s</span>`
      : `Platziere deinen Einsatz <span class="timer">${sec}s</span>`;
    if (myP && !alreadyBet) betControls.classList.remove('hidden');
    startTimer(state.phaseEndsAt);
  } else if (state.phase === 'playing') {
    const active = state.players[state.activeSeat];
    if (active && active.userId === me.id) {
      phaseInfo.innerHTML = `Dein Zug <span class="timer">${sec}s</span>`;
      turnActions.classList.remove('hidden');
      const doubleBtn = turnActions.querySelector('[data-action="double"]');
      doubleBtn.disabled = !(myP && myP.cards.length === 2 && myP.credits >= myP.bet);
    } else if (active) {
      phaseInfo.innerHTML = `${app.escapeHtml(active.username)} ist am Zug <span class="timer">${sec}s</span>`;
    } else {
      phaseInfo.textContent = 'Karten werden ausgeteilt…';
    }
    startTimer(state.phaseEndsAt);
  } else if (state.phase === 'dealer') {
    phaseInfo.textContent = 'Dealer spielt…';
  } else if (state.phase === 'settling') {
    phaseInfo.innerHTML = `Auswertung — neue Runde in <span class="timer">${sec}s</span>`;
    startTimer(state.phaseEndsAt);
  } else {
    phaseInfo.textContent = 'Warte auf Spieler…';
  }
}

function startTimer(endsAt) {
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    const s = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    const el = phaseInfo.querySelector('.timer');
    if (el) el.textContent = s + 's';
    if (s <= 0) clearInterval(timerHandle);
  }, 500);
}

function cardHtml(card, cardBack = 'classic') {
  if (card.hidden) return `<div class="card-el back cb-${cardBack}"></div>`;
  const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
  const isRed = card.suit === 'H' || card.suit === 'D';
  return `<div class="card-el ${isRed ? 'red' : ''}">
    <div class="rank">${card.rank}</div>
    <div class="suit">${suits[card.suit]}</div>
    <div class="center">${suits[card.suit]}</div>
    <div class="rank-br">${card.rank}</div>
  </div>`;
}

function translateStatus(s) {
  return { idle: 'Bereit', ready: 'Gesetzt', stand: 'Passt', bust: 'Überkauft', blackjack: 'Blackjack!' }[s] || s;
}

function addMessage(msg) {
  const el = document.createElement('div');
  el.className = 'msg ' + (msg.type === 'system' ? 'system' : '');
  if (msg.type === 'chat') el.innerHTML = `<span class="who">${app.escapeHtml(msg.username)}:</span>${app.escapeHtml(msg.text)}`;
  else el.textContent = msg.text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}