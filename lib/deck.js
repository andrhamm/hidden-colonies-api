import flatMap from 'lodash.flatmap';
import shuffle from 'lodash.shuffle';

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

const KEYS = {
  deck: 'd',
  players: 'p',
  discard: 't',
};

const CARDS = {
  [KEYS.deck]: [],
  [KEYS.players]: [
    [],
    [],
  ],
  [KEYS.discard]: [
    [],
    [],
    [],
    [],
    [],
  ],
};

export const shuffledDeck = () => shuffle(flatMap(CATEGORIES,
  (category, categoryId) => Array(CARDS).fill().map((card, cardId) => [categoryId, cardId])));

export const newGame = () => {
//
};
