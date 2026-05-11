import { useCallback, useEffect, useRef, useState } from 'react';
import { SignIn } from './views/SignIn';
import { ContinueAs } from './views/ContinueAs';
import { SheetSetup } from './views/SheetSetup';
import { Add } from './views/Add';
import { Transactions } from './views/Transactions';
import { Dashboard } from './views/Dashboard';
import { DemoData } from './views/DemoData';
import { EditTransactionModal } from './views/EditTransactionModal';
import { signOut, silentSignIn } from './api/gis';
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
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [config, setConfig] = useState<LocalConfig | null>(null);
  // Profile cached from a previous session. If present and no live auth,
  // we show ContinueAs (one-click re-auth) instead of the full SignIn.
  const [cachedProfile, setCachedProfile] = useState<GoogleProfile | null>(
    () => loadLastProfile(),
  );
  // Tracks the silent-reauth attempt that runs once on mount when a cached
  // profile exists. While in flight we render nothing — flashing the
  // ContinueAs card and then ripping it away on success is jarring.
  const [silentTried, setSilentTried] = useState(false);

  const handleSignedIn = useCallback(
    (profile: GoogleProfile, accessToken: string) => {
      saveLastProfile(profile);
      setAuth({ profile, accessToken });
      setCachedProfile(profile);
    },
    [],
  );

  useEffect(() => {
    if (!auth) return;
    setConfig(loadConfig(auth.profile.sub));
  }, [auth]);

  // Try a silent reauth on first paint when we have a cached profile.
  // Succeeds when Google still has consent — most refreshes go straight
  // through to the app without any user-facing sign-in step.
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
    if (cachedProfile) {
      // Hold the splash while the silent attempt is in flight.
      if (!silentTried) {
        return <LoadingSplash />;
      }
      return (
        <ContinueAs
          profile={cachedProfile}
          onSignedIn={handleSignedIn}
          onUseDifferent={() => {
            clearLastProfile();
            setCachedProfile(null);
          }}
        />
      );
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
        setCachedProfile(null);
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
  const [sheetMenuOpen, setSheetMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const sheetMenuRef = useRef<HTMLDivElement | null>(null);
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

  // Close either dropdown when the user clicks anywhere outside it.
  useEffect(() => {
    if (!userMenuOpen && !sheetMenuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (userMenuOpen && userMenuRef.current && !userMenuRef.current.contains(t)) {
        setUserMenuOpen(false);
      }
      if (sheetMenuOpen && sheetMenuRef.current && !sheetMenuRef.current.contains(t)) {
        setSheetMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userMenuOpen, sheetMenuOpen]);

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
          <span className="app-logo-text">Budgie</span>
          <span className="app-logo-line" />
        </div>
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

      <div className="app-meta">
        <div className="app-meta-sheet" ref={sheetMenuRef}>
          <button
            type="button"
            className="app-meta-trigger"
            onClick={() => setSheetMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={sheetMenuOpen}
          >
            {config.sheetName ?? 'sheet'}
            <ChevIcon />
          </button>
          {sheetMenuOpen && (
            <div className="app-menu app-menu-sheet" role="menu">
              <button
                type="button"
                className="app-menu-item"
                role="menuitem"
                onClick={() => {
                  setSheetMenuOpen(false);
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
                  setSheetMenuOpen(false);
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
                onClick={() => setSheetMenuOpen(false)}
              >
                Open in Drive ↗
              </a>
            </div>
          )}
        </div>
        {error && <span className="app-meta-err">· {error}</span>}
      </div>

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
            onClose={() => setEditingTx(null)}
          />
        )}
      </main>

      <nav className="tabbar">
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

// Small downward chevron used as the "open menu" affordance on the
// sheet-name trigger in the meta strip.
function ChevIcon() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      width="10"
      height="10"
      style={{ marginLeft: 4, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }}
    >
      <path d="M3 5 L6 8 L9 5" />
    </svg>
  );
}
