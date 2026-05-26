'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Routine } from '@/types';

const PRESET_COLORS = [
  '#8A9E8C', '#A89880', '#6B6660', '#2C2A26',
  '#C4D4C5', '#D4C8B8', '#9E9890', '#E5DFD4',
];

interface Props {
  routine: Routine;
}

export default function RoutineEditClient({ routine }: Props) {
  const router = useRouter();
  const [name, setName] = useState(routine.name);
  const [description, setDescription] = useState(routine.description ?? '');
  const [color, setColor] = useState(routine.color);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required'); return; }

    setSaving(true);
    setError('');
    const supabase = createClient();

    const { error: err } = await supabase
      .from('routines')
      .update({
        name: name.trim(),
        description: description.trim() || null,
        color,
      })
      .eq('id', routine.id);

    if (err) { setError(err.message); setSaving(false); return; }

    router.push(`/routines/${routine.id}`);
  }

  async function handleDelete() {
    setDeleting(true);
    const supabase = createClient();
    await supabase.from('routines').delete().eq('id', routine.id);
    router.push('/routines');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href={`/routines/${routine.id}`} className="text-sm text-warm-light hover:text-charcoal">
          {routine.name}
        </Link>
        <span className="text-warm-light">/</span>
        <span className="text-sm text-warm-mid">Edit</span>
      </div>

      <h1 className="font-display text-3xl text-charcoal">Edit Routine</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">
            Description <span className="normal-case font-normal tracking-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-warm-mid mb-2 uppercase tracking-wide">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform border border-glow-border"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `3px solid ${c}` : 'none',
                  outlineOffset: '2px',
                  transform: color === c ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm text-charcoal bg-dust-lt border border-dust rounded-md px-3 py-2">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-charcoal text-cream text-sm font-medium rounded-pill px-5 py-2.5 disabled:opacity-50 hover:bg-charcoal/90"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <Link href={`/routines/${routine.id}`} className="text-sm text-warm-mid hover:text-charcoal px-4 py-2.5">
            Cancel
          </Link>
        </div>
      </form>

      <div className="border-t border-glow-border pt-6">
        <p className="text-xs font-medium text-warm-mid mb-1 uppercase tracking-wide">Remove</p>
        <p className="text-xs text-warm-light mb-3">
          Removing a routine deletes it and all its overlap records. Rituals remain but lose their routine membership.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-warm-mid border border-glow-border rounded-pill px-4 py-2 hover:bg-taupe transition-colors"
          >
            Remove Routine
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm bg-dust text-cream rounded-pill px-4 py-2 disabled:opacity-50 hover:bg-dust/90"
            >
              {deleting ? 'Removing…' : 'Yes, remove'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-sm text-warm-light hover:text-charcoal"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
