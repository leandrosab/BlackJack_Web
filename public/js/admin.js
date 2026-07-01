let users = [];
let editing = null;

(async function () {
  const me = await app.loadMe();
  if (!me) return;
  if (me.role !== 'admin') { location.href = '/lobby.html'; return; }
  app.renderSidebar('admin');
  await load();
  render();
  setInterval(async () => { await load(); render(); }, 8000);
})();

async function load() {
  const res = await fetch('/api/admin/users', { credentials: 'same-origin' });
  const data = await res.json();
  users = data.users;
}

function render() {
  const filter = document.getElementById('filter').value.toLowerCase();
  const filtered = users.filter(u => !filter || u.username.toLowerCase().includes(filter));
  document.getElementById('user-count').textContent = `${filtered.length} User (${users.filter(u => u.online).length} online)`;
  const tbody = document.getElementById('user-tbody');
  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td><span class="dot ${u.online ? 'online' : ''}"></span>${u.online ? 'Online' : 'Offline'}</td>
      <td>
        <div class="row gap-8">
          ${app.avatarHtml({ username: u.username, avatar: u.avatar }, 'sm')}
          <span>${app.escapeHtml(u.username)}</span>
        </div>
      </td>
      <td><span class="badge-role ${u.role}">${u.role}</span></td>
      <td class="text-accent">${app.formatCredits(u.credits)}</td>
      <td>${u.roomId ? `<span class="text-info small">Raum ${u.roomId}</span>` : '<span class="text-muted small">—</span>'}</td>
      <td class="tiny text-muted">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('de-CH') : '—'}</td>
      <td class="actions">
        <button class="btn small" data-credits="${u.id}">◆ Credits</button>
        ${u.role !== 'admin' ? `<button class="btn small danger" data-del="${u.id}">Löschen</button>` : ''}
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('[data-credits]').forEach(b => b.addEventListener('click', () => openCredits(b.dataset.credits)));
  tbody.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => delUser(b.dataset.del)));
}

document.getElementById('filter').addEventListener('input', render);

function openCredits(userId) {
  editing = users.find(u => u.id === userId);
  document.getElementById('cm-user').textContent = `${editing.username} — aktuell: ${app.formatCredits(editing.credits)}`;
  document.getElementById('cm-delta').value = 1000;
  app.openModal('credit-modal');
}

document.querySelectorAll('[data-preset]').forEach(b => {
  b.addEventListener('click', () => { document.getElementById('cm-delta').value = b.dataset.preset; });
});

document.getElementById('btn-apply-credits').addEventListener('click', async () => {
  const delta = parseInt(document.getElementById('cm-delta').value, 10);
  if (!editing || !Number.isFinite(delta)) return;
  try {
    const res = await fetch('/api/admin/credits', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ userId: editing.id, delta }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    app.toast(`Credits aktualisiert: ${app.formatCredits(data.credits)}`, 'success');
    app.closeModal('credit-modal');
    await load(); render();
  } catch (err) { app.toast(err.message, 'error'); }
});

async function delUser(id) {
  const u = users.find(u => u.id === id);
  if (!u) return;
  if (!confirm(`Wirklich Konto von "${u.username}" löschen?`)) return;
  try {
    const res = await fetch('/api/admin/user/' + id, { method: 'DELETE', credentials: 'same-origin' });
    if (!res.ok) throw new Error((await res.json()).error);
    await load(); render();
    app.toast('Gelöscht', 'success');
  } catch (err) { app.toast(err.message, 'error'); }
}