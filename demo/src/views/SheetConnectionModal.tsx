import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createTransactionsTab,
  listTabs,
  listTransactions,
  readHeaderRow,
  renameTab,
} from '../api/sheets';
import {
  colLetter,
  DEFAULT_DATA_START_ROW,
  DEFAULT_MAPPING,
  DEFAULT_META_TAB,
  FIELDS,
  lastMappedCol,
  type ColumnMapping,
  type FieldKey,
  type SheetConnection,
} from '../lib/connection';
import { fmtUSD } from '../lib/budget';
import type { Transaction } from '../lib/types';

// Sentinel <option> value for "create a new tab".
const NEW_TAB = '__new__';

type Props = {
  sheetId: string;
  sheetName?: string;
  // Present in edit mode (Settings); absent on first connection.
  initial?: SheetConnection;
  firstRun?: boolean;
  onSave: (conn: SheetConnection) => void;
  onClose: () => void;
};

// Header-text → field guesses, so the mapping arrives mostly filled in and
// the user only corrects misses. Order matters: specific fields claim their
// columns first (sub before cat so "Sub-category" doesn't match cat's regex).
const GUESS_ORDER: Array<{ key: FieldKey; re: RegExp }> = [
  { key: 'date', re: /date|day|when/i },
  { key: 'amount', re: /amount|amt|price|cost|value|total|spent|\$/i },
  { key: 'sub', re: /sub/i },
  { key: 'cat', re: /categor|type|group|bucket/i },
  { key: 'note', re: /note|desc|memo|item|detail|merchant|name|place/i },
];

function guessMapping(headers: string[]): ColumnMapping {
  const used = new Set<number>();
  const out: ColumnMapping = { date: -1, amount: -1, note: -1, cat: -1, sub: -1 };
  for (const { key, re } of GUESS_ORDER) {
    const i = headers.findIndex((h, idx) => !used.has(idx) && re.test(String(h)));
    if (i >= 0) {
      used.add(i);
      out[key] = i;
    }
  }
  // Required fields fall back to the default layout when no header matched.
  if (out.date < 0) out.date = DEFAULT_MAPPING.date;
  if (out.amount < 0) out.amount = DEFAULT_MAPPING.amount;
  return out;
}

