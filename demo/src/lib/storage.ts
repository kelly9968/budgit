// Per-Google-account local config. Stores the full sheet connection (tab,
// column mapping, sync mode, metadata tab name) — connection details live
// client-side to avoid a bootstrap loop (we'd need the metaTab name to read
// the config that names the metaTab) and so read-only mode never has to
// write the user's spreadsheet. Budget and categories normally live in the
// sheet's metadata tab; in read-only mode they fall back to a local cache
// here (loadLocalMeta / saveLocalMeta).

import type { GoogleProfile } from './types';
import type { Category } from './categories';
import {
  DEFAULT_DATA_START_ROW,
  DEFAULT_MAPPING,
  DEFAULT_META_TAB,
  DEFAULT_TX_TAB,
  type ColumnMapping,
  type SheetConnection,
} from './connection';

const KEY = (sub: string) => `budgie:config:${sub}`;
const META_KEY = (sub: string, sheetId: string) => `budgie:meta:${sub}:${sheetId}`;
const PROFILE_KEY = 'budgie:lastProfile';
const TOKEN_KEY = 'budgie:token';

// The stored config IS the connection. Alias keeps existing imports working.
export type LocalConfig = SheetConnection;

export const DEFAULT_BUDGET = 5200;

function normalizeMapping(m: Partial<ColumnMapping> | undefined): ColumnMapping {
  return {
    date: m?.date ?? DEFAULT_MAPPING.date,
    amount: m?.amount ?? DEFAULT_MAPPING.amount,
    note: m?.note ?? DEFAULT_MAPPING.note,
    cat: m?.cat ?? DEFAULT_MAPPING.cat,
    sub: m?.sub ?? DEFAULT_MAPPING.sub,
  };
}

// Backfill defaults so pre-upgrade configs (which stored only
// {sheetId, sheetName}) resolve to the historical hardcoded contract and
// keep working with zero user-visible change. The mapping may itself be
// partial in stored JSON, so it's deep-defaulted too.
type StoredConnection = Omit<Partial<SheetConnection>, 'mapping'> & {
  sheetId: string;
  mapping?: Partial<ColumnMapping>;
};

export function withConnectionDefaults(p: StoredConnection): SheetConnection {
  return {
    sheetId: p.sheetId,
    sheetName: p.sheetName,
    txTab: p.txTab || DEFAULT_TX_TAB,
    metaTab: p.metaTab || DEFAULT_META_TAB,
    mapping: normalizeMapping(p.mapping),
    dataStartRow:
      typeof p.dataStartRow === 'number' && p.dataStartRow >= 1
        ? p.dataStartRow
        : DEFAULT_DATA_START_ROW,
    writeEnabled: p.writeEnabled ?? true,
  };
}

export function loadConfig(sub: string): LocalConfig | null {
  try {
    const raw = localStorage.getItem(KEY(sub));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConnection>;
    if (!parsed.sheetId) return null;
    return withConnectionDefaults({ ...parsed, sheetId: parsed.sheetId });
  } catch {
    return null;
  }
}

export function saveConfig(sub: string, cfg: LocalConfig): void {
  localStorage.setItem(KEY(sub), JSON.stringify(cfg));
}

export function clearConfig(sub: string): void {
  localStorage.removeItem(KEY(sub));
}

// ── Local metadata cache (budget/categories in read-only mode) ────────
// When the connection is read-only we never write the sheet, so app meta
// persists here instead — keyed per account + sheet so switching sheets
// doesn't bleed settings across.
export type LocalMeta = { budget?: number; categories?: Category[] };

export function loadLocalMeta(sub: string, sheetId: string): LocalMeta {
  try {
    const raw = localStorage.getItem(META_KEY(sub, sheetId));
    return raw ? (JSON.parse(raw) as LocalMeta) : {};
  } catch {
    return {};
  }
}

export function saveLocalMeta(sub: string, sheetId: string, patch: LocalMeta): void {
  localStorage.setItem(
    META_KEY(sub, sheetId),
    JSON.stringify({ ...loadLocalMeta(sub, sheetId), ...patch }),
  );
}

// ── Last-signed-in profile (for the "Continue as X" splash on reload) ─
// Not sensitive — just sub/email/name/picture. Cleared on explicit sign-out.
export function loadLastProfile(): GoogleProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as GoogleProfile) : null;
  } catch {
    return null;
  }
}

export function saveLastProfile(profile: GoogleProfile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export function clearLastProfile(): void {
  localStorage.removeItem(PROFILE_KEY);
}

// ── Cached OAuth access token ────────────────────────────────────────
// Persisted so a refresh within the token's TTL (~1 hour) lands the user
// straight in the app without any sign-in step. The token is short-lived
// and scoped to drive.file + identity, and never leaves the browser
// either way; localStorage matches the in-memory threat model.
export type StoredToken = { token: string; expiresAt: number };

export function loadToken(): StoredToken | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as Partial<StoredToken>;
    if (typeof t.token !== 'string' || typeof t.expiresAt !== 'number') return null;
    if (t.expiresAt <= Date.now()) return null;
    return { token: t.token, expiresAt: t.expiresAt };
  } catch {
    return null;
  }
}

export function saveToken(t: StoredToken): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
