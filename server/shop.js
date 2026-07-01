// Item catalog. IDs are also inventory tokens (e.g. "theme:emerald").
// Prices are intentionally high so users must play to unlock most of them.

const CATALOG = [
  // --- Themes (whole-site color palette) ---
  { id: 'theme:midnight', kind: 'theme', name: 'Midnight',   price: 0,     tier: 'starter', preview: '#0e1013' },
  { id: 'theme:ivory',    kind: 'theme', name: 'Ivory Light', price: 800,   tier: 'basic',   preview: '#f2f2ee' },
  { id: 'theme:emerald',  kind: 'theme', name: 'Emerald',    price: 1500,  tier: 'basic',   preview: '#0d3b2c' },
  { id: 'theme:ruby',     kind: 'theme', name: 'Ruby',       price: 1500,  tier: 'basic',   preview: '#2e1015' },
  { id: 'theme:cobalt',   kind: 'theme', name: 'Cobalt',     price: 2500,  tier: 'rare',    preview: '#0e1a3a' },
  { id: 'theme:neon',     kind: 'theme', name: 'Neon',       price: 5000,  tier: 'rare',    preview: '#150a2e' },
  { id: 'theme:royal',    kind: 'theme', name: 'Royal Gold', price: 10000, tier: 'legendary', preview: '#1a1305' },

  // --- Card Backs ---
  { id: 'cardback:classic', kind: 'cardback', name: 'Classic Blue', price: 0,    tier: 'starter' },
  { id: 'cardback:crimson', kind: 'cardback', name: 'Crimson',      price: 500,  tier: 'basic' },
  { id: 'cardback:forest',  kind: 'cardback', name: 'Forest',       price: 500,  tier: 'basic' },
  { id: 'cardback:royal',   kind: 'cardback', name: 'Royal Damask', price: 2000, tier: 'rare' },
  { id: 'cardback:carbon',  kind: 'cardback', name: 'Carbon Fibre', price: 2500, tier: 'rare' },
  { id: 'cardback:gold',    kind: 'cardback', name: 'Gold Foil',    price: 8000, tier: 'legendary' },
  { id: 'cardback:neon',    kind: 'cardback', name: 'Neon Grid',    price: 6000, tier: 'legendary' },

  // --- Avatar accessories (emoji rendered on top of avatar) ---
  { id: 'avatar:crown',      kind: 'avatar', name: 'Crown 👑',      price: 3000,  tier: 'rare',      emoji: '👑' },
  { id: 'avatar:tophat',     kind: 'avatar', name: 'Top Hat 🎩',    price: 2000,  tier: 'basic',     emoji: '🎩' },
  { id: 'avatar:sunglasses', kind: 'avatar', name: 'Sunglasses 🕶',  price: 1200,  tier: 'basic',     emoji: '🕶️' },
  { id: 'avatar:mustache',   kind: 'avatar', name: 'Mustache 👨',    price: 800,   tier: 'basic',     emoji: '👨' },
  { id: 'avatar:diamond',    kind: 'avatar', name: 'Diamond 💎',    price: 4000,  tier: 'rare',      emoji: '💎' },
  { id: 'avatar:fire',       kind: 'avatar', name: 'On Fire 🔥',    price: 5000,  tier: 'rare',      emoji: '🔥' },
  { id: 'avatar:star',       kind: 'avatar', name: 'VIP Star ⭐',    price: 7500,  tier: 'legendary', emoji: '⭐' },
  { id: 'avatar:rocket',     kind: 'avatar', name: 'Rocket 🚀',     price: 5000,  tier: 'rare',      emoji: '🚀' },
];

function catalog() { return CATALOG; }

function findItem(id) { return CATALOG.find(i => i.id === id); }

function buy(user, itemId, db) {
  const item = findItem(itemId);
  if (!item) throw new Error('Unbekannter Artikel');
  if ((user.inventory || []).includes(itemId)) throw new Error('Bereits gekauft');
  if (user.credits < item.price) throw new Error('Nicht genug Credits');
  user.credits -= item.price;
  (user.inventory ||= []).push(itemId);
  db.updateUser(user.id, { credits: user.credits, inventory: user.inventory });
  return { itemId, credits: user.credits, inventory: user.inventory };
}

module.exports = { catalog, findItem, buy };