import { useMemo, useRef, useState } from 'react';
import { getCategory, type Category } from '../lib/categories';
import { fmtUSD } from '../lib/budget';
import { useSwipe } from '../lib/swipe';
import type { Transaction } from '../lib/types';

type Props = {
  txns: Transaction[];
  categories: Category[];
  loading: boolean;
  onSelect: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => Promise<void>;
};

const fDay = (iso: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + 'T00:00:00');
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

// Compact, fixed-width row date — pairs with the day-group header
// to give an Excel-like "every row is self-describing" feel.
const fShortDate = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function Transactions({ txns, categories, loading, onSelect, onDelete }: Props) {
  const [query, setQuery] = useState('');
  const [catFilter, setCatFilter] = useState<string | null>(null);
  // Row id (composed of date+row) currently revealing its delete
  // action. Only one row open at a time — like iOS Mail.
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txns.filter((t) => {
      if (catFilter && t.cat !== catFilter) return false;
      if (!q) return true;
      // Match against note, category, amount, and the rendered day
      // label. Notes are the headline use case but date/cat hits are
      // useful too (e.g. "groceries" or "yesterday").
      const hay = [
        t.note ?? '',
        t.cat,
        t.amount.toFixed(2),
        fDay(t.date),
        t.date,
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [txns, query, catFilter]);

  const grouped = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, Transaction[]>();
    for (const t of sorted) {
      const k = fDay(t.date);
      const list = map.get(k) ?? [];
      list.push(t);
      map.set(k, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const total = filtered.reduce((s, t) => s + t.amount, 0);
  const isFiltered = query.trim() !== '' || catFilter !== null;
  const headLabel = isFiltered
    ? `Filtered · ${filtered.length}${filtered.length !== txns.length ? ` of ${txns.length}` : ''}`
    : `All transactions · ${txns.length}`;

  return (
    <div className="tx">
      <div className="tx-controls">
        <div className="tx-search-wrap">
          <SearchIcon />
          <input
            className="tx-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, categories, amounts…"
            aria-label="Search transactions"
          />
          {query && (
            <button
              type="button"
              className="tx-search-clear"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div className="tx-cat-filter" role="group" aria-label="Filter by category">
          <button
            type="button"
            className={`tx-cat-chip ${catFilter === null ? 'sel' : ''}`}
            onClick={() => setCatFilter(null)}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`tx-cat-chip ${catFilter === c.name ? 'sel' : ''}`}
              style={catFilter === c.name ? { background: c.color } : undefined}
              onClick={() =>
                setCatFilter((cur) => (cur === c.name ? null : c.name))
              }
            >
              <span className="tx-cat-chip-ico">{c.icon}</span>
              <span>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="tx-head">
        <span>{headLabel}</span>
        <strong>{fmtUSD(total)}</strong>
      </div>
      {txns.length === 0 && !loading && (
        <div className="tx-empty">No transactions yet. Add one to get started.</div>
      )}
      {txns.length > 0 && filtered.length === 0 && (
        <div className="tx-empty">
          No matches.{' '}
          <button
            type="button"
            className="tx-empty-reset"
            onClick={() => {
              setQuery('');
              setCatFilter(null);
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {grouped.map(([day, items]) => (
        <div className="tx-sec" key={day}>
          <div className="tx-day">{day}</div>
          <div className="tx-grp">
            {items.map((t, i) => {
              const id = `${t.date}-${t._row ?? `s${i}`}`;
              return (
                <TxRow
                  key={id}
                  tx={t}
                  category={getCategory(t.cat, categories)}
                  isOpen={openRowId === id}
                  onOpen={() => setOpenRowId(id)}
                  onClose={() => setOpenRowId(null)}
                  onSelect={onSelect}
                  onDelete={onDelete}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" className="tx-search-ico">
      <circle cx="10" cy="10" r="5.5" />
      <path d="M14 14 L18 18" />
    </svg>
  );
}

function TxRow({
  tx,
  category,
  isOpen,
  onOpen,
  onClose,
  onSelect,
  onDelete,
}: {
  tx: Transaction;
  category: Category;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSelect: (tx: Transaction) => void;
  onDelete: (tx: Transaction) => Promise<void>;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [deleting, setDeleting] = useState(false);
  const editable = tx._row !== undefined;

  useSwipe(wrapRef, {
    onLeft: () => editable && onOpen(),
    onRight: () => onClose(),
  });

  const handleClick = () => {
    if (isOpen) {
      onClose();
      return;
    }
    if (editable) onSelect(tx);
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      await onDelete(tx);
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div
      ref={wrapRef}
      className={`tx-row-wrap ${isOpen ? 'open' : ''}`}
    >
      <button
        type="button"
        className={`tx-row tx-row-content ${editable ? '' : 'tx-row-static'}`}
        onClick={handleClick}
        disabled={!editable && !isOpen}
        aria-label={editable ? `${tx.cat} ${fmtUSD(tx.amount)}` : undefined}
      >
        <span className="tx-date">{fShortDate(tx.date)}</span>
        <span className="tx-bdg" style={{ background: category.color }} aria-hidden="true">
          {category.icon}
        </span>
        <span className="tx-text">
          <span className="tx-primary">{tx.note || tx.cat}</span>
          {tx.note && <span className="tx-secondary">{tx.cat}</span>}
        </span>
        <span className="tx-amt">-{fmtUSD(tx.amount)}</span>
      </button>
      {editable && (
        <button
          type="button"
          className="tx-row-delete"
          onClick={handleDelete}
          disabled={deleting}
          aria-label={`Delete ${tx.cat} ${fmtUSD(tx.amount)}`}
          // Tucked behind the row content; only reachable when isOpen.
          // tabIndex switches with state so keyboard users skip it
          // when it's not visible.
          tabIndex={isOpen ? 0 : -1}
        >
          {deleting ? '…' : 'Delete'}
        </button>
      )}
    </div>
  );
}
