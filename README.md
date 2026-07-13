# Back on Track

A mobile-first budgeting PWA (Progressive Web App) that syncs with your Google Sheet. Built entirely in a single HTML file — no frameworks, no build step, no backend server.

---

## What it is

Back on Track is a mobile budgeting app that sits on top of your existing Google Sheet. Your sheet is the database. The app is the beautiful mobile interface. Transactions you add in the app go straight to your sheet, and you can pull fresh data from the sheet with one tap.

It installs on your iPhone or Android home screen like a native app — no App Store, no subscription, no account required.

---

## How it was built

This project was designed and built through a series of conversations with Claude (Anthropic). The entire product — UI, logic, Google Sheets integration, landing page, and onboarding flow — was built iteratively through natural language, with no manual coding.

### Key design decisions made along the way

- **Single HTML file** — the entire app (landing page + onboarding + PWA) lives in one `index.html`. No build pipeline, no dependencies to manage. Anyone can open it in a text editor and understand it.
- **Google Sheets as the database** — no backend server, no new database to manage. The user's existing spreadsheet is the source of truth. The app reads and writes to it via a Google Apps Script web app endpoint.
- **PWA over native app** — installable via Safari "Add to Home Screen". No App Store review, no developer fee, works on any device.
- **JSONP for cross-origin requests** — Google Apps Script redirects block standard `fetch()` calls from mobile browsers. The workaround is JSONP (injecting a `<script>` tag dynamically), which bypasses CORS entirely.

---

## File structure

```
back-on-track/
├── index.html              # The entire app — landing page + onboarding + PWA
├── manifest.json           # PWA manifest (name, icons, display mode)
├── sw.js                   # Service worker for offline support
├── google-apps-script.js   # Paste this into Google Apps Script to enable sync
├── icons/
│   ├── icon-192.png        # PWA home screen icon (192×192)
│   └── icon-512.png        # PWA home screen icon (512×512)
└── README.md               # This file
```

---

## How the sync works

The `google-apps-script.js` file is deployed as a Google Apps Script Web App inside the user's Google Sheet. It exposes two endpoints:

- **GET `/exec`** — returns all transactions as JSON (with JSONP support via `?callback=fnName`)
- **POST `/exec`** — appends a new transaction row to the sheet

The app calls these endpoints using a `<script>` tag injection (JSONP) for reads, and a standard `fetch()` POST for writes.

Each user deploys their own copy of the script inside their own sheet. There is no shared backend — every user's data stays entirely within their own Google account.

---

## Column mapping

The script is currently configured for this sheet structure:

| Column | Field |
|--------|-------|
| A | Date |
| B | Amount |
| C | Biz Name / Note |
| D | Category |

To change the column mapping, edit the constants at the top of `google-apps-script.js`:

```javascript
const SHEET_NAME  = "Var Costs"; // Sheet tab name
const COL_DATE    = 1;           // Column A
const COL_AMOUNT  = 2;           // Column B
const COL_NOTE    = 3;           // Column C
const COL_CAT     = 4;           // Column D
const COL_SUB     = 0;           // 0 = no sub-category column
const HEADER_ROWS = 1;           // Row 1 is headers
```

---

## Dashboard metrics

The dashboard computes several metrics from the raw transaction data:

- **Spend to date** — sum of all transactions in the current month
- **Daily rate** — `monthly budget ÷ days in month` (e.g. $5,200 ÷ 30 = $173/day)
- **7-day average** — rolling average of the last 7 days of spend
- **Month average** — spend to date ÷ days elapsed
- **Blended average** — after day 7: `(7-day avg × 0.5) + (month avg × 0.5)`. Before day 7: just the 7-day avg. This smooths out early-month volatility.
- **On-track signal** — green if blended avg ≤ daily rate, amber if ≤ daily rate × 1.15, red if over
- **Forecast EOM** — `spent + blended avg × remaining days`
- **Recovery days** — days of spend at an assumed daily rate until cumulative spend drops back below the cumulative budget line. User can adjust the assumed daily spend with a slider.

---

## Daily tracker table colour logic

| Column | Green | Red | Dim |
|--------|-------|-----|-----|
| Total | Cumulative spend ≤ cumulative budget | Over | — |
| Day | Day's spend ≤ daily rate | Over daily rate | Zero spend day |
| +/− | Negative (under budget) | Positive (over budget) | Zero |

---

## Deploying your own copy

### Step 1 — Deploy the Apps Script

1. Open your Google Sheet
2. Go to **Extensions → Apps Script**
3. Delete all existing code
4. Paste the contents of `google-apps-script.js`
5. Edit the column constants at the top to match your sheet
6. Save (⌘S)
7. Click **Deploy → New deployment**
8. Type: Web app | Execute as: Me | Who has access: Anyone
9. Click **Deploy** → authorise when prompted
10. Copy the `/exec` URL

### Step 2 — Bake the URL into the app

Open `index.html` in a text editor. Find this line:

```javascript
let SHEET_API_URL = 'YOUR_APPS_SCRIPT_URL_HERE';
```

Replace `YOUR_APPS_SCRIPT_URL_HERE` with your `/exec` URL.

### Step 3 — Host on GitHub Pages

1. Create a new GitHub repository
2. Upload all files (keeping `icons/` as a folder)
3. Go to Settings → Pages → Deploy from branch → main → Save
4. Your app is live at `yourusername.github.io/repo-name`

### Step 4 — Install on iPhone

1. Open the GitHub Pages URL in Safari
2. Tap the Share button → Add to Home Screen → Add
3. The app appears on your home screen and opens full-screen

---

## Updating the app

When you want to make changes:

1. Go to your GitHub repo
2. Click `index.html` → click the pencil ✏️ edit icon
3. Make your changes
4. Click **Commit changes**
5. GitHub Pages auto-deploys in ~30 seconds

If you change the Apps Script, you must create a **New deployment** (not update existing) to get a fresh URL that reflects your changes. Then update the URL in `index.html`.

---

## Phase 2 — Google Workspace Add-on (saved for later)

A full Google Workspace Add-on has been built and saved separately. When published to the Google Workspace Marketplace ($5 one-time developer fee + 1–3 day review), the entire setup flow becomes:

1. Install the add-on from Marketplace (one tap)
2. Open Google Sheets → Extensions → Back on Track → Connect
3. Pick your tab and columns in the sidebar
4. Tap "Generate link" → URL auto-copies to clipboard
5. Paste into app → done

No code, no script editor, no deployment steps. Entirely mobile-friendly.

---

## Tech stack

| Layer | What |
|-------|------|
| Frontend | Vanilla HTML/CSS/JS — no frameworks |
| Charts | Chart.js (CDN) |
| Fonts | DM Serif Display + DM Sans (Google Fonts) |
| Backend | Google Apps Script (runs inside Google Sheets) |
| Database | Google Sheets |
| Hosting | GitHub Pages (or Netlify) |
| Install | PWA via Safari "Add to Home Screen" |
| Offline | Service worker caches app shell |

### Native Android

`android/` contains the native Compose client, signed-release workflow, and Month Pace / Recent
Spend home-screen widgets. See [`android/README.md`](android/README.md) for Google authorization,
configuration, build, testing, and installation details.

The reviewed signed APK is published at `/downloads/Budgie.apk`; adjacent checksum and JSON
metadata files identify the exact release.

---

## Planned improvements

- [ ] Google Workspace Marketplace add-on for zero-code setup
- [ ] Multi-month view and historical comparison
- [ ] Category breakdown charts
- [ ] Budget per category
- [ ] Swipe to delete transactions
- [ ] Dark mode
- [ ] Shared budget tracking (partner/family)
