const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.json');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Default fields applied to any user missing them (schema migration on load).
const USER_DEFAULTS = {
  role: 'user',
  avatar: { bg: '#3b6cf0', emoji: null },
  theme: 'midnight',
  cardBack: 'classic',
  inventory: ['theme:midnight', 'cardback:classic'],
  friends: [],
  friendRequests: [],
  blocked: [],
  createdAt: 0,
};

function migrateUser(u) {
  for (const [k, v] of Object.entries(USER_DEFAULTS)) {
    if (u[k] === undefined) u[k] = Array.isArray(v) ? [...v] : (typeof v === 'object' && v ? { ...v } : v);
  }
  return u;
}

function load() {
  try {
    ensureDir();
    if (!fs.existsSync(DB_PATH)) {
      const initial = { users: [], messages: {} };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
      console.log('[db] created new database at', DB_PATH);
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    parsed.users = (parsed.users || []).map(migrateUser);
    parsed.messages = parsed.messages || {};
    console.log('[db] loaded database, users:', parsed.users.length);
    return parsed;
  } catch (err) {
    console.error('[db] load failed at', DB_PATH, '-', err.message);
    console.warn('[db] falling back to in-memory (data will NOT persist)');
    return { users: [], messages: {} };
  }
}

let cache = load();
let saveTimer = null;

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2));
    } catch (err) {
      console.error('[db] save failed:', err.message);
    }
    saveTimer = null;
  }, 100);
}

// ---- Users ----
function findUserByName(name) {
  const lower = String(name).toLowerCase();
  return cache.users.find(u => u.username.toLowerCase() === lower);
}
function findUserById(id) { return cache.users.find(u => u.id === id); }
function createUser({ id, username, passwordHash, credits, role }) {
  const user = migrateUser({
    id, username, passwordHash, credits,
    role: role || 'user',
    createdAt: Date.now(),
  });
  cache.users.push(user);
  save();
  return user;
}
function updateUser(userId, patch) {
  const u = findUserById(userId);
  if (!u) return null;
  Object.assign(u, patch);
  save();
  return u;
}
function updateCredits(userId, credits) { return updateUser(userId, { credits }); }
function deleteUser(userId) {
  const idx = cache.users.findIndex(u => u.id === userId);
  if (idx < 0) return false;
  cache.users.splice(idx, 1);
  delete cache.messages[userId];
  for (const other of cache.users) {
    other.friends = (other.friends || []).filter(f => f !== userId);
    other.friendRequests = (other.friendRequests || []).filter(r => r.from !== userId);
    if (cache.messages[other.id]) {
      cache.messages[other.id] = (cache.messages[other.id] || []).filter(m => m.with !== userId);
    }
  }
  save();
  return true;
}
function allUsers() { return cache.users; }
function topUsers(limit = 10) {
  return [...cache.users]
    .filter(u => u.role !== 'admin')
    .sort((a, b) => b.credits - a.credits)
    .slice(0, limit)
    .map(u => ({ username: u.username, credits: u.credits, avatar: u.avatar }));
}

// ---- Messages (DMs) ----
// Stored as messages[userId] = [{ with, from, to, text, at }, ...]
function getConversation(userId, otherId) {
  const list = cache.messages[userId] || [];
  return list.filter(m => m.with === otherId).slice(-100);
}
function addMessage(fromId, toId, text) {
  const at = Date.now();
  const forSender = { with: toId, from: fromId, to: toId, text, at };
  const forReceiver = { with: fromId, from: fromId, to: toId, text, at };
  (cache.messages[fromId] ||= []).push(forSender);
  (cache.messages[toId] ||= []).push(forReceiver);
  // trim
  const trim = (arr) => arr.length > 500 ? arr.slice(-500) : arr;
  cache.messages[fromId] = trim(cache.messages[fromId]);
  cache.messages[toId] = trim(cache.messages[toId]);
  save();
  return { from: fromId, to: toId, text, at };
}

module.exports = {
  findUserByName, findUserById, createUser, updateUser, updateCredits, deleteUser,
  allUsers, topUsers,
  getConversation, addMessage,
};
