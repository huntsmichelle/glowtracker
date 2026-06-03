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
import { getCategoryColor } from '@/lib/categoryColors';
import { processInstanceKept } from '@/lib/productTracking';

interface Props {
  instance: InstanceWithTask;
}

const statusStyles: Record<string, string> = {
  upcoming:  'bg-taupe text-warm-mid border-glow-border',
  due:       'bg-dust-lt text-charcoal border-dust',
  completed: 'bg-sage-lt text-charcoal border-sage',
  skipped:   'bg-taupe text-warm-light border-glow-border',
  snoozed:   'bg-taupe text-warm-mid border-glow-border',
};

const statusLabels: Record<string, string> = {
  upcoming:  'Upcoming',
  due:       'Ready for Refresh',
  completed: 'Kept',
  skipped:   'Passed',
  snoozed:   'Deferred',
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
  const categoryColor = getCategoryColor(task.category?.name ?? '').dot;
  const isCountdown   = task.mode === 'countdown';

  const daysUntil = differenceInDays(parseISO(instance.due_date_start), today());
  const isOverdue = differenceInDays(today(), parseISO(instance.due_date_end)) > 0;

  const adjustedDatePreview =
    eventDate && daysBefore > 0
      ? format(addDays(parseISO(eventDate), -daysBefore), 'MMM d, yyyy')
      : null;
  const originalWindowLabel = (!instance.due_date_end || instance.due_date_start === instance.due_date_end)
    ? format(parseISO(instance.due_date_start), 'MMM d, yyyy')
    : `${format(parseISO(instance.due_date_start), 'MMM d')}–${format(parseISO(instance.due_date_end), 'MMM d, yyyy')}`;

  async function handleComplete() {
    setLoading(true);
    const date = new Date(completionDate + 'T00:00:00');
    const cost = completionCost !== '' ? Number(completionCost) : null;
    const supabase = createClient();
    const { updated } = await completeInstance(instance.id, task as Task, date, cost);
    if (updated) setInstance({ ...instance, ...updated });
    setShowCompleteForm(false);
    setLoading(false);
    // Non-blocking: product tracking failures must not affect kept status
    processInstanceKept(supabase, instance.id, task.id, instance.user_id).catch(console.error);
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
      <Link href={`/tasks/${task.id}`} className="text-sm text-warm-light hover:text-charcoal">
        ← {task.name}
      </Link>

      {/* Status badge + dates */}
      <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: categoryColor }} />
              <span className="text-xs text-warm-light">{task.category?.name ?? 'No category'}</span>
              {isCountdown && (
                <span className="text-xs text-warm-mid font-medium">Countdown</span>
              )}
              {instance.is_event_override && instance.event_name && (
                <span className="text-xs text-charcoal bg-dust-lt border border-dust px-2 py-0.5 rounded-pill">
                  {instance.days_before_event}d before {instance.event_name}
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl text-charcoal">{task.name}</h1>
            {isCountdown && task.target_label && task.target_date && (
              <p className="text-xs text-warm-mid mt-0.5">
                → {task.target_label} · {format(parseISO(task.target_date), 'MMM d, yyyy')}
              </p>
            )}
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-pill border ${statusStyles[status] ?? ''}`}>
            {statusLabels[status] ?? status}
          </span>
        </div>

        <div className="space-y-1.5 text-sm text-charcoal">
          <div className="flex justify-between">
            <span className="text-warm-light">Window</span>
            <span>
              {format(parseISO(instance.due_date_start), 'MMM d')}
              {instance.due_date_end && instance.due_date_end !== instance.due_date_start
                ? <>{' – '}{format(parseISO(instance.due_date_end), 'MMM d, yyyy')}</>
                : <>{', '}{format(parseISO(instance.due_date_start), 'yyyy')}</>}
            </span>
          </div>
          {instance.is_event_override && instance.event_date && (
            <div className="flex justify-between">
              <span className="text-warm-light">Event date</span>
              <span className="text-dust">{format(parseISO(instance.event_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          {isActionable && (
            <div className="flex justify-between">
              <span className="text-warm-light">Timing</span>
              <span className={isOverdue ? 'text-dust font-medium' : ''}>
                {isOverdue
                  ? `Ready for refresh · ${differenceInDays(today(), parseISO(instance.due_date_end))}d past window`
                  : daysUntil > 0
                  ? `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`
                  : 'Due now'}
              </span>
            </div>
          )}
          {instance.actual_completion_date && (
            <div className="flex justify-between">
              <span className="text-warm-light">Kept</span>
              <span>{format(parseISO(instance.actual_completion_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          {instance.cost != null && (
            <div className="flex justify-between">
              <span className="text-warm-light">Cost</span>
              <span className="font-medium">${instance.cost.toFixed(2)}</span>
            </div>
          )}
          {instance.calendar_event_date && (
            <div className="flex justify-between">
              <span className="text-warm-light">Logged date</span>
              <span className="text-warm-mid text-xs">
                {format(parseISO(instance.calendar_event_date), 'MMM d, yyyy')}
              </span>
            </div>
          )}
          {instance.calendar_event_cost != null && (
            <div className="flex justify-between">
              <span className="text-warm-light">Logged cost</span>
              <span className="text-warm-mid text-xs">${instance.calendar_event_cost.toFixed(2)}</span>
            </div>
          )}
          {instance.snooze_until && (
            <div className="flex justify-between">
              <span className="text-warm-light">Deferred until</span>
              <span>{format(parseISO(instance.snooze_until), 'MMM d, yyyy')}</span>
            </div>
          )}
        </div>

        {task.description && (
          <div className="bg-taupe rounded-md p-3 text-sm text-warm-mid whitespace-pre-wrap">
            {task.description}
          </div>
        )}

        {task.reminder_notes && (
          <div className="border border-dust bg-dust-lt rounded-md p-3 space-y-1">
            <p className="label-overline">Reminder</p>
            <p className="text-sm text-charcoal whitespace-pre-wrap">{task.reminder_notes}</p>
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
                  className="flex-1 bg-charcoal hover:bg-charcoal/90 text-cream text-sm font-medium rounded-pill py-3 transition-colors"
                >
                  Mark Kept
                </button>
                <button
                  onClick={handleSkip}
                  disabled={loading}
                  className="flex-1 bg-taupe hover:bg-glow-border text-warm-mid text-sm font-medium rounded-pill py-3 transition-colors disabled:opacity-50"
                >
                  Pass
                </button>
                <button
                  onClick={() => setShowSnoozeForm(true)}
                  className="flex-1 bg-taupe hover:bg-glow-border text-warm-mid text-sm font-medium rounded-pill py-3 transition-colors"
                >
                  Defer
                </button>
              </div>
              {!instance.is_event_override && !isCountdown && (
                <button
                  onClick={() => setShowAdjustForm(true)}
                  className="w-full border border-glow-border text-warm-mid text-sm font-medium rounded-pill py-2.5 hover:bg-taupe transition-colors"
                >
                  Adjust for event…
                </button>
              )}
            </div>
          )}

          {/* Complete form */}
          {showCompleteForm && (
            <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5 space-y-4">
              <p className="label-overline">Log completion</p>
              {isCountdown && (
                <p className="text-xs text-warm-mid">
                  Countdown ritual: remaining instances will be recalculated from your target date.
                </p>
              )}
              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Actual date</label>
                <input
                  type="date"
                  value={completionDate}
                  max={format(today(), 'yyyy-MM-dd')}
                  onChange={e => setCompletionDate(e.target.value)}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Cost ($)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-light text-sm">$</span>
                  <input
                    type="number" min={0} step="0.01"
                    value={completionCost}
                    onChange={e => setCompletionCost(e.target.value)}
                    placeholder={task.default_cost != null ? String(task.default_cost) : '0.00'}
                    className="w-full pl-7"
                  />
                </div>
                <p className="text-xs text-warm-light mt-1">Optional — override the default if this session cost more or less.</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowCompleteForm(false)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2 hover:bg-taupe transition-colors">Cancel</button>
                <button onClick={handleComplete} disabled={loading} className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Mark Kept'}
                </button>
              </div>
            </div>
          )}

          {/* Snooze form */}
          {showSnoozeForm && (
            <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5 space-y-4">
              <p className="label-overline">Defer</p>
              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Days to defer</label>
                <input
                  type="number" min={1} max={30} value={snoozeDays}
                  onChange={e => setSnoozeDays(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowSnoozeForm(false)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2 hover:bg-taupe transition-colors">Cancel</button>
                <button onClick={handleSnooze} disabled={loading} className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2 disabled:opacity-50">
                  {loading ? 'Saving…' : 'Defer'}
                </button>
              </div>
            </div>
          )}

          {/* Adjust for event form */}
          {showAdjustForm && (
            <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5 space-y-4">
              <div>
                <p className="label-overline">Adjust for event</p>
                <p className="text-xs text-warm-light mt-0.5">
                  Move this single instance to align with an upcoming event. Your regular cadence continues afterward.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Event name *</label>
                <input
                  type="text" value={eventName}
                  onChange={e => setEventName(e.target.value)}
                  placeholder="e.g. Vacation to Italy"
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Event date *</label>
                <input
                  type="date" value={eventDate}
                  min={format(today(), 'yyyy-MM-dd')}
                  onChange={e => setEventDate(e.target.value)}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Days before event</label>
                <input
                  type="number" min={1} max={90} value={daysBefore}
                  onChange={e => setDaysBefore(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              {adjustedDatePreview && (
                <div className="bg-taupe border border-glow-border rounded-md p-3 text-sm text-warm-mid">
                  Your {task.name} will move from{' '}
                  <span className="font-medium text-charcoal">{originalWindowLabel}</span> to{' '}
                  <span className="font-medium text-charcoal">{adjustedDatePreview}</span>
                  {eventName && ` (${daysBefore} days before ${eventName})`}.
                </div>
              )}

              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="resumeNormal"
                  checked={resumeNormal}
                  onChange={e => setResumeNormal(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-glow-border"
                />
                <div>
                  <label htmlFor="resumeNormal" className="text-sm font-medium text-charcoal">
                    Resume normal cadence after this event
                  </label>
                  <p className="text-xs text-warm-light mt-0.5">
                    The next instance will be scheduled from your actual completion date.
                  </p>
                </div>
              </div>

              {!resumeNormal && (
                <div>
                  <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Next instance date after event</label>
                  <input
                    type="date" value={overrideNextDate}
                    min={eventDate || format(today(), 'yyyy-MM-dd')}
                    onChange={e => setOverrideNextDate(e.target.value)}
                    className="w-full"
                  />
                  <p className="text-xs text-warm-light mt-1">The instance after this one will start from this date.</p>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setShowAdjustForm(false)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2 hover:bg-taupe transition-colors">Cancel</button>
                <button
                  onClick={handleAdjustForEvent}
                  disabled={loading || !eventName.trim() || !eventDate}
                  className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2 disabled:opacity-50"
                >
                  {loading ? 'Saving…' : 'Confirm adjustment'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5 space-y-3">
        <p className="label-overline">Notes <span className="normal-case font-normal text-warm-light tracking-normal">(this instance only)</span></p>
        <textarea
          rows={4}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How did it go? Any adjustments?"
          className="w-full resize-none"
        />
        <button
          onClick={saveNotes}
          disabled={notesLoading}
          className="text-sm border border-glow-border text-warm-mid rounded-pill px-4 py-1.5 hover:bg-taupe transition-colors disabled:opacity-50"
        >
          {notesLoading ? 'Saving…' : 'Save notes'}
        </button>
      </div>

      {/* Photo placeholder (Phase 2) */}
      <div className="bg-stone border border-dashed border-glow-border rounded-lg p-5">
        <p className="label-overline mb-1">Before / After Photos</p>
        <p className="text-xs text-warm-light">Photo uploads coming soon.</p>
      </div>

      {/* Products placeholder (Phase 2) */}
      <div className="bg-stone border border-dashed border-glow-border rounded-lg p-5">
        <p className="label-overline mb-1">Products Used</p>
        <p className="text-xs text-warm-light">Product tracking coming soon.</p>
      </div>
    </div>
  );
}
