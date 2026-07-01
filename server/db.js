const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'db.json');

function ensureDir() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  try {
    ensureDir();
    if (!fs.existsSync(DB_PATH)) {
      const initial = { users: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
      console.log('[db] created new database at', DB_PATH);
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    console.log('[db] loaded database, users:', parsed.users?.length ?? 0);
    return parsed;
  } catch (err) {
    console.error('[db] load failed at', DB_PATH, '-', err.message);
    console.warn('[db] falling back to in-memory (data will NOT persist)');
    return { users: [] };
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

function findUserByName(name) {
  const lower = name.toLowerCase();
  return cache.users.find(u => u.username.toLowerCase() === lower);
}

function findUserById(id) {
  return cache.users.find(u => u.id === id);
}

function createUser({ id, username, passwordHash, credits }) {
  cache.users.push({ id, username, passwordHash, credits, createdAt: Date.now() });
  save();
}

function updateCredits(userId, credits) {
  const user = findUserById(userId);
  if (user) {
    user.credits = credits;
    save();
  }
}

function topUsers(limit = 10) {
  return [...cache.users]
    .sort((a, b) => b.credits - a.credits)
    .slice(0, limit)
    .map(u => ({ username: u.username, credits: u.credits }));
}

module.exports = { findUserByName, findUserById, createUser, updateCredits, topUsers };
