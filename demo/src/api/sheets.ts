import { clearAccessToken, getAccessToken, requestAccessToken } from './gis';
import type { Transaction } from '../lib/types';
import type { Category } from '../lib/categories';
import {
  buildRow,
  colLetter,
  lastMappedCol,
  mappedCells,
  parseRow,
  DEFAULT_META_TAB,
  DEFAULT_TX_TAB,
  type SheetConnection,
} from '../lib/connection';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// Header rows written onto tabs the APP creates. Existing user tabs are
// never touched — their layout is described by the connection's mapping.
export const HEADERS = ['Date', 'Amount', 'Note', 'Category', 'Sub'] as const;
export const META_HEADERS = ['key', 'value'] as const;

const READONLY_MSG =
  'This sheet is connected read-only. Turn on two-way sync in Sheet settings to make changes.';

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

// Tab titles, in sheet order — feeds the tab picker in the connection UI.
export async function listTabs(spreadsheetId: string): Promise<string[]> {
  const meta = await getMeta(spreadsheetId);
  return meta.sheets.map((s) => s.properties.title);
}

// Row-1 values of a tab, so the mapping UI can label columns
// ("C — Amount") and auto-guess the mapping.
export async function readHeaderRow(spreadsheetId: string, tab: string): Promise<string[]> {
  // ZZ keeps wide, user-owned sheets mappable without requesting the whole
  // grid. Empty trailing cells are omitted by the Sheets API response.
  const range = encodeURIComponent(refRange(tab, 'A1:ZZ1'));
  const res = await authedFetch(`/${spreadsheetId}/values/${range}`);
  const data = await jsonOrThrow<{ values?: string[][] }>(res);
  return data.values?.[0] ?? [];
}

// ── Create a brand-new spreadsheet, ready to use ──────────────────────
export async function createSpreadsheet(title: string): Promise<string> {
  const body = {
    properties: { title },
    sheets: [
      { properties: { title: DEFAULT_TX_TAB } },
      { properties: { title: DEFAULT_META_TAB } },
    ],
  };
  const res = await authedFetch('', { method: 'POST', body: JSON.stringify(body) });
  const data = await jsonOrThrow<SpreadsheetMeta>(res);
  await writeHeaders(data.spreadsheetId, DEFAULT_TX_TAB, [...HEADERS]);
  await writeHeaders(data.spreadsheetId, DEFAULT_META_TAB, [...META_HEADERS]);
  return data.spreadsheetId;
}

// Create a fresh app-managed transactions tab (standard headers). Used by
// "+ Create a new tab" in the connection modal.
export async function createTransactionsTab(
  spreadsheetId: string,
  title: string,
): Promise<void> {
  await addTab(spreadsheetId, title);
  await writeHeaders(spreadsheetId, title, [...HEADERS]);
}

