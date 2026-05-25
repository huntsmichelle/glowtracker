'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  completeInstance,
  skipInstance,
  snoozeInstance,
  createEventOverride,
  today,
  deriveStatus,
  toISODate,
} from '@/lib/instanceEngine';
import type { InstanceWithTask, Task } from '@/types';

interface Props {
  instance: InstanceWithTask;
}

const statusColors: Record<string, string> = {
  upcoming:  'bg-blue-50 text-blue-700 border-blue-100',
  due:       'bg-amber-50 text-amber-700 border-amber-100',
  completed: 'bg-green-50 text-green-700 border-green-100',
  skipped:   'bg-gray-100 text-gray-500 border-gray-200',
  snoozed:   'bg-purple-50 text-purple-700 border-purple-100',
};

export default function InstanceDetailClient({ instance: initial }: Props) {
  const router = useRouter();
  const [instance, setInstance] = useState(initial);
  const [notes, setNotes]       = useState(initial.notes ?? '');
  const [notesLoading, setNotesLoading]     = useState(false);
  const [completionDate, setCompletionDate] = useState(format(today(), 'yyyy-MM-dd'));
  const [completionCost, setCompletionCost] = useState(
    initial.task?.default_cost != null ? String(initial.task.default_cost) : ''
  );
  const [snoozeDays, setSnoozeDays]         = useState(3);
  const [loading, setLoading]               = useState(false);
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [showSnoozeForm, setShowSnoozeForm]     = useState(false);
  const [showAdjustForm, setShowAdjustForm]     = useState(false);

  // Event override form state
  const [eventName, setEventName]         = useState('');
  const [eventDate, setEventDate]         = useState('');
  const [daysBefore, setDaysBefore]       = useState(7);
  const [resumeNormal, setResumeNormal]   = useState(true);
  const [overrideNextDate, setOverrideNextDate] = useState('');

  const status       = deriveStatus(instance);
  const isActionable = status !== 'completed' && status !== 'skipped';
  const task         = instance.task!;
  const categoryColor = task.category?.color ?? '#6B7280';
  const isCountdown   = task.mode === 'countdown';

  const daysUntil = differenceInDays(parseISO(instance.due_date_start), today());
  const isOverdue = differenceInDays(today(), parseISO(instance.due_date_end)) > 0;

  // Computed preview for the event override form
  const adjustedDatePreview =
    eventDate && daysBefore > 0
      ? format(addDays(parseISO(eventDate), -daysBefore), 'MMM d, yyyy')
      : null;
  const originalWindowLabel = `${format(parseISO(instance.due_date_start), 'MMM d')}–${format(parseISO(instance.due_date_end), 'MMM d, yyyy')}`;

  async function handleComplete() {
    setLoading(true);
    const date = new Date(completionDate + 'T00:00:00');
    const cost = completionCost !== '' ? Number(completionCost) : null;
    const { updated } = await completeInstance(instance.id, task as Task, date, cost);
    if (updated) setInstance({ ...instance, ...updated });
    setShowCompleteForm(false);
    setLoading(false);
    router.refresh();
  }

  async function handleSkip() {
    setLoading(true);
    const { updated } = await skipInstance(instance.id, task as Task);
    if (updated) setInstance({ ...instance, ...updated });
    setLoading(false);
    router.refresh();
  }

  async function handleSnooze() {
    setLoading(true);
    const updated = await snoozeInstance(instance.id, snoozeDays, instance.due_date_end);
    if (updated) setInstance({ ...instance, ...updated });
    setShowSnoozeForm(false);
    setLoading(false);
    router.refresh();
  }

  async function handleAdjustForEvent() {
    if (!eventName.trim() || !eventDate) return;
    setLoading(true);
    const nextDate = !resumeNormal && overrideNextDate ? overrideNextDate : undefined;
    const updated = await createEventOverride(instance.id, eventName.trim(), eventDate, daysBefore, nextDate);
    if (updated) setInstance({ ...instance, ...updated });
    setShowAdjustForm(false);
    setLoading(false);
    router.refresh();
  }

  async function saveNotes() {
    setNotesLoading(true);
    const supabase = createClient();
    await supabase.from('instances').update({ notes }).eq('id', instance.id);
    setNotesLoading(false);
  }

  return (
    <div className="space-y-5">
      {/* Back link */}
      <Link href={`/tasks/${task.id}`} className="text-sm text-gray-400 hover:text-gray-600">
        ← {task.name}
      </Link>

      {/* Status badge + dates */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor }} />
              <span className="text-xs text-gray-400">{task.category?.name ?? 'No category'}</span>
              {isCountdown && (
                <span className="text-xs text-purple-400 font-medium">Countdown</span>
              )}
              {/* Event override badge */}
              {instance.is_event_override && instance.event_name && (
                <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  ⏱ {instance.days_before_event}d before {instance.event_name}
                </span>
              )}
            </div>
            <h1 className="text-lg font-bold text-gray-800">{task.name}</h1>
            {isCountdown && task.target_label && task.target_date && (
              <p className="text-xs text-purple-500 mt-0.5">
                → {task.target_label} · {format(parseISO(task.target_date), 'MMM d, yyyy')}
              </p>
            )}
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full border ${statusColors[status] ?? ''}`}>
            {status}
          </span>
        </div>

        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex justify-between">
            <span className="text-gray-400">Window</span>
            <span>
              {format(parseISO(instance.due_date_start), 'MMM d')}
              {' – '}
              {format(parseISO(instance.due_date_end), 'MMM d, yyyy')}
            </span>
          </div>
          {instance.is_event_override && instance.event_date && (
            <div className="flex justify-between">
              <span className="text-gray-400">Event date</span>
              <span className="text-amber-600">{format(parseISO(instance.event_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          {isActionable && (
            <div className="flex justify-between">
              <span className="text-gray-400">Timing</span>
              <span className={isOverdue ? 'text-red-500 font-medium' : ''}>
                {isOverdue
                  ? `Overdue by ${differenceInDays(today(), parseISO(instance.due_date_end))}d`
                  : daysUntil > 0
                  ? `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
                  : 'Due now'}
              </span>
            </div>
          )}
          {instance.actual_completion_date && (
            <div className="flex justify-between">
              <span className="text-gray-400">Completed</span>
              <span>{format(parseISO(instance.actual_completion_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          {instance.cost != null && (
            <div className="flex justify-between">
              <span className="text-gray-400">Cost</span>
              <span className="font-medium">${instance.cost.toFixed(2)}</span>
            </div>
          )}
          {instance.snooze_until && (
            <div className="flex justify-between">
              <span className="text-gray-400">Snoozed until</span>
              <span>{format(parseISO(instance.snooze_until), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        {task.description && (
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700 whitespace-pre-wrap">
            {task.description}
          </div>
        )}

        {task.reminder_notes && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide">Reminder notes</p>
            <p className="text-sm text-amber-800 whitespace-pre-wrap">{task.reminder_notes}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {isActionable && (
        <div className="space-y-3">
          {!showCompleteForm && !showSnoozeForm && !showAdjustForm && (
            <div className="space-y-2">
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
              {/* Only show Adjust for Event on non-overridden, non-countdown instances */}
              {!instance.is_event_override && !isCountdown && (
                <button
                  onClick={() => setShowAdjustForm(true)}
                  className="w-full bg-purple-50 hover:bg-purple-100 text-purple-600 text-sm font-medium rounded-xl py-2.5 transition-colors"
                >
                  Adjust for event…
                </button>
              )}
            </div>
          )}

          {/* Complete form */}
          {showCompleteForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Log completion</h2>
              {isCountdown && (
                <p className="text-xs text-purple-500">
                  Countdown task: remaining instances will be recalculated from your target date.
                </p>
              )}
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number" min={0} step="0.01"
                    value={completionCost}
                    onChange={e => setCompletionCost(e.target.value)}
                    placeholder={task.default_cost != null ? String(task.default_cost) : '0.00'}
                    className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Optional. Override the default if this session cost more or less.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCompleteForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2">Cancel</button>
                <button onClick={handleComplete} disabled={loading} className="flex-1 bg-green-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}

          {/* Snooze form */}
          {showSnoozeForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <h2 className="font-semibold text-gray-800">Snooze</h2>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Days to snooze</label>
                <input
                  type="number" min={1} max={30} value={snoozeDays}
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

          {/* Adjust for event form */}
          {showAdjustForm && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
              <div>
                <h2 className="font-semibold text-gray-800">Adjust for event</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Move this single instance to align with an upcoming event. Your regular cadence continues afterward.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event name *</label>
                <input
                  type="text" value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  placeholder="e.g. Vacation to Italy"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event date *</label>
                <input
                  type="date" value={eventDate}
                  min={format(today(), 'yyyy-MM-dd')}
                  onChange={e => setEventDate(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Days before event</label>
                <input
                  type="number" min={1} max={90} value={daysBefore}
                  onChange={e => setDaysBefore(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              {/* Preview */}
              {adjustedDatePreview && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-sm text-purple-700">
                  Your {task.name} will move from{' '}
                  <span className="font-medium">{originalWindowLabel}</span> to{' '}
                  <span className="font-medium">{adjustedDatePreview}</span>
                  {eventName && ` (${daysBefore} days before ${eventName})`}.
                </div>
              )}

              {/* Resume cadence toggle */}
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="resumeNormal"
                  checked={resumeNormal}
                  onChange={e => setResumeNormal(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-500"
                />
                <div>
                  <label htmlFor="resumeNormal" className="text-sm font-medium text-gray-700">
                    Resume normal cadence after this event
                  </label>
                  <p className="text-xs text-gray-400 mt-0.5">
                    The next instance will be scheduled from your actual completion date.
                  </p>
                </div>
              </div>

              {!resumeNormal && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Next instance date after event</label>
                  <input
                    type="date" value={overrideNextDate}
                    min={eventDate || format(today(), 'yyyy-MM-dd')}
                    onChange={e => setOverrideNextDate(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">The instance after this one will start from this date.</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowAdjustForm(false)} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2">Cancel</button>
                <button
                  onClick={handleAdjustForEvent}
                  disabled={loading || !eventName.trim() || !eventDate}
                  className="flex-1 bg-purple-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Confirm adjustment'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">
          Notes <span className="text-gray-400 font-normal">(this instance only)</span>
        </h2>
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
