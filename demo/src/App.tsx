import { useCallback, useEffect, useState } from 'react';
import { SignIn } from './views/SignIn';
import { SheetSetup } from './views/SheetSetup';
import { Add } from './views/Add';
import { Transactions } from './views/Transactions';
import { Dashboard } from './views/Dashboard';
import { signOut, silentSignIn } from './api/gis';
import { addTransaction, listTransactions, sheetUrl } from './api/sheets';
import {
  clearConfig,
  DEFAULT_BUDGET,
  loadConfig,
  saveConfig,
  type LocalConfig,
} from './lib/storage';
import type { GoogleProfile, Transaction } from './lib/types';

type AuthState = {
  profile: GoogleProfile;
  accessToken: string;
};

type BootStatus = 'booting' | 'signed-out' | 'signed-in';
type TabId = 'dash' | 'add' | 'tx';

export function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [config, setConfig] = useState<LocalConfig | null>(null);
  const [boot, setBoot] = useState<BootStatus>('booting');

  useEffect(() => {
    let cancelled = false;
    silentSignIn().then((result) => {
      if (cancelled) return;
      if (result) {
        setAuth(result);
        setBoot('signed-in');
      } else {
        setBoot('signed-out');
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!auth) return;
    setConfig(loadConfig(auth.profile.sub));
  }, [auth]);

  if (boot === 'booting') {
    return <div className="boot-wrap" />;
  }

  if (!auth) {
    return (
      <SignIn
        onSignedIn={(profile, accessToken) => {
          setAuth({ profile, accessToken });
          setBoot('signed-in');
        }}
      />
    );
  }

  if (!config) {
    return (
      <SheetSetup
        onReady={(sheetId, sheetName) => {
          const next: LocalConfig = { sheetId, sheetName, budget: DEFAULT_BUDGET };
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
        setAuth(null);
        setConfig(null);
        setBoot('signed-out');
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
  const [tab, setTab] = useState<TabId>('dash');
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listTransactions(config.sheetId);
      setTxns(rows);
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-logo">
          <span className="app-logo-text">Budgie</span>
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
            budget={config.budget}
            onBudgetChange={(b) => onConfigChange({ ...config, budget: b })}
          />
        )}
        {tab === 'add' && <Add onAdd={handleAdd} />}
        {tab === 'tx' && <Transactions txns={txns} loading={loading} />}
      </main>

      <nav className="tabbar">
        <TabBtn id="dash" current={tab} setTab={setTab} icon="◐" label="Dashboard" />
        <TabBtn id="add" current={tab} setTab={setTab} icon="+" label="Add" />
        <TabBtn id="tx" current={tab} setTab={setTab} icon="≡" label="History" />
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
  icon: string;
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
