// Shared bootstrap for authenticated pages.
// Loads current user, applies theme, renders sidebar, exposes utility helpers.

window.app = (function () {
  let me = null;

  async function loadMe() {
    const res = await fetch('/api/me', { credentials: 'same-origin' });
    if (!res.ok) { location.href = '/'; return null; }
    me = await res.json();
    applyTheme(me.theme || 'midnight');
    return me;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  function currentUser() { return me; }

  function renderSidebar(activeKey) {
    const el = document.getElementById('app-sidebar');
    if (!el || !me) return;
    const isAdmin = me.role === 'admin';
    const items = [
      { key: 'lobby',    href: '/lobby.html',    label: 'Tische', icon: 'grid' },
      { key: 'friends',  href: '/friends.html',  label: 'Freunde', icon: 'users' },
      { key: 'shop',     href: '/shop.html',     label: 'Shop', icon: 'shop' },
      { key: 'settings', href: '/settings.html', label: 'Einstellungen', icon: 'gear' },
    ];
    if (isAdmin) items.push({ key: 'admin', href: '/admin.html', label: 'Admin', icon: 'shield' });

    el.innerHTML = `
      <div class="brand"><div class="logo">♠</div><span>Blackjack</span></div>
      <nav>
        ${items.map(it => `
          <a href="${it.href}" class="${it.key === activeKey ? 'active' : ''}">
            <span class="icon">${iconSvg(it.icon)}</span>
            <span class="label">${it.label}</span>
            ${it.key === 'friends' ? '<span class="badge hidden" id="badge-friends"></span>' : ''}
          </a>
        `).join('')}
      </nav>
      <div class="user-pill">
        ${avatarHtml(me, 'sm')}
        <div class="info">
          <div class="n">${escapeHtml(me.username)}${me.role === 'admin' ? ' <span class="tag" style="background:rgba(245,193,126,0.2);color:var(--warn)">Admin</span>' : ''}</div>
          <div class="c">${me.credits.toLocaleString('de-CH')}</div>
        </div>
        <button class="btn ghost small" onclick="app.logout()">↪</button>
      </div>
    `;
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/';
  }

  function iconSvg(name) {
    const map = {
      grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
      users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      shop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18M16 10a4 4 0 0 1-8 0"/></svg>',
      gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6 1.65 1.65 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09c.7.29 1.29.87 1.51 1.51 0 .61-.32 1.19-.33 1.82l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0c.29.7.87 1.29 1.51 1.51H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
      shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    };
    return map[name] || '';
  }

  function avatarHtml(user, size = 'md') {
    if (!user) return '';
    const bg = (user.avatar && user.avatar.bg) || '#3b6cf0';
    const emoji = user.avatar && user.avatar.emoji;
    const initial = (user.username || '?').charAt(0).toUpperCase();
    return `<div class="avatar avatar-${size}" style="background:${bg}">
      <span>${escapeHtml(initial)}</span>
      ${emoji ? `<span class="acc">${emoji}</span>` : ''}
    </div>`;
  }

  function cardBackClass(user) {
    return `cb-${(user && user.cardBack) || 'classic'}`;
  }

  function toast(msg, type = 'info') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast'; el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.className = 'toast ' + (type === 'error' ? 'error' : type === 'success' ? 'success' : '');
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(el._h);
    el._h = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function formatCredits(n) { return (n || 0).toLocaleString('de-CH'); }

  function openModal(id) { document.getElementById(id)?.classList.add('show'); }
  function closeModal(id) { document.getElementById(id)?.classList.remove('show'); }

  return {
    loadMe, currentUser, renderSidebar, logout,
    avatarHtml, cardBackClass, iconSvg,
    toast, escapeHtml, formatCredits,
    applyTheme, openModal, closeModal,
  };
})();