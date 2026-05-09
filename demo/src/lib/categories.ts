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

const FALLBACK: Category = { name: 'Other', icon: '💸', color: '#f2f2f2' };

export function getCategory(name: string): Category {
  return DEFAULT_CATEGORIES.find((c) => c.name === name) ?? { ...FALLBACK, name };
}
