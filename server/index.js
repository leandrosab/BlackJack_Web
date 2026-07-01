// Catch startup crashes so Render logs show a real reason.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (err) => {
  console.error('[FATAL] unhandledRejection:', err);
  process.exit(1);
});

console.log('[boot] starting Blackjack Royale…');
console.log('[boot] node', process.version, 'cwd', process.cwd());

require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const auth = require('./auth');
const db = require('./db');
const rooms = require('./rooms');
console.log('[boot] modules loaded');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
rooms.setIo(io);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

// --- Auth routes ---
app.post('/api/register', auth.register);
app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/me', auth.authMiddleware, auth.me);

// --- Rooms ---
app.get('/api/rooms', auth.authMiddleware, (req, res) => {
  res.json({ rooms: rooms.listRooms() });
});

app.post('/api/rooms', auth.authMiddleware, (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 30) || `${req.user.username}'s Tisch`;
  const room = rooms.createRoom({ name, hostId: req.user.id });
  res.json({ id: room.id });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ users: db.topUsers(10) });
});

// --- Socket.io ---
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
  socket.user = { id: user.id, username: user.username };
  next();
});

io.on('connection', (socket) => {
  socket.on('room:join', ({ roomId }) => {
    try {
      const room = rooms.getRoom(roomId);
      if (!room) return socket.emit('error:msg', 'Raum existiert nicht');
      const dbUser = db.findUserById(socket.user.id);
      rooms.joinRoom(room, dbUser);
      socket.roomId = room.id;
      socket.join(`room:${room.id}`);
      socket.emit('room:joined', { roomId: room.id, chat: room.chat.slice(-30) });
      rooms.broadcastMessage(room, io, `${socket.user.username} betritt den Tisch.`);
      rooms.broadcastState(room, io);
      rooms.maybeAutoStart(room, io);
    } catch (err) {
      socket.emit('error:msg', err.message);
    }
  });

  socket.on('room:leave', () => handleLeave(socket));

  socket.on('room:bet', ({ amount }) => {
    const room = rooms.getRoom(socket.roomId);
    if (!room) return;
    try {
      rooms.placeBet(room, socket.user.id, amount);
      rooms.broadcastState(room, io);
    } catch (err) {
      socket.emit('error:msg', err.message);
    }
  });

  socket.on('room:action', ({ action }) => {
    const room = rooms.getRoom(socket.roomId);
    if (!room) return;
    try {
      rooms.playerAction(room, socket.user.id, action);
      rooms.broadcastState(room, io);
    } catch (err) {
      socket.emit('error:msg', err.message);
    }
  });

  socket.on('room:chat', ({ text }) => {
    const room = rooms.getRoom(socket.roomId);
    if (!room) return;
    rooms.chatMessage(room, io, socket.user.username, text);
  });

  socket.on('disconnect', () => handleLeave(socket));
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
  socket.roomId = null;
}

// SPA fallback — served AFTER static and API routes. Uses app.use (not app.get('*'))
// because path-to-regexp v6+ no longer accepts a bare '*'.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'), (err) => {
    if (err) next(err);
  });
});

server.on('error', (err) => {
  console.error('[FATAL] server error:', err);
  process.exit(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[boot] Blackjack Royale listening on 0.0.0.0:${PORT}`);
});