// Rename a tab in the actual spreadsheet (used to rename the metadata tab).
export async function renameTab(
  spreadsheetId: string,
  oldTitle: string,
  newTitle: string,
): Promise<void> {
  const meta = await getMeta(spreadsheetId);
  const tab = meta.sheets.find((s) => s.properties.title === oldTitle);
  if (!tab) throw new Error(`Tab "${oldTitle}" not found`);
  const body = {
    requests: [
      {
        updateSheetProperties: {
          properties: { sheetId: tab.properties.sheetId, title: newTitle },
          fields: 'title',
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

// ── Provision the app-managed metadata tab ────────────────────────────
// Replaces the old ensureSchema. Deliberately narrower: it NEVER touches
// the transactions tab (that may be a sheet the user maintains by hand),
// and in read-only mode it's a complete no-op — we truly never write.
export async function provisionOrValidate(conn: SheetConnection): Promise<void> {
  if (!conn.writeEnabled) return;
  const meta = await getMeta(conn.sheetId);
  const titles = new Set(meta.sheets.map((s) => s.properties.title));
  if (!titles.has(conn.metaTab)) {
    await addTab(conn.sheetId, conn.metaTab);
    await writeHeaders(conn.sheetId, conn.metaTab, [...META_HEADERS]);
  }
}

async function addTab(spreadsheetId: string, title: string): Promise<void> {
  const body = { requests: [{ addSheet: { properties: { title } } }] };
  const res = await authedFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await jsonOrThrow<unknown>(res);
}

async function writeHeaders(
  spreadsheetId: string,
  tab: string,
  headers: string[],
): Promise<void> {
  const range = encodeURIComponent(refRange(tab, `A1:${colLetter(headers.length - 1)}1`));
  const body = { values: [headers] };
  const res = await authedFetch(
    `/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  await jsonOrThrow<unknown>(res);
}

// ── Transactions: read via the connection's column mapping ────────────
export async function listTransactions(conn: SheetConnection): Promise<Transaction[]> {
  const right = colLetter(lastMappedCol(conn.mapping));
  const range = encodeURIComponent(
    refRange(conn.txTab, `A${conn.dataStartRow}:${right}`),
  );
  const url = `/${conn.sheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await authedFetch(url);
  const data = await jsonOrThrow<{ values?: unknown[][] }>(res);
  const rows = data.values ?? [];
  return rows
    .map((row, i) => parseRow(conn.mapping, row, i + conn.dataStartRow))
    .filter((tx): tx is Transaction => tx !== null);
}

// ── Append a new transaction ──────────────────────────────────────────
export async function addTransaction(
  conn: SheetConnection,
  tx: Transaction,
): Promise<void> {
  if (!conn.writeEnabled) throw new Error(READONLY_MSG);
  const right = colLetter(lastMappedCol(conn.mapping));
  const range = encodeURIComponent(refRange(conn.txTab, `A:${right}`));
  const url = `/${conn.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = { values: [buildRow(conn.mapping, tx)] };
  const res = await authedFetch(url, { method: 'POST', body: JSON.stringify(body) });
  await jsonOrThrow<unknown>(res);
}

// ── Update a single transaction row ──────────────────────────────────
// Writes ONLY the mapped cells (values:batchUpdate, one range per cell) so
// any other columns on that row — user formulas, their own notes — survive.
export async function updateTransaction(
  conn: SheetConnection,
  row: number,
  tx: Transaction,
): Promise<void> {
  if (!conn.writeEnabled) throw new Error(READONLY_MSG);
  const data = mappedCells(conn.mapping, tx).map(({ col, value }) => ({
    range: refRange(conn.txTab, `${colLetter(col)}${row}`),
    values: [[value]],
  }));
  const body = { valueInputOption: 'USER_ENTERED', data };
  const res = await authedFetch(`/${conn.sheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await jsonOrThrow<unknown>(res);
}

// ── Delete a single transaction row ──────────────────────────────────
// Needs the *internal* sheetId (numeric) of the transactions tab — which
// is different from the spreadsheet id. We look it up via getMeta.
//
// Removes the entire row: in a mapped sheet with extra user columns those
// cells go too (surfaced as a caveat in the connection UI).
//
// NOTE: after a delete, all _row values for rows below this one shift up
// by 1. Caller MUST refresh the transaction list before any further edits
// or deletes; otherwise stale _row values will mutate the wrong rows.
export async function deleteTransaction(
  conn: SheetConnection,
  row: number,
): Promise<void> {
  if (!conn.writeEnabled) throw new Error(READONLY_MSG);
  const meta = await getMeta(conn.sheetId);
  const tab = meta.sheets.find((s) => s.properties.title === conn.txTab);
  if (!tab) throw new Error(`Tab "${conn.txTab}" not found`);
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
  const res = await authedFetch(`/${conn.sheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await jsonOrThrow<unknown>(res);
}

// ── Append many transactions in one round-trip (used by demo data) ────
export async function addTransactionsBulk(
  conn: SheetConnection,
  txs: Transaction[],
): Promise<void> {
  if (txs.length === 0) return;
  if (!conn.writeEnabled) throw new Error(READONLY_MSG);
  const right = colLetter(lastMappedCol(conn.mapping));
  const range = encodeURIComponent(refRange(conn.txTab, `A:${right}`));
  const url = `/${conn.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = { values: txs.map((tx) => buildRow(conn.mapping, tx)) };
  const res = await authedFetch(url, { method: 'POST', body: JSON.stringify(body) });
  await jsonOrThrow<unknown>(res);
}

// ── App-level metadata stored as key|value rows in the metadata tab ───
//
// Layout:
//   A1: key      B1: value
//   A2: budget   B2: 5200
//   A3: categories  B3: [{"name":"Groceries","icon":"🛒","color":"#f5f0eb"},...]
//
// Numbers are stored as numbers; structured values are JSON strings.
//
// Why keys + JSON in B: trivial to extend with new keys, single round-trip
// to read everything, single cell update to write one key.

export type AppMeta = {
  budget?: number;
  categories?: Category[];
};

type RawEntry = { key: string; rawValue: string; row: number };

async function readMetaEntries(conn: SheetConnection): Promise<RawEntry[]> {
  const range = encodeURIComponent(refRange(conn.metaTab, 'A2:B'));
  const res = await authedFetch(`/${conn.sheetId}/values/${range}`);
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

export async function loadAppMeta(conn: SheetConnection): Promise<AppMeta> {
  const entries = await readMetaEntries(conn);
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
  conn: SheetConnection,
  key: K,
  value: NonNullable<AppMeta[K]>,
): Promise<void> {
  // Belt-and-braces: callers route meta to localStorage in read-only mode,
  // but guard here too so no code path can write a read-only sheet.
  if (!conn.writeEnabled) return;

  const serialized =
    typeof value === 'number' ? String(value) : JSON.stringify(value);

  const entries = await readMetaEntries(conn);
  const existing = entries.find((e) => e.key === key);

  if (existing) {
    // Update in place
    const range = encodeURIComponent(
      refRange(conn.metaTab, `A${existing.row}:B${existing.row}`),
    );
    const body = { values: [[key, serialized]] };
    const res = await authedFetch(
      `/${conn.sheetId}/values/${range}?valueInputOption=USER_ENTERED`,
      { method: 'PUT', body: JSON.stringify(body) },
    );
    await jsonOrThrow<unknown>(res);
  } else {
    // Append new row
    const range = encodeURIComponent(refRange(conn.metaTab, 'A:B'));
    const body = { values: [[key, serialized]] };
    const res = await authedFetch(
      `/${conn.sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify(body) },
    );
    await jsonOrThrow<unknown>(res);
  }
}

// ── Convenience: build the URL to open the sheet in Google Sheets ─────
export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
