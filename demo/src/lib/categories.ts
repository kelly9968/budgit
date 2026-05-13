export type Category = {
  name: string;
  icon: string;
  color: string;
};

export const DEFAULT_CATEGORIES: Category[] = [
  { name: 'Groceries', icon: '🛒', color: '#f5f0eb' },
  { name: 'Eat out', icon: '🍽️', color: '#f5eded' },
  { name: 'Drinks', icon: '🍺', color: '#edf2f8' },
  { name: 'Household', icon: '🏠', color: '#edf5ed' },
  { name: 'Transport', icon: '🚇', color: '#ededf8' },
  { name: 'Health', icon: '💊', color: '#f5edf2' },
  { name: 'Other', icon: '💸', color: '#f2f2f2' },
];

// Palettes for the new-category modal. Lifted from index.html:1052-1053.
export const EMOJI_PALETTE = [
  '🛒','🍽️','🍺','🏠','🚇','💊','💸','🎮','🎬','✈️','📚','🐾',
  '💄','🎵','🏋️','🌿','🛍️','☕','🍕','💡',
];

export const COLOR_PALETTE = [
  '#f5f0eb', '#edf2f8', '#f5eded', '#edf5ed', '#ededf8',
  '#f5edf2', '#f8f7ec', '#f0edf8', '#edf8f5', '#f2f2f2',
];

const FALLBACK: Category = { name: 'Other', icon: '💸', color: '#f2f2f2' };

export function getCategory(name: string, list: Category[] = DEFAULT_CATEGORIES): Category {
  return list.find((c) => c.name === name) ?? { ...FALLBACK, name };
}
