require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const { Server } = require('socket.io');

const auth = require('./auth');
const db = require('./db');
const rooms = require('./rooms');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);
rooms.setIo(io);

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

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
      // Get up-to-date credits from DB
      const dbUser = db.findUserById(socket.user.id);
      const player = rooms.joinRoom(room, dbUser);
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

  socket.on('room:leave', () => {
    handleLeave(socket);
  });

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

  socket.on('disconnect', () => {
    handleLeave(socket);
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
  socket.roomId = null;
}

// Fallback route for SPA-like navigation
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🃏 Blackjack läuft auf http://localhost:${PORT}`);
});
