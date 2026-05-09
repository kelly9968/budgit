// Per-Google-account local config. Only stores pointers (sheetId/sheetName) —
// budget and categories live in the sheet's @metadata tab now.

import type { GoogleProfile } from './types';

const KEY = (sub: string) => `budgie:config:${sub}`;
const PROFILE_KEY = 'budgie:lastProfile';

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
