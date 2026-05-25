/**
 * Task Engine
 *
 * All scheduling logic lives here. Two modes are supported:
 *
 * STANDARD MODE (mode = 'standard')
 *   Tasks are generated one at a time, each anchored to the
 *   completion date of the previous task. The routine grows
 *   forward indefinitely.
 *
 * COUNTDOWN MODE (mode = 'countdown')
 *   All tasks are pre-generated at creation time, scheduled
 *   backward from a fixed target_date. When a task is completed,
 *   the remaining tasks are recalculated backward from the
 *   target — not forward from the completion date. The target
 *   date is always the anchor. After the target date passes:
 *     - continue_after_target = true  → routine switches to
 *       standard mode, first post-target task is due at
 *       target_date + interval
 *     - continue_after_target = false → routine is deactivated
 */

import { addDays, format, parseISO, isAfter, isBefore } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import type { Routine, Task, TaskStatus } from '@/types';

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
 * Derives the display status for a task based on current date.
 * completed/skipped/snoozed are taken from the stored column;
 * upcoming vs due is always recalculated from dates.
 */
export function deriveStatus(task: Task): TaskStatus {
  if (task.status === 'completed' || task.status === 'skipped') return task.status;
  if (task.status === 'snoozed') {
    if (task.snooze_until && !isAfter(parseISO(task.snooze_until), today())) {
      return 'due'; // snooze expired
    }
    return 'snoozed';
  }

  const start = parseISO(task.due_date_start);
  if (isAfter(start, today())) return 'upcoming';
  return 'due'; // within or past window
}

/**
 * Returns days until the start of the due window (negative = overdue).
 */
export function daysUntilDue(task: Task): number {
  const start = parseISO(task.due_date_start);
  const t = today();
  return Math.round((start.getTime() - t.getTime()) / 86_400_000);
}

// ─── Window calculation ───────────────────────────────────────────────────────

/**
 * Calculates the due window for the NEXT task given an anchor date
 * (standard mode: anchor = last completion date).
 */
export function calculateNextWindow(
  anchorDate: Date,
  routine: Pick<Routine, 'interval_min_days' | 'interval_max_days'>
): { due_date_start: string; due_date_end: string } {
  return {
    due_date_start: toISODate(addDays(anchorDate, routine.interval_min_days)),
    due_date_end:   toISODate(addDays(anchorDate, routine.interval_max_days)),
  };
}

/**
 * Calculates the countdown task windows for a given routine.
 * Returns an array of {due_date_start, due_date_end} objects
 * ordered oldest-first (chronological).
 *
 * Each task's due_date_end is (target - days_before_target - n * interval_min_days).
 * Window width = interval_max_days - interval_min_days (0 for exact intervals).
 */
export function calculateCountdownWindows(
  routine: Pick<Routine, 'target_date' | 'days_before_target' | 'interval_min_days' | 'interval_max_days'>
): Array<{ due_date_start: string; due_date_end: string }> {
  if (!routine.target_date) return [];

  const target = parseISO(routine.target_date);
  const daysBeforeTarget = routine.days_before_target ?? 7;
  const spread = routine.interval_max_days - routine.interval_min_days; // window width
  const t = today();
  const windows: Array<{ due_date_start: string; due_date_end: string }> = [];
  let n = 0;

  while (true) {
    // The "ideal" end of this task's window, counting backwards from target
    const dueEnd   = addDays(target, -(daysBeforeTarget + n * routine.interval_min_days));
    const dueStart = addDays(dueEnd, -spread);

    // Stop once this task's end date is already in the past
    if (isBefore(dueEnd, t)) break;

    // Safety cap — no routine should realistically need more than 200 tasks
    if (n >= 200) break;

    windows.push({
      due_date_start: toISODate(dueStart),
      due_date_end:   toISODate(dueEnd),
    });

    n++;
  }

  // Reverse so the array is chronological (earliest task first)
  return windows.reverse();
}

// ─── Task creation ────────────────────────────────────────────────────────────

/**
 * Creates the very first task for a newly created STANDARD routine.
 * Uses initial_anchor_date if the user entered a past "last done" date,
 * otherwise anchors to today.
 */
export async function createFirstTask(routine: Routine): Promise<Task | null> {
  const anchor = routine.initial_anchor_date
    ? parseISO(routine.initial_anchor_date)
    : today();

  const window = calculateNextWindow(anchor, routine);

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      routine_id:           routine.id,
      user_id:              routine.user_id,
      due_date_start:       window.due_date_start,
      due_date_end:         window.due_date_end,
      interval_anchor_date: toISODate(anchor),
      status:               'upcoming',
    })
    .select()
    .single();

  if (error) {
    console.error('createFirstTask error:', error);
    return null;
  }
  return data;
}

/**
 * Generates ALL tasks for a COUNTDOWN routine at creation time.
 * Also called to regenerate after a task is completed (since the
 * target date is the fixed anchor, not the completion date).
 * Returns the inserted tasks or null on error.
 */
