import { useEffect, useRef, useState } from 'react';
import { getCategory, type Category } from '../lib/categories';
import { NewCategoryModal } from './NewCategoryModal';
import { ParseReviewModal } from './ParseReviewModal';
import { parseTransaction, type ParsedTx } from '../api/openrouter';
import type { Transaction } from '../lib/types';

type Props = {
  categories: Category[];
  onAdd: (tx: Transaction) => Promise<void>;
  onBulkAdd: (txs: Transaction[]) => Promise<void>;
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

const readDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(file);
  });

export function Add({ categories, onAdd, onBulkAdd, onAddCategory }: Props) {
  const [date, setDate] = useState(todayISO());
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<string>(categories[0]?.name ?? 'Other');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  // AI parse state
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState<'idle' | 'image' | 'text'>('idle');
  const [showTextPop, setShowTextPop] = useState(false);
  const [parseText, setParseText] = useState('');
  const [pendingMulti, setPendingMulti] = useState<Transaction[] | null>(null);

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

  const applyParsed = (parsed: ParsedTx[]) => {
    if (parsed.length === 0) {
      setError('No transaction found — try again.');
      return;
    }
    if (parsed.length === 1) {
      const p = parsed[0];
      setAmount(String(p.amount));
      setDate(p.date);
      setCat(p.cat);
      setNote(p.note);
      setError(null);
      setFlash('Parsed — review and save');
      setTimeout(() => setFlash(null), 1800);
      return;
    }
    // 2+ → open review modal
    setPendingMulti(parsed.map((p) => ({ ...p, sub: '' })));
    setError(null);
  };

  const handleImage = async (file: File) => {
    setParsing('image');
    setError(null);
    try {
      const dataUrl = await readDataUrl(file);
      const result = await parseTransaction(
        { kind: 'image', dataUrl },
        { categories: categories.map((c) => c.name), today: todayISO() },
      );
      applyParsed(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse image');
    } finally {
      setParsing('idle');
    }
  };

  const handleParseText = async () => {
    const text = parseText.trim();
    if (!text) return;
    setParsing('text');
    setError(null);
    try {
      const result = await parseTransaction(
        { kind: 'text', text },
        { categories: categories.map((c) => c.name), today: todayISO() },
      );
      applyParsed(result);
      setShowTextPop(false);
      setParseText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not parse text');
    } finally {
      setParsing('idle');
    }
  };

  const handleBulkConfirm = async (txs: Transaction[]) => {
    await onBulkAdd(txs);
    setPendingMulti(null);
    setFlash(`${txs.length} transactions added`);
    setTimeout(() => setFlash(null), 2200);
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

        <div className="add-amt-tools">
          <button
            type="button"
            className={`amt-tool ${parsing === 'image' ? 'busy' : ''}`}
            onClick={() => fileRef.current?.click()}
            disabled={parsing !== 'idle'}
            aria-label="Parse from image"
            title="Parse from photo"
          >
            {parsing === 'image' ? <SpinIcon /> : <CameraIcon />}
          </button>
          <button
            type="button"
            className={`amt-tool ${parsing === 'text' ? 'busy' : ''}`}
            onClick={() => setShowTextPop((v) => !v)}
            disabled={parsing !== 'idle'}
            aria-label="Parse from text"
            title="Parse from text"
          >
            {parsing === 'text' ? <SpinIcon /> : <SparkleIcon />}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImage(f);
            e.target.value = '';
          }}
        />

        {showTextPop && (
          <div className="amt-textpop">
            <textarea
              className="amt-textpop-input"
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
              placeholder="e.g. coffee 4.50 yesterday, or paste a charge"
              rows={3}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParseText();
                if (e.key === 'Escape') setShowTextPop(false);
              }}
            />
            <div className="amt-textpop-actions">
              <button
                type="button"
                className="amt-textpop-cancel"
                onClick={() => setShowTextPop(false)}
                disabled={parsing === 'text'}
              >
                Cancel
              </button>
              <button
                type="button"
                className="amt-textpop-go"
                onClick={handleParseText}
                disabled={parsing === 'text' || !parseText.trim()}
              >
                {parsing === 'text' ? 'Parsing…' : 'Parse'}
              </button>
            </div>
          </div>
        )}
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

      {pendingMulti && (
        <ParseReviewModal
          txs={pendingMulti}
          categories={categories}
          onConfirm={handleBulkConfirm}
          onClose={() => setPendingMulti(null)}
        />
      )}
    </form>
  );
}

// ── Icons ────────────────────────────────────────────────────────────
function CameraIcon() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M4 8 L7 8 L8.5 6 L13.5 6 L15 8 L18 8 L18 16 L4 16 Z" />
      <circle cx="11" cy="12" r="3" />
    </svg>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 3 L12.4 8.6 L18 10 L12.4 11.4 L11 17 L9.6 11.4 L4 10 L9.6 8.6 Z" />
    </svg>
  );
}

function SpinIcon() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" className="amt-tool-spin">
      <path d="M11 3 a8 8 0 0 1 8 8" />
    </svg>
  );
}
