// The app ↔ spreadsheet linkage: which tab holds transactions, how its
// columns map to our fields, where data begins, what the app-managed
// metadata tab is called, and whether the app may write back (two-way)
// or is a read-only viewer over a sheet the user maintains by hand.
//
// Everything here is PURE — no network, no auth — so the fiddly column
// math and row (de)serialization are unit-testable in isolation.

import type { Transaction } from './types';

export type FieldKey = 'date' | 'amount' | 'note' | 'cat' | 'sub';

// 0-based column indices. `date` and `amount` are required (>= 0);
// `note`/`cat`/`sub` may be -1, meaning "this sheet has no such column".
export type ColumnMapping = Record<FieldKey, number>;

export type SheetConnection = {
  sheetId: string;
  sheetName?: string;
  txTab: string;          // tab holding transactions
  metaTab: string;        // app-managed key/value tab (renamable)
  mapping: ColumnMapping;
  dataStartRow: number;   // first data row, 1-based (2 ⇒ row 1 is headers)
  writeEnabled: boolean;  // two-way sync master switch; false = read-only
};

// The historical hardcoded contract: Date, Amount, Note, Category, Sub in
// A–E. App-created sheets and pre-upgrade configs both resolve to this.
export const DEFAULT_MAPPING: ColumnMapping = {
  date: 0,
  amount: 1,
  note: 2,
  cat: 3,
  sub: 4,
};

export const DEFAULT_TX_TAB = 'Transactions';
export const DEFAULT_META_TAB = '@metadata';
export const DEFAULT_DATA_START_ROW = 2;

// Field order + labels for the mapping UI.
export const FIELDS: Array<{ key: FieldKey; label: string; required: boolean }> = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Amount', required: true },
  { key: 'note', label: 'Note', required: false },
  { key: 'cat', label: 'Category', required: false },
  { key: 'sub', label: 'Sub-category', required: false },
];

// 0-based column index → A1 letters. 0→A, 25→Z, 26→AA, 51→AZ, 52→BA.
export function colLetter(index0: number): string {
  let n = index0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Highest column index the mapping references — the read range's right edge.
export function lastMappedCol(m: ColumnMapping): number {
  const used = Object.values(m).filter((i) => i >= 0);
  return used.length ? Math.max(...used) : 0;
}

// Google Sheets serial date (days since 1899-12-30) → yyyy-MM-dd.
export function serialToISO(serial: number): string {
  const ms = (serial - 25569) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Normalize a raw date cell (serial number from UNFORMATTED_VALUE, or a
// free-form string) into yyyy-MM-dd; null when unusable.
export function normalizeDate(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') return serialToISO(raw);
  if (typeof raw === 'string') {
    const parsed = new Date(raw);
    return isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
  }
  return null;
}

// Sheets normally returns numeric cells as numbers, but hand-maintained
// spreadsheets often contain text-formatted currency ("$1,234.50"). Keep
// the parser forgiving without accepting arbitrary strings as partial nums.
export function normalizeAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  const normalized = text.replace(/[$,\s]/g, '');
  if (!/^\+?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// The (columnIndex, value) cells a transaction occupies under this mapping.
// Update writes exactly these cells; append spreads them into a row.
export function mappedCells(
  m: ColumnMapping,
  tx: Transaction,
): Array<{ col: number; value: string | number }> {
  const cells: Array<{ col: number; value: string | number }> = [];
  const put = (col: number, value: string | number) => {
    if (col >= 0) cells.push({ col, value });
  };
  put(m.date, tx.date);
  put(m.amount, tx.amount);
  put(m.note, tx.note ?? '');
  put(m.cat, tx.cat ?? '');
  put(m.sub, tx.sub ?? '');
  return cells;
}

// Build a sparse row array for values.append — each field at its mapped
// index, unmapped gaps left as ''. Width runs to the last mapped column so
// columns to the right of our data are never touched.
export function buildRow(m: ColumnMapping, tx: Transaction): Array<string | number> {
  const row = new Array<string | number>(lastMappedCol(m) + 1).fill('');
  for (const { col, value } of mappedCells(m, tx)) row[col] = value;
  return row;
}

// Parse one sheet row into a Transaction via the mapping. Returns null for
// rows without a usable date + positive amount (blank lines, subtotals…).
export function parseRow(
  m: ColumnMapping,
  row: unknown[],
  sheetRow: number,
): Transaction | null {
  const cell = (idx: number): unknown => (idx >= 0 ? row[idx] : undefined);

  const date = normalizeDate(cell(m.date));
  if (date === null) return null;

  const amount = normalizeAmount(cell(m.amount));
  if (amount === null) return null;

  const str = (idx: number): string => {
    const v = cell(idx);
    return v != null ? String(v) : '';
  };

  return {
    date,
    amount,
    note: str(m.note),
    cat: str(m.cat) || 'Other',
    sub: str(m.sub),
    _row: sheetRow,
  };
}
