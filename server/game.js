const SUITS = ['H', 'D', 'C', 'S'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck(numDecks = 4) {
  const deck = [];
  for (let d = 0; d < numDecks; d++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardValue(rank) {
  if (rank === 'A') return 11;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  return parseInt(rank, 10);
}

function handScore(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardValue(c.rank);
    if (c.rank === 'A') aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

function isBlackjack(cards) {
  return cards.length === 2 && handScore(cards) === 21;
}

function isBust(cards) {
  return handScore(cards) > 21;
}

function settleOutcome(playerCards, dealerCards) {
  const p = handScore(playerCards);
  const d = handScore(dealerCards);
  const pBJ = isBlackjack(playerCards);
  const dBJ = isBlackjack(dealerCards);
  if (pBJ && dBJ) return 'push';
  if (pBJ) return 'blackjack';
  if (dBJ) return 'lose';
  if (p > 21) return 'lose';
  if (d > 21) return 'win';
  if (p > d) return 'win';
  if (p < d) return 'lose';
  return 'push';
}

function payoutMultiplier(outcome) {
  switch (outcome) {
    case 'blackjack': return 1.5;
    case 'win': return 1;
    case 'push': return 0;
    case 'lose': return -1;
    default: return 0;
  }
}

module.exports = {
  newDeck,
  handScore,
  isBlackjack,
  isBust,
  settleOutcome,
  payoutMultiplier,
  cardValue,
};