export function SheetConnectionModal({
  sheetId,
  sheetName,
  initial,
  firstRun,
  onSave,
  onClose,
}: Props) {
  const [tabs, setTabs] = useState<string[] | null>(null);
  const [txTab, setTxTab] = useState(initial?.txTab ?? '');
  const [newTabName, setNewTabName] = useState('Transactions');
  const [mapping, setMapping] = useState<ColumnMapping>(initial?.mapping ?? DEFAULT_MAPPING);
  const [dataStartRow, setDataStartRow] = useState(initial?.dataStartRow ?? DEFAULT_DATA_START_ROW);
  const [writeEnabled, setWriteEnabled] = useState(initial?.writeEnabled ?? true);
  const [metaTab, setMetaTab] = useState(initial?.metaTab ?? DEFAULT_META_TAB);

  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<Transaction[] | null>(null);
  const [previewErr, setPreviewErr] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const creatingNew = txTab === NEW_TAB;
  // The tab we last auto-guessed a mapping for. Seeded with the saved tab in
  // edit mode so opening Settings never clobbers a saved mapping; guesses
  // only fire when the user switches to a different tab.
  const guessedFor = useRef<string | null>(initial?.txTab ?? null);

  // Load the sheet's tabs once; pick a sensible default selection.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listTabs(sheetId);
        if (cancelled) return;
        setTabs(list);
        setTxTab((cur) => {
          if (cur) return cur;
          if (list.includes('Transactions')) return 'Transactions';
          return list[0] ?? NEW_TAB;
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not read the sheet');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetId]);

  // When a real tab is selected, read its header row for the column labels
  // and auto-guess a mapping (unless it's the tab we already configured).
  useEffect(() => {
    if (!txTab || creatingNew) {
      setHeaders([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const h = await readHeaderRow(sheetId, txTab);
        if (cancelled) return;
        setHeaders(h);
        if (guessedFor.current !== txTab) {
          guessedFor.current = txTab;
          setMapping(guessMapping(h));
        }
      } catch {
        if (!cancelled) setHeaders([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheetId, txTab, creatingNew]);

  // Live preview: debounce, then parse the first rows with the current
  // mapping so the user sees the connection reading their real data before
  // committing. Read-only by construction — preview never writes.
  const mappingKey = `${mapping.date}|${mapping.amount}|${mapping.note}|${mapping.cat}|${mapping.sub}`;
  useEffect(() => {
    if (creatingNew || !txTab || mapping.date < 0 || mapping.amount < 0) {
      setPreview(null);
      setPreviewErr(false);
      return;
    }
    let cancelled = false;
    setPreview(null);
    const t = setTimeout(async () => {
      try {
        const probe: SheetConnection = {
          sheetId,
          sheetName,
          txTab,
          metaTab,
          mapping,
          dataStartRow,
          writeEnabled: false,
        };
        const rows = await listTransactions(probe);
        if (!cancelled) {
          setPreview(rows.slice(0, 3));
          setPreviewErr(false);
        }
      } catch {
        if (!cancelled) {
          setPreview(null);
          setPreviewErr(true);
        }
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // metaTab intentionally omitted: it has no effect on the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetId, txTab, mappingKey, dataStartRow, creatingNew]);

  // Column dropdown covers the wider of: detected headers, current mapping,
  // and a minimum of 6 so short sheets still offer a few spare columns.
  const columnCount = useMemo(
    () => Math.max(headers.length, lastMappedCol(mapping) + 1, 6),
    [headers, mapping],
  );

  const setField = (key: FieldKey, col: number) =>
    setMapping((m) => ({ ...m, [key]: col }));

  const handleSave = async () => {
    setError(null);

    const finalTxTab = creatingNew ? newTabName.trim() : txTab;
    const finalMetaTab = metaTab.trim() || DEFAULT_META_TAB;

    // Validate
    if (creatingNew) {
      if (!finalTxTab) return setError('Name the new tab');
      if (tabs?.includes(finalTxTab)) return setError(`A tab named "${finalTxTab}" already exists`);
    } else {
      if (!finalTxTab) return setError('Pick a transactions tab');
      if (mapping.date < 0 || mapping.amount < 0) return setError('Map both Date and Amount');
      const used = Object.values(mapping).filter((i) => i >= 0);
      if (new Set(used).size !== used.length) {
        return setError('Each field needs its own column');
      }
    }
    if (writeEnabled && finalMetaTab === finalTxTab) {
      return setError('The metadata tab must be different from the transactions tab');
    }
    if (
      writeEnabled &&
      tabs?.includes(finalMetaTab) &&
      finalMetaTab !== initial?.metaTab
    ) {
      return setError(`A tab named "${finalMetaTab}" already exists`);
    }

    setSaving(true);
    try {
      if (creatingNew) {
        await createTransactionsTab(sheetId, finalTxTab);
      }
      // Rename the real metadata tab when the name changed in edit mode.
      if (
        initial &&
        writeEnabled &&
        finalMetaTab !== initial.metaTab &&
        tabs?.includes(initial.metaTab)
      ) {
        await renameTab(sheetId, initial.metaTab, finalMetaTab);
      }
      onSave({
        sheetId,
        sheetName,
        txTab: finalTxTab,
        metaTab: finalMetaTab,
        mapping: creatingNew ? DEFAULT_MAPPING : mapping,
        dataStartRow: creatingNew ? DEFAULT_DATA_START_ROW : dataStartRow,
        writeEnabled,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the connection');
      setSaving(false);
    }
  };

  const columnOptions = (includeNone: boolean) => (
    <>
      {includeNone && <option value={-1}>None</option>}
      {Array.from({ length: columnCount }, (_, i) => (
        <option key={i} value={i}>
          {colLetter(i)}
          {headers[i] ? ` — ${headers[i]}` : ''}
        </option>
      ))}
    </>
  );

  return createPortal(
    <div className="modal-ov" onClick={firstRun ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-h3">{firstRun ? 'Connect this sheet' : 'Sheet settings'}</div>
        {sheetName && <div className="conn-sub">{sheetName}</div>}

        {/* Transactions tab */}
        <div className="modal-section-lbl">Transactions tab</div>
        <select
          className="modal-input conn-select"
          value={txTab}
          onChange={(e) => setTxTab(e.target.value)}
          disabled={tabs === null}
        >
          {tabs === null && <option value="">Loading tabs…</option>}
          {tabs?.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
          {tabs !== null && <option value={NEW_TAB}>＋ Create a new tab…</option>}
        </select>
        {creatingNew && (
          <input
            className="modal-input conn-newtab"
            value={newTabName}
            onChange={(e) => setNewTabName(e.target.value)}
            placeholder="New tab name"
            maxLength={40}
          />
        )}
        {creatingNew && (
          <div className="conn-hint">
            We&rsquo;ll add this tab with the standard columns (Date, Amount, Note,
            Category, Sub).
          </div>
        )}

        {/* Column mapping — existing tabs only; new tabs get the standard layout */}
        {!creatingNew && (
          <>
            <div className="modal-section-lbl">Column mapping</div>
            <div className="conn-map">
              {FIELDS.map(({ key, label, required }) => (
                <label className="conn-map-row" key={key}>
                  <span className="conn-map-lbl">
                    {label}
                    {required && <span className="conn-req">*</span>}
                  </span>
                  <select
                    className="conn-map-sel"
                    value={mapping[key]}
                    onChange={(e) => setField(key, Number(e.target.value))}
                  >
                    {columnOptions(!required)}
                  </select>
                </label>
              ))}
              <label className="conn-map-row">
                <span className="conn-map-lbl">Data starts on row</span>
                <input
                  className="conn-map-sel conn-num"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={dataStartRow}
                  onChange={(e) => setDataStartRow(Math.max(1, Number(e.target.value) || 1))}
                />
              </label>
            </div>

            {/* Live read-back of the first rows under this mapping */}
            <div className="conn-preview">
              <div className="conn-preview-lbl">Preview</div>
              {previewErr && (
                <div className="conn-preview-empty">Couldn&rsquo;t read rows with this mapping.</div>
              )}
              {!previewErr && preview === null && (
                <div className="conn-preview-empty">Checking&hellip;</div>
              )}
              {!previewErr && preview !== null && preview.length === 0 && (
                <div className="conn-preview-empty">No transactions found yet — that&rsquo;s fine for an empty tab.</div>
              )}
              {!previewErr &&
                preview?.map((t, i) => (
                  <div className="conn-preview-row" key={i}>
                    <span className="conn-preview-date">{t.date}</span>
                    <span className="conn-preview-note">{t.note || t.cat}</span>
                    <span className="conn-preview-amt">{fmtUSD(t.amount)}</span>
                  </div>
                ))}
            </div>
          </>
        )}

        {/* Two-way sync toggle */}
        <div className="conn-toggle-row">
          <div className="conn-toggle-text">
            <div className="conn-toggle-title">Two-way sync</div>
            <div className="conn-hint">
              {writeEnabled
                ? 'The app adds, edits and deletes rows in your sheet, and pulls in edits you make there.'
                : 'Read-only: the app never changes your sheet. Adding and editing are off.'}
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={writeEnabled}
            aria-label="Two-way sync"
            className={`conn-switch ${writeEnabled ? 'on' : ''}`}
            onClick={() => setWriteEnabled((v) => !v)}
          >
            <span className="conn-switch-knob" />
          </button>
        </div>

        {/* Metadata tab — only exists when the app can write */}
        {writeEnabled && (
          <>
            <div className="modal-section-lbl">Metadata tab</div>
            <input
              className="modal-input"
              value={metaTab}
              onChange={(e) => setMetaTab(e.target.value)}
              placeholder={DEFAULT_META_TAB}
              maxLength={40}
            />
            <div className="conn-hint">
              A small app-managed tab storing your budget and categories, so they
              follow the sheet across devices.
            </div>
          </>
        )}

        {!creatingNew && writeEnabled && (
          <div className="conn-hint conn-warn">
            Deleting a transaction in the app removes its whole sheet row —
            including any columns the app doesn&rsquo;t manage.
          </div>
        )}

        {error && (
          <div className="signin-error" style={{ marginTop: 12 }}>
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            {firstRun ? 'Back' : 'Cancel'}
          </button>
          <button
            type="button"
            className="modal-save"
            onClick={handleSave}
            disabled={saving || tabs === null}
          >
            {saving ? 'Saving…' : firstRun ? 'Connect' : 'Save'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
