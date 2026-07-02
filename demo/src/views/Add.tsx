import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { getCategory, type Category } from '../lib/categories';
import { NewCategoryModal } from './NewCategoryModal';
import { ParseReviewModal } from './ParseReviewModal';
import { parseTransaction, type ParsedTx } from '../api/openrouter';
import { useSwipe } from '../lib/swipe';
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
  // Whimsy: nonce remounts the glyph-toss burst; `justAdded` briefly
  // morphs the submit button to its "landed" state.
  const [celebrate, setCelebrate] = useState<{ key: number; icon: string } | null>(null);
  const [justAdded, setJustAdded] = useState(false);

  // AI parse state
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const galleryRef = useRef<HTMLInputElement | null>(null);
  const [parsing, setParsing] = useState<'idle' | 'image' | 'text'>('idle');
  // Input mode: 'amount' shows the numeric input; 'text' shows the wand
  // parser. Camera + file are immediate actions that don't change mode.
  const [mode, setMode] = useState<'amount' | 'text'>('text');
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
      // Celebrate: toss the category glyph, swell the button, buzz once.
      setCelebrate((c) => ({ key: (c?.key ?? 0) + 1, icon: selectedCat.icon }));
      setJustAdded(true);
      navigator.vibrate?.(12);
      setTimeout(() => setJustAdded(false), 500);
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
      // Drop the user back into the amount view so the parsed value is
      // immediately visible in the big serif numeral.
      setMode('amount');
      setParseText('');
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

  // Swipe across the form to toggle between the numeric $ input and
  // the wand text parser. Camera + file are actions, not modes — they
  // intentionally aren't part of the cycle.
  const formRef = useRef<HTMLFormElement | null>(null);
  useSwipe(formRef, {
    onLeft: () => setMode((m) => (m === 'amount' ? 'text' : 'amount')),
    onRight: () => setMode((m) => (m === 'amount' ? 'text' : 'amount')),
  });

  return (
    <form className="add" onSubmit={handleSubmit} ref={formRef}>
      <div className={`add-amt-hero mode-${mode}`}>
        <div className="add-amt-lbl">
          {mode === 'text' ? 'Describe' : 'Amount'}
        </div>

        {mode === 'amount' && (
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
        )}

        {mode === 'text' && (
          <div className="amt-textpop-frame">
            <textarea
              className="amt-textpop-input"
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
              placeholder="Include any details you want — date, notes, items, prices — and we'll separate it out into individual transactions."
              rows={4}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleParseText();
              }}
            />
            <button
              type="button"
              className="amt-textpop-go"
              onClick={handleParseText}
              disabled={parsing === 'text' || !parseText.trim()}
            >
              {parsing === 'text' ? 'Parsing…' : 'Parse'}
            </button>
          </div>
        )}

        <div className="add-amt-tools">
          <button
            type="button"
            className={`amt-tool ${mode === 'amount' ? 'on' : ''}`}
            onClick={() => setMode('amount')}
            disabled={parsing !== 'idle'}
            aria-label="Enter amount"
            title="Enter amount"
            aria-pressed={mode === 'amount'}
          >
            <DollarIcon />
          </button>
          <button
            type="button"
            className={`amt-tool ${mode === 'text' ? 'on' : ''} ${parsing === 'text' ? 'busy' : ''}`}
            onClick={() => setMode('text')}
            disabled={parsing !== 'idle'}
            aria-label="Describe with AI"
            title="Describe with AI"
            aria-pressed={mode === 'text'}
          >
            {parsing === 'text' ? <SpinIcon /> : <WandIcon />}
          </button>
          <button
            type="button"
            className={`amt-tool ${parsing === 'image' ? 'busy' : ''}`}
            onClick={() => cameraRef.current?.click()}
            disabled={parsing !== 'idle'}
            aria-label="Take photo of receipt"
            title="Take photo"
          >
            {parsing === 'image' ? <SpinIcon /> : <CameraIcon />}
          </button>
          <button
            type="button"
            className={`amt-tool ${parsing === 'image' ? 'busy' : ''}`}
            onClick={() => galleryRef.current?.click()}
            disabled={parsing !== 'idle'}
            aria-label="Attach receipt image"
            title="Attach image"
          >
            <ClipIcon />
          </button>
        </div>

        <input
          ref={cameraRef}
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
        <input
          ref={galleryRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImage(f);
            e.target.value = '';
          }}
        />
      </div>

      {mode !== 'text' && (
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
      )}

      {mode !== 'text' && (
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
      )}

      {mode !== 'text' && (
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
      )}

      {error && <div className="signin-error">{error}</div>}
      {flash && <div className="add-flash">{flash}</div>}

      {celebrate && <Celebration key={celebrate.key} icon={celebrate.icon} />}
      <button
        type="submit"
        className={`add-submit ${justAdded ? 'done' : ''}`}
        disabled={working}
      >
        {working ? 'Adding…' : justAdded ? 'Added ✓' : 'Add transaction'}
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

// A short-lived burst of the category glyph, fanning up and out from the
// submit button. Keyed on a nonce by the caller so each add replays it.
const CELEBRATE_BITS = [
  { x: -46, rise: 74, rot: -28, delay: 0 },
  { x: -22, rise: 104, rot: -12, delay: 40 },
  { x: 0, rise: 120, rot: 0, delay: 70 },
  { x: 22, rise: 104, rot: 14, delay: 40 },
  { x: 46, rise: 76, rot: 26, delay: 10 },
  { x: -9, rise: 92, rot: -8, delay: 95 },
  { x: 13, rise: 88, rot: 12, delay: 115 },
];
function Celebration({ icon }: { icon: string }) {
  return (
    <div className="add-celebrate" aria-hidden="true">
      {CELEBRATE_BITS.map((b, i) => (
        <span
          key={i}
          className="add-celebrate-bit"
          style={{
            '--x': `${b.x}px`,
            '--rise': `${b.rise}px`,
            '--rot': `${b.rot}deg`,
            '--delay': `${b.delay}ms`,
          } as CSSProperties}
        >
          {icon}
        </span>
      ))}
    </div>
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

function DollarIcon() {
  // Inline serif-feel "$" — borrows the editorial currency glyph used in
  // the amount hero rather than a generic geometric one.
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M11 4 L11 18" />
      <path d="M14.5 7.2 C 13.6 6.2 12.4 5.6 11 5.6 C 9 5.6 7.6 6.7 7.6 8.3 C 7.6 9.9 9 10.6 11 11.1 C 13 11.6 14.4 12.3 14.4 13.9 C 14.4 15.5 13 16.6 11 16.6 C 9.6 16.6 8.3 16 7.4 15" />
    </svg>
  );
}

function ClipIcon() {
  // Paperclip — signals "attach a file" (as distinct from the camera).
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M16.5 9.5 L9 17 C 7 19 4 16 6 14 L13.5 6.5 C 14.8 5.2 16.8 5.2 18 6.5 C 19.2 7.7 19.2 9.7 18 11 L11 18" />
    </svg>
  );
}

function WandIcon() {
  // Diagonal wand stick with a 4-point star at the tip + a tiny sparkle.
  // Reads as "magic" without leaning on emoji.
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true">
      <path d="M3 19 L13 9" />
      <path d="M16 3 L17 6 L20 7 L17 8 L16 11 L15 8 L12 7 L15 6 Z" />
      <path d="M6.2 4.5 L6.7 5.8 L8 6.3 L6.7 6.8 L6.2 8.1 L5.7 6.8 L4.4 6.3 L5.7 5.8 Z" />
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
