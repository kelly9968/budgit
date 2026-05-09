import { useState } from 'react';
import {
  genDay,
  genMonth,
  genTwoYears,
  genWeek,
  genYear,
} from '../lib/demoData';
import type { Category } from '../lib/categories';
import type { Transaction } from '../lib/types';

type Range = '1d' | '1w' | '1m' | '1y' | '2y';

type Props = {
  categories: Category[];
  onBulkAdd: (txs: Transaction[]) => Promise<void>;
};

const OPTIONS: Array<{ id: Range; label: string; desc: string }> = [
  { id: '1d', label: '1 day', desc: 'A handful of transactions for today' },
  { id: '1w', label: '1 week', desc: 'Last 7 days, ~70% of days with spend' },
  { id: '1m', label: '1 month', desc: 'From the 1st of this month to today' },
  { id: '1y', label: '1 year', desc: 'Jan 1 of this year through today' },
  { id: '2y', label: '2 years', desc: 'Jan 1 of last year through today (~600+ rows)' },
];

const generators: Record<Range, (cats: Category[]) => Transaction[]> = {
  '1d': genDay,
  '1w': genWeek,
  '1m': genMonth,
  '1y': genYear,
  '2y': genTwoYears,
};

export function DemoData({ categories, onBulkAdd }: Props) {
  const [working, setWorking] = useState<Range | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const handleClick = async (id: Range) => {
    setError(null);
    setWorking(id);
    try {
      const txs = generators[id](categories);
      if (txs.length === 0) {
        setFlash('No transactions generated (seeded an empty range).');
      } else {
        await onBulkAdd(txs);
        setFlash(`Added ${txs.length} demo transactions.`);
      }
      setTimeout(() => setFlash(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="demo">
      <div className="demo-banner">DEV ONLY — visible because <code>import.meta.env.DEV</code></div>
      <h2 className="demo-h2">Seed demo transactions</h2>
      <p className="demo-p">
        Generates random transactions across your categories at ~70% day-coverage,
        with category-appropriate amounts. Writes straight to the sheet.
      </p>
      <div className="demo-list">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            type="button"
            className="demo-opt"
            onClick={() => handleClick(o.id)}
            disabled={working !== null}
          >
            <div className="demo-opt-label">
              <strong>{o.label}</strong>
              <span>{o.desc}</span>
            </div>
            <span className="demo-opt-action">
              {working === o.id ? '…' : 'Generate'}
            </span>
          </button>
        ))}
      </div>
      {error && <div className="signin-error">{error}</div>}
      {flash && <div className="add-flash">{flash}</div>}
      <p className="demo-warn">
        Heads up: this appends to your real sheet. Delete rows in Sheets to clean up.
      </p>
    </div>
  );
}
