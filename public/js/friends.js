let me = null;
let friends = [];
let requests = [];
let activeDm = null;
let socket = null;

(async function () {
  me = await app.loadMe();
  if (!me) return;
  app.renderSidebar('friends');
  await load();
  render();
  connectSocket();
})();

function connectSocket() {
  socket = io({ withCredentials: true });
  socket.on('friends:update', async () => { await load(); render(); });
  socket.on('dm:new', (msg) => {
    if (activeDm && (msg.from === activeDm || msg.to === activeDm)) {
      appendDmMsg(msg);
    } else if (msg.to === me.id) {
      const from = friends.find(f => f.id === msg.from);
      app.toast(`💬 Neue Nachricht von ${from?.username || 'jemandem'}`);
    }
  });
}

async function load() {
  const res = await fetch('/api/friends', { credentials: 'same-origin' });
  const data = await res.json();
  friends = data.friends;
  requests = data.requests;
}

function render() {
  renderRequests();
  renderFriends();
}

function renderRequests() {
  const card = document.getElementById('req-card');
  const el = document.getElementById('requests');
  if (!requests.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  el.innerHTML = requests.map(r => `
    <div class="friend-row">
      ${app.avatarHtml({ username: r.username, avatar: r.avatar }, 'sm')}
      <div class="name">${app.escapeHtml(r.username)}</div>
      <button class="btn small primary" data-accept="${r.fromId}">✓</button>
      <button class="btn small danger" data-decline="${r.fromId}">×</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-accept]').forEach(b => b.addEventListener('click', () => act('accept', b.dataset.accept)));
  el.querySelectorAll('[data-decline]').forEach(b => b.addEventListener('click', () => act('decline', b.dataset.decline)));
}

async function act(kind, id) {
  const body = kind === 'accept' ? { fromId: id } : kind === 'decline' ? { fromId: id } : { otherId: id };
  const url = kind === 'accept' ? '/api/friends/accept' : kind === 'decline' ? '/api/friends/decline' : '/api/friends/remove';
  try {
    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    await load(); render();
  } catch (err) { app.toast(err.message, 'error'); }
}

function renderFriends() {
  const el = document.getElementById('friends');
  if (!friends.length) { el.innerHTML = '<div class="empty">Noch keine Freunde. Add jemanden!</div>'; return; }
  el.innerHTML = friends.map(f => `
    <div class="friend-row" data-open="${f.id}" style="cursor:pointer">
      ${app.avatarHtml({ username: f.username, avatar: f.avatar }, 'sm')}
      <div class="flex1">
        <div class="name">${app.escapeHtml(f.username)}</div>
        ${f.online ? (f.roomId ? `<div class="roomtag">🃏 In Raum</div>` : '<div class="roomtag">Online</div>') : '<div class="tiny text-muted">Offline</div>'}
      </div>
      <span class="status ${f.online ? 'online' : ''}"></span>
      <button class="btn small ghost" data-send="${f.id}" title="Credits senden">💸</button>
      <button class="btn small ghost" data-remove="${f.id}" title="Freund entfernen">×</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-open]').forEach(row => row.addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    openDm(row.dataset.open);
  }));
  el.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openSendCredits(b.dataset.send);
  }));
  el.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Freund entfernen?')) act('remove', b.dataset.remove);
  }));
}

let sendTarget = null;
function openSendCredits(friendId) {
  sendTarget = friends.find(f => f.id === friendId);
  if (!sendTarget) return;
  document.getElementById('send-target').textContent = `An ${sendTarget.username} — du hast ◆ ${app.formatCredits(me.credits)}`;
  document.getElementById('send-amount').value = 500;
  app.openModal('send-modal');
}
document.querySelectorAll('#send-modal [data-preset]').forEach(b => {
  b.addEventListener('click', () => { document.getElementById('send-amount').value = b.dataset.preset; });
});
document.getElementById('btn-send-credits').addEventListener('click', async () => {
  const amount = parseInt(document.getElementById('send-amount').value, 10);
  if (!sendTarget || !Number.isFinite(amount) || amount <= 0) return;
  try {
    const res = await fetch('/api/credits/transfer', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ toId: sendTarget.id, amount }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    me.credits = data.credits;
    app.renderSidebar('friends');
    app.closeModal('send-modal');
    app.toast(`${amount} Credits an ${sendTarget.username} gesendet`, 'success');
  } catch (err) { app.toast(err.message, 'error'); }
});

document.getElementById('btn-add').addEventListener('click', async () => {
  const username = document.getElementById('add-name').value.trim();
  if (!username) return;
  try {
    const res = await fetch('/api/friends/request', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    document.getElementById('add-name').value = '';
    app.toast(data.autoAccepted ? 'Ihr seid nun Freunde!' : 'Anfrage gesendet', 'success');
    await load(); render();
  } catch (err) { app.toast(err.message, 'error'); }
});

async function openDm(friendId) {
  activeDm = friendId;
  const friend = friends.find(f => f.id === friendId);
  document.getElementById('dm-header').textContent = `Chat mit ${friend.username}`;
  document.getElementById('dm-empty').classList.add('hidden');
  document.getElementById('dm-body').classList.remove('hidden');
  const res = await fetch(`/api/dm/${friendId}`, { credentials: 'same-origin' });
  const data = await res.json();
  const log = document.getElementById('dm-log');
  log.innerHTML = '';
  (data.messages || []).forEach(appendDmMsg);
}

function appendDmMsg(msg) {
  const log = document.getElementById('dm-log');
  const mine = msg.from === me.id;
  const el = document.createElement('div');
  el.className = 'msg';
  el.innerHTML = mine
    ? `<div style="text-align:right"><span style="display:inline-block;background:var(--accent);color:var(--accent-contrast);padding:6px 10px;border-radius:10px;max-width:75%;">${app.escapeHtml(msg.text)}</span></div>`
    : `<div><span style="display:inline-block;background:var(--surface-2);padding:6px 10px;border-radius:10px;max-width:75%;">${app.escapeHtml(msg.text)}</span></div>`;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
}

document.getElementById('dm-send').addEventListener('click', sendDm);
document.getElementById('dm-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendDm(); });
function sendDm() {
  const text = document.getElementById('dm-input').value.trim();
  if (!text || !activeDm) return;
  socket.emit('dm:send', { toId: activeDm, text });
  document.getElementById('dm-input').value = '';
}