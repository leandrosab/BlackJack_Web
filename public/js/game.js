const meName = document.getElementById('me-name');
const meCredits = document.getElementById('me-credits');
const tableTitle = document.getElementById('table-title');
const tableSubtitle = document.getElementById('table-subtitle');
const dealerCards = document.getElementById('dealer-cards');
const dealerScore = document.getElementById('dealer-score');
const playersArea = document.getElementById('players-area');
const phaseInfo = document.getElementById('phase-info');
const betControls = document.getElementById('bet-controls');
const turnActions = document.getElementById('turn-actions');
const betTotalEl = document.getElementById('bet-total');
const btnPlaceBet = document.getElementById('btn-place-bet');
const btnClearBet = document.getElementById('btn-clear-bet');
const btnBack = document.getElementById('btn-back');
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
const chatSend = document.getElementById('chat-send');
const toast = document.getElementById('toast');

const roomId = new URLSearchParams(location.search).get('room');
if (!roomId) location.href = '/lobby.html';

let me = null;
let socket = null;
let currentState = null;
let pendingBet = 0;
let timerHandle = null;

// --- init ---
async function init() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) return (location.href = '/');
    me = await res.json();
    meName.textContent = me.username;
    updateCredits(me.credits);
  } catch { return (location.href = '/'); }

  socket = io({ withCredentials: true });
  socket.on('connect', () => socket.emit('room:join', { roomId }));
  socket.on('connect_error', (err) => showToast('Verbindungsfehler: ' + err.message));
  socket.on('error:msg', (msg) => showToast(msg));
  socket.on('room:joined', ({ chat }) => {
    chatLog.innerHTML = '';
    (chat || []).forEach(m => addMessage(m));
  });
  socket.on('room:state', (state) => renderState(state));
  socket.on('room:message', (msg) => addMessage(msg));
}

btnBack.addEventListener('click', () => {
  socket?.emit('room:leave');
  setTimeout(() => (location.href = '/lobby.html'), 100);
});

// --- Betting chips ---
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const amount = parseInt(chip.dataset.chip, 10);
    pendingBet += amount;
    if (pendingBet > me.credits) pendingBet = me.credits;
    betTotalEl.textContent = pendingBet;
  });
});
btnClearBet.addEventListener('click', () => { pendingBet = 0; betTotalEl.textContent = 0; });
btnPlaceBet.addEventListener('click', () => {
  if (pendingBet < 10) return showToast('Min. Einsatz: 10');
  socket.emit('room:bet', { amount: pendingBet });
});

// --- Actions ---
turnActions.querySelectorAll('[data-action]').forEach(btn => {
  btn.addEventListener('click', () => socket.emit('room:action', { action: btn.dataset.action }));
});

// --- Chat ---
chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });
function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;
  socket.emit('room:chat', { text });
  chatInput.value = '';
}

// --- Render ---
function renderState(state) {
  currentState = state;
  tableTitle.textContent = state.name || 'Blackjack';
  renderDealer(state.dealer);
  renderPlayers(state);
  renderPhase(state);
  const myPlayer = state.players.find(p => p.userId === me.id);
  if (myPlayer) updateCredits(myPlayer.credits);
}

function renderDealer(dealer) {
  dealerCards.innerHTML = dealer.cards.map(cardHtml).join('');
  dealerScore.textContent = dealer.cards.length ? dealer.score : '–';
}

function renderPlayers(state) {
  playersArea.innerHTML = '';
  // Fill seats: show all seats up to 5
  const bySeat = {};
  state.players.forEach(p => { bySeat[p.seat] = p; });
  for (let seat = 0; seat < 5; seat++) {
    const p = bySeat[seat];
    if (!p) continue;
    const el = document.createElement('div');
    const isActive = state.activeSeat === p.seat && state.phase === 'playing';
    const isMe = p.userId === me.id;
    el.className = `seat ${isActive ? 'active' : ''} ${isMe ? 'me' : ''} ${p.lastResult ? 'result-' + p.lastResult : ''}`;
    const cardsHtml = p.cards.map(cardHtml).join('') || '<div style="height:92px;"></div>';
    const statusText = translateStatus(p.status);
    el.innerHTML = `
      <div class="name">${escapeHtml(p.username)}${isMe ? ' (Du)' : ''}</div>
      <div class="credits-mini">🪙 ${p.credits.toLocaleString('de-CH')}</div>
      <div class="cards">${cardsHtml}</div>
      <div class="hand-score">${p.cards.length ? p.score : '–'}</div>
      <div class="bet">${p.bet > 0 ? '💰 ' + p.bet : ''}</div>
      <div class="status-badge ${p.status}">${statusText}</div>
    `;
    playersArea.appendChild(el);
  }
}

