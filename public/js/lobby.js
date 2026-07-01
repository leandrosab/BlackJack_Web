(async function () {
  const me = await app.loadMe();
  if (!me) return;
  app.renderSidebar('lobby');
  await Promise.all([loadRooms(), loadLeaderboard()]);
  setInterval(loadRooms, 4000);
  setInterval(loadLeaderboard, 15000);
})();

const roomsListEl = document.getElementById('rooms-list');
const lbEl = document.getElementById('leaderboard');
const visSel = document.getElementById('new-visibility');
const pwField = document.getElementById('pw-field');

visSel.addEventListener('change', () => {
  pwField.classList.toggle('hidden', visSel.value !== 'password');
});

document.getElementById('btn-create-confirm').addEventListener('click', async () => {
  const btn = document.getElementById('btn-create-confirm');
  btn.disabled = true;
  try {
    const body = {
      name: document.getElementById('new-name').value,
      visibility: visSel.value,
      password: document.getElementById('new-password').value,
    };
    const res = await fetch('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler');
    location.href = `/game.html?room=${data.id}`;
  } catch (err) {
    app.toast(err.message, 'error');
    btn.disabled = false;
  }
});

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms', { credentials: 'same-origin' });
    if (!res.ok) throw new Error();
    const { rooms } = await res.json();
    if (!rooms.length) {
      roomsListEl.innerHTML = '<div class="empty">Noch keine Tische. Eröffne den ersten!</div>';
      return;
    }
    roomsListEl.innerHTML = rooms.map(r => {
      const visTag = r.visibility === 'password'
        ? '<span class="tag password">🔒 Passwort</span>'
        : r.visibility === 'friends'
          ? '<span class="tag friends">👥 Nur Freunde</span>'
          : '<span class="tag public">🌐 Öffentlich</span>';
      return `
        <div class="room-row">
          <div class="info">
            <h3>${app.escapeHtml(r.name)} ${visTag}</h3>
            <div class="meta">Runde ${r.round} · ${translatePhase(r.phase)} · ${r.players}/5 Spieler</div>
          </div>
          <button class="btn primary small" onclick="joinRoom('${r.id}', ${r.locked ? 'true' : 'false'})">Beitreten</button>
        </div>`;
    }).join('');
  } catch {
    roomsListEl.innerHTML = '<div class="empty">Konnte Tische nicht laden.</div>';
  }
}

window.joinRoom = function (id, locked) {
  if (locked) {
    const pw = prompt('Passwort für diesen Tisch:');
    if (!pw) return;
    location.href = `/game.html?room=${id}&pw=${encodeURIComponent(pw)}`;
  } else {
    location.href = `/game.html?room=${id}`;
  }
};

async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const { users } = await res.json();
    if (!users.length) { lbEl.innerHTML = '<div class="empty">Noch keine Spieler.</div>'; return; }
    lbEl.innerHTML = users.map((u, i) => {
      const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
      return `<div class="leader">
        <div class="rank">${rank}</div>
        ${app.avatarHtml({ username: u.username, avatar: u.avatar }, 'sm')}
        <div class="name">${app.escapeHtml(u.username)}</div>
        <div class="credits-val">${app.formatCredits(u.credits)}</div>
      </div>`;
    }).join('');
  } catch {
    lbEl.innerHTML = '<div class="empty">Bestenliste nicht verfügbar.</div>';
  }
}

function translatePhase(p) {
  return { waiting: 'Warten', betting: 'Einsätze', playing: 'Läuft', dealer: 'Dealer', settling: 'Auswertung' }[p] || p;
}