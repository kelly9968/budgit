import { useMemo } from 'react';
import { getCategory, type Category } from '../lib/categories';
import { fmtUSD } from '../lib/budget';
import type { Transaction } from '../lib/types';

type Props = {
  txns: Transaction[];
  categories: Category[];
  loading: boolean;
  onSelect: (tx: Transaction) => void;
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

export function Transactions({ txns, categories, loading, onSelect }: Props) {
  const grouped = useMemo(() => {
    const sorted = [...txns].sort((a, b) => b.date.localeCompare(a.date));
    const map = new Map<string, Transaction[]>();
    for (const t of sorted) {
      const k = fDay(t.date);
      const list = map.get(k) ?? [];
      list.push(t);
      map.set(k, list);
    }
    return Array.from(map.entries());
  }, [txns]);

  const total = txns.reduce((s, t) => s + t.amount, 0);

  return (
    <div className="tx">
      <div className="tx-head">
        <span>All transactions · {txns.length}</span>
        <strong>{fmtUSD(total)}</strong>
      </div>
      {txns.length === 0 && !loading && (
        <div className="tx-empty">No transactions yet. Add one to get started.</div>
      )}
      {grouped.map(([day, items]) => (
        <div className="tx-sec" key={day}>
          <div className="tx-day">{day}</div>
          <div className="tx-grp">
            {items.map((t, i) => {
              const c = getCategory(t.cat, categories);
              const editable = t._row !== undefined;
              return (
                <button
                  type="button"
                  className={`tx-row ${editable ? '' : 'tx-row-static'}`}
                  key={`${t.date}-${i}`}
                  onClick={() => editable && onSelect(t)}
                  disabled={!editable}
                  aria-label={editable ? `Edit ${t.cat} ${fmtUSD(t.amount)}` : undefined}
                >
                  <div className="tx-bdg" style={{ background: c.color }}>{c.icon}</div>
                  <div className="tx-info">
                    <span className="tx-cat">{t.cat}</span>
                    {t.note && <span className="tx-note">{t.note}</span>}
                  </div>
                  <div className="tx-amt">-{fmtUSD(t.amount)}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
