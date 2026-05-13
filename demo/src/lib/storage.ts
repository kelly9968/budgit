// Per-Google-account local config. Only stores pointers (sheetId/sheetName) —
// budget and categories live in the sheet's @metadata tab now.

import type { GoogleProfile } from './types';

const KEY = (sub: string) => `budgie:config:${sub}`;
const PROFILE_KEY = 'budgie:lastProfile';
const TOKEN_KEY = 'budgie:token';

export type LocalConfig = {
  sheetId: string;
  sheetName?: string;
};

export const DEFAULT_BUDGET = 5200;

export function loadConfig(sub: string): LocalConfig | null {
  try {
    const raw = localStorage.getItem(KEY(sub));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalConfig>;
    if (!parsed.sheetId) return null;
    return { sheetId: parsed.sheetId, sheetName: parsed.sheetName };
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
