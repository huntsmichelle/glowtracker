'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, format, parseISO, isBefore } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { createFirstTask, generateCountdownTasks, calculateCountdownWindows } from '@/lib/taskEngine';
import type { Category, Routine, RoutineFormValues, IntervalType, IntervalUnit, RoutineMode } from '@/types';

interface Props {
  categories: Category[];
  initialValues?: Partial<RoutineFormValues>;
  routineId?: string;   // present = edit mode
  userId: string;
}

// Step in the multi-step creation flow (edit mode skips to 'details')
type Step = 'mode-choice' | 'anchor-date' | 'details' | 'countdown-preview';

// Convert interval to days based on unit
function toDays(value: number, unit: IntervalUnit): number {
  return unit === 'weeks' ? value * 7 : value;
}

// Format a date pair as a readable range (or single date if same)
function formatWindow(start: string, end: string): string {
  if (start === end) return format(parseISO(start), 'MMM d, yyyy');
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d, yyyy')}`;
}

export default function RoutineForm({ categories, initialValues, routineId, userId }: Props) {
  const router = useRouter();
  const isEdit = !!routineId;

  // ── Step / mode ───────────────────────────────────────────────────────────
  const [step, setStep]   = useState<Step>(isEdit ? 'details' : 'mode-choice');
  const [mode, setMode]   = useState<RoutineMode>(initialValues?.mode ?? 'standard');

  // ── Standard mode: anchor date ────────────────────────────────────────────
  const [anchorType, setAnchorType]   = useState<'today' | 'past'>('today');
  const [anchorDate, setAnchorDate]   = useState(initialValues?.initial_anchor_date ?? '');

  // ── Core fields ───────────────────────────────────────────────────────────
  const [name, setName]               = useState(initialValues?.name ?? '');
  const [categoryId, setCategoryId]   = useState(initialValues?.category_id ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [reminderDays, setReminderDays] = useState(initialValues?.default_reminder_days ?? 2);

  // ── Interval ──────────────────────────────────────────────────────────────
  const [intervalType, setIntervalType] = useState<IntervalType>(
    initialValues?.intervalType ?? 'range'
  );
  const [intervalMin, setIntervalMin] = useState(initialValues?.intervalMin ?? 4);
  const [intervalMax, setIntervalMax] = useState(initialValues?.intervalMax ?? 6);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    initialValues?.intervalUnit ?? 'weeks'
  );

  // ── Countdown mode ────────────────────────────────────────────────────────
  const [targetDate, setTargetDate]           = useState(initialValues?.target_date ?? '');
  const [targetLabel, setTargetLabel]         = useState(initialValues?.target_label ?? '');
  const [daysBeforeTarget, setDaysBeforeTarget] = useState(initialValues?.days_before_target ?? 7);
  const [continueAfterTarget, setContinueAfterTarget] = useState(
    initialValues?.continue_after_target ?? true
  );

  // ── Preview (countdown creation only) ────────────────────────────────────
  const [previewWindows, setPreviewWindows] = useState<Array<{ due_date_start: string; due_date_end: string }>>([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // ─── Validation helpers ───────────────────────────────────────────────────

  function intervalMinDays(): number {
    return toDays(intervalMin, intervalUnit);
  }
  function intervalMaxDays(): number {
    const max = intervalType === 'exact' ? intervalMin : intervalMax;
    return toDays(max, intervalUnit);
  }

  function validateInterval(): string {
    if (intervalMin < 1) return 'Interval must be at least 1.';
    if (intervalType === 'range' && intervalMin > intervalMax) {
      return 'Minimum interval cannot be greater than maximum.';
    }
    return '';
  }

  // ─── Preview calculation (countdown) ─────────────────────────────────────

  function buildPreview() {
    const err = validateInterval();
    if (err) { setError(err); return; }
    if (!targetDate) { setError('Please enter a target date.'); return; }

    const windows = calculateCountdownWindows({
      target_date: targetDate,
      days_before_target: daysBeforeTarget,
      interval_min_days: intervalMinDays(),
      interval_max_days: intervalMaxDays(),
    });

    if (windows.length === 0) {
      setError('No tasks fall between today and the target date with this interval. Try a shorter interval or a later target date.');
      return;
    }

    setError('');
    setPreviewWindows(windows);
    setStep('countdown-preview');
  }

  // ─── Form submission ──────────────────────────────────────────────────────

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');

    const intervalErr = validateInterval();
    if (intervalErr) { setError(intervalErr); return; }
    if (!name.trim()) { setError('Routine name is required.'); return; }

    if (mode === 'countdown') {
      if (!targetDate) { setError('Please enter a target date.'); return; }
      if (isBefore(parseISO(targetDate), new Date())) {
        setError('Target date must be in the future.'); return;
      }
    }

    setLoading(true);
    const supabase = createClient();

    const payload = {
      name:                 name.trim(),
      category_id:          categoryId || null,
      description:          description.trim() || null,
      interval_min_days:    intervalMinDays(),
      interval_max_days:    intervalMaxDays(),
      default_reminder_days: reminderDays,
      user_id:              userId,
      mode,
      // Standard mode — only set when user entered a past anchor date
      initial_anchor_date:
        mode === 'standard' && anchorType === 'past' && anchorDate
          ? anchorDate
          : null,
      // Countdown mode
      target_date:           mode === 'countdown' ? targetDate : null,
      target_label:          mode === 'countdown' ? targetLabel.trim() || null : null,
      days_before_target:    mode === 'countdown' ? daysBeforeTarget : null,
      continue_after_target: mode === 'countdown' ? continueAfterTarget : true,
    };

    if (isEdit) {
      const { error: updateErr } = await supabase
        .from('routines')
        .update(payload)
        .eq('id', routineId);
      if (updateErr) { setError(updateErr.message); setLoading(false); return; }
      router.push(`/routines/${routineId}`);
    } else {
      const { data, error: insertErr } = await supabase
        .from('routines')
        .insert(payload)
        .select()
        .single();
      if (insertErr) { setError(insertErr.message); setLoading(false); return; }

      const routine = data as Routine;
      if (mode === 'countdown') {
        await generateCountdownTasks(routine);
      } else {
        await createFirstTask(routine);
      }
      router.push(`/routines/${routine.id}`);
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
    await supabase.from('routines').delete().eq('id', routineId);
    router.push('/routines');
    router.refresh();
  }

  // ─── Shared interval UI block ─────────────────────────────────────────────

  function IntervalFields() {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Interval</label>
        <p className="text-xs text-gray-400 mb-2">How often this routine recurs.</p>

        {/* Exact vs Range toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3">
          {(['exact', 'range'] as IntervalType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setIntervalType(t)}
              className={`flex-1 text-sm py-1.5 font-medium transition-colors ${
                intervalType === t
                  ? 'bg-pink-500 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t === 'exact' ? 'Exact' : 'Range (min – max)'}
            </button>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">
              {intervalType === 'exact' ? 'Every' : 'Min'}
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={intervalMin}
              onChange={e => setIntervalMin(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>

          {intervalType === 'range' && (
            <>
              <span className="text-gray-400 mb-2">–</span>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Max</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={intervalMax}
                  onChange={e => setIntervalMax(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
            </>
          )}

          {/* Unit selector */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Unit</label>
            <select
              value={intervalUnit}
              onChange={e => setIntervalUnit(e.target.value as IntervalUnit)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  // ─── Shared core fields (name, category, description, reminder) ───────────

  function CoreFields() {
    return (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Routine name *</label>
          <input
            required
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Hair Color"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
          >
            <option value="">No category</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description / notes</label>
          <p className="text-xs text-gray-400 mb-2">Instructions, products used, etc. — shown on every task.</p>
          <textarea
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
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
            value={reminderDays}
            onChange={e => setReminderDays(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          <p className="text-xs text-gray-400 mt-1">0 = on the due date; max 14 days. Reminders coming in Phase 2.</p>
        </div>
      </>
    );
  }

  // ─── Error banner ─────────────────────────────────────────────────────────

  function ErrorBanner() {
    if (!error) return null;
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: mode-choice
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'mode-choice') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">I am…</h2>
          <p className="text-sm text-gray-400">Choose how this routine is scheduled.</p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => { setMode('standard'); setStep('anchor-date'); }}
            className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-colors ${
              mode === 'standard'
                ? 'border-pink-500 bg-pink-50'
                : 'border-gray-200 hover:border-pink-200'
            }`}
          >
            <p className="font-semibold text-gray-800 text-sm mb-0.5">Starting a new routine</p>
            <p className="text-xs text-gray-400">
              Track a recurring habit going forward. Tasks are scheduled one at a time,
              anchored to each completion.
            </p>
          </button>

          <button
            type="button"
            onClick={() => { setMode('countdown'); setStep('details'); }}
            className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-colors ${
              mode === 'countdown'
                ? 'border-pink-500 bg-pink-50'
                : 'border-gray-200 hover:border-pink-200'
            }`}
          >
            <p className="font-semibold text-gray-800 text-sm mb-0.5">Planning for a future event</p>
            <p className="text-xs text-gray-400">
              Work backwards from a target date (e.g. a wedding). All tasks are pre-generated
              and anchored to your event — not to each completion.
            </p>
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: anchor-date (standard mode only, create flow)
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'anchor-date') {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setStep('mode-choice')}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back
        </button>

        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">When did you last do this?</h2>
          <p className="text-sm text-gray-400">
            Your first task will be scheduled from this date. If you skip this, today is used.
          </p>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setAnchorType('today')}
            className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
              anchorType === 'today'
                ? 'border-pink-500 bg-pink-50'
                : 'border-gray-200 hover:border-pink-200'
            }`}
          >
            <p className="text-sm font-medium text-gray-800">Today</p>
            <p className="text-xs text-gray-400">Start the countdown from right now.</p>
          </button>

          <button
            type="button"
            onClick={() => setAnchorType('past')}
            className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
              anchorType === 'past'
                ? 'border-pink-500 bg-pink-50'
                : 'border-gray-200 hover:border-pink-200'
            }`}
          >
            <p className="text-sm font-medium text-gray-800">Enter a past date</p>
            <p className="text-xs text-gray-400">
              Use a real past completion date so the countdown starts from reality.
            </p>
          </button>

          {anchorType === 'past' && (
            <input
              type="date"
              value={anchorDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setAnchorDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => setStep('details')}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
        >
          Continue
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: countdown-preview
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'countdown-preview') {
    return (
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setStep('details')}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back to details
        </button>

        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">Scheduled tasks</h2>
          <p className="text-sm text-gray-400">
            {previewWindows.length} task{previewWindows.length !== 1 ? 's' : ''} from today to your target
            {targetLabel ? ` (${targetLabel})` : ''}.
          </p>
        </div>

        <div className="space-y-2">
          {previewWindows.map((w, i) => (
            <div
              key={i}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5"
            >
              <span className="text-xs text-gray-400">Task {i + 1}</span>
              <span className="text-sm text-gray-700 font-medium">
                {formatWindow(w.due_date_start, w.due_date_end)}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between bg-pink-50 rounded-lg border border-pink-200 px-4 py-2.5">
            <span className="text-xs text-pink-500 font-medium">Target</span>
            <span className="text-sm text-pink-700 font-medium">
              {format(parseISO(targetDate), 'MMM d, yyyy')}
              {targetLabel && ` — ${targetLabel}`}
            </span>
          </div>
        </div>

        {ErrorBanner()}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setStep('details')}
            className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2.5"
          >
            Adjust
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={loading}
            className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
          >
            {loading ? 'Creating…' : 'Create routine'}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: details (both modes, and all edit-mode renders)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <form onSubmit={e => { e.preventDefault(); mode === 'countdown' && !isEdit ? buildPreview() : handleSubmit(e); }} className="space-y-5">
      {!isEdit && (
        <button
          type="button"
          onClick={() => setStep(mode === 'standard' ? 'anchor-date' : 'mode-choice')}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back
        </button>
      )}

      {isEdit && mode !== 'standard' && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-600 font-medium">
            {mode === 'countdown' ? 'Countdown routine' : 'Standard routine'} — mode cannot be changed after creation.
          </p>
        </div>
      )}

      {ErrorBanner()}

      {CoreFields()}
      {IntervalFields()}

      {/* Countdown-specific fields */}
      {mode === 'countdown' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target date *</label>
            <input
              type="date"
              value={targetDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setTargetDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event name (optional)</label>
            <input
              type="text"
              value={targetLabel}
              onChange={e => setTargetLabel(e.target.value)}
              placeholder="e.g. Wedding, Photoshoot"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Final task should land this many days before target
            </label>
            <input
              type="number"
              min={1}
              max={60}
              value={daysBeforeTarget}
              onChange={e => setDaysBeforeTarget(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <p className="text-xs text-gray-400 mt-1">
              e.g. 7 = last task is due about one week before your event.
            </p>
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="continueAfterTarget"
              checked={continueAfterTarget}
              onChange={e => setContinueAfterTarget(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-pink-500 focus:ring-pink-400"
            />
            <div>
              <label htmlFor="continueAfterTarget" className="text-sm font-medium text-gray-700">
                Continue after target event
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                If checked, after your event date passes this routine switches to standard
                forward-scheduling using the same interval.
              </p>
            </div>
          </div>
        </>
      )}

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
          {loading
            ? 'Saving…'
            : isEdit
            ? 'Save changes'
            : mode === 'countdown'
            ? 'Preview tasks →'
            : 'Create routine'}
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
