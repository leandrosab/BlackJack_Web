let items = [];
let inventory = [];
let credits = 0;
let filter = 'all';
let me = null;

(async function () {
  me = await app.loadMe();
  if (!me) return;
  app.renderSidebar('shop');
  await load();
  render();
  document.querySelectorAll('.tab-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.cat;
      document.querySelectorAll('.tab-filter').forEach(b => b.classList.toggle('primary', b === btn));
      render();
    });
  });
})();

async function load() {
  const res = await fetch('/api/shop', { credentials: 'same-origin' });
  const data = await res.json();
  items = data.items;
  inventory = data.inventory;
  credits = data.credits;
}

function render() {
  const grid = document.getElementById('items-grid');
  const list = filter === 'all' ? items : items.filter(i => i.kind === filter);
  grid.innerHTML = list.map(it => renderCard(it)).join('');
  grid.querySelectorAll('[data-buy]').forEach(btn => {
    btn.addEventListener('click', () => buy(btn.dataset.buy));
  });
}

function renderCard(it) {
  const owned = inventory.includes(it.id);
  const canAfford = credits >= it.price;
  const [kind, short] = it.id.split(':');
  const preview = kind === 'theme'
    ? `<div class="theme-swatch" style="background:${it.preview}"></div>`
    : kind === 'cardback'
      ? `<div class="cb cb-${short}"></div>`
      : `<div style="font-size:2.4rem">${it.emoji || '?'}</div>`;
  return `<div class="shop-item tier-${it.tier} ${owned ? 'owned' : ''}">
    <div class="preview">${preview}<span class="tier-badge">${it.tier}</span></div>
    <div class="name">${app.escapeHtml(it.name)}</div>
    <div class="text-muted small">${kindLabel(kind)}</div>
    <div class="footer">
      <span class="price">${it.price === 0 ? 'Gratis' : app.formatCredits(it.price)}</span>
      ${owned ? '<span class="text-success small">✓ Freigeschaltet</span>' :
        `<button class="btn small primary" ${canAfford ? '' : 'disabled'} data-buy="${it.id}">Kaufen</button>`}
    </div>
  </div>`;
}

function kindLabel(k) {
  return { theme: 'Theme', cardback: 'Kartendesign', avatar: 'Avatar-Accessoire' }[k] || k;
}

async function buy(id) {
  try {
    const res = await fetch('/api/shop/buy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin', body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    credits = data.credits;
    inventory = data.inventory;
    me.credits = credits; me.inventory = inventory;
    app.renderSidebar('shop');
    render();
    app.toast('Gekauft — im Einstellungs-Menü aktivieren.', 'success');
  } catch (err) { app.toast(err.message, 'error'); }
}