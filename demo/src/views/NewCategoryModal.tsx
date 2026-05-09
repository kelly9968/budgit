import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  COLOR_PALETTE,
  EMOJI_PALETTE,
  type Category,
} from '../lib/categories';

type Props = {
  existing: Category[];
  onSave: (cat: Category) => Promise<void>;
  onClose: () => void;
};

export function NewCategoryModal({ existing, onSave, onClose }: Props) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(EMOJI_PALETTE[0]);
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Enter a name');
      return;
    }
    if (existing.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      setError('That category already exists');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({ name: trimmed, icon, color });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setSaving(false);
    }
  };

  return createPortal(
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-handle" />
        <div className="modal-h3">New category</div>

        <div className="modal-preview" style={{ background: color }}>
          <span className="modal-preview-ico">{icon}</span>
          <span className="modal-preview-name">{name || 'Category name'}</span>
        </div>

        <input
          className="modal-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          maxLength={20}
          autoFocus
        />

        <div className="modal-section-lbl">Icon</div>
        <div className="modal-emoji-grid">
          {EMOJI_PALETTE.map((e) => (
            <button
              key={e}
              type="button"
              className={`modal-emoji ${e === icon ? 'sel' : ''}`}
              onClick={() => setIcon(e)}
            >
              {e}
            </button>
          ))}
        </div>

        <div className="modal-section-lbl">Color</div>
        <div className="modal-color-grid">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`modal-color ${c === color ? 'sel' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>

        {error && <div className="signin-error" style={{ marginTop: 12 }}>{error}</div>}

        <div className="modal-actions">
          <button type="button" className="modal-cancel" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className="modal-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Add category'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
