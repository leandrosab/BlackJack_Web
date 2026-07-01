const COLORS = [
  '#3b6cf0', '#7ee8b6', '#f57285', '#d4b483', '#c878ff', '#7eb6f5', '#f5c17e', '#a288c8',
  '#5b8a72', '#8a5b6e', '#5b6a8a', '#8a835b', '#4a4a4a', '#2b5b8e', '#a83232', '#2b7a4a',
];

let SHOP_CATALOG = [];
let me = null;

(async function () {
  me = await app.loadMe();
  if (!me) return;
  app.renderSidebar('settings');
  await loadShop();
  renderProfile();
  renderColorGrid();
  renderAccessoryGrid();
  renderThemeGrid();
  renderCardBackGrid();
})();

async function loadShop() {
  const res = await fetch('/api/shop', { credentials: 'same-origin' });
  const data = await res.json();
  SHOP_CATALOG = data.items;
  me.credits = data.credits;
  me.inventory = data.inventory;
}

function renderProfile() {
  document.getElementById('avatar-preview').innerHTML = app.avatarHtml(me, 'lg');
  document.getElementById('s-username').textContent = me.username;
  document.getElementById('s-role').textContent = me.role === 'admin' ? 'Administrator' : 'Spieler';
  document.getElementById('s-credits').textContent = '◆ ' + app.formatCredits(me.credits);

  const s = me.stats || { rounds: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0 };
  const winRate = s.rounds > 0 ? Math.round((s.wins / s.rounds) * 100) : 0;
  document.getElementById('stats-grid').innerHTML = `
    ${statTile('Runden', s.rounds)}
    ${statTile('Wins', s.wins, 'success')}
    ${statTile('Losses', s.losses, 'danger')}
    ${statTile('Blackjacks', s.blackjacks, 'accent')}
    ${statTile('Winrate', winRate + '%')}
  `;

  const btn = document.getElementById('btn-daily');
  const DAY_MS = 24 * 60 * 60 * 1000;
  const nextIn = (me.lastDailyClaim || 0) + DAY_MS - Date.now();
  if (nextIn > 0) {
    const h = Math.floor(nextIn / 3600000);
    const m = Math.floor((nextIn % 3600000) / 60000);
    btn.textContent = `🎁 In ${h}h ${m}m`;
    btn.disabled = true;
  } else {
    btn.textContent = '🎁 Daily Bonus';
    btn.disabled = false;
  }
}

function statTile(label, value, tone = '') {
  const color = tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : tone === 'accent' ? 'var(--accent)' : 'var(--text)';
  return `<div style="background:var(--surface-2);padding:10px 6px;border-radius:8px;">
    <div style="font-size:1.2rem;font-weight:700;color:${color};">${value}</div>
    <div class="tiny text-muted">${label}</div>
  </div>`;
}

