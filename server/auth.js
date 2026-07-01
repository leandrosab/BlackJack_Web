const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me-in-production';
const TOKEN_TTL = '7d';
const STARTING_CREDITS = 1000;

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token;
  const payload = token ? verifyToken(token) : null;
  if (!payload) return res.status(401).json({ error: 'Nicht angemeldet' });
  const user = db.findUserById(payload.id);
  if (!user) return res.status(401).json({ error: 'Benutzer nicht gefunden' });
  req.user = user;
  next();
}

function validateUsername(name) {
  if (typeof name !== 'string') return 'Ungültiger Benutzername';
  const trimmed = name.trim();
  if (trimmed.length < 3 || trimmed.length > 16) return 'Benutzername: 3-16 Zeichen';
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) return 'Nur Buchstaben, Zahlen, _ und -';
  return null;
}

function validatePassword(pw) {
  if (typeof pw !== 'string') return 'Ungültiges Passwort';
  if (pw.length < 6 || pw.length > 100) return 'Passwort: mindestens 6 Zeichen';
  return null;
}

async function register(req, res) {
  const { username, password } = req.body || {};
  const uErr = validateUsername(username);
  if (uErr) return res.status(400).json({ error: uErr });
  const pErr = validatePassword(password);
  if (pErr) return res.status(400).json({ error: pErr });

  const trimmed = username.trim();
  if (db.findUserByName(trimmed)) {
    return res.status(409).json({ error: 'Benutzername bereits vergeben' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const id = crypto.randomUUID();
  db.createUser({ id, username: trimmed, passwordHash, credits: STARTING_CREDITS });

  const user = db.findUserById(id);
  const token = signToken(user);
  setCookie(res, token);
  res.json(publicUser(user));
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Fehlende Angaben' });

  const user = db.findUserByName(username.trim());
  if (!user) return res.status(401).json({ error: 'Falscher Name oder Passwort' });

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Falscher Name oder Passwort' });

  const token = signToken(user);
  setCookie(res, token);
  res.json(publicUser(user));
}

function publicUser(u) {
  return {
    id: u.id, username: u.username, credits: u.credits,
    avatar: u.avatar, theme: u.theme, cardBack: u.cardBack,
    inventory: u.inventory, role: u.role,
  };
}

function logout(req, res) {
  res.clearCookie('token');
  res.json({ ok: true });
}

function me(req, res) {
  res.json(publicUser(req.user));
}

function setCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

module.exports = { register, login, logout, me, authMiddleware, verifyToken, JWT_SECRET };
