import type { GoogleProfile } from '../lib/types';
import { clearToken, loadToken, saveToken } from '../lib/storage';

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

// We bundle identity (openid/email/profile) with the API scopes so a single
// consent popup gives us everything. This keeps the sign-in flow tied to a
// single user gesture (avoids popup-blocker / gesture-context issues).
//
// Scope strategy: `drive.file` only — non-sensitive, lets us read/write
// only spreadsheets the user explicitly picked via Google Picker or that
// Budgit created via Sheets API. Sufficient for every operation in the
// app. Avoids the broad `spreadsheets` scope (sensitive, triggers a
// security questionnaire during OAuth verification).
export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/drive.file',
].join(' ');

if (!CLIENT_ID) {
  throw new Error('VITE_GOOGLE_CLIENT_ID is not set');
}

// ── Wait for the GIS script to finish loading ────────────────────────
let gisReady: Promise<void> | null = null;
export function waitForGis(): Promise<void> {
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - start > 10_000) return reject(new Error('GIS script load timeout'));
      setTimeout(tick, 50);
    };
    tick();
  });
  return gisReady;
}

// ── Token client (singleton) ──────────────────────────────────────────
type CachedToken = { token: string; expiresAt: number };
// Seed the in-memory cache from localStorage so refreshes within the
// token's TTL skip the sign-in flow entirely.
let cachedToken: CachedToken | null = loadToken();
let tokenClient: google.accounts.oauth2.TokenClient | null = null;

function ensureTokenClient(): google.accounts.oauth2.TokenClient {
  if (tokenClient) return tokenClient;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES,
    callback: () => {}, // overridden per-request
  });
  return tokenClient;
}

export async function requestAccessToken(
  opts: { prompt?: '' | 'none' | 'consent' } = {},
): Promise<string> {
  await waitForGis();
  const client = ensureTokenClient();
  return new Promise<string>((resolve, reject) => {
    const c = client as unknown as {
      callback: (r: google.accounts.oauth2.TokenResponse) => void;
      error_callback: (e: { type: string; message?: string }) => void;
    };
    c.callback = (resp) => {
      if (resp.error || !resp.access_token) {
        reject(new Error(resp.error || 'No access token returned'));
        return;
      }
      cachedToken = {
        token: resp.access_token,
        // refresh 60s early to avoid mid-request 401s
        expiresAt: Date.now() + (resp.expires_in - 60) * 1000,
      };
      saveToken(cachedToken);
      resolve(resp.access_token);
    };
    c.error_callback = (err) =>
      reject(new Error(err.message || err.type || 'Token request failed'));
    client.requestAccessToken({ prompt: opts.prompt ?? '' });
  });
}

export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  return requestAccessToken({ prompt: '' });
}

// ── Userinfo (profile) ────────────────────────────────────────────────
export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const data = (await res.json()) as {
    sub: string;
    email: string;
    name: string;
    picture?: string;
  };
  return { sub: data.sub, email: data.email, name: data.name, picture: data.picture };
}

// ── One-shot sign-in: token + profile in a single user gesture ────────
export async function signIn(): Promise<{
  profile: GoogleProfile;
  accessToken: string;
}> {
  const accessToken = await requestAccessToken();
  const profile = await fetchProfile(accessToken);
  return { profile, accessToken };
}

// ── Silent sign-in: try to get a token without prompting the user.
// Succeeds when Google still has the user's consent for this client +
// scopes. Fails (returns null) when the user has revoked, never granted,
// or the browser blocks third-party cookies for accounts.google.com.
export async function silentSignIn(): Promise<{
  profile: GoogleProfile;
  accessToken: string;
} | null> {
  try {
    const accessToken = await requestAccessToken({ prompt: 'none' });
    const profile = await fetchProfile(accessToken);
    return { profile, accessToken };
  } catch {
    return null;
  }
}

// ── Sign-out ──────────────────────────────────────────────────────────
export function signOut(): void {
  if (cachedToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(cachedToken.token);
  }
  cachedToken = null;
  clearToken();
}

export function clearAccessToken(): void {
  cachedToken = null;
  clearToken();
}

// Read the current cached token (memory + localStorage). Returns null
// when expired or absent. Used by the App on mount to decide whether
// it can skip the sign-in flow.
export function readCachedToken(): CachedToken | null {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken;
  return null;
}
