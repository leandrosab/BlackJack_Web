const meName = document.getElementById('me-name');
const meCredits = document.getElementById('me-credits');
const roomsList = document.getElementById('rooms-list');
const leaderboard = document.getElementById('leaderboard');
const btnCreate = document.getElementById('btn-create');
const btnLogout = document.getElementById('btn-logout');
const roomNameInput = document.getElementById('room-name');
const toast = document.getElementById('toast');

function showToast(msg, type = 'error') {
  toast.textContent = msg;
  toast.classList.remove('success', 'error');
  if (type === 'success') toast.classList.add('success');
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

async function loadMe() {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) { window.location.href = '/'; return; }
    const user = await res.json();
    meName.textContent = user.username;
    meCredits.textContent = user.credits.toLocaleString('de-CH');
  } catch {
    window.location.href = '/';
  }
}

async function loadRooms() {
  try {
    const res = await fetch('/api/rooms', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Fehler');
    const data = await res.json();
    if (!data.rooms.length) {
      roomsList.innerHTML = '<div class="rooms-empty">Noch keine Tische offen — eröffne den ersten! 🃏</div>';
      return;
    }
    roomsList.innerHTML = data.rooms.map(r => `
      <div class="room-row">
        <div class="room-info">
          <h3>${escapeHtml(r.name)}</h3>
          <div class="meta">Runde ${r.round} · Phase: ${translatePhase(r.phase)} · ${r.players}/5 Spieler</div>
        </div>
        <button class="btn primary small" data-join="${r.id}">Beitreten</button>
      </div>
    `).join('');
    roomsList.querySelectorAll('[data-join]').forEach(btn => {
      btn.addEventListener('click', () => {
        window.location.href = `/game.html?room=${btn.dataset.join}`;
      });
    });
  } catch (err) {
    roomsList.innerHTML = '<div class="rooms-empty">Konnte Tische nicht laden.</div>';
  }
}

async function loadLeaderboard() {
  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();
    if (!data.users.length) {
      leaderboard.innerHTML = '<div class="rooms-empty">Noch keine Spieler.</div>';
      return;
    }
    leaderboard.innerHTML = data.users.map((u, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`;
      return `<div class="leader"><span><span class="rank">${medal}</span>${escapeHtml(u.username)}</span><span class="credits">🪙 ${u.credits.toLocaleString('de-CH')}</span></div>`;
    }).join('');
  } catch {
    leaderboard.innerHTML = '<div class="rooms-empty">Bestenliste nicht verfügbar.</div>';
  }
}

function translatePhase(p) {
  return { waiting: 'Wartend', betting: 'Einsätze', playing: 'Spiel läuft', dealer: 'Dealer', settling: 'Auswertung' }[p] || p;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

btnCreate.addEventListener('click', async () => {
  btnCreate.disabled = true;
  try {
    const res = await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ name: roomNameInput.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Fehler');
    window.location.href = `/game.html?room=${data.id}`;
  } catch (err) {
    showToast(err.message);
    btnCreate.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  window.location.href = '/';
});

loadMe();
loadRooms();
loadLeaderboard();
setInterval(loadRooms, 4000);
setInterval(loadLeaderboard, 15000);
