const db = require('./db');

// Presence tracking (in-memory)
// Map userId -> { sockets: Set, roomId, since }
const presence = new Map();

function markOnline(userId, socketId) {
  const entry = presence.get(userId) || { sockets: new Set(), roomId: null, since: Date.now() };
  entry.sockets.add(socketId);
  presence.set(userId, entry);
}
function markOffline(userId, socketId) {
  const entry = presence.get(userId);
  if (!entry) return false;
  entry.sockets.delete(socketId);
  if (entry.sockets.size === 0) {
    presence.delete(userId);
    return true; // fully offline
  }
  return false;
}
function setRoom(userId, roomId) {
  const entry = presence.get(userId);
  if (entry) entry.roomId = roomId;
}
function isOnline(userId) { return presence.has(userId); }
function roomOf(userId) { return presence.get(userId)?.roomId || null; }
function onlineList() { return [...presence.keys()]; }

// ---- Friend logic ----
function sendFriendRequest(fromUser, toName) {
  const target = db.findUserByName(toName);
  if (!target) throw new Error('Benutzer nicht gefunden');
  if (target.id === fromUser.id) throw new Error('Kann dich nicht selbst adden');
  if ((fromUser.friends || []).includes(target.id)) throw new Error('Ihr seid bereits Freunde');
  if ((target.blocked || []).includes(fromUser.id)) throw new Error('Anfrage nicht möglich');
  const existing = (target.friendRequests || []).find(r => r.from === fromUser.id);
  if (existing) throw new Error('Anfrage bereits gesendet');
  // Auto-accept if reverse request exists
  const reverse = (fromUser.friendRequests || []).find(r => r.from === target.id);
  if (reverse) {
    acceptFriendRequest(fromUser, target.id);
    return { autoAccepted: true, friendId: target.id };
  }
  target.friendRequests = target.friendRequests || [];
  target.friendRequests.push({ from: fromUser.id, at: Date.now() });
  db.updateUser(target.id, { friendRequests: target.friendRequests });
  return { autoAccepted: false, friendId: target.id };
}

function acceptFriendRequest(user, fromId) {
  user.friendRequests = (user.friendRequests || []).filter(r => r.from !== fromId);
  if (!(user.friends || []).includes(fromId)) user.friends = [...(user.friends || []), fromId];
  db.updateUser(user.id, { friends: user.friends, friendRequests: user.friendRequests });
  const other = db.findUserById(fromId);
  if (other) {
    if (!(other.friends || []).includes(user.id)) other.friends = [...(other.friends || []), user.id];
    db.updateUser(other.id, { friends: other.friends });
  }
}

function declineFriendRequest(user, fromId) {
  user.friendRequests = (user.friendRequests || []).filter(r => r.from !== fromId);
  db.updateUser(user.id, { friendRequests: user.friendRequests });
}

function removeFriend(user, otherId) {
  user.friends = (user.friends || []).filter(f => f !== otherId);
  db.updateUser(user.id, { friends: user.friends });
  const other = db.findUserById(otherId);
  if (other) {
    other.friends = (other.friends || []).filter(f => f !== user.id);
    db.updateUser(other.id, { friends: other.friends });
  }
}

function friendListView(user) {
  return (user.friends || []).map(id => {
    const u = db.findUserById(id);
    if (!u) return null;
    return {
      id: u.id,
      username: u.username,
      avatar: u.avatar,
      online: isOnline(u.id),
      roomId: roomOf(u.id),
    };
  }).filter(Boolean);
}

function requestsView(user) {
  return (user.friendRequests || []).map(r => {
    const u = db.findUserById(r.from);
    return u ? { fromId: u.id, username: u.username, avatar: u.avatar, at: r.at } : null;
  }).filter(Boolean);
}

module.exports = {
  markOnline, markOffline, setRoom, isOnline, roomOf, onlineList,
  sendFriendRequest, acceptFriendRequest, declineFriendRequest, removeFriend,
  friendListView, requestsView,
};