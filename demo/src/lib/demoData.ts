import type { Category } from './categories';
import type { Transaction } from './types';

// Per-category amount distribution — rough buckets that look "real"
// when scattered across many days. Mean & std-dev style (uniform within
// the range; we don't need a real gaussian).
const AMOUNT_BUCKETS: Record<string, [number, number]> = {
  Groceries: [12, 80],
  'Eat out': [9, 35],
  Drinks: [4, 22],
  Household: [6, 60],
  Transport: [2.5, 18],
  Health: [8, 60],
  Other: [5, 40],
};

const NOTES_BY_CAT: Record<string, string[]> = {
  Groceries: ['Weekly shop', 'Top-up', 'Veg market', 'Big shop', 'Snacks', ''],
  'Eat out': ['Lunch wrap', 'Breakfast', 'Dinner out', 'Quick bite', 'Coffee + pastry', ''],
  Drinks: ['Coffee', 'Bar tab', 'Cocktail', 'Pint', ''],
  Household: ['Cleaning', 'Lightbulbs', 'Bin bags', 'Detergent', ''],
  Transport: ['Train', 'Taxi', 'Bus', 'Tube', 'Parking', ''],
  Health: ['Pharmacy', 'Vitamins', 'Gym', 'Physio', ''],
  Other: ['Misc', 'Stuff', 'Random', ''],
};

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randAmount(catName: string): number {
  const [lo, hi] = AMOUNT_BUCKETS[catName] ?? [5, 40];
  return Math.round((Math.random() * (hi - lo) + lo) * 100) / 100;
}

function randNote(catName: string): string {
  const list = NOTES_BY_CAT[catName] ?? [''];
  return list[randInt(0, list.length - 1)];
}

function isoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Generate transactions across [start, endInclusive]. About 1-4 per day,
// roughly 70% of days have spend, picking categories at random.
export function generateTransactions(
  startDate: Date,
  endDateInclusive: Date,
  categories: Category[],
): Transaction[] {
  if (categories.length === 0) return [];
  const txs: Transaction[] = [];
  const cur = new Date(startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(endDateInclusive);
  end.setHours(0, 0, 0, 0);

  while (cur <= end) {
    if (Math.random() < 0.7) {
      const count = randInt(1, 4);
      for (let i = 0; i < count; i++) {
        const cat = categories[randInt(0, categories.length - 1)];
        const amount = randAmount(cat.name);
        txs.push({
          date: isoDate(cur),
          amount,
          note: randNote(cat.name),
          cat: cat.name,
          sub: '',
        });
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return txs;
}

// Convenience helpers for the demo UI.
export function genDay(categories: Category[]): Transaction[] {
  const today = new Date();
  return generateTransactions(today, today, categories);
}

export function genWeek(categories: Category[]): Transaction[] {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return generateTransactions(start, end, categories);
}

export function genMonth(categories: Category[]): Transaction[] {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return generateTransactions(start, end, categories);
}

export function genYear(categories: Category[]): Transaction[] {
  const end = new Date();
  const start = new Date(end.getFullYear(), 0, 1);
  return generateTransactions(start, end, categories);
}

export function genTwoYears(categories: Category[]): Transaction[] {
  const end = new Date();
  const start = new Date(end.getFullYear() - 1, 0, 1);
  return generateTransactions(start, end, categories);
}
