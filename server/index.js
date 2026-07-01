process.on('uncaughtException', (err) => { console.error('[FATAL]', err); process.exit(1); });
process.on('unhandledRejection', (err) => { console.error('[FATAL]', err); process.exit(1); });

console.log('[boot] starting Blackjack Royale…');
console.log('[boot] node', process.version, 'cwd', process.cwd());

require('dotenv').config();
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const auth = require('./auth');
const db = require('./db');
const rooms = require('./rooms');
const shop = require('./shop');
const social = require('./social');
console.log('[boot] modules loaded');

// ---- Admin bootstrap ----
const ADMIN_USERNAME = 'Admin46';
const ADMIN_PASSWORD = 'Password12346Admin';
(async function ensureAdmin() {
  const existing = db.findUserByName(ADMIN_USERNAME);
  if (existing) {
    // Keep admin flag + password fresh so credentials always work.
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    db.updateUser(existing.id, { role: 'admin', passwordHash: hash });
    console.log('[boot] admin user refreshed');
    return;
  }
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  db.createUser({
    id: crypto.randomUUID(),
    username: ADMIN_USERNAME,
    passwordHash: hash,
    credits: 1000000,
    role: 'admin',
  });
  console.log('[boot] admin user created');
})();

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
rooms.setIo(io);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// ---- Auth ----
app.post('/api/register', auth.register);
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/me', auth.authMiddleware, (req, res) => res.json(publicUser(req.user)));

function publicUser(u) {
  return {
    id: u.id, username: u.username, credits: u.credits,
    avatar: u.avatar, theme: u.theme, cardBack: u.cardBack,
    inventory: u.inventory, role: u.role,
    stats: u.stats || { rounds: 0, wins: 0, losses: 0, pushes: 0, blackjacks: 0 },
    lastDailyClaim: u.lastDailyClaim || 0,
  };
}

// ---- Settings ----
app.patch('/api/settings', auth.authMiddleware, (req, res) => {
  const { theme, cardBack, avatar } = req.body || {};
  const patch = {};
  if (theme && (req.user.inventory || []).includes(`theme:${theme}`)) patch.theme = theme;
  else if (theme) return res.status(403).json({ error: 'Theme nicht freigeschaltet' });
  if (cardBack && (req.user.inventory || []).includes(`cardback:${cardBack}`)) patch.cardBack = cardBack;
  else if (cardBack) return res.status(403).json({ error: 'Kartendesign nicht freigeschaltet' });
  if (avatar && typeof avatar === 'object') {
    const bg = /^#[0-9a-fA-F]{6}$/.test(String(avatar.bg || '')) ? avatar.bg : req.user.avatar?.bg;
    let emoji = null;
    if (avatar.emoji) {
      if (avatar.emoji === 'none') emoji = null;
      else if ((req.user.inventory || []).includes(`avatar:${avatar.emoji}`)) {
        emoji = shop.findItem(`avatar:${avatar.emoji}`)?.emoji || null;
      } else return res.status(403).json({ error: 'Accessoire nicht freigeschaltet' });
    }
    patch.avatar = { bg, emoji };
  }
  db.updateUser(req.user.id, patch);
  res.json(publicUser(db.findUserById(req.user.id)));
});

app.post('/api/settings/password', auth.authMiddleware, async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof next !== 'string' || next.length < 6) return res.status(400).json({ error: 'Neues Passwort zu kurz (min. 6)' });
  const ok = await bcrypt.compare(String(current || ''), req.user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Aktuelles Passwort falsch' });
  const hash = await bcrypt.hash(next, 10);
  db.updateUser(req.user.id, { passwordHash: hash });
  res.json({ ok: true });
});