export async function generateCountdownTasks(routine: Routine): Promise<Task[] | null> {
  const windows = calculateCountdownWindows(routine);

  if (windows.length === 0) return [];

  const inserts = windows.map(w => ({
    routine_id:           routine.id,
    user_id:              routine.user_id,
    due_date_start:       w.due_date_start,
    due_date_end:         w.due_date_end,
    interval_anchor_date: null, // no single anchor in countdown mode
    status:               'upcoming' as TaskStatus,
  }));

  const { data, error } = await supabase.from('tasks').insert(inserts).select();

  if (error) {
    console.error('generateCountdownTasks error:', error);
    return null;
  }
  return data;
}

// ─── Task actions ─────────────────────────────────────────────────────────────

/**
 * Marks a task as completed and schedules the next one.
 *
 * Standard mode:
 *   Creates the next task anchored to the actual completion date.
 *
 * Countdown mode:
 *   Deletes all remaining upcoming/snoozed tasks, then either:
 *   - Regenerates them backward from target (if target hasn't passed), or
 *   - Creates ONE forward task from target (if target passed + continue_after_target), or
 *   - Deactivates the routine (if target passed + !continue_after_target).
 */
export async function completeTask(
  taskId: string,
  routine: Routine,
  actualDate: Date = today()
): Promise<{ updated: Task | null; next: Task | null }> {
  const { data: updated, error: updateErr } = await supabase
    .from('tasks')
    .update({
      status:                  'completed',
      actual_completion_date:  toISODate(actualDate),
    })
    .eq('id', taskId)
    .select()
    .single();

  if (updateErr) {
    console.error('completeTask update error:', updateErr);
    return { updated: null, next: null };
  }

  if (routine.mode === 'countdown') {
    return handlePostCompleteCountdown(routine);
  }

  // Standard mode: create next task anchored to actual completion date
  const next = await createNextTask(routine, actualDate);
  return { updated, next };
}

/**
 * Marks a task as skipped.
 *
 * Standard mode: creates the next task anchored to today.
 * Countdown mode: just marks as skipped — the other pre-generated
 *   tasks are already in the database, no new task needed.
 */
export async function skipTask(
  taskId: string,
  routine: Routine
): Promise<{ updated: Task | null; next: Task | null }> {
  const { data: updated, error } = await supabase
    .from('tasks')
    .update({ status: 'skipped' })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('skipTask error:', error);
    return { updated: null, next: null };
  }

  if (routine.mode === 'countdown') {
    // All future tasks already exist — nothing to generate
    return { updated, next: null };
  }

  const next = await createNextTask(routine, today());
  return { updated, next };
}

/**
 * Snoozes a task by pushing its snooze_until date N days past the current
 * due_date_end. Does NOT create a new task — just shifts the existing one.
 */
export async function snoozeTask(
  taskId: string,
  days: number,
  currentDueDateEnd: string
): Promise<Task | null> {
  const newSnoozeUntil = toISODate(addDays(parseISO(currentDueDateEnd), days));

  const { data, error } = await supabase
    .from('tasks')
    .update({ status: 'snoozed', snooze_until: newSnoozeUntil })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    console.error('snoozeTask error:', error);
    return null;
  }
  return data;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Inserts the next task for a standard-mode routine, anchored to a given date.
 * Guards against creating a duplicate future task.
 */
async function createNextTask(
  routine: Routine,
  anchorDate: Date
): Promise<Task | null> {
  // Guard: never create a second future task in standard mode
  const { data: existing } = await supabase
    .from('tasks')
    .select('id')
    .eq('routine_id', routine.id)
    .in('status', ['upcoming', 'snoozed'])
    .limit(1);

  if (existing && existing.length > 0) {
    console.warn('createNextTask: future task already exists, skipping');
    return null;
  }

  const window = calculateNextWindow(anchorDate, routine);

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      routine_id:           routine.id,
      user_id:              routine.user_id,
      due_date_start:       window.due_date_start,
      due_date_end:         window.due_date_end,
      interval_anchor_date: toISODate(anchorDate),
      status:               'upcoming',
    })
    .select()
    .single();

  if (error) {
    console.error('createNextTask error:', error);
    return null;
  }
  return data;
}

/**
 * Post-completion logic for countdown routines.
 * Clears all remaining future tasks and either regenerates them
 * (if target hasn't passed) or transitions to standard mode.
 */
async function handlePostCompleteCountdown(
  routine: Routine
): Promise<{ updated: Task | null; next: Task | null }> {
  // Delete all remaining upcoming/snoozed tasks
  await supabase
    .from('tasks')
    .delete()
    .eq('routine_id', routine.id)
    .in('status', ['upcoming', 'snoozed']);

  if (!routine.target_date) return { updated: null, next: null };

  const target = parseISO(routine.target_date);
  const t = today();

  if (isAfter(t, target)) {
    // Target date has passed
    if (routine.continue_after_target) {
      // Switch to standard mode: first post-target task forward from target date
      const next = await createNextTask(
        { ...routine, mode: 'standard' },
        target
      );
      return { updated: null, next };
    } else {
      // Deactivate the routine — the event is done
      await supabase
        .from('routines')
        .update({ is_active: false })
        .eq('id', routine.id);
      return { updated: null, next: null };
    }
  }

  // Target hasn't passed — regenerate all countdown tasks
  await generateCountdownTasks(routine);
  return { updated: null, next: null };
}
