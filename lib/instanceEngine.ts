/**
 * Instance Engine
 *
 * All scheduling logic lives here. Two modes are supported:
 *
 * STANDARD MODE (mode = 'standard')
 *   Instances are generated one at a time, each anchored to the
 *   completion date of the previous instance. The task grows
 *   forward indefinitely.
 *
 * COUNTDOWN MODE (mode = 'countdown')
 *   All instances are pre-generated at creation time, scheduled
 *   backward from a fixed target_date. When an instance is
 *   completed, the remaining instances are recalculated backward
 *   from the target — NOT forward from the completion date.
 *   The target date is always the anchor.
 *
 *   After the target date passes:
 *     continue_after_target = true  → switches to standard mode;
 *       first post-target instance is due at target_date + interval
 *     continue_after_target = false → task is deactivated
 */

import { addDays, format, parseISO, isAfter, isBefore } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import type { Task, Instance, InstanceStatus } from '@/types';

const supabase = createClient();

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function today(): Date {
  return new Date(new Date().toDateString()); // strips time component
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// ─── Status derivation ────────────────────────────────────────────────────────

/**
 * Derives the display status for an instance based on current date.
 * completed/skipped/snoozed are taken from the stored column;
 * upcoming vs due is always recalculated from dates.
 */
export function deriveStatus(instance: Instance): InstanceStatus {
  if (instance.status === 'completed' || instance.status === 'skipped') {
    return instance.status;
  }
  if (instance.status === 'snoozed') {
    if (instance.snooze_until && !isAfter(parseISO(instance.snooze_until), today())) {
      return 'due'; // snooze expired
    }
    return 'snoozed';
  }

  const start = parseISO(instance.due_date_start);
  if (isAfter(start, today())) return 'upcoming';
  return 'due'; // within or past window
}

/**
 * Returns days until the start of the due window (negative = overdue).
 */
export function daysUntilDue(instance: Instance): number {
  const start = parseISO(instance.due_date_start);
  const t = today();
  return Math.round((start.getTime() - t.getTime()) / 86_400_000);
}

// ─── Window calculation ───────────────────────────────────────────────────────

/**
 * Calculates the due window for the NEXT instance given an anchor date
 * (standard mode: anchor = last completion date).
 */
export function calculateNextWindow(
  anchorDate: Date,
  task: Pick<Task, 'interval_min_days' | 'interval_max_days'>
): { due_date_start: string; due_date_end: string } {
  return {
    due_date_start: toISODate(addDays(anchorDate, task.interval_min_days)),
    due_date_end:   toISODate(addDays(anchorDate, task.interval_max_days)),
  };
}

/**
 * Calculates all instance windows for a countdown task, ordered
 * oldest-first (chronological).
 *
 * For each n = 0, 1, 2, …:
 *   due_date_end   = target − days_before_target − n × interval_min_days
 *   due_date_start = due_date_end − (interval_max_days − interval_min_days)
 *
 * Stops when due_date_end would be in the past.
 */
export function calculateCountdownWindows(
  task: Pick<Task, 'target_date' | 'days_before_target' | 'interval_min_days' | 'interval_max_days'>
): Array<{ due_date_start: string; due_date_end: string }> {
  if (!task.target_date) return [];

  const target          = parseISO(task.target_date);
  const daysBeforeTarget = task.days_before_target ?? 7;
  const spread          = task.interval_max_days - task.interval_min_days;
  const t               = today();
  const windows: Array<{ due_date_start: string; due_date_end: string }> = [];
  let n = 0;

  while (true) {
    const dueEnd   = addDays(target, -(daysBeforeTarget + n * task.interval_min_days));
    const dueStart = addDays(dueEnd, -spread);

    if (isBefore(dueEnd, t)) break;
    if (n >= 200) break; // safety cap

    windows.push({
      due_date_start: toISODate(dueStart),
      due_date_end:   toISODate(dueEnd),
    });

    n++;
  }

  return windows.reverse(); // chronological (earliest first)
}

// ─── Instance creation ────────────────────────────────────────────────────────

/**
 * Creates the first instance for a newly created STANDARD task.
 * Uses initial_anchor_date if the user entered a past "last done"
 * date; otherwise anchors to today.
 */
export async function createFirstInstance(task: Task): Promise<Instance | null> {
  const anchor = task.initial_anchor_date
    ? parseISO(task.initial_anchor_date)
    : today();

  const window = calculateNextWindow(anchor, task);

  const { data, error } = await supabase
    .from('instances')
    .insert({
      task_id:              task.id,
      user_id:              task.user_id,
      due_date_start:       window.due_date_start,
      due_date_end:         window.due_date_end,
      interval_anchor_date: toISODate(anchor),
      status:               'upcoming',
    })
    .select()
    .single();

  if (error) {
    console.error('createFirstInstance error:', error);
    return null;
  }
  return data;
}

/**
 * Generates ALL instances for a COUNTDOWN task at creation time.
 * Also called to regenerate after a completion (the target date
 * is the fixed anchor, not the completion date).
 */
export async function generateCountdownInstances(task: Task): Promise<Instance[] | null> {
  const windows = calculateCountdownWindows(task);

  if (windows.length === 0) return [];

  const inserts = windows.map(w => ({
    task_id:              task.id,
    user_id:              task.user_id,
    due_date_start:       w.due_date_start,
    due_date_end:         w.due_date_end,
    interval_anchor_date: null, // no single anchor in countdown mode
    status:               'upcoming' as InstanceStatus,
  }));

  const { data, error } = await supabase.from('instances').insert(inserts).select();

  if (error) {
    console.error('generateCountdownInstances error:', error);
    return null;
  }
  return data;
}

// ─── Instance actions ─────────────────────────────────────────────────────────

/**
 * Marks an instance as completed and schedules the next one.
 *
 * Standard mode:
 *   Creates the next instance anchored to the actual completion date.
 *
 * Countdown mode:
 *   Deletes remaining upcoming/snoozed instances, then either
 *   regenerates them backward from target (if target hasn't passed),
 *   creates a forward-scheduled instance (target passed + continue),
 *   or deactivates the task (target passed + no continue).
 */
export async function completeInstance(
  instanceId: string,
  task: Task,
  actualDate: Date = today()
): Promise<{ updated: Instance | null; next: Instance | null }> {
  const { data: updated, error: updateErr } = await supabase
    .from('instances')
    .update({
      status:                 'completed',
      actual_completion_date: toISODate(actualDate),
    })
    .eq('id', instanceId)
    .select()
    .single();

  if (updateErr) {
    console.error('completeInstance error:', updateErr);
    return { updated: null, next: null };
  }

  if (task.mode === 'countdown') {
    return handlePostCompleteCountdown(task);
  }

  const next = await createNextInstance(task, actualDate);
  return { updated, next };
}

/**
 * Marks an instance as skipped.
 *
 * Standard mode: creates the next instance anchored to today.
 * Countdown mode: just marks as skipped — other pre-generated
 *   instances already exist; no new one is needed.
 */
export async function skipInstance(
  instanceId: string,
  task: Task
): Promise<{ updated: Instance | null; next: Instance | null }> {
  const { data: updated, error } = await supabase
    .from('instances')
    .update({ status: 'skipped' })
    .eq('id', instanceId)
    .select()
    .single();

  if (error) {
    console.error('skipInstance error:', error);
    return { updated: null, next: null };
  }

  if (task.mode === 'countdown') {
    return { updated, next: null };
  }

  const next = await createNextInstance(task, today());
  return { updated, next };
}

/**
 * Snoozes an instance by setting snooze_until to N days past
 * the current due_date_end. Does NOT create a new instance.
 */
export async function snoozeInstance(
  instanceId: string,
  days: number,
  currentDueDateEnd: string
): Promise<Instance | null> {
  const newSnoozeUntil = toISODate(addDays(parseISO(currentDueDateEnd), days));

  const { data, error } = await supabase
    .from('instances')
    .update({ status: 'snoozed', snooze_until: newSnoozeUntil })
    .eq('id', instanceId)
    .select()
    .single();

  if (error) {
    console.error('snoozeInstance error:', error);
    return null;
  }
  return data;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Inserts the next instance for a standard-mode task.
 * Guards against creating a duplicate future instance.
 */
async function createNextInstance(
  task: Task,
  anchorDate: Date
): Promise<Instance | null> {
  const { data: existing } = await supabase
    .from('instances')
    .select('id')
    .eq('task_id', task.id)
    .in('status', ['upcoming', 'snoozed'])
    .limit(1);

  if (existing && existing.length > 0) {
    console.warn('createNextInstance: future instance already exists, skipping');
    return null;
  }

  const window = calculateNextWindow(anchorDate, task);

  const { data, error } = await supabase
    .from('instances')
    .insert({
      task_id:              task.id,
      user_id:              task.user_id,
      due_date_start:       window.due_date_start,
      due_date_end:         window.due_date_end,
      interval_anchor_date: toISODate(anchorDate),
      status:               'upcoming',
    })
    .select()
    .single();

  if (error) {
    console.error('createNextInstance error:', error);
    return null;
  }
  return data;
}

/**
 * Post-completion logic for countdown tasks.
 * Clears all remaining future instances, then either regenerates
 * them (target hasn't passed), transitions to standard mode
 * (target passed + continue), or deactivates (target passed + stop).
 */
async function handlePostCompleteCountdown(
  task: Task
): Promise<{ updated: Instance | null; next: Instance | null }> {
  await supabase
    .from('instances')
    .delete()
    .eq('task_id', task.id)
    .in('status', ['upcoming', 'snoozed']);

  if (!task.target_date) return { updated: null, next: null };

  const target = parseISO(task.target_date);
  const t = today();

  if (isAfter(t, target)) {
    if (task.continue_after_target) {
      // Switch to standard mode: first post-target instance from target date
      const next = await createNextInstance({ ...task, mode: 'standard' }, target);
      return { updated: null, next };
    } else {
      await supabase.from('tasks').update({ is_active: false }).eq('id', task.id);
      return { updated: null, next: null };
    }
  }

  await generateCountdownInstances(task);
  return { updated: null, next: null };
}
