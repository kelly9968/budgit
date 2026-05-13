import { clearAccessToken, getAccessToken, requestAccessToken } from './gis';
import type { Transaction } from '../lib/types';
import type { Category } from '../lib/categories';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const TAB_NAME = 'Transactions';
export const HEADERS = ['Date', 'Amount', 'Note', 'Category', 'Sub'] as const;

export const META_TAB = '@metadata';
export const META_HEADERS = ['key', 'value'] as const;

// ── Generic authed fetch with retries for 401 + scope-403 ─────────────
//
// 401 → token expired or invalid; transparently fetch a new one.
// 403 with "insufficient scopes" → the persisted token was issued
// before the SCOPES list grew. Drop it and force a consent prompt so
// the user re-grants with the current scope set; one-time friction
// after a deploy that adds a scope.
async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (res.status === 401) {
    const fresh = await getAccessToken();
    return fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        ...(init.headers || {}),
        Authorization: `Bearer ${fresh}`,
        'Content-Type': 'application/json',
      },
    });
  }
  if (res.status === 403) {
    const peek = await res.clone().text();
    if (/insufficient.*scope/i.test(peek)) {
      clearAccessToken();
      const fresh = await requestAccessToken({ prompt: 'consent' });
      return fetch(`${BASE}${path}`, {
        ...init,
        headers: {
          ...(init.headers || {}),
          Authorization: `Bearer ${fresh}`,
          'Content-Type': 'application/json',
        },
      });
    }
  }
  return res;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// A1-notation range helper. Tab names with special chars (e.g. `@metadata`)
