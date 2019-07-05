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

// const KEYS = {
//   deck: 'd',
//   hands: 'h',
//   played: 'p',
//   discarded: 'x',
// };

export const shuffledDeck = () => shuffle(flatMap(CATEGORIES, (category, categoryId) => CARDS.map((card, cardId) => [categoryId, cardId].join(':'))));

export const dealNewGame = () => {
  const deck = shuffledDeck();
  const hands = deck.splice(0, HAND_SIZE * 2).reduce((acc, v, i) => {
    acc[i % 2].push(v);
    return acc;
  }, [[], []]);

  return {
    categories: CATEGORIES,
    deck,
    hands,
    played: Array(2).fill([]),
    discarded: Array(5).fill([]),
  };
};

export const calculateScore = () => {

};
