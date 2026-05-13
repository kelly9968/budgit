import { useState } from 'react';
import { createPortal } from 'react-dom';
import { getCategory, type Category } from '../lib/categories';
import { NewCategoryModal } from './NewCategoryModal';
import type { Transaction } from '../lib/types';

type Props = {
  tx: Transaction;
  categories: Category[];
  onSave: (next: Transaction) => Promise<void>;
  onDelete: (tx: Transaction) => Promise<void>;
  onAddCategory: (cat: Category) => Promise<void>;
  onClose: () => void;
};

export function EditTransactionModal({
  tx,
  categories,
  onSave,
  onDelete,
  onAddCategory,
  onClose,
}: Props) {
  const [date, setDate] = useState(tx.date);
  const [amount, setAmount] = useState(String(tx.amount));
  const [note, setNote] = useState(tx.note);
  const [cat, setCat] = useState(tx.cat);
  const [working, setWorking] = useState<'save' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNewCat, setShowNewCat] = useState(false);

  const handleAddCategory = async (newCat: Category) => {
    await onAddCategory(newCat);
    setCat(newCat.name);
    setShowNewCat(false);
  };

  const selectedCat = getCategory(cat, categories);

  const handleSave = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setError('Enter an amount');
      return;
    }
    setError(null);
    setWorking('save');
    try {
      await onSave({
        ...tx,
        date,
        amount: amt,
        note: note.trim(),
        cat,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setWorking(null);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setError(null);
    setWorking('delete');
    try {
      await onDelete(tx);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete');
      setWorking(null);
    }
  };

  // Portal to body so modal isn't subject to .app-main / .tabbar
  // stacking-context games (modal would otherwise render under the
  // transformed tabbar in some browsers).
  return createPortal(
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-h3">Edit transaction</div>

        <div className="edit-amt-hero">
          <span className="edit-amt-currency">$</span>
          <input
            className="edit-amt-input"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>

        <div className="edit-row">
          <span className="edit-row-lbl">Date</span>
          <input
            className="edit-row-input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="edit-row">
          <span className="edit-row-lbl">Category</span>
          <div className="edit-cats">
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
              onClick={() => setShowNewCat(true)}
            >
              <span className="add-cat-ico">+</span>
              <span className="add-cat-name">New</span>
            </button>
          </div>
        </div>

        <div className="add-note edit-note">
          <span
            className="add-note-ico"
            style={{ background: selectedCat.color }}
          >
            📝
          </span>
          <input
            className="add-note-input"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (optional)"
            maxLength={80}
          />
        </div>

        {error && <div className="signin-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions edit-actions">
          <button
            type="button"
            className="modal-cancel edit-delete"
            onClick={handleDelete}
            disabled={working !== null}
          >
            {working === 'delete'
              ? 'Deleting…'
              : confirmDelete
              ? 'Tap again to confirm'
              : 'Delete'}
          </button>
          <button
            type="button"
            className="modal-cancel"
            onClick={onClose}
            disabled={working !== null}
          >
            Cancel
          </button>
          <button
            type="button"
            className="modal-save"
            onClick={handleSave}
            disabled={working !== null}
          >
            {working === 'save' ? 'Saving…' : 'Save'}
          </button>
        </div>

        {showNewCat && (
          <NewCategoryModal
            existing={categories}
            onSave={handleAddCategory}
            onClose={() => setShowNewCat(false)}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}
