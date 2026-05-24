'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createFirstOccurrence } from '@/lib/occurrenceEngine';
import type { Category, Series, SeriesFormValues } from '@/types';

interface Props {
  categories: Category[];
  initialValues?: Partial<SeriesFormValues>;
  seriesId?: string;         // present = edit mode
  userId: string;
}

export default function SeriesForm({ categories, initialValues, seriesId, userId }: Props) {
  const router = useRouter();
  const isEdit = !!seriesId;

  const [form, setForm] = useState<SeriesFormValues>({
    name: initialValues?.name ?? '',
    category_id: initialValues?.category_id ?? '',
    description: initialValues?.description ?? '',
    interval_min_weeks: initialValues?.interval_min_weeks ?? 4,
    interval_max_weeks: initialValues?.interval_max_weeks ?? 6,
    default_reminder_days: initialValues?.default_reminder_days ?? 2,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field: keyof SeriesFormValues, value: string | number) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.interval_min_weeks > form.interval_max_weeks) {
      setError('Minimum interval cannot be greater than maximum.');
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const payload = {
      name: form.name.trim(),
      category_id: form.category_id || null,
      description: form.description.trim() || null,
      interval_min_days: form.interval_min_weeks * 7,
      interval_max_days: form.interval_max_weeks * 7,
      default_reminder_days: form.default_reminder_days,
      user_id: userId,
    };

    if (isEdit) {
      const { error } = await supabase.from('series').update(payload).eq('id', seriesId);
      if (error) { setError(error.message); setLoading(false); return; }
      router.push(`/series/${seriesId}`);
    } else {
      const { data, error } = await supabase.from('series').insert(payload).select().single();
      if (error) { setError(error.message); setLoading(false); return; }
      // Immediately generate the first occurrence
      await createFirstOccurrence(data as Series);
      router.push(`/series/${data.id}`);
    }

    router.refresh();
  }

  async function handleDelete() {
    if (!isEdit) return;
    const confirmed = window.confirm(
      'Delete this routine and all its history? This cannot be undone.'
    );
    if (!confirmed) return;

    setLoading(true);
    const supabase = createClient();
    await supabase.from('series').delete().eq('id', seriesId);
    router.push('/series');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Routine name *</label>
        <input
          required
          type="text"
          value={form.name}
          onChange={e => update('name', e.target.value)}
          placeholder="e.g. Hair Color"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <select
          value={form.category_id}
          onChange={e => update('category_id', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
        >
          <option value="">No category</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Interval range (weeks)
        </label>
        <p className="text-xs text-gray-400 mb-2">
          How often this routine recurs — expressed as a window (min to max).
        </p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Min weeks</label>
            <input
              type="number"
              min={1}
              max={52}
              value={form.interval_min_weeks}
              onChange={e => update('interval_min_weeks', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          <span className="text-gray-400 mt-5">–</span>
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Max weeks</label>
            <input
              type="number"
              min={1}
              max={52}
              value={form.interval_max_weeks}
              onChange={e => update('interval_max_weeks', Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description / notes</label>
        <p className="text-xs text-gray-400 mb-2">
          Instructions, products used, etc. — shown on every occurrence.
        </p>
        <textarea
          rows={4}
          value={form.description}
          onChange={e => update('description', e.target.value)}
          placeholder="e.g. Use Wella 6N + 20-vol developer, apply root-to-tip..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Reminder offset (days before due)
        </label>
        <input
          type="number"
          min={0}
          max={14}
          value={form.default_reminder_days}
          onChange={e => update('default_reminder_days', Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
        />
        <p className="text-xs text-gray-400 mt-1">0 = on the due date; max 14 days. Reminders are a Phase 2 feature.</p>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2.5"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
        >
          {loading ? 'Saving…' : isEdit ? 'Save changes' : 'Create routine'}
        </button>
      </div>

      {isEdit && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={loading}
          className="w-full text-red-500 text-sm py-2 hover:underline"
        >
          Delete this routine
        </button>
      )}
    </form>
  );
}