function renderPhase(state) {
  const myPlayer = state.players.find(p => p.userId === me.id);
  const secLeft = Math.max(0, Math.ceil((state.phaseEndsAt - Date.now()) / 1000));
  clearInterval(timerHandle);

  betControls.classList.add('hidden');
  turnActions.classList.add('hidden');

  if (state.phase === 'betting') {
    const alreadyBet = myPlayer && myPlayer.bet > 0;
    phaseInfo.innerHTML = alreadyBet
      ? `Einsatz platziert (${myPlayer.bet}). Warte auf andere… <span class="timer">${secLeft}s</span>`
      : `Platziere deinen Einsatz <span class="timer">${secLeft}s</span>`;
    if (myPlayer && !alreadyBet) betControls.classList.remove('hidden');
    startTimer(state.phaseEndsAt);
  } else if (state.phase === 'playing') {
    const active = state.players[state.activeSeat];
    if (active && active.userId === me.id) {
      phaseInfo.innerHTML = `Dein Zug! <span class="timer">${secLeft}s</span>`;
      turnActions.classList.remove('hidden');
      const doubleBtn = turnActions.querySelector('[data-action="double"]');
      doubleBtn.disabled = !(myPlayer && myPlayer.cards.length === 2 && myPlayer.credits >= myPlayer.bet);
    } else if (active) {
      phaseInfo.innerHTML = `${escapeHtml(active.username)} ist am Zug <span class="timer">${secLeft}s</span>`;
    } else {
      phaseInfo.textContent = 'Karten werden ausgeteilt…';
    }
    startTimer(state.phaseEndsAt);
  } else if (state.phase === 'dealer') {
    phaseInfo.textContent = 'Dealer spielt…';
  } else if (state.phase === 'settling') {
    phaseInfo.innerHTML = `Auswertung — neue Runde in <span class="timer">${secLeft}s</span>`;
    startTimer(state.phaseEndsAt);
  } else if (state.phase === 'waiting') {
    phaseInfo.textContent = 'Warte auf Spieler…';
  }
}

function startTimer(endsAt) {
  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    const secLeft = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    const timerEl = phaseInfo.querySelector('.timer');
    if (timerEl) timerEl.textContent = secLeft + 's';
    if (secLeft <= 0) clearInterval(timerHandle);
  }, 500);
}

// --- helpers ---
function cardHtml(card) {
  if (card.hidden) return '<div class="card-el back"></div>';
  const suits = { H: '♥', D: '♦', C: '♣', S: '♠' };
  const isRed = card.suit === 'H' || card.suit === 'D';
  const rankDisp = card.rank;
  return `<div class="card-el ${isRed ? 'red' : ''}">
    <div class="rank">${rankDisp}</div>
    <div class="suit">${suits[card.suit]}</div>
    <div class="center">${suits[card.suit]}</div>
    <div class="rank-br">${rankDisp}</div>
  </div>`;
}

function translateStatus(s) {
  return {
    idle: 'Bereit',
    ready: 'Gesetzt',
    stand: 'Passt',
    bust: 'Überkauft',
    blackjack: 'Blackjack!',
  }[s] || s;
}

function addMessage(msg) {
  const el = document.createElement('div');
  el.className = `msg ${msg.type === 'system' ? 'system' : ''}`;
  if (msg.type === 'chat') {
    el.innerHTML = `<span class="who">${escapeHtml(msg.username)}:</span>${escapeHtml(msg.text)}`;
  } else {
    el.textContent = msg.text;
  }
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function updateCredits(c) {
  meCredits.textContent = c.toLocaleString('de-CH');
  if (me) me.credits = c;
  // Reset pending bet if we entered a new betting round
  if (currentState && currentState.phase !== 'betting') {
    pendingBet = 0;
    betTotalEl.textContent = 0;
  }
}

function showToast(msg, type = 'error') {
  toast.textContent = msg;
  toast.classList.remove('success', 'error');
  if (type === 'success') toast.classList.add('success');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Reset pending bet whenever new betting phase starts
let lastPhase = null;
setInterval(() => {
  if (currentState && currentState.phase === 'betting' && lastPhase !== 'betting') {
    pendingBet = 0;
    betTotalEl.textContent = 0;
  }
  lastPhase = currentState?.phase;
}, 500);

init();
