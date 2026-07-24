import { useCallback, useEffect, useRef, useState } from 'react';
import { SignIn } from './views/SignIn';
import { SheetSetup } from './views/SheetSetup';
import { Add } from './views/Add';
import { Transactions } from './views/Transactions';
import { Dashboard, type SelectedMonth } from './views/Dashboard';
import { DemoData } from './views/DemoData';
import { EditTransactionModal } from './views/EditTransactionModal';
import { readCachedToken, signOut, silentSignIn } from './api/gis';
import { useSwipe } from './lib/swipe';
import {
  addTransaction,
  addTransactionsBulk,
  deleteTransaction,
  listTransactions,
  loadAppMeta,
  provisionOrValidate,
  saveAppMeta,
  sheetUrl,
  updateTransaction,
  type AppMeta,
} from './api/sheets';
import { SheetConnectionModal } from './views/SheetConnectionModal';
import {
  clearConfig,
  clearLastProfile,
  DEFAULT_BUDGET,
  loadConfig,
  loadLastProfile,
  loadLocalMeta,
  saveConfig,
  saveLastProfile,
  saveLocalMeta,
  type LocalConfig,
} from './lib/storage';
import { DEFAULT_CATEGORIES, type Category } from './lib/categories';
import type { GoogleProfile, Transaction } from './lib/types';

type AuthState = {
  profile: GoogleProfile;
  accessToken: string;
};

type TabId = 'dash' | 'add' | 'tx' | 'demo';

// One coin flip per page load — same icon for the whole SPA session,
// reshuffled on refresh. Picked at module scope so a re-render of the
// header doesn't trigger a new draw.
const HEADER_ICON = Math.random() < 0.5 ? '/icon_1.png' : '/icon_2.png';

