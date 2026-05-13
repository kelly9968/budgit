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
  ensureSchema,
  listTransactions,
  loadAppMeta,
  saveAppMeta,
  sheetUrl,
  updateTransaction,
} from './api/sheets';
import {
  clearConfig,
  clearLastProfile,
  DEFAULT_BUDGET,
  loadConfig,
  loadLastProfile,
  saveConfig,
  saveLastProfile,
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
        onReady={(sheetId, sheetName) => {
          const next: LocalConfig = { sheetId, sheetName };
          saveConfig(auth.profile.sub, next);
          setConfig(next);
        }}
      />
    );
  }

  return (
    <Main
      auth={auth}
      config={config}
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
  onSwitchSheet,
  onSignOut,
}: {
  auth: AuthState;
  config: LocalConfig;
  onSwitchSheet: () => void;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<TabId>('add');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const tabbarRef = useRef<HTMLElement | null>(null);

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

  // Swipe across the tab bar to move between tabs. Order excludes
  // 'demo' in production; the tab itself is dev-only.
  const tabOrder: TabId[] = import.meta.env.DEV
    ? ['dash', 'add', 'tx', 'demo']
    : ['dash', 'add', 'tx'];
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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Self-heal: brings old sheets (without @metadata tab) up to spec.
      // Idempotent — no-op when both tabs already exist.
      await ensureSchema(config.sheetId);
      const [rows, meta] = await Promise.all([
        listTransactions(config.sheetId),
        loadAppMeta(config.sheetId),
      ]);
      setTxns(rows);

      // Hydrate budget from sheet, or seed defaults on first run
      if (meta.budget !== undefined) {
        setBudget(meta.budget);
      } else {
        setBudget(DEFAULT_BUDGET);
        // Don't await — non-blocking seed
        saveAppMeta(config.sheetId, 'budget', DEFAULT_BUDGET).catch(() => {});
      }

      // Hydrate categories from sheet, or seed defaults on first run
      if (meta.categories !== undefined && meta.categories.length > 0) {
        setCategories(meta.categories);
      } else {
        setCategories(DEFAULT_CATEGORIES);
        saveAppMeta(config.sheetId, 'categories', DEFAULT_CATEGORIES).catch(() => {});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
      setFirstLoadDone(true);
    }
  }, [config.sheetId]);

  useEffect(() => {
    refresh();
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
      await addTransaction(config.sheetId, tx);
    } catch (e) {
      setTxns((prev) => prev.filter((t) => t !== tx));
      throw e;
    }
  };

  const handleBudgetChange = async (b: number) => {
    const prev = budget;
    setBudget(b); // optimistic
    try {
      await saveAppMeta(config.sheetId, 'budget', b);
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
      await saveAppMeta(config.sheetId, 'categories', next);
    } catch (e) {
      setCategories(prev);
      throw e;
    }
  };

  const handleBulkAdd = async (txs: Transaction[]) => {
    setTxns((prev) => [...txs, ...prev]);
    try {
      await addTransactionsBulk(config.sheetId, txs);
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
      await updateTransaction(config.sheetId, next._row, next);
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
      await deleteTransaction(config.sheetId, target._row);
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
        {tab === 'add' && (
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

        {editingTx && (
          <EditTransactionModal
            tx={editingTx}
            categories={categories}
            onSave={handleEditSave}
            onDelete={handleEditDelete}
            onAddCategory={handleAddCategory}
            onClose={() => setEditingTx(null)}
          />
        )}
      </main>

      <nav className="tabbar" ref={tabbarRef}>
        <TabBtn id="dash" current={tab} setTab={setTab} icon={<DashIcon />} label="Dashboard" />
        <TabBtn id="add" current={tab} setTab={setTab} icon={<AddIcon />} label="Add" />
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

