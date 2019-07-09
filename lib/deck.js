import flatMap from 'lodash.flatmap';
import shuffle from 'lodash.shuffle';

const HAND_SIZE = 8;

const CATEGORIES = [
  'agriculture',
  'medicine',
  'military',
  'politics',
  'science',
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

export function isWagerCard(cardId) {
  return WAGER_CARD_INDEXES.includes(cardId);
}

function arrayOfArrays(size, subArraySize) {
  return Array(size).fill().map(() => (subArraySize ? arrayOfArrays(subArraySize) : []));
}

export function shuffledDeck() {
  return shuffle(flatMap(CATEGORIES, (category, categoryId) => CARDS.map((card, cardId) => [categoryId, cardId].join(':'))));
}

export function sortCardsForDisplay(hand) {
  const categorized = hand.reduce((acc, card) => {
    const [categoryId, cardId] = card.split(':').map(num => parseInt(num, 10));
    acc[categoryId].push(cardId);
    return acc;
  }, arrayOfArrays(CATEGORIES.length));

  const sorted = [];

  categorized.forEach((cardIds, categoryId) => {
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

    sortedCardIds.forEach((cardId) => {
      sorted.push(`${categoryId}:${cardId}`);
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
    categories: CATEGORIES,
    deck,
    hands,
    played: arrayOfArrays(2, CATEGORIES.length),
    discarded: arrayOfArrays(CATEGORIES.length),
  };
}

export function calculateScore(played) {

}
