import { describe, expect, it } from 'vitest';
import {
  buildRow,
  colLetter,
  DEFAULT_MAPPING,
  lastMappedCol,
  mappedCells,
  normalizeAmount,
  normalizeDate,
  parseRow,
  serialToISO,
  type ColumnMapping,
} from './connection';
import type { Transaction } from './types';

// A scattered layout: extra user columns between our fields, no sub column.
// A=date, C=amount, F=note, D=category. B and E belong to the user.
const SCATTERED: ColumnMapping = { date: 0, amount: 2, note: 5, cat: 3, sub: -1 };

const TX: Transaction = {
  date: '2026-07-01',
  amount: 42.5,
  note: 'Weekly shop',
  cat: 'Groceries',
  sub: '',
};

describe('colLetter', () => {
  it('handles single letters', () => {
    expect(colLetter(0)).toBe('A');
    expect(colLetter(4)).toBe('E');
    expect(colLetter(25)).toBe('Z');
  });
  it('rolls over past Z (the String.fromCharCode(64+n) trap)', () => {
    expect(colLetter(26)).toBe('AA');
    expect(colLetter(27)).toBe('AB');
    expect(colLetter(51)).toBe('AZ');
    expect(colLetter(52)).toBe('BA');
    expect(colLetter(701)).toBe('ZZ');
    expect(colLetter(702)).toBe('AAA');
  });
});

describe('lastMappedCol', () => {
  it('finds the right edge of the default layout', () => {
    expect(lastMappedCol(DEFAULT_MAPPING)).toBe(4);
  });
  it('ignores unmapped (-1) fields', () => {
    expect(lastMappedCol(SCATTERED)).toBe(5);
    expect(lastMappedCol({ date: 1, amount: 3, note: -1, cat: -1, sub: -1 })).toBe(3);
  });
});

describe('buildRow / parseRow round-trip', () => {
  it('is identical to the historical layout under the default mapping', () => {
    expect(buildRow(DEFAULT_MAPPING, TX)).toEqual([
      '2026-07-01',
      42.5,
      'Weekly shop',
      'Groceries',
      '',
    ]);
  });

  it('places fields at scattered indices, leaving user columns blank', () => {
    const row = buildRow(SCATTERED, TX);
    expect(row).toEqual(['2026-07-01', '', 42.5, 'Groceries', '', 'Weekly shop']);
  });

  it('round-trips through parseRow under any mapping', () => {
    for (const m of [DEFAULT_MAPPING, SCATTERED]) {
      const parsed = parseRow(m, buildRow(m, TX), 7);
      expect(parsed).toMatchObject({
        date: TX.date,
        amount: TX.amount,
        note: TX.note,
        cat: TX.cat,
        _row: 7,
      });
    }
  });
});

describe('parseRow', () => {
  it('reads serial dates from UNFORMATTED_VALUE responses', () => {
    // 2026-07-01 = serial 46204 (days since 1899-12-30)
    const parsed = parseRow(DEFAULT_MAPPING, [46204, 12, '', 'Other', ''], 2);
    expect(parsed?.date).toBe('2026-07-01');
  });

  it('rejects rows without a usable date or positive amount', () => {
    expect(parseRow(DEFAULT_MAPPING, ['', 12, '', '', ''], 2)).toBeNull();
    expect(parseRow(DEFAULT_MAPPING, ['2026-07-01', '', '', '', ''], 2)).toBeNull();
    expect(parseRow(DEFAULT_MAPPING, ['2026-07-01', -5, '', '', ''], 2)).toBeNull();
    expect(parseRow(DEFAULT_MAPPING, ['2026-07-01', 'n/a', '', '', ''], 2)).toBeNull();
  });

  it('parses string amounts and defaults category to Other', () => {
    const parsed = parseRow(DEFAULT_MAPPING, ['2026-07-01', '19.99', '', '', ''], 2);
    expect(parsed?.amount).toBe(19.99);
    expect(parsed?.cat).toBe('Other');
  });

  it('parses text-formatted currency without accepting partial junk', () => {
    expect(normalizeAmount('$1,234.56')).toBe(1234.56);
    expect(normalizeAmount(' 42 ')).toBe(42);
    expect(normalizeAmount('12 dollars')).toBeNull();
    expect(normalizeAmount('-5')).toBeNull();
  });

  it('treats unmapped fields as empty / defaults', () => {
    const parsed = parseRow(SCATTERED, buildRow(SCATTERED, TX), 3);
    expect(parsed?.sub).toBe('');
  });
});

describe('mappedCells', () => {
  it('emits one cell per mapped field, skipping -1', () => {
    const cells = mappedCells(SCATTERED, TX);
    expect(cells).toEqual([
      { col: 0, value: '2026-07-01' },
      { col: 2, value: 42.5 },
      { col: 5, value: 'Weekly shop' },
      { col: 3, value: 'Groceries' },
    ]);
  });
});

describe('date helpers', () => {
  it('serialToISO matches known anchors', () => {
    expect(serialToISO(25569)).toBe('1970-01-01');
    expect(serialToISO(46204)).toBe('2026-07-01');
  });
  it('normalizeDate accepts serials, ISO strings, and rejects junk', () => {
    expect(normalizeDate(46204)).toBe('2026-07-01');
    expect(normalizeDate('2026-07-01')).toBe('2026-07-01');
    expect(normalizeDate('not a date')).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate('')).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });
});
