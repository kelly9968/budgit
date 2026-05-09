import { getAccessToken } from './gis';
import type { Transaction } from '../lib/types';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export const TAB_NAME = 'Transactions';
export const HEADERS = ['Date', 'Amount', 'Note', 'Category', 'Sub'] as const;

// ── Generic authed fetch with one silent retry on 401 ─────────────────
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
  if (res.status !== 401) return res;
  // token expired between cache check and request — retry once
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

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
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
    sheets: [{ properties: { title: TAB_NAME } }],
  };
  const res = await authedFetch('', { method: 'POST', body: JSON.stringify(body) });
  const data = await jsonOrThrow<SpreadsheetMeta>(res);
  await writeHeaders(data.spreadsheetId);
  return data.spreadsheetId;
}

// ── Ensure the picked spreadsheet has our Transactions tab + headers ──
// Adds a Transactions tab if missing, then writes headers if A1:E1 empty
// or doesn't match. Idempotent.
export async function ensureSchema(spreadsheetId: string): Promise<void> {
  const meta = await getMeta(spreadsheetId);
  const hasTab = meta.sheets.some((s) => s.properties.title === TAB_NAME);
  if (!hasTab) {
    await addTab(spreadsheetId);
  }
  const existing = await readRow1(spreadsheetId);
  const matches =
    existing.length === HEADERS.length &&
    existing.every((v, i) => String(v).trim() === HEADERS[i]);
  if (!matches) {
    await writeHeaders(spreadsheetId);
  }
}

async function addTab(spreadsheetId: string): Promise<void> {
  const body = {
    requests: [{ addSheet: { properties: { title: TAB_NAME } } }],
  };
  const res = await authedFetch(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  await jsonOrThrow<unknown>(res);
}

async function readRow1(spreadsheetId: string): Promise<string[]> {
  const range = encodeURIComponent(`${TAB_NAME}!A1:E1`);
  const res = await authedFetch(`/${spreadsheetId}/values/${range}`);
  const data = await jsonOrThrow<{ values?: string[][] }>(res);
  return data.values?.[0] ?? [];
}

async function writeHeaders(spreadsheetId: string): Promise<void> {
  const range = encodeURIComponent(`${TAB_NAME}!A1:E1`);
  const body = { values: [HEADERS] };
  const res = await authedFetch(
    `/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    { method: 'PUT', body: JSON.stringify(body) },
  );
  await jsonOrThrow<unknown>(res);
}

// ── Read all transactions from row 2 onwards ──────────────────────────
export async function listTransactions(spreadsheetId: string): Promise<Transaction[]> {
  const range = encodeURIComponent(`${TAB_NAME}!A2:E`);
  // valueRenderOption=UNFORMATTED_VALUE returns raw numbers/dates;
  // dateTimeRenderOption=FORMATTED_STRING gives us yyyy-MM-dd for dates.
  // Mixing those isn't possible — we use UNFORMATTED_VALUE and convert
  // Sheets serial-day numbers back to ISO dates ourselves.
  const url = `/${spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`;
  const res = await authedFetch(url);
  const data = await jsonOrThrow<{ values?: unknown[][] }>(res);
  const rows = data.values ?? [];
  return rows
    .map(parseRow)
    .filter((tx): tx is Transaction => tx !== null);
}

// Sheets serial dates: integer days since 1899-12-30 (Lotus quirk).
function serialToISO(serial: number): string {
  const ms = (serial - 25569) * 86_400_000;
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function parseRow(row: unknown[]): Transaction | null {
  const rawDate = row[0];
  const rawAmount = row[1];
  if (rawDate == null || rawAmount == null || rawAmount === '') return null;

  let date: string;
  if (typeof rawDate === 'number') date = serialToISO(rawDate);
  else if (typeof rawDate === 'string') {
    // Try to coerce common formats. If it's already yyyy-MM-dd we keep it.
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
  };
}

// ── Append a new transaction ──────────────────────────────────────────
export async function addTransaction(
  spreadsheetId: string,
  tx: Transaction,
): Promise<void> {
  const range = encodeURIComponent(`${TAB_NAME}!A:E`);
  const url = `/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const body = {
    values: [[tx.date, tx.amount, tx.note, tx.cat, tx.sub]],
  };
  const res = await authedFetch(url, { method: 'POST', body: JSON.stringify(body) });
  await jsonOrThrow<unknown>(res);
}

// ── Convenience: build the URL to open the sheet in Google Sheets ─────
export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
