import { useState } from 'react';
import { createSpreadsheet, ensureSchema, getMeta } from '../api/sheets';
import { pickSpreadsheet } from '../api/picker';

type Props = {
  onReady: (sheetId: string, sheetName: string) => void;
};

export function SheetSetup({ onReady }: Props) {
  const [working, setWorking] = useState<null | 'create' | 'pick'>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setError(null);
    setWorking('create');
    try {
      const title = `Budgit — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      const id = await createSpreadsheet(title);
      onReady(id, title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create sheet');
      setWorking(null);
    }
  };

  const handlePick = async () => {
    setError(null);
    setWorking('pick');
    try {
      const picked = await pickSpreadsheet();
      if (!picked) {
        setWorking(null);
        return;
      }
      await ensureSchema(picked.id);
      // refresh title in case picker name was stale
      const meta = await getMeta(picked.id);
      onReady(picked.id, meta.properties.title);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not set up sheet');
      setWorking(null);
    }
  };

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <div className="signin-logo">
          <span className="signin-logo-text">Budgit</span>
          <span className="signin-logo-line" />
        </div>
        <h1 className="setup-h1">Where should we track?</h1>
        <p className="setup-p">
          Pick an existing spreadsheet or let us create a fresh one. Either way,
          we&rsquo;ll add a <code>Transactions</code> tab with the right columns.
        </p>

        <div className="setup-options">
          <button
            type="button"
            className="setup-opt"
            onClick={handleCreate}
            disabled={working !== null}
          >
            <div className="setup-opt-ico">＋</div>
            <div className="setup-opt-body">
              <div className="setup-opt-title">Create a new sheet</div>
              <div className="setup-opt-desc">
                One click. Lives in your Drive, named after this month.
              </div>
            </div>
            {working === 'create' && <div className="setup-opt-spin">…</div>}
          </button>

          <button
            type="button"
            className="setup-opt"
            onClick={handlePick}
            disabled={working !== null}
          >
            <div className="setup-opt-ico">⌕</div>
            <div className="setup-opt-body">
              <div className="setup-opt-title">Use an existing sheet</div>
              <div className="setup-opt-desc">
                Pick from your Drive. We&rsquo;ll add a <code>Transactions</code> tab if it&rsquo;s not there.
              </div>
            </div>
            {working === 'pick' && <div className="setup-opt-spin">…</div>}
          </button>
        </div>

        {error && <div className="signin-error">{error}</div>}

        <p className="setup-note">
          We only see sheets you create here or explicitly pick &mdash; not your whole Drive.
        </p>
      </div>
    </div>
  );
}
