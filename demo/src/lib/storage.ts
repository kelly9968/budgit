// Per-Google-account local config. Keyed by the user's `sub` so multiple
// accounts on the same browser don't collide.

const KEY = (sub: string) => `budgie:config:${sub}`;

export type LocalConfig = {
  sheetId: string;
  sheetName?: string;
  budget: number; // monthly budget; defaults to 5200 if missing
};

export const DEFAULT_BUDGET = 5200;

export function loadConfig(sub: string): LocalConfig | null {
  try {
    const raw = localStorage.getItem(KEY(sub));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalConfig>;
    if (!parsed.sheetId) return null;
    return {
      sheetId: parsed.sheetId,
      sheetName: parsed.sheetName,
      budget: typeof parsed.budget === 'number' ? parsed.budget : DEFAULT_BUDGET,
    };
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