app.delete('/api/settings/account', auth.authMiddleware, async (req, res) => {
  if (req.user.role === 'admin') return res.status(403).json({ error: 'Admin kann sich nicht löschen' });
  const { password } = req.body || {};
  const ok = await bcrypt.compare(String(password || ''), req.user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Passwort falsch' });
  db.deleteUser(req.user.id);
  res.clearCookie('token');
  res.json({ ok: true });
});

// ---- Shop ----
app.get('/api/shop', auth.authMiddleware, (req, res) => {
  res.json({
    items: shop.catalog(db),
    inventory: req.user.inventory || [],
    credits: req.user.credits,
  });
});
app.post('/api/shop/buy', auth.authMiddleware, (req, res) => {
  try {
    const result = shop.buy(req.user, String(req.body?.id), db);
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ---- Daily Bonus ----
app.post('/api/daily', auth.authMiddleware, (req, res) => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const last = req.user.lastDailyClaim || 0;
  if (now - last < DAY_MS) {
    const wait = DAY_MS - (now - last);
    return res.status(429).json({ error: 'Zu früh', waitMs: wait });
  }
  const reward = 250;
  const credits = (req.user.credits || 0) + reward;
  db.updateUser(req.user.id, { credits, lastDailyClaim: now });
  res.json({ reward, credits, next: now + DAY_MS });
});

// ---- Credit Transfer to friend ----
app.post('/api/credits/transfer', auth.authMiddleware, (req, res) => {
  const { toId, amount } = req.body || {};
  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt) || amt <= 0) return res.status(400).json({ error: 'Ungültiger Betrag' });
  if (amt > 100000) return res.status(400).json({ error: 'Max. 100\'000 pro Transfer' });
  if (!(req.user.friends || []).includes(String(toId))) return res.status(403).json({ error: 'Nur an Freunde' });
  const other = db.findUserById(String(toId));
  if (!other) return res.status(404).json({ error: 'Empfänger nicht gefunden' });
  if (req.user.credits < amt) return res.status(400).json({ error: 'Nicht genug Credits' });
  const senderNew = req.user.credits - amt;
  const receiverNew = (other.credits || 0) + amt;
  db.updateCredits(req.user.id, senderNew);
  db.updateCredits(other.id, receiverNew);
  io.to(`user:${other.id}`).emit('credits:update', { credits: receiverNew });
  io.to(`user:${other.id}`).emit('dm:new', {
    from: req.user.id, to: other.id, text: `💸 Du hast ${amt} Credits von ${req.user.username} erhalten.`, at: Date.now(),
    system: true,
  });
  res.json({ credits: senderNew });
});

// ---- Friends ----
app.get('/api/friends', auth.authMiddleware, (req, res) => {
  res.json({
    friends: social.friendListView(req.user),
    requests: social.requestsView(req.user),
  });
});
app.post('/api/friends/request', auth.authMiddleware, (req, res) => {
  try {
    const target = db.findUserByName(String(req.body?.username || ''));
    const result = social.sendFriendRequest(req.user, String(req.body?.username || ''));
    // Notify target if online
    if (target) io.to(`user:${target.id}`).emit('friends:update');
    res.json(result);
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.post('/api/friends/accept', auth.authMiddleware, (req, res) => {
  const fromId = String(req.body?.fromId || '');
  social.acceptFriendRequest(req.user, fromId);
  io.to(`user:${fromId}`).emit('friends:update');
  res.json({ ok: true });
});
app.post('/api/friends/decline', auth.authMiddleware, (req, res) => {
  social.declineFriendRequest(req.user, String(req.body?.fromId || ''));
  res.json({ ok: true });
});
app.post('/api/friends/remove', auth.authMiddleware, (req, res) => {
  const otherId = String(req.body?.otherId || '');
  social.removeFriend(req.user, otherId);
  io.to(`user:${otherId}`).emit('friends:update');
  res.json({ ok: true });
});

// ---- DMs ----
app.get('/api/dm/:otherId', auth.authMiddleware, (req, res) => {
  if (!(req.user.friends || []).includes(req.params.otherId)) {
    return res.status(403).json({ error: 'Nur zwischen Freunden' });
  }
  res.json({ messages: db.getConversation(req.user.id, req.params.otherId) });
});

// ---- Rooms ----
app.get('/api/rooms', auth.authMiddleware, (req, res) => {
  res.json({ rooms: rooms.listRooms({
    requestingUserId: req.user.id,
    isAdmin: req.user.role === 'admin',
    friendsOf: req.user.friends || [],
  }) });
});
app.post('/api/rooms', auth.authMiddleware, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 30) || `${req.user.username}'s Tisch`;
  const visibility = ['public', 'friends', 'password'].includes(req.body?.visibility) ? req.body.visibility : 'public';
  const password = visibility === 'password' ? String(req.body?.password || '').slice(0, 30) : '';
  if (visibility === 'password' && !password) return res.status(400).json({ error: 'Passwort erforderlich' });
  const room = rooms.createRoom({ name, hostId: req.user.id, visibility, password });
  res.json({ id: room.id });
});

app.get('/api/leaderboard', (_req, res) => res.json({ users: db.topUsers(10) }));

// ---- Admin ----
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Nur für Admins' });
  next();
}
app.get('/api/admin/users', auth.authMiddleware, adminOnly, (_req, res) => {
  const users = db.allUsers().map(u => ({
    id: u.id, username: u.username, credits: u.credits, role: u.role,
    createdAt: u.createdAt, avatar: u.avatar,
    online: social.isOnline(u.id),
    roomId: social.roomOf(u.id),
  }));
  res.json({ users });
});
app.post('/api/admin/credits', auth.authMiddleware, adminOnly, (req, res) => {
  const { userId, delta } = req.body || {};
  const target = db.findUserById(String(userId || ''));
  if (!target) return res.status(404).json({ error: 'User nicht gefunden' });
  const d = Math.floor(Number(delta));
  if (!Number.isFinite(d)) return res.status(400).json({ error: 'Ungültiger Betrag' });
  const next = Math.max(0, target.credits + d);
  db.updateCredits(target.id, next);
  io.to(`user:${target.id}`).emit('credits:update', { credits: next });
  res.json({ userId: target.id, credits: next });
});
app.post('/api/admin/grant', auth.authMiddleware, adminOnly, (req, res) => {
  const target = db.findUserById(String(req.body?.userId || ''));
  const itemId = String(req.body?.itemId || '');
  if (!target || !shop.findItem(itemId)) return res.status(400).json({ error: 'Ungültig' });
  if (!(target.inventory || []).includes(itemId)) {
    target.inventory = [...(target.inventory || []), itemId];
    db.updateUser(target.id, { inventory: target.inventory });
  }
  res.json({ ok: true });
});
app.delete('/api/admin/user/:id', auth.authMiddleware, adminOnly, (req, res) => {
  const target = db.findUserById(req.params.id);
  if (!target) return res.status(404).json({ error: 'Nicht gefunden' });
  if (target.role === 'admin') return res.status(403).json({ error: 'Admin nicht löschbar' });
  db.deleteUser(target.id);
  res.json({ ok: true });
});

app.post('/api/admin/shop', auth.authMiddleware, adminOnly, (req, res) => {
  const { name, price, emoji, tier } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 40);
  const cleanEmoji = String(emoji || '').trim().slice(0, 8);
  const cleanPrice = Math.max(0, Math.floor(Number(price)));
  const okTier = ['basic', 'rare', 'legendary'].includes(tier) ? tier : 'basic';
  if (!cleanName || !cleanEmoji || !Number.isFinite(cleanPrice)) {
    return res.status(400).json({ error: 'Name, Emoji und Preis erforderlich' });
  }
  const shortId = crypto.randomBytes(4).toString('hex');
  const item = {
    id: `avatar:custom-${shortId}`,
    kind: 'avatar',
    name: cleanName,
    price: cleanPrice,
    tier: okTier,
    emoji: cleanEmoji,
    custom: true,
  };
  db.addCustomItem(item);
  res.json(item);
});

