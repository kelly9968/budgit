import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getCategory, type Category } from '../lib/categories';
import type { Transaction } from '../lib/types';

type Props = {
  txs: Transaction[];
  categories: Category[];
  onConfirm: (txs: Transaction[]) => Promise<void>;
  onClose: () => void;
};

export function ParseReviewModal({
  txs: initial,
  categories,
  onConfirm,
  onClose,
}: Props) {
  const [rows, setRows] = useState<Transaction[]>(initial);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Transaction>) => {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  };
  const remove = (i: number) => {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    if (rows.length === 0) {
      setError('Nothing to save');
      return;
    }
    if (rows.some((r) => !r.amount || r.amount <= 0)) {
      setError('Every row needs an amount');
      return;
    }
    setError(null);
    setWorking(true);
    try {
      await onConfirm(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setWorking(false);
    }
  };

  return createPortal(
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-h3">Review {rows.length} transactions</div>

        <div className="parse-list">
          {rows.map((r, i) => {
            const sel = getCategory(r.cat, categories);
            return (
              <div key={i} className="parse-row" style={{ background: sel.color }}>
                <div className="parse-row-top">
                  <span className="parse-row-currency">$</span>
                  <input
                    className="parse-row-amt"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={r.amount || ''}
                    onChange={(e) =>
                      update(i, { amount: parseFloat(e.target.value) || 0 })
                    }
                  />
                  <input
                    className="parse-row-date"
                    type="date"
                    value={r.date}
                    onChange={(e) => update(i, { date: e.target.value })}
                  />
                  <button
                    type="button"
                    className="parse-row-x"
                    onClick={() => remove(i)}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
                <div className="parse-row-cats">
                  {categories.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      className={`add-cat ${c.name === r.cat ? 'sel' : ''}`}
                      style={{ background: c.color }}
                      onClick={() => update(i, { cat: c.name })}
                    >
                      <span className="add-cat-ico">{c.icon}</span>
                      <span className="add-cat-name">{c.name}</span>
                    </button>
                  ))}
                </div>
                <input
                  className="parse-row-note"
                  type="text"
                  value={r.note}
                  onChange={(e) => update(i, { note: e.target.value })}
                  placeholder="Note (optional)"
                  maxLength={80}
                />
              </div>
            );
          })}
        </div>

        {error && <div className="signin-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button
            type="button"
            className="modal-cancel"
            onClick={onClose}
            disabled={working}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-save"
            onClick={handleSave}
            disabled={working || rows.length === 0}
          >
            {working ? 'Saving…' : `Save all (${rows.length})`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