export function App() {
  // Seed auth synchronously from the persisted token + profile so a
  // refresh within the token's TTL (~1 hour) lands the user straight in
  // the app — no flash of sign-in, no extra click.
  const [auth, setAuth] = useState<AuthState | null>(() => {
    const t = readCachedToken();
    const p = loadLastProfile();
    if (t && p) return { profile: p, accessToken: t.token };
    return null;
  });
  const [config, setConfig] = useState<LocalConfig | null>(null);
  // Captured once on mount so the silent-reauth effect dep stays stable.
  const [cachedProfile] = useState<GoogleProfile | null>(() => loadLastProfile());
  // Tracks the silent-reauth attempt that runs once on mount when the
  // persisted token is missing/expired but a cached profile exists.
  // While in flight we render nothing — flashing SignIn and then
  // ripping it away on success is jarring.
  const [silentTried, setSilentTried] = useState(false);

  const handleSignedIn = useCallback(
    (profile: GoogleProfile, accessToken: string) => {
      saveLastProfile(profile);
      setAuth({ profile, accessToken });
    },
    [],
  );

  useEffect(() => {
    if (!auth) return;
    setConfig(loadConfig(auth.profile.sub));
  }, [auth]);

  // When the persisted token is gone but we still know who the user
  // was, try a silent reauth once. Succeeds when Google still has
  // consent — most refreshes past the token TTL go straight through
  // without any user-facing sign-in step.
  useEffect(() => {
    if (auth || silentTried || !cachedProfile) return;
    let cancelled = false;
    (async () => {
      const result = await silentSignIn();
      if (cancelled) return;
      if (result) {
        handleSignedIn(result.profile, result.accessToken);
      }
      setSilentTried(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth, silentTried, cachedProfile, handleSignedIn]);

  if (!auth) {
    // Hold the splash while the silent attempt is in flight so we
    // don't flash the SignIn card in the success case.
    if (cachedProfile && !silentTried) {
      return <LoadingSplash />;
    }
    return <SignIn onSignedIn={handleSignedIn} />;
  }

  if (!config) {
    return (
      <SheetSetup
        onReady={(conn) => {
          saveConfig(auth.profile.sub, conn);
          setConfig(conn);
        }}
      />
    );
  }

  return (
    <Main
      auth={auth}
      config={config}
      onConfigChange={(next) => {
        saveConfig(auth.profile.sub, next);
        setConfig(next);
      }}
      onSwitchSheet={() => {
        clearConfig(auth.profile.sub);
        setConfig(null);
      }}
      onSignOut={() => {
        signOut();
        clearLastProfile();
        setAuth(null);
        setConfig(null);
      }}
    />
  );
}

function Main({
  auth,
  config,
  onConfigChange,
  onSwitchSheet,
  onSignOut,
}: {
  auth: AuthState;
  config: LocalConfig;
  onConfigChange: (next: LocalConfig) => void;
  onSwitchSheet: () => void;
  onSignOut: () => void;
}) {
  const canWrite = config.writeEnabled;
  const [tab, setTab] = useState<TabId>(canWrite ? 'add' : 'dash');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const tabbarRef = useRef<HTMLElement | null>(null);

  // There's no Add tab in read-only mode; hop off it if the connection
  // flips to read-only while Add is open.
  useEffect(() => {
    if (!canWrite && tab === 'add') setTab('dash');
  }, [canWrite, tab]);

  // Category tapped on the Dashboard pie legend — jumps to History
  // pre-filtered to that category. One-shot: cleared as soon as the
  // user leaves the tx tab, so a later manual tab-bar visit to History
  // starts unfiltered instead of replaying a stale jump.
  const [jumpCategory, setJumpCategory] = useState<string | null>(null);
  useEffect(() => {
    if (tab !== 'tx') setJumpCategory(null);
  }, [tab]);
  const handleCategoryJump = (name: string) => {
    setJumpCategory(name);
    setTab('tx');
  };

  // Selected month — owned at app level so the header can render its
  // month nav even when the active tab is something other than the
  // dashboard. Dashboard reads it via prop.
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState<SelectedMonth>({
    year: now.getFullYear(),
    month: now.getMonth(),
  });
  const navMonth = (delta: number) => {
    const next = new Date(selectedMonth.year, selectedMonth.month + delta, 1);
    setSelectedMonth({ year: next.getFullYear(), month: next.getMonth() });
  };
  const goToday = () =>
    setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() });
  const isCurrentMonth =
    selectedMonth.year === now.getFullYear() &&
    selectedMonth.month === now.getMonth();
  const monthLbl = new Date(selectedMonth.year, selectedMonth.month, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Swipe across the tab bar to move between tabs. 'add' drops out in
  // read-only mode; 'demo' is dev-only.
  const writableOrder: TabId[] = canWrite ? ['dash', 'add', 'tx'] : ['dash', 'tx'];
  const tabOrder: TabId[] = import.meta.env.DEV
    ? [...writableOrder, 'demo']
    : writableOrder;
  const goTab = (delta: number) => {
    const i = tabOrder.indexOf(tab);
    const next = tabOrder[i + delta];
    if (next) setTab(next);
  };
  useSwipe(tabbarRef, {
    onLeft: () => goTab(1),
    onRight: () => goTab(-1),
  });
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstLoadDone, setFirstLoadDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [budget, setBudget] = useState<number>(DEFAULT_BUDGET);
  const [categories, setCategories] = useState<Category[]>(DEFAULT_CATEGORIES);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);

  // When the last successful load finished — lets the focus listener pull
  // external sheet edits without hammering the API on every tab switch.
  const lastSync = useRef(0);
  // Only the newest refresh may commit state. A focus refresh, manual
  // refresh, or sheet-settings change can otherwise race a slower request
  // and paint data from the previous connection over the current one.
  const refreshSeq = useRef(0);

  // Persist app metadata (budget/categories) to the sheet's metadata tab
  // when two-way sync is on, or to the local cache when read-only — the
  // read-only promise is that we never write the user's spreadsheet.
  const persistMeta = useCallback(
    async <K extends keyof AppMeta>(key: K, value: NonNullable<AppMeta[K]>) => {
      if (config.writeEnabled) {
        await saveAppMeta(config, key, value);
      } else {
        saveLocalMeta(auth.profile.sub, config.sheetId, { [key]: value });
      }
    },
    [config, auth.profile.sub],
  );

  const refresh = useCallback(async () => {
    const seq = ++refreshSeq.current;
    setLoading(true);
    setError(null);
    try {
      // Self-heal the app's metadata tab (no-op when read-only or present).
      await provisionOrValidate(config);
      const rows = await listTransactions(config);
      const meta = config.writeEnabled
        ? await loadAppMeta(config)
        : loadLocalMeta(auth.profile.sub, config.sheetId);
      if (seq !== refreshSeq.current) return;
      setTxns(rows);

      // Hydrate budget, or seed defaults on first run
      if (meta.budget !== undefined) {
        setBudget(meta.budget);
      } else {
        setBudget(DEFAULT_BUDGET);
        // Don't await — non-blocking seed
        persistMeta('budget', DEFAULT_BUDGET).catch(() => {});
      }

      // Hydrate categories, or seed defaults on first run
      if (meta.categories !== undefined && meta.categories.length > 0) {
        setCategories(meta.categories);
      } else {
        setCategories(DEFAULT_CATEGORIES);
        persistMeta('categories', DEFAULT_CATEGORIES).catch(() => {});
      }
      lastSync.current = Date.now();
    } catch (e) {
      if (seq === refreshSeq.current) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      }
    } finally {
      if (seq === refreshSeq.current) {
        setLoading(false);
        setFirstLoadDone(true);
      }
    }
  }, [config, auth.profile.sub, persistMeta]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Sheet → app half of two-way flow: when the app regains focus or
  // visibility, re-read the sheet so edits made directly in Google Sheets
  // appear without a manual refresh. Debounced to protect API quota.
  useEffect(() => {
    const maybeSync = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSync.current < 30_000) return;
      refresh();
    };
    window.addEventListener('focus', maybeSync);
    document.addEventListener('visibilitychange', maybeSync);
    return () => {
      window.removeEventListener('focus', maybeSync);
      document.removeEventListener('visibilitychange', maybeSync);
    };
  }, [refresh]);

  // Close the avatar dropdown when the user clicks anywhere outside it.
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userMenuRef.current && !userMenuRef.current.contains(t)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen]);

  const handleAdd = async (tx: Transaction) => {
    setTxns((prev) => [tx, ...prev]);
    try {
      await addTransaction(config, tx);
    } catch (e) {
      setTxns((prev) => prev.filter((t) => t !== tx));
      throw e;
    }
  };

  const handleBudgetChange = async (b: number) => {
    const prev = budget;
    setBudget(b); // optimistic
    try {
      await persistMeta('budget', b);
    } catch (e) {
      setBudget(prev);
      setError(e instanceof Error ? e.message : 'Could not save budget');
    }
  };

  const handleAddCategory = async (cat: Category) => {
    const next = [...categories, cat];
    const prev = categories;
    setCategories(next); // optimistic
    try {
      await persistMeta('categories', next);
    } catch (e) {
      setCategories(prev);
      throw e;
    }
  };

  const handleBulkAdd = async (txs: Transaction[]) => {
    setTxns((prev) => [...txs, ...prev]);
    try {
      await addTransactionsBulk(config, txs);
      // refetch so we have the canonical sheet state (and stable order)
      await refresh();
    } catch (e) {
      setTxns((prev) => prev.filter((t) => !txs.includes(t)));
      throw e;
    }
  };

  const handleEditSave = async (next: Transaction) => {
    if (next._row === undefined) {
      throw new Error('Cannot edit: row reference missing');
    }
    const prev = txns;
    setTxns((p) => p.map((t) => (t._row === next._row ? next : t)));
    try {
      await updateTransaction(config, next._row, next);
      setEditingTx(null);
    } catch (e) {
      setTxns(prev);
      throw e;
    }
  };

  const handleEditDelete = async (target: Transaction) => {
    if (target._row === undefined) {
      throw new Error('Cannot delete: row reference missing');
    }
    const prev = txns;
    setTxns((p) => p.filter((t) => t._row !== target._row));
    setEditingTx(null);
    try {
      await deleteTransaction(config, target._row);
      // Refresh so remaining rows pick up their new row numbers (deleting
      // shifts everything below up by 1).
      await refresh();
    } catch (e) {
      setTxns(prev);
      throw e;
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo">
          <img
            src={HEADER_ICON}
            alt=""
            className="app-logo-mark"
            aria-hidden="true"
          />
          <span className="app-logo-text">budgie</span>
        </div>
        {tab === 'dash' && (
          <div className="app-monthnav">
            <button
              type="button"
              className="app-monthnav-arrow app-monthnav-prev"
              onClick={() => navMonth(-1)}
              aria-label="Previous month"
            >
              ‹
            </button>
            <span
              className="app-monthnav-label"
              onDoubleClick={goToday}
              title={isCurrentMonth ? undefined : 'Double-tap to return to this month'}
            >
              {monthLbl}
            </span>
            <button
              type="button"
              className="app-monthnav-arrow app-monthnav-next"
              onClick={() => navMonth(1)}
              aria-label="Next month"
            >
              ›
            </button>
          </div>
        )}
        <div className="app-user" ref={userMenuRef}>
          <button
            type="button"
            className="app-avatar-btn"
            onClick={() => setUserMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            aria-label="Account menu"
          >
            {auth.profile.picture ? (
              <img src={auth.profile.picture} alt="" className="app-avatar" />
            ) : (
              <span className="app-avatar app-avatar-fallback">
                {auth.profile.name?.[0] ?? '?'}
              </span>
            )}
          </button>
          {userMenuOpen && (
            <div className="app-menu" role="menu">
              <div className="app-menu-head">
                <div className="app-menu-name">{auth.profile.name}</div>
                <div className="app-menu-email">{auth.profile.email}</div>
              </div>
              <div className="app-menu-section">
                <div className="app-menu-section-lbl">Sheet</div>
                <div className="app-menu-section-val">{config.sheetName ?? '—'}</div>
                <div className="app-menu-section-sub">
                  {config.txTab} · {canWrite ? 'two-way sync' : 'read-only'}
                </div>
              </div>
              <button
                type="button"
                className="app-menu-item"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  refresh();
                }}
                disabled={loading}
              >
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="app-menu-item"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  setSettingsOpen(true);
                }}
              >
                Sheet settings…
              </button>
              <button
                type="button"
                className="app-menu-item"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  onSwitchSheet();
                }}
              >
                Switch sheet
              </button>
              <a
                className="app-menu-item"
                role="menuitem"
                href={sheetUrl(config.sheetId)}
                target="_blank"
                rel="noreferrer"
                onClick={() => setUserMenuOpen(false)}
              >
                Open in Drive ↗
              </a>
              <div className="app-menu-sep" />
              <button
                type="button"
                className="app-menu-item"
                role="menuitem"
                onClick={() => {
                  setUserMenuOpen(false);
                  onSignOut();
                }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {error && <div className="app-error">{error}</div>}

      <main className="app-main">
        {tab === 'add' && canWrite && (
          <Add
            categories={categories}
            onAdd={handleAdd}
            onBulkAdd={handleBulkAdd}
            onAddCategory={handleAddCategory}
          />
        )}
        {tab === 'dash' && (
          firstLoadDone ? (
            <Dashboard
              txns={txns}
              budget={budget}
              categories={categories}
              onBudgetChange={handleBudgetChange}
              selectedMonth={selectedMonth}
              onCategorySelect={handleCategoryJump}
            />
          ) : (
            <LoadingSplash />
          )
        )}
        {tab === 'tx' && (
          firstLoadDone ? (
            <Transactions
              txns={txns}
              categories={categories}
              loading={loading}
              readOnly={!canWrite}
              initialCatFilter={jumpCategory}
              onSelect={setEditingTx}
              onDelete={handleEditDelete}
            />
          ) : (
            <LoadingSplash />
          )
        )}
        {tab === 'demo' && import.meta.env.DEV && (
          <DemoData categories={categories} onBulkAdd={handleBulkAdd} />
        )}

        {editingTx && canWrite && (
          <EditTransactionModal
            tx={editingTx}
            categories={categories}
            onSave={handleEditSave}
            onDelete={handleEditDelete}
            onAddCategory={handleAddCategory}
            onClose={() => setEditingTx(null)}
          />
        )}

        {settingsOpen && (
          <SheetConnectionModal
            sheetId={config.sheetId}
            sheetName={config.sheetName}
            initial={config}
            onSave={(conn) => {
              setSettingsOpen(false);
              // Persisting a new config re-runs refresh via its config dep.
              onConfigChange(conn);
            }}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </main>

      <nav className="tabbar" ref={tabbarRef}>
        <TabBtn id="dash" current={tab} setTab={setTab} icon={<DashIcon />} label="Dashboard" />
        {canWrite && (
          <TabBtn id="add" current={tab} setTab={setTab} icon={<AddIcon />} label="Add" />
        )}
        <TabBtn id="tx" current={tab} setTab={setTab} icon={<HistoryIcon />} label="History" />
        {import.meta.env.DEV && (
          <TabBtn id="demo" current={tab} setTab={setTab} icon={<DemoIcon />} label="Demo" />
        )}
      </nav>
    </div>
  );
}

// Loading state shown while the first refresh resolves. Keeps the header
// + tabbar visible so the user has spatial continuity, just gates the
// content area to avoid the "jump" when data lands and replaces defaults.
function LoadingSplash() {
  return (
    <div className="loading-splash" aria-live="polite" aria-busy="true">
      <div className="loading-mark">B</div>
      <div className="loading-line">
        <span className="loading-dot" />
        <span className="loading-dot" />
        <span className="loading-dot" />
      </div>
      <div className="loading-text">Reading from your sheet</div>
    </div>
  );
}

function TabBtn({
  id,
  current,
  setTab,
  icon,
  label,
}: {
  id: TabId;
  current: TabId;
  setTab: (t: TabId) => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      className={`tabbar-btn ${current === id ? 'active' : ''}`}
      onClick={() => setTab(id)}
    >
      <span className="tabbar-ico">{icon}</span>
      <span className="tabbar-lbl">{label}</span>
    </button>
  );
}

// ── Tab bar icons — minimal stroke set, all 22×22 ────────────────────
function DashIcon() {
  // Editorial sparkline rising into a peak — speaks to "trend / overview"
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M3 16 L8 10 L12 13 L19 5" />
      <circle cx="19" cy="5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AddIcon() {
  // Plus inscribed in a soft square — looks more crafted than a bare +
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <rect x="3" y="3" width="16" height="16" rx="4" />
      <path d="M11 7 L11 15" />
      <path d="M7 11 L15 11" />
    </svg>
  );
}

function HistoryIcon() {
  // Short stack of horizontal lines suggesting receipts / ledger entries
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M5 7 L17 7" />
      <path d="M5 11 L14 11" />
      <path d="M5 15 L17 15" />
      <circle cx="3" cy="7" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3" cy="11" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="3" cy="15" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function DemoIcon() {
  // Sparkle / star — dev-only flag
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 3 L12.7 8.5 L18 10 L12.7 11.5 L11 17 L9.3 11.5 L4 10 L9.3 8.5 Z" />
    </svg>
  );
}
