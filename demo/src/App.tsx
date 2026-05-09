import { useCallback, useEffect, useState } from 'react';
import { SignIn } from './views/SignIn';
import { ContinueAs } from './views/ContinueAs';
import { SheetSetup } from './views/SheetSetup';
import { Add } from './views/Add';
import { Transactions } from './views/Transactions';
import { Dashboard } from './views/Dashboard';
import { DemoData } from './views/DemoData';
import { EditTransactionModal } from './views/EditTransactionModal';
import { signOut } from './api/gis';
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

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [config, setConfig] = useState<LocalConfig | null>(null);
  // Profile cached from a previous session. If present and no live auth,
  // we show ContinueAs (one-click re-auth) instead of the full SignIn.
  const [cachedProfile, setCachedProfile] = useState<GoogleProfile | null>(
    () => loadLastProfile(),
  );

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

  if (!auth) {
    if (cachedProfile) {
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
  const [tab, setTab] = useState<TabId>('dash');
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
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
    }
  }, [config.sheetId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
          <span className="app-logo-text">Budgit</span>
          <span className="app-logo-line" />
        </div>
        <div className="app-user">
          <button className="app-signout" onClick={refresh} disabled={loading}>
            {loading ? '↻…' : '↻'}
          </button>
          <button className="app-signout" onClick={onSwitchSheet}>
            Switch sheet
          </button>
          {auth.profile.picture && (
            <img src={auth.profile.picture} alt="" className="app-avatar" />
          )}
          <button className="app-signout" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="app-meta">
        <a href={sheetUrl(config.sheetId)} target="_blank" rel="noreferrer">
          {config.sheetName ?? 'sheet'} ↗
        </a>
        {error && <span className="app-meta-err">· {error}</span>}
      </div>

      <main className="app-main">
        {tab === 'dash' && (
          <Dashboard
            txns={txns}
            budget={budget}
            onBudgetChange={handleBudgetChange}
          />
        )}
        {tab === 'add' && (
          <Add
            categories={categories}
            onAdd={handleAdd}
            onAddCategory={handleAddCategory}
          />
        )}
        {tab === 'tx' && (
          <Transactions
            txns={txns}
            categories={categories}
            loading={loading}
            onSelect={setEditingTx}
          />
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
