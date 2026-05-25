'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Routine } from '@/types';

const PRESET_COLORS = [
  '#EC4899', '#8B5CF6', '#3B82F6', '#10B981',
  '#F59E0B', '#EF4444', '#6366F1', '#14B8A6',
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

    if (err) {
      setError(err.message);
      setSaving(false);
      return;
    }

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
        <Link href={`/routines/${routine.id}`} className="text-sm text-gray-400 hover:text-gray-600">
          {routine.name}
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600">Edit</span>
      </div>

      <h1 className="text-xl font-bold text-gray-800">Edit Routine</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-300 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform"
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

        {error && <p className="text-red-500 text-sm">{error}</p>}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-pink-500 text-white text-sm font-medium rounded-lg px-4 py-2.5 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <Link href={`/routines/${routine.id}`} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2.5">
            Cancel
          </Link>
        </div>
      </form>

      {/* Delete section */}
      <div className="border-t border-gray-100 pt-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">Danger Zone</h3>
        <p className="text-xs text-gray-400 mb-3">
          Deleting a routine removes it and all its conflict records. Tasks remain but lose their routine membership.
        </p>
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-sm text-red-500 border border-red-200 rounded-lg px-4 py-2"
          >
            Delete Routine
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-sm bg-red-500 text-white rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Yes, delete'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-sm text-gray-500"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
