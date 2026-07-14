# Budgie

Budgie is a Google Sheets-backed budgeting app with a separate public marketing site.

## Layout

- `demo/` — the production React + TypeScript + Vite app.
- `marketing/` — the static marketing site.
- `index.html` and other root files — the original upstream single-file prototype; not deployed.

## Local checks

```bash
cd demo
npm test
npm run build
```

## Deployments

| Site | CapRover app | Domain | Deploy |
|---|---|---|---|
| Product app | `budgie` | `app.budgie.help` | `cd demo && ./deploy.sh` |
| Marketing | `budgie-marketing` | `budgie.help` | `cd marketing && ./deploy.sh` |

Both domains terminate TLS at Cloudflare and reach CapRover over the tunnel's HTTP ingress rules. Do not enable CapRover SSL for them.

The app's Google OAuth client and browser API key must allow `https://app.budgie.help` (the API key referrer pattern is `https://app.budgie.help/*`). Vite's Google/OpenRouter values are public client-side build args configured on the `budgie` app in CapRover.

## Data contract

The user's chosen Google Sheet is the source of truth. Existing tabs can map arbitrary columns to date, amount, note, category, and sub-category. Read-only connections must never issue a Sheets write. Two-way connections store budget/category metadata in the configured app-managed metadata tab.
