import { useEffect, useState } from 'react';
import { getCategory, type Category } from '../lib/categories';
import { NewCategoryModal } from './NewCategoryModal';
import type { Transaction } from '../lib/types';

type Props = {
  categories: Category[];
  onAdd: (tx: Transaction) => Promise<void>;
  onAddCategory: (cat: Category) => Promise<void>;
};

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};
const fmtDateLong = (iso: string) => {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
};

export function Add({ categories, onAdd, onAddCategory }: Props) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<string>(categories[0]?.name ?? 'Other');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // If the selected category is removed (e.g., on first metadata load), fall
  // back to the first available one.
  useEffect(() => {
    if (categories.length === 0) return;
    if (!categories.some((c) => c.name === cat)) setCat(categories[0].name);
  }, [categories, cat]);

  const selectedCat = getCategory(cat, categories);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Enter an amount');
      return;
    }
    setError(null);
    setWorking(true);
    try {
      await onAdd({ date, amount: amt, note: note.trim(), cat, sub: '' });
      setFlash(`$${amt.toFixed(2)} added to ${cat}`);
      setAmount('');
      setNote('');
      setTimeout(() => setFlash(null), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setWorking(false);
    }
  };

  const handleAddCategory = async (newCat: Category) => {
    await onAddCategory(newCat);
    setCat(newCat.name);
    setShowModal(false);
  };

  return (
    <form className="add" onSubmit={handleSubmit}>
      <div className="add-amt-hero">
        <div className="add-amt-lbl">Amount</div>
        <div className="add-amt-display">
          <span className="add-amt-currency">$</span>
          <input
            className="add-amt-input"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            required
          />
        </div>
      </div>

      <div className="add-row">
        <span className="add-row-lbl">Date</span>
        <input
          className="add-row-input"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <span className="add-row-hint">{fmtDateLong(date)}</span>
      </div>

      <div className="add-row">
        <span className="add-row-lbl">Category</span>
        <div className="add-cats">
          {categories.map((c) => (
            <button
              key={c.name}
              type="button"
              className={`add-cat ${c.name === cat ? 'sel' : ''}`}
              style={{ background: c.color }}
              onClick={() => setCat(c.name)}
            >
              <span className="add-cat-ico">{c.icon}</span>
              <span className="add-cat-name">{c.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="add-cat add-cat-new"
            onClick={() => setShowModal(true)}
          >
            <span className="add-cat-ico">+</span>
            <span className="add-cat-name">New</span>
          </button>
        </div>
      </div>

      <div className="add-note">
        <span className="add-note-ico" style={{ background: selectedCat.color }}>📝</span>
        <input
          className="add-note-input"
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          maxLength={80}
        />
      </div>

      {error && <div className="signin-error">{error}</div>}
      {flash && <div className="add-flash">{flash}</div>}

      <button type="submit" className="add-submit" disabled={working}>
        {working ? 'Adding…' : 'Add transaction'}
      </button>

      {showModal && (
        <NewCategoryModal
          existing={categories}
          onSave={handleAddCategory}
          onClose={() => setShowModal(false)}
        />
      )}
    </form>
  );
}