// need to be wrapped in single quotes; embedded quotes are doubled.
function refRange(tab: string, range: string): string {
  const escaped = tab.replace(/'/g, "''");
  return `'${escaped}'!${range}`;
}

// ── Spreadsheet metadata ──────────────────────────────────────────────
type SpreadsheetMeta = {
  spreadsheetId: string;
  properties: { title: string };
  sheets: Array<{ properties: { sheetId: number; title: string } }>;
};

export async function getMeta(spreadsheetId: string): Promise<SpreadsheetMeta> {
  const res = await authedFetch(`/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`);
  return jsonOrThrow<SpreadsheetMeta>(res);
}

// ── Create a brand-new spreadsheet, ready to use ──────────────────────
export async function createSpreadsheet(title: string): Promise<string> {
  const body = {
    properties: { title },
    sheets: [
      { properties: { title: TAB_NAME } },
      { properties: { title: META_TAB } },
    ],
  };
  const res = await authedFetch('', { method: 'POST', body: JSON.stringify(body) });
  const data = await jsonOrThrow<SpreadsheetMeta>(res);
  await writeHeaders(data.spreadsheetId, TAB_NAME, [...HEADERS]);
  await writeHeaders(data.spreadsheetId, META_TAB, [...META_HEADERS]);
  return data.spreadsheetId;
}

// ── Ensure the picked spreadsheet has both tabs + correct headers ─────
export async function ensureSchema(spreadsheetId: string): Promise<void> {
  const meta = await getMeta(spreadsheetId);
  const tabTitles = new Set(meta.sheets.map((s) => s.properties.title));

  if (!tabTitles.has(TAB_NAME)) await addTab(spreadsheetId, TAB_NAME);
  if (!tabTitles.has(META_TAB)) await addTab(spreadsheetId, META_TAB);

  await ensureHeaders(spreadsheetId, TAB_NAME, [...HEADERS]);
  await ensureHeaders(spreadsheetId, META_TAB, [...META_HEADERS]);
}

async function ensureHeaders(
  spreadsheetId: string,
  tab: string,
  expected: string[],
): Promise<void> {
  const existing = await readRow1(spreadsheetId, tab, expected.length);
  const matches =
    existing.length === expected.length &&
    existing.every((v, i) => String(v).trim() === expected[i]);
  if (!matches) await writeHeaders(spreadsheetId, tab, expected);
}

async function addTab(spreadsheetId: string, title: string): Promise<void> {
  const body = { requests: [{ addSheet: { properties: { title } } }] };
  const res = await authedFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await jsonOrThrow<unknown>(res);
}

async function readRow1(
  spreadsheetId: string,
  tab: string,
  width: number,
): Promise<string[]> {
  const colEnd = String.fromCharCode(64 + width); // 1=A, 2=B, …
  const range = encodeURIComponent(refRange(tab, `A1:${colEnd}1`));
  const res = await authedFetch(`/${spreadsheetId}/values/${range}`);
  const data = await jsonOrThrow<{ values?: string[][] }>(res);
  return data.values?.[0] ?? [];
}

async function writeHeaders(
  spreadsheetId: string,
  tab: string,
  headers: string[],
): Promise<void> {
  const colEnd = String.fromCharCode(64 + headers.length);
  const range = encodeURIComponent(refRange(tab, `A1:${colEnd}1`));
  const body = { values: [headers] };
  const res = await authedFetch(
    `/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  await jsonOrThrow<unknown>(res);
}

// ── Transactions: read all from row 2 onwards ─────────────────────────
export async function listTransactions(spreadsheetId: string): Promise<Transaction[]> {
  const range = encodeURIComponent(refRange(TAB_NAME, 'A2:E'));
  const url = `/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await authedFetch(url);
  const data = await jsonOrThrow<{ values?: unknown[][] }>(res);
  const rows = data.values ?? [];
  return rows
    .map((row, i) => parseTxnRow(row, i + 2))
    .filter((tx): tx is Transaction => tx !== null);
}

function serialToISO(serial: number): string {
  const ms = (serial - 25569) * 86_400_000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function parseTxnRow(row: unknown[], sheetRow: number): Transaction | null {
  const rawDate = row[0];
  const rawAmount = row[1];
  if (rawDate == null || rawAmount == null || rawAmount === '') return null;

  let date: string;
  if (typeof rawDate === 'number') date = serialToISO(rawDate);
  else if (typeof rawDate === 'string') {
    const parsed = new Date(rawDate);
    date = isNaN(parsed.getTime()) ? rawDate : parsed.toISOString().slice(0, 10);
  } else return null;

  const amount =
    typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount));
  if (isNaN(amount) || amount <= 0) return null;

  return {
    date,
    amount,
    note: row[2] != null ? String(row[2]) : '',
    cat: row[3] != null ? String(row[3]) : 'Other',
    sub: row[4] != null ? String(row[4]) : '',
    _row: sheetRow,
  };
}

// ── Append a new transaction ──────────────────────────────────────────
export async function addTransaction(
  spreadsheetId: string,
  tx: Transaction,
): Promise<void> {
  const range = encodeURIComponent(refRange(TAB_NAME, 'A:E'));
  const url = `/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = { values: [[tx.date, tx.amount, tx.note, tx.cat, tx.sub]] };
  const res = await authedFetch(url, { method: 'POST', body: JSON.stringify(body) });
  await jsonOrThrow<unknown>(res);
}

// ── Update a single transaction row ──────────────────────────────────
export async function updateTransaction(
  spreadsheetId: string,
  row: number,
  tx: Transaction,
): Promise<void> {
  const range = encodeURIComponent(refRange(TAB_NAME, `A${row}:E${row}`));
  const body = { values: [[tx.date, tx.amount, tx.note, tx.cat, tx.sub]] };
  const res = await authedFetch(
    `/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  await jsonOrThrow<unknown>(res);
}

// ── Delete a single transaction row ──────────────────────────────────
// Needs the *internal* sheetId (numeric) of the Transactions tab — which
// is different from the spreadsheet id. We look it up via getMeta.
//
// NOTE: after a delete, all _row values for rows below this one shift up
// by 1. Caller MUST refresh the transaction list before any further edits
// or deletes; otherwise stale _row values will mutate the wrong rows.
export async function deleteTransaction(
  spreadsheetId: string,
  row: number,
): Promise<void> {
  const meta = await getMeta(spreadsheetId);
  const tab = meta.sheets.find((s) => s.properties.title === TAB_NAME);
  if (!tab) throw new Error(`Tab "${TAB_NAME}" not found`);
  const body = {
    requests: [
      {
        deleteDimension: {
          range: {
            sheetId: tab.properties.sheetId,
            dimension: 'ROWS',
            startIndex: row - 1, // 0-based, inclusive
            endIndex: row, // 0-based, exclusive
          },
        },
      },
    ],
  };
  const res = await authedFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await jsonOrThrow<unknown>(res);
}

// ── Append many transactions in one round-trip (used by demo data) ────
export async function addTransactionsBulk(
  spreadsheetId: string,
  txs: Transaction[],
): Promise<void> {
  if (txs.length === 0) return;
  const range = encodeURIComponent(refRange(TAB_NAME, 'A:E'));
  const url = `/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = {
    values: txs.map((tx) => [tx.date, tx.amount, tx.note, tx.cat, tx.sub]),
  };
  const res = await authedFetch(url, { method: 'POST', body: JSON.stringify(body) });
  await jsonOrThrow<unknown>(res);
}

// ── App-level metadata stored as key|value rows in @metadata tab ──────
//
// Layout:
//   A1: key      B1: value
//   A2: budget   B2: 5200
//   A3: categories  B3: [{"name":"Groceries","icon":"🛒","color":"#f5f0eb"},...]
//
// Numbers are stored as numbers; structured values are JSON strings.
//
// Why keys + JSON in B: trivial to extend with new keys, single round-trip
// to read everything, single cell update to write one key. Categories as
// JSON in a single cell looks a bit ugly in Sheets but the user rarely
// touches @metadata directly.

export type AppMeta = {
  budget?: number;
  categories?: Category[];
};

type RawEntry = { key: string; rawValue: string; row: number };

async function readMetaEntries(spreadsheetId: string): Promise<RawEntry[]> {
  const range = encodeURIComponent(refRange(META_TAB, 'A2:B'));
  const res = await authedFetch(`/${spreadsheetId}/values/${range}`);
  const data = await jsonOrThrow<{ values?: string[][] }>(res);
  const rows = data.values ?? [];
  return rows
    .map((row, i) => ({
      key: row[0] ?? '',
      rawValue: row[1] ?? '',
      row: i + 2, // 1-indexed sheet row, +1 for header
    }))
    .filter((e) => e.key !== '');
}

export async function loadAppMeta(spreadsheetId: string): Promise<AppMeta> {
  const entries = await readMetaEntries(spreadsheetId);
  const map = new Map(entries.map((e) => [e.key, e.rawValue]));
  const result: AppMeta = {};

  if (map.has('budget')) {
    const n = parseFloat(map.get('budget')!);
    if (!isNaN(n) && n > 0) result.budget = n;
  }
  if (map.has('categories')) {
    try {
      const parsed = JSON.parse(map.get('categories')!);
      if (Array.isArray(parsed)) result.categories = parsed as Category[];
    } catch {
      // leave undefined; caller falls back to defaults
    }
  }
  return result;
}

export async function saveAppMeta<K extends keyof AppMeta>(
  spreadsheetId: string,
  key: K,
  value: NonNullable<AppMeta[K]>,
): Promise<void> {
  const serialized =
    typeof value === 'number' ? String(value) : JSON.stringify(value);

  const entries = await readMetaEntries(spreadsheetId);
  const existing = entries.find((e) => e.key === key);

  if (existing) {
    // Update in place
    const range = encodeURIComponent(
      refRange(META_TAB, `A${existing.row}:B${existing.row}`),
    );
    const body = { values: [[key, serialized]] };
    const res = await authedFetch(
      `/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    await jsonOrThrow<unknown>(res);
  } else {
    // Append new row
    const range = encodeURIComponent(refRange(META_TAB, 'A:B'));
    const body = { values: [[key, serialized]] };
    const res = await authedFetch(
      `/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    await jsonOrThrow<unknown>(res);
  }
}

// ── Convenience: build the URL to open the sheet in Google Sheets ─────
export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
