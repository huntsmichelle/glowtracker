'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, differenceInDays } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { completeOccurrence, skipOccurrence, snoozeOccurrence, today, deriveStatus } from '@/lib/occurrenceEngine';
import type { OccurrenceWithSeries, Series } from '@/types';

interface Props {
  occurrence: OccurrenceWithSeries;
}

const statusColors: Record<string, string> = {
  upcoming: 'bg-blue-50 text-blue-700 border-blue-100',
  due: 'bg-amber-50 text-amber-700 border-amber-100',
  completed: 'bg-green-50 text-green-700 border-green-100',
  skipped: 'bg-gray-100 text-gray-500 border-gray-200',
  snoozed: 'bg-purple-50 text-purple-700 border-purple-100',
};

export default function OccurrenceDetailClient({ occurrence: initial }: Props) {
  const router = useRouter();
  const [occ, setOcc] = useState(initial);
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [notesLoading, setNotesLoading] = useState(false);
  const [completionDate, setCompletionDate] = useState(format(today(), 'yyyy-MM-dd'));
  const [snoozeDays, setSnoozeDays] = useState(3);
  const [loading, setLoading] = useState(false);
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [showSnoozeForm, setShowSnoozeForm] = useState(false);

  const status = deriveStatus(occ);
  const isActionable = status !== 'completed' && status !== 'skipped';
  const series = occ.series!;
  const categoryColor = series.category?.color ?? '#6B7280';

  const daysUntil = differenceInDays(parseISO(occ.due_date_start), today());
  const isOverdue = differenceInDays(today(), parseISO(occ.due_date_end)) > 0;

  async function handleComplete() {
    setLoading(true);
    const date = new Date(completionDate + 'T00:00:00');
    const { updated } = await completeOccurrence(occ.id, series as Series, date);
    if (updated) setOcc({ ...occ, ...updated });
    setShowCompleteForm(false);
    setLoading(false);
    router.refresh();
  }

  async function handleSkip() {
    setLoading(true);
    const { updated } = await skipOccurrence(occ.id, series as Series);
    if (updated) setOcc({ ...occ, ...updated });
    setLoading(false);
    router.refresh();
  }

  async function handleSnooze() {
    setLoading(true);
    const updated = await snoozeOccurrence(occ.id, snoozeDays, occ.due_date_end);
    if (updated) setOcc({ ...occ, ...updated });
    setShowSnoozeForm(false);
    setLoading(false);
    router.refresh();
  }

  async function saveNotes() {
    setNotesLoading(true);
    const supabase = createClient();
    await supabase.from('occurrences').update({ notes }).eq('id', occ.id);
    setNotesLoading(false);
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link href={`/series/${series.id}`} className="text-sm text-gray-400 hover:text-gray-600">
        ← {series.name}
      </Link>

      {/* Status badge + dates */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor }} />
              <span className="text-xs text-gray-400">{series.category?.name ?? 'No category'}</span>
            </div>
            <h1 className="text-lg font-bold text-gray-800">{series.name}</h1>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusColors[status] ?? ''}`}>
            {status}
          </span>
        </div>

        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex justify-between">
            <span className="text-gray-400">Window</span>
            <span>
              {format(parseISO(occ.due_date_start), 'MMM d')} – {format(parseISO(occ.due_date_end), 'MMM d, yyyy')}
            </span>
          </div>
          {isActionable && (
            <div className="flex justify-between">
              <span className="text-gray-400">Timing</span>
              <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                {isOverdue
                  ? `Overdue by ${differenceInDays(today(), parseISO(occ.due_date_end))}d`
                  : daysUntil > 0
                  ? `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
                  : 'Due now'}
              </span>
            </div>
          )}
          {occ.actual_completion_date && (
            <div className="flex justify-between">
              <span className="text-gray-400">Completed</span>
              <span>{format(parseISO(occ.actual_completion_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          {occ.snooze_until && (
            <div className="flex justify-between">
              <span className="text-gray-400">Snoozed until</span>
              <span>{format(parseISO(occ.snooze_until), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        {/* Description from series */}
        {series.description && (
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {series.description}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {isActionable && (
        <div className="space-y-3">
          {!showCompleteForm && !showSnoozeForm && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowCompleteForm(true)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-xl py-3 transition-colors"
              >
                Mark Complete
              </button>
              <button
                onClick={handleSkip}
                disabled={loading}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-xl py-3 transition-colors disabled:opacity-50"
              >
                Skip
              </button>
              <button
                onClick={() => setShowSnoozeForm(true)}
                className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-600 text-sm font-medium rounded-xl py-3 transition-colors"
              >
                Snooze
              </button>
            </div>
          )}

          {showCompleteForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Log completion</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Actual date</label>
                <input
                  type="date"
                  value={completionDate}
                  max={format(today(), 'yyyy-MM-dd')}
                  onChange={e => setCompletionDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCompleteForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2">Cancel</button>
                <button onClick={handleComplete} disabled={loading} className="flex-1 bg-green-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          {showSnoozeForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Snooze</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Days to snooze</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={snoozeDays}
                  onChange={e => setSnoozeDays(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSnoozeForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2">Cancel</button>
                <button onClick={handleSnooze} disabled={loading} className="flex-1 bg-amber-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Snooze'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Notes <span className="text-gray-400 font-normal">(this occurrence only)</span></h2>
        <textarea
          rows={4}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How did it go? Any adjustments?"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-pink-400"
        />
        <button
          onClick={saveNotes}
          disabled={notesLoading}
          className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg px-4 py-1.5 disabled:opacity-50"
        >
          {notesLoading ? 'Saving…' : 'Save notes'}
        </button>
      </div>

      {/* Photo placeholder (Phase 2) */}
      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-1">Before / After Photos</h2>
        <p className="text-xs text-gray-400">Photo uploads coming in Phase 2.</p>
      </div>

      {/* Products placeholder (Phase 2) */}
      <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-400 mb-1">Products Used</h2>
        <p className="text-xs text-gray-400">Product tracking coming in Phase 2.</p>
      </div>
    </div>
  );
}
