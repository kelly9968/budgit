import { useState } from 'react';
import { createSpreadsheet, getMeta } from '../api/sheets';
import { pickSpreadsheet } from '../api/picker';
import { SheetConnectionModal } from './SheetConnectionModal';
import {
  DEFAULT_DATA_START_ROW,
  DEFAULT_MAPPING,
  DEFAULT_META_TAB,
  DEFAULT_TX_TAB,
  type SheetConnection,
} from '../lib/connection';

type Props = {
  onReady: (conn: SheetConnection) => void;
};

export function SheetSetup({ onReady }: Props) {
  const [working, setWorking] = useState<null | 'create' | 'pick'>(null);
  const [error, setError] = useState<string | null>(null);
  // A just-picked existing sheet, awaiting the first-run connection wizard.
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);

  const handleCreate = async () => {
    setError(null);
    setWorking('create');
    try {
      const title = `Budgie — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;
      const id = await createSpreadsheet(title);
      // Fresh app-managed sheet: standard layout, two-way sync, ready to go.
      onReady({
        sheetId: id,
        sheetName: title,
        txTab: DEFAULT_TX_TAB,
        metaTab: DEFAULT_META_TAB,
        mapping: DEFAULT_MAPPING,
        dataStartRow: DEFAULT_DATA_START_ROW,
        writeEnabled: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create sheet');
      setWorking(null);
    }
  };

  const handlePick = async () => {
    setError(null);
    setWorking('pick');
    try {
      const result = await pickSpreadsheet();
      if (!result) {
        setWorking(null);
        return;
      }
      // Refresh the title (picker names can be stale), then open the
      // connection wizard — nothing in their sheet is touched until they
      // review the mapping and hit Connect.
      const meta = await getMeta(result.id);
      setPicked({ id: result.id, name: meta.properties.title });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open that sheet');
      setWorking(null);
    }
  };

  return (
    <div className="setup-wrap">
      <div className="setup-card">
        <div className="signin-logo">
          <span className="signin-logo-text">budgie</span>
        </div>
        <h1 className="setup-h1">Where should we track?</h1>
        <p className="setup-p">
          Pick an existing spreadsheet or let us create a fresh one. For an
          existing sheet, you&rsquo;ll choose which tab and columns hold your data.
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
                Pick from your Drive, map its columns, choose one-way or two-way sync.
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

      {picked && (
        <SheetConnectionModal
          sheetId={picked.id}
          sheetName={picked.name}
          firstRun
          onSave={(conn) => {
            setPicked(null);
            onReady(conn);
          }}
          onClose={() => {
            setPicked(null);
            setWorking(null);
          }}
        />
      )}
    </div>
  );
}