document.addEventListener('click', async (e) => {
  if (e.target?.id === 'btn-daily') {
    try {
      const res = await fetch('/api/daily', { method: 'POST', credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      me = await (await fetch('/api/me', { credentials: 'same-origin' })).json();
      app.renderSidebar('settings');
      renderProfile();
      app.toast(`+${data.reward} Credits geholt!`, 'success');
    } catch (err) { app.toast(err.message, 'error'); }
  }
});

function renderColorGrid() {
  const el = document.getElementById('color-grid');
  el.innerHTML = COLORS.map(c => `<div class="swatch ${me.avatar.bg === c ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>`).join('');
  el.querySelectorAll('.swatch').forEach(sw => {
    sw.addEventListener('click', async () => {
      const color = sw.dataset.color;
      try {
        const res = await fetch('/api/settings', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin', body: JSON.stringify({ avatar: { bg: color, emoji: me.avatar.emoji ? extractShopId(me.avatar.emoji) : null } }),
        });
        if (!res.ok) throw new Error((await res.json()).error);
        me = await res.json();
        renderProfile();
        renderColorGrid();
        app.toast('Avatar-Farbe geändert', 'success');
      } catch (err) { app.toast(err.message, 'error'); }
    });
  });
}

function extractShopId(emoji) {
  const item = SHOP_CATALOG.find(i => i.emoji === emoji);
  return item ? item.id.split(':')[1] : null;
}

function renderAccessoryGrid() {
  const el = document.getElementById('acc-grid');
  const items = SHOP_CATALOG.filter(i => i.kind === 'avatar');
  const none = `<div class="shop-item ${!me.avatar.emoji ? 'owned' : ''}" data-none="1">
    <div class="preview">🚫</div>
    <div class="name">Kein Accessoire</div>
    <div class="footer"><span class="text-muted small">Standard</span>${!me.avatar.emoji ? '<span class="text-success small">Aktiv</span>' : '<button class="btn small">Wählen</button>'}</div>
  </div>`;
  el.innerHTML = none + items.map(it => renderItemCard(it, 'accessory')).join('');
  el.querySelectorAll('[data-none]').forEach(c => c.addEventListener('click', () => selectAccessory(null)));
  el.querySelectorAll('[data-accessory]').forEach(c => c.addEventListener('click', () => {
    const id = c.dataset.accessory;
    const owned = (me.inventory || []).includes(`avatar:${id}`);
    if (!owned) { app.toast('Erst im Shop kaufen', 'error'); return; }
    selectAccessory(id);
  }));
}

async function selectAccessory(shortId) {
  try {
    const res = await fetch('/api/settings', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ avatar: { bg: me.avatar.bg, emoji: shortId || 'none' } }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    me = await res.json();
    renderProfile();
    renderAccessoryGrid();
    app.toast('Accessoire aktualisiert', 'success');
  } catch (err) { app.toast(err.message, 'error'); }
}

function renderItemCard(item, mode) {
  const owned = (me.inventory || []).includes(item.id);
  const [kind, short] = item.id.split(':');
  const preview = kind === 'theme'
    ? `<div class="theme-swatch" style="--preview:${item.preview};background:${item.preview}"></div>`
    : kind === 'cardback'
      ? `<div class="cb cb-${short}"></div>`
      : `<div style="font-size: 2.4rem;">${item.emoji || '?'}</div>`;
  const isActive = kind === 'theme' ? me.theme === short : kind === 'cardback' ? me.cardBack === short : (me.avatar.emoji && me.avatar.emoji === item.emoji);
  const attr = mode === 'theme' ? `data-theme-id="${short}"` : mode === 'cardback' ? `data-cardback-id="${short}"` : `data-accessory="${short}"`;
  return `<div class="shop-item tier-${item.tier} ${owned ? 'owned' : ''} ${isActive ? 'owned' : ''}" ${attr}>
    <div class="preview">${preview}<span class="tier-badge">${item.tier}</span></div>
    <div class="name">${app.escapeHtml(item.name)}</div>
    <div class="footer">
      <span class="price">${item.price === 0 ? 'Gratis' : app.formatCredits(item.price)}</span>
      ${isActive ? '<span class="text-success small">Aktiv</span>' : (owned ? '<button class="btn small">Wählen</button>' : '<span class="text-muted small">🔒</span>')}
    </div>
  </div>`;
}

function renderThemeGrid() {
  const el = document.getElementById('theme-grid');
  const items = SHOP_CATALOG.filter(i => i.kind === 'theme');
  el.innerHTML = items.map(it => renderItemCard(it, 'theme')).join('');
  el.querySelectorAll('[data-theme-id]').forEach(c => c.addEventListener('click', async () => {
    const short = c.dataset.themeId;
    const owned = (me.inventory || []).includes(`theme:${short}`);
    if (!owned) return app.toast('Im Shop kaufen', 'error');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ theme: short }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      me = await res.json();
      app.applyTheme(me.theme);
      renderThemeGrid();
      app.toast('Theme aktiv', 'success');
    } catch (err) { app.toast(err.message, 'error'); }
  }));
}

function renderCardBackGrid() {
  const el = document.getElementById('cardback-grid');
  const items = SHOP_CATALOG.filter(i => i.kind === 'cardback');
  el.innerHTML = items.map(it => renderItemCard(it, 'cardback')).join('');
  el.querySelectorAll('[data-cardback-id]').forEach(c => c.addEventListener('click', async () => {
    const short = c.dataset.cardbackId;
    const owned = (me.inventory || []).includes(`cardback:${short}`);
    if (!owned) return app.toast('Im Shop kaufen', 'error');
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ cardBack: short }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      me = await res.json();
      renderCardBackGrid();
      app.toast('Kartendesign aktiv', 'success');
    } catch (err) { app.toast(err.message, 'error'); }
  }));
}

document.getElementById('btn-pw').addEventListener('click', async () => {
  const current = document.getElementById('pw-current').value;
  const next = document.getElementById('pw-next').value;
  if (!next || next.length < 6) return app.toast('Neues Passwort zu kurz', 'error');
  try {
    const res = await fetch('/api/settings/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ current, next }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-next').value = '';
    app.toast('Passwort geändert', 'success');
  } catch (err) { app.toast(err.message, 'error'); }
});

document.getElementById('btn-del').addEventListener('click', async () => {
  const password = document.getElementById('del-pw').value;
  if (!password) return;
  try {
    const res = await fetch('/api/settings/account', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ password }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    location.href = '/';
  } catch (err) { app.toast(err.message, 'error'); }
});