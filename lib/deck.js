import flatMap from 'lodash.flatmap';
import shuffle from 'lodash.shuffle';

const HAND_SIZE = 8;

const SUITS = [
  'agriculture',
  'science',
  'politics',
  'medicine',
  'military',
];

const COLORS = [
  '2D882D',
  '226666',
  'AA6C39',
  'AA3939',
  '343838',
];

const CARDS = [
  'm', // 0, m=multiplier
  'm', // 1
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
  'm', // 11
];

const WAGER_CARD_INDEXES = [0, 1, 11];

export function splitCard(card) {
  return card.split(':').map(str => parseInt(str, 10));
}
export function isWagerCard(cardId) {
  return WAGER_CARD_INDEXES.includes(parseInt(cardId, 10));
}

function arrayOfArrays(size, subArraySize) {
  return Array(size).fill().map(() => (subArraySize ? arrayOfArrays(subArraySize) : []));
}

export function shuffledDeck() {
  return shuffle(flatMap(SUITS, (suit, suitIdx) => CARDS.map((card, cardId) => [suitIdx, cardId].join(':'))));
}

export function sortCardsForDisplay(hand) {
  const sortedBySuit = hand.reduce((acc, card) => {
    const [suitIdx, cardIdx] = splitCard(card);
    acc[suitIdx].push(cardIdx);
    return acc;
  }, arrayOfArrays(SUITS.length));

  const sorted = [];

  sortedBySuit.forEach((cardIds, suitIdx) => {
    const sortedCardIds = cardIds.sort((a, b) => a - b);
    const oddWagerIndex = sortedCardIds.indexOf(11);
    if (oddWagerIndex !== -1) {
      const oddWager = sortedCardIds.splice(oddWagerIndex, 1);
      const secondWagerIndex = sortedCardIds.indexOf(1);
      const firstWagerIndex = sortedCardIds.indexOf(0);

      if (secondWagerIndex !== -1) {
        sortedCardIds.splice(secondWagerIndex + 1, 0, oddWager);
      } else if (firstWagerIndex !== -1) {
        sortedCardIds.splice(firstWagerIndex + 1, 0, oddWager);
      } else {
        sortedCardIds.unshift(oddWager);
      }
    }

    sortedCardIds.forEach((cardIdx) => {
      sorted.push(`${suitIdx}:${cardIdx}`);
    });
  });

  return sorted;
}

export function dealNewGame() {
  const deck = shuffledDeck();
  const hands = deck.splice(0, HAND_SIZE * 2).reduce((acc, v, i) => {
    acc[i % 2].push(v);
    return acc;
  }, [[], []]);

  return {
    suits: SUITS.map((suit, suitIdx) => ({
      suit,
      color: COLORS[suitIdx],
    })),
    deck,
    hands: hands.map(sortCardsForDisplay),
    played: arrayOfArrays(2, SUITS.length),
    discarded: arrayOfArrays(SUITS.length),
  };
}

export function validPlay(card, played) {
  const [suitIdx, cardIdx] = Array.isArray(card) ? card : splitCard(card);

  const [_topCardSuitIdx, topCardIdx] = splitCard(played[suitIdx][0] || '');

  console.log(`Validating play ${card.toString()} on top of ${(played[suitIdx][0] || 'null').toString()}`);
  if (topCardIdx !== undefined && !isWagerCard(topCardIdx)) {
    if (isWagerCard(cardIdx) || cardIdx < topCardIdx) {
      return false;
    }
  }

  return true;
}

export function calculateScore(played, totalOnly = false) {
  let score = 0;

  const expeditions = played.reduce((scored, suiteCards) => {
    const cost = suiteCards.length > 0 ? -20 : 0;
    const bonus = suiteCards.length >= 8 ? 20 : 0;

    let wagerMultiplier = 1;
    let sum = 0;

    suiteCards.forEach((card) => {
      const cardId = splitCard(card)[1];
      if (isWagerCard(cardId)) {
        wagerMultiplier += 1;
      } else {
        sum += cardId;
      }
    });

    const subtotal = sum + cost;
    const multiplied = subtotal * wagerMultiplier;
    const total = multiplied + bonus;

    score += total;

    scored.push({
      cost,
      sum,
      subtotal,
      wagerMultiplier,
      multiplied,
      bonus,
      total,
    });

    return scored;
  }, []);

  return totalOnly ? score : {
    score,
    expeditions,
  };
}