app.delete('/api/admin/shop/:id', auth.authMiddleware, adminOnly, (req, res) => {
  const ok = db.removeCustomItem(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json({ ok: true });
});

// ---- Socket.io ----
io.use((socket, next) => {
  const cookieHeader = socket.handshake.headers.cookie || '';
  const cookies = {};
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    cookies[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
  }
  const token = cookies.token;
  const payload = token ? auth.verifyToken(token) : null;
  if (!payload) return next(new Error('Nicht angemeldet'));
  const user = db.findUserById(payload.id);
  if (!user) return next(new Error('Benutzer nicht gefunden'));
  socket.user = { id: user.id, username: user.username, role: user.role };
  next();
});

io.on('connection', (socket) => {
  social.markOnline(socket.user.id, socket.id);
  socket.join(`user:${socket.user.id}`);
  // Notify friends
  const user = db.findUserById(socket.user.id);
  for (const fid of (user.friends || [])) io.to(`user:${fid}`).emit('friends:update');

  socket.on('room:join', ({ roomId, password }) => {
    try {
      const room = rooms.getRoom(roomId);
      if (!room) return socket.emit('error:msg', 'Raum existiert nicht');
      const dbUser = db.findUserById(socket.user.id);
      const host = db.findUserById(room.hostId);
      rooms.joinRoom(room, dbUser, {
        password,
        isAdmin: dbUser.role === 'admin',
        friendsOfHost: host?.friends || [],
      });
      socket.roomId = room.id;
      socket.join(`room:${room.id}`);
      social.setRoom(socket.user.id, room.id);
      socket.emit('room:joined', { roomId: room.id, chat: room.chat.slice(-30) });
      rooms.broadcastMessage(room, io, `${socket.user.username} betritt den Tisch.`);
      rooms.broadcastState(room, io);
      rooms.maybeAutoStart(room, io);
    } catch (err) { socket.emit('error:msg', err.message); }
  });

  socket.on('room:leave', () => handleLeave(socket));

  socket.on('room:bet', ({ amount }) => {
    const room = rooms.getRoom(socket.roomId);
    if (!room) return;
    try { rooms.placeBet(room, socket.user.id, amount); rooms.broadcastState(room, io); }
    catch (err) { socket.emit('error:msg', err.message); }
  });

  socket.on('room:action', ({ action }) => {
    const room = rooms.getRoom(socket.roomId);
    if (!room) return;
    try { rooms.playerAction(room, socket.user.id, action); rooms.broadcastState(room, io); }
    catch (err) { socket.emit('error:msg', err.message); }
  });

  socket.on('room:chat', ({ text }) => {
    const room = rooms.getRoom(socket.roomId);
    if (!room) return;
    rooms.chatMessage(room, io, socket.user.username, text);
  });

  // ---- DMs via socket ----
  socket.on('dm:send', ({ toId, text }) => {
    const me = db.findUserById(socket.user.id);
    if (!me || !(me.friends || []).includes(toId)) return socket.emit('error:msg', 'Nur an Freunde');
    const clean = String(text || '').slice(0, 500).trim();
    if (!clean) return;
    const msg = db.addMessage(me.id, toId, clean);
    socket.emit('dm:new', msg);
    io.to(`user:${toId}`).emit('dm:new', msg);
  });

  socket.on('disconnect', () => {
    handleLeave(socket);
    const fullyOffline = social.markOffline(socket.user.id, socket.id);
    if (fullyOffline) {
      const u = db.findUserById(socket.user.id);
      if (u) for (const fid of (u.friends || [])) io.to(`user:${fid}`).emit('friends:update');
    }
  });
});

function handleLeave(socket) {
  if (!socket.roomId) return;
  const room = rooms.getRoom(socket.roomId);
  if (room) {
    rooms.leaveRoom(room, socket.user.id);
    rooms.broadcastMessage(room, io, `${socket.user.username} hat den Tisch verlassen.`);
    rooms.broadcastState(room, io);
  }
  socket.leave(`room:${socket.roomId}`);
  social.setRoom(socket.user.id, null);
  socket.roomId = null;
}

// SPA fallback
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => { if (err) next(err); });
});

server.on('error', (err) => { console.error('[FATAL] server error:', err); process.exit(1); });
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[boot] Blackjack Royale listening on 0.0.0.0:${PORT}`);
});