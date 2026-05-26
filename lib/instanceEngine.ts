/**
 * Instance Engine
 *
 * All scheduling logic lives here. Two modes are supported:
 *
 * STANDARD MODE (mode = 'standard')
 *   One "upcoming" instance exists at a time — the next actionable date.
 *   Beyond that, projected instances are pre-generated for 6 months using
 *   the midpoint interval as the cadence. Lifecycle:
 *
 *   CREATE  → createFirstInstance() makes the upcoming instance, then
 *             generateProjectedInstances() fills out 6 months of forecasts.
 *
 *   COMPLETE → completeInstance() marks done, regenerates projections from
 *              the actual completion date, promotes the first projected to
 *              upcoming. If completedEarlier/later than scheduled, all future
 *              projections shift accordingly.
 *
 *   SKIP    → skipInstance() marks skipped. Projections remain on their
 *              original dates (cadence unchanged). The next projected
 *              instance is promoted to upcoming.
 *
 *   SNOOZE  → snoozeInstance() sets snooze_until, no new instance created.
 *
 * COUNTDOWN MODE (mode = 'countdown')
 *   All instances are pre-generated at creation time, scheduled backward
 *   from a fixed target_date. No projected instances are used for countdown
 *   tasks — the pre-generated instances fill that role.
 *
 * EVENT OVERRIDE (one-off date adjustment)
 *   A single upcoming instance can be moved to align with a future event.
 *
 * PROJECTION LIFECYCLE
 *   status='projected', is_projected=true  → forecast, not shown in list view
 *   status='upcoming',  is_projected=false → next actionable, shown in list view
 *   When projected is promoted to upcoming: due window is expanded from the
 *   stored interval_anchor_date using the task's min/max interval.
 */

import { addDays, format, parseISO, isAfter, isBefore } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import type { Task, Instance, InstanceStatus } from '@/types';

function isTwiceDaily(task: Pick<Task, 'frequency_type'>): boolean {
  return task.frequency_type === 'twice_daily';
}

// Lazy singleton — not evaluated at module import time.
let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) _client = createClient();
  return _client;
}

// --- Date helpers ------------------------------------------------------------

export function today(): Date {
  return new Date(new Date().toDateString()); // strips time component
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// --- Status derivation -------------------------------------------------------

/**
 * Derives the display status for an instance based on current date.
 * completed / skipped / snoozed / projected are taken from the stored column;
 * upcoming vs due is always recalculated from dates.
 */
export function deriveStatus(instance: Instance): InstanceStatus {
  if (
    instance.status === 'completed' ||
    instance.status === 'skipped' ||
    instance.status === 'projected'
  ) {
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

// --- Window calculation ------------------------------------------------------

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
 */
export function calculateCountdownWindows(
  task: Pick<Task, 'target_date' | 'days_before_target' | 'interval_min_days' | 'interval_max_days'>
): Array<{ due_date_start: string; due_date_end: string }> {
  if (!task.target_date) return [];

  const target           = parseISO(task.target_date);
  const daysBeforeTarget = task.days_before_target ?? 7;
  const spread           = task.interval_max_days - task.interval_min_days;
  const t                = today();
  const windows: Array<{ due_date_start: string; due_date_end: string }> = [];
  let n = 0;

  while (true) {
    const dueEnd   = addDays(target, -(daysBeforeTarget + n * task.interval_min_days));
    const dueStart = addDays(dueEnd, -spread);

    if (isBefore(dueEnd, t)) break;
    if (n >= 200) break;

    windows.push({
      due_date_start: toISODate(dueStart),
      due_date_end:   toISODate(dueEnd),
    });

    n++;
  }

  return windows.reverse(); // chronological (earliest first)
}

// --- Instance creation -------------------------------------------------------

/**
 * Creates the first instance(s) for a newly created STANDARD task, then
 * pre-generates 6 months of projected instances beyond it.
 * For twice_daily tasks, creates slot A + slot B on the anchor date.
 */
export async function createFirstInstance(task: Task): Promise<Instance | null> {
  if (isTwiceDaily(task)) {
    return createFirstTwiceDailyInstances(task);
  }

  const anchor = task.initial_anchor_date
    ? parseISO(task.initial_anchor_date)
    : today();

  const window = calculateNextWindow(anchor, task);

  const { data, error } = await db()
    .from('instances')
    .insert({
      task_id:              task.id,
      user_id:              task.user_id,
      due_date_start:       window.due_date_start,
      due_date_end:         window.due_date_end,
      interval_anchor_date: toISODate(anchor),
      status:               'upcoming',
      is_projected:         false,
      scheduled_time:       task.scheduled_time ?? null,
      time_of_day_label:    task.time_of_day_label ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error('createFirstInstance error:', error);
    return null;
  }

  await generateProjectedInstances(task, parseISO(data.due_date_end));

  return data;
}

/**
 * Generates ALL instances for a COUNTDOWN task at creation time.
 * Also called to regenerate after a completion.
 */
export async function generateCountdownInstances(task: Task): Promise<Instance[] | null> {
  const windows = calculateCountdownWindows(task);

  if (windows.length === 0) return [];

  const inserts = windows.map(w => ({
    task_id:              task.id,
    user_id:              task.user_id,
    due_date_start:       w.due_date_start,
    due_date_end:         w.due_date_end,
    interval_anchor_date: null,
    status:               'upcoming' as InstanceStatus,
    is_projected:         false,
  }));

  const { data, error } = await db().from('instances').insert(inserts).select();

  if (error) {
    console.error('generateCountdownInstances error:', error);
    return null;
  }
  return data;
}

// --- Instance actions --------------------------------------------------------

/**
 * Marks an instance as completed and rebuilds the forward schedule.
 *
 * Standard mode:
 *   Deletes all projected instances for this task, then regenerates them
 *   anchored to actualDate (or override_next_date if set). Promotes the
 *   first projected instance to upcoming. This shifts the entire forward
 *   schedule when completed earlier or later than the midpoint date.
 *
 * Countdown mode:
 *   Deletes remaining upcoming/snoozed instances, then either regenerates
 *   them backward from target (if target hasn't passed), creates a forward-
 *   scheduled instance (target passed + continue), or deactivates the task.
 */
export async function completeInstance(
  instanceId: string,
  task: Task,
  actualDate: Date = today(),
  cost?: number | null
): Promise<{ updated: Instance | null; next: Instance | null }> {
  const updatePayload: Record<string, unknown> = {
    status:                 'completed',
    actual_completion_date: toISODate(actualDate),
    // Store the calendar sync fields so Phase 6 can create the event
    // from the actual date and cost rather than the scheduled window.
    calendar_event_date: toISODate(actualDate),
    calendar_event_cost: cost !== undefined ? cost : null,
  };
  if (cost !== undefined) updatePayload.cost = cost;

  const { data: updated, error: updateErr } = await db()
    .from('instances')
    .update(updatePayload)
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

  if (isTwiceDaily(task) && updated) {
    const next = await handleTwiceDailySlotDone(task, updated);
    return { updated, next };
  }

  // If the completed instance had override_next_date set, use that as the
  // scheduling anchor so the next instance starts from the user's chosen date.
  const anchor = updated?.override_next_date
    ? parseISO(updated.override_next_date)
    : actualDate;

  // Wipe old projections, regenerate from new anchor, then promote the first.
  await generateProjectedInstances(task, anchor);
  const next = await promoteNextProjected(task);

  return { updated, next };
}

/**
 * Marks an instance as skipped.
 *
 * Standard mode:
 *   Does NOT regenerate projections — the schedule stays anchored to the
 *   last completion date. Simply promotes the next projected instance to
 *   upcoming, so the list view shows the next date unchanged.
 *
 * Countdown mode:
 *   Marks as skipped; the pre-generated upcoming instances already handle
 *   the schedule, so no promotion is needed.
 */
export async function skipInstance(
  instanceId: string,
  task: Task
): Promise<{ updated: Instance | null; next: Instance | null }> {
  const { data: updated, error } = await db()
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

  if (isTwiceDaily(task) && updated) {
    const next = await handleTwiceDailySlotDone(task, updated);
    return { updated, next };
  }

  // Promote the next projected to upcoming. If no projections exist (old data
  // created before projections were introduced), fall back to creating one.
  let next = await promoteNextProjected(task);
  if (!next) {
    next = await createNextInstance(task, today());
  }

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

  const { data, error } = await db()
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

// --- Event override ----------------------------------------------------------

/**
 * Adjusts a specific instance to align with a one-time event.
 */
export async function createEventOverride(
  instanceId: string,
  eventName: string,
  eventDate: string,
  daysBefore: number,
  overrideNextDate?: string
): Promise<Instance | null> {
  const adjustedDate = toISODate(addDays(parseISO(eventDate), -daysBefore));

  const { data, error } = await db()
    .from('instances')
    .update({
      due_date_start:     adjustedDate,
      due_date_end:       adjustedDate,
      is_event_override:  true,
      event_name:         eventName,
      event_date:         eventDate,
      days_before_event:  daysBefore,
      override_next_date: overrideNextDate ?? null,
    })
    .eq('id', instanceId)
    .select()
    .single();

  if (error) {
    console.error('createEventOverride error:', error);
    return null;
  }
  return data;
}

// --- Delete operations -------------------------------------------------------

/**
 * Deletes a single instance. For standard tasks, promotes the next projected
 * to upcoming (or creates one if no projections exist). Countdown tasks
 * already have pre-generated instances.
 */
export async function deleteInstance(
  instanceId: string,
  task: Task
): Promise<{ next: Instance | null }> {
  const { error } = await db()
    .from('instances')
    .delete()
    .eq('id', instanceId);

  if (error) {
    console.error('deleteInstance error:', error);
    return { next: null };
  }

  if (task.mode === 'countdown') {
    return { next: null };
  }

  let next = await promoteNextProjected(task);
  if (!next) {
    next = await createNextInstance(task, today());
  }
  return { next };
}

/**
 * Hard-deletes a task and all its instances (including projected ones).
 */
export async function deleteTask(taskId: string): Promise<boolean> {
  await db().from('instances').delete().eq('task_id', taskId);
  await db().from('task_products').delete().eq('task_id', taskId);
  const { error } = await db().from('tasks').delete().eq('id', taskId);
  if (error) {
    console.error('deleteTask error:', error);
    return false;
  }
  return true;
}

// --- Internal helpers --------------------------------------------------------

/**
 * Returns the midpoint of the task's interval range (rounded).
 * Used as the projection cadence for standard-mode tasks.
 */
function midpointDays(task: Pick<Task, 'interval_min_days' | 'interval_max_days'>): number {
  return Math.round((task.interval_min_days + task.interval_max_days) / 2);
}

/**
 * Deletes all existing projected instances for a task, then inserts new ones
 * using the midpoint interval as the cadence.
 *
 * Projections are at: anchorDate + n*midpoint (n = 1, 2, ..., up to 6 months).
 * Each projection stores interval_anchor_date = anchorDate + (n-1)*midpoint so
 * that when promoted, calculateNextWindow(interval_anchor_date, task) produces
 * the correct min/max due window.
 */
export async function generateProjectedInstances(task: Task, anchorDate: Date): Promise<void> {
  if (isTwiceDaily(task)) {
    await generateTwiceDailyProjections(task, anchorDate);
    return;
  }
  if (task.mode !== 'standard') return;

  // Wipe stale projections before rebuilding.
  await db()
    .from('instances')
    .delete()
    .eq('task_id', task.id)
    .eq('is_projected', true);

  const midpoint = midpointDays(task);
  const cutoff   = addDays(today(), 182); // ~6 months
  const inserts: Record<string, unknown>[] = [];

  for (let n = 1; n <= 100; n++) {
    const projDate = addDays(anchorDate, n * midpoint);
    if (isAfter(projDate, cutoff)) break;

    inserts.push({
      task_id:              task.id,
      user_id:              task.user_id,
      due_date_start:       toISODate(projDate),
      due_date_end:         toISODate(projDate),
      // Anchor = expected completion of the previous instance in this projection chain.
      // Used by promoteNextProjected to expand the single date to a proper window.
      interval_anchor_date: toISODate(addDays(anchorDate, (n - 1) * midpoint)),
      status:               'projected' as InstanceStatus,
      is_projected:         true,
    });
  }

  if (inserts.length > 0) {
    const { error } = await db().from('instances').insert(inserts);
    if (error) console.error('generateProjectedInstances error:', error);
  }
}

/**
 * Finds the earliest projected instance for a task and promotes it to
 * 'upcoming' with a full due window calculated from its stored anchor.
 * Returns the promoted instance, or null if no projected instances exist.
 */
async function promoteNextProjected(task: Task): Promise<Instance | null> {
  const { data: proj } = await db()
    .from('instances')
    .select('id, interval_anchor_date, due_date_start')
    .eq('task_id', task.id)
    .eq('is_projected', true)
    .order('due_date_start', { ascending: true })
    .limit(1)
    .single();

  if (!proj) return null;

  // Reconstruct the due window from the stored anchor date.
  const anchor = proj.interval_anchor_date
    ? parseISO(proj.interval_anchor_date)
    : addDays(parseISO(proj.due_date_start), -midpointDays(task));
  const window = calculateNextWindow(anchor, task);

  const { data, error } = await db()
    .from('instances')
    .update({
      status:         'upcoming',
      is_projected:   false,
      due_date_start: window.due_date_start,
      due_date_end:   window.due_date_end,
    })
    .eq('id', proj.id)
    .select()
    .single();

  if (error) {
    console.error('promoteNextProjected error:', error);
    return null;
  }
  return data;
}

/**
 * Inserts the next instance for a standard-mode task.
 * Used as a fallback for tasks created before projections were introduced.
 * Guards against creating a duplicate when an upcoming instance already exists.
 */
async function createNextInstance(
  task: Task,
  anchorDate: Date
): Promise<Instance | null> {
  const { data: existing } = await db()
    .from('instances')
    .select('id')
    .eq('task_id', task.id)
    .in('status', ['upcoming', 'snoozed'])
    .eq('is_projected', false)
    .limit(1);

  if (existing && existing.length > 0) {
    console.warn('createNextInstance: upcoming instance already exists, skipping');
    return null;
  }

  const window = calculateNextWindow(anchorDate, task);

  const { data, error } = await db()
    .from('instances')
    .insert({
      task_id:              task.id,
      user_id:              task.user_id,
      due_date_start:       window.due_date_start,
      due_date_end:         window.due_date_end,
      interval_anchor_date: toISODate(anchorDate),
      status:               'upcoming',
      is_projected:         false,
    })
    .select()
    .single();

  if (error) {
    console.error('createNextInstance error:', error);
    return null;
  }
  return data;
}

// ─── Twice-daily helpers ──────────────────────────────────────────────────────

/**
 * Creates slot A + slot B instances for the anchor date and seeds 6 months of
 * projected pairs beyond it.
 */
async function createFirstTwiceDailyInstances(task: Task): Promise<Instance | null> {
  const anchor = task.initial_anchor_date ? parseISO(task.initial_anchor_date) : today();
  const dateStr = toISODate(anchor);

  const { data, error } = await db()
    .from('instances')
    .insert([
      {
        task_id:           task.id,
        user_id:           task.user_id,
        due_date_start:    dateStr,
        due_date_end:      dateStr,
        interval_anchor_date: dateStr,
        status:            'upcoming' as InstanceStatus,
        is_projected:      false,
        slot:              'a',
        time_of_day_label: task.slot_a_label ?? 'Morning',
        scheduled_time:    task.slot_a_time  ?? null,
      },
      {
        task_id:           task.id,
        user_id:           task.user_id,
        due_date_start:    dateStr,
        due_date_end:      dateStr,
        interval_anchor_date: dateStr,
        status:            'upcoming' as InstanceStatus,
        is_projected:      false,
        slot:              'b',
        time_of_day_label: task.slot_b_label ?? 'Evening',
        scheduled_time:    task.slot_b_time  ?? null,
      },
    ])
    .select();

  if (error) {
    console.error('createFirstTwiceDailyInstances error:', error);
    return null;
  }

  await generateTwiceDailyProjections(task, anchor);
  return data?.[0] ?? null;
}

/**
 * Rebuilds all projected instances for a twice_daily task starting the day
 * after anchorDate, covering 6 months.
 */
async function generateTwiceDailyProjections(task: Task, anchorDate: Date): Promise<void> {
  await db().from('instances').delete().eq('task_id', task.id).eq('is_projected', true);

  const cutoff = addDays(today(), 182);
  const inserts: Record<string, unknown>[] = [];

  for (let n = 1; n <= 182; n++) {
    const day = addDays(anchorDate, n);
    if (isAfter(day, cutoff)) break;
    const dateStr = toISODate(day);

    inserts.push(
      {
        task_id:           task.id,
        user_id:           task.user_id,
        due_date_start:    dateStr,
        due_date_end:      dateStr,
        interval_anchor_date: toISODate(anchorDate),
        status:            'projected' as InstanceStatus,
        is_projected:      true,
        slot:              'a',
        time_of_day_label: task.slot_a_label ?? 'Morning',
        scheduled_time:    task.slot_a_time  ?? null,
      },
      {
        task_id:           task.id,
        user_id:           task.user_id,
        due_date_start:    dateStr,
        due_date_end:      dateStr,
        interval_anchor_date: toISODate(anchorDate),
        status:            'projected' as InstanceStatus,
        is_projected:      true,
        slot:              'b',
        time_of_day_label: task.slot_b_label ?? 'Evening',
        scheduled_time:    task.slot_b_time  ?? null,
      },
    );
  }

  // Batch in chunks of 500 to stay within PostgREST limits
  for (let i = 0; i < inserts.length; i += 500) {
    const { error } = await db().from('instances').insert(inserts.slice(i, i + 500));
    if (error) console.error('generateTwiceDailyProjections error:', error);
  }
}

/**
 * After one slot of a twice_daily pair is completed/skipped, checks whether
 * the paired slot is also done. If so, promotes the next projected pair to
 * upcoming. Returns the first promoted instance, or null if nothing to promote.
 */
async function handleTwiceDailySlotDone(
  task: Task,
  instance: Instance
): Promise<Instance | null> {
  const pairedSlot = instance.slot === 'a' ? 'b' : 'a';

  const { data: paired } = await db()
    .from('instances')
    .select('id, status')
    .eq('task_id', task.id)
    .eq('due_date_start', instance.due_date_start)
    .eq('slot', pairedSlot)
    .not('is_projected', 'eq', true)
    .limit(1)
    .single();

  const pairedDone =
    paired?.status === 'completed' || paired?.status === 'skipped';

  if (!pairedDone) return null;

  return promoteTwiceDailyPair(task);
}

/**
 * Promotes the earliest projected twice_daily pair (both slots for the same
 * date) to 'upcoming'. Regenerates projections if the pool is exhausted.
 */
async function promoteTwiceDailyPair(task: Task): Promise<Instance | null> {
  const { data: projections } = await db()
    .from('instances')
    .select('id, due_date_start, slot')
    .eq('task_id', task.id)
    .eq('is_projected', true)
    .order('due_date_start', { ascending: true })
    .limit(10);

  if (!projections?.length) {
    // Pool exhausted — rebuild from today and try again
    await generateTwiceDailyProjections(task, today());
    const { data: fresh } = await db()
      .from('instances')
      .select('id, due_date_start')
      .eq('task_id', task.id)
      .eq('is_projected', true)
      .order('due_date_start', { ascending: true })
      .limit(2);
    if (!fresh?.length) return null;
    const firstDate = fresh[0].due_date_start;
    const ids = fresh.filter(p => p.due_date_start === firstDate).map(p => p.id);
    const { data } = await db()
      .from('instances')
      .update({ status: 'upcoming', is_projected: false })
      .in('id', ids)
      .select();
    return data?.[0] ?? null;
  }

  const firstDate = projections[0].due_date_start;
  const ids = projections.filter(p => p.due_date_start === firstDate).map(p => p.id);

  const { data, error } = await db()
    .from('instances')
    .update({ status: 'upcoming', is_projected: false })
    .in('id', ids)
    .select();

  if (error) {
    console.error('promoteTwiceDailyPair error:', error);
    return null;
  }
  return data?.[0] ?? null;
}

/**
 * Post-completion logic for countdown tasks.
 */
async function handlePostCompleteCountdown(
  task: Task
): Promise<{ updated: Instance | null; next: Instance | null }> {
  await db()
    .from('instances')
    .delete()
    .eq('task_id', task.id)
    .in('status', ['upcoming', 'snoozed']);

  if (!task.target_date) return { updated: null, next: null };

  const target = parseISO(task.target_date);
  const t = today();

  if (isAfter(t, target)) {
    if (task.continue_after_target) {
      const next = await createNextInstance({ ...task, mode: 'standard' }, target);
      return { updated: null, next };
    } else {
      await db().from('tasks').update({ is_active: false }).eq('id', task.id);
      return { updated: null, next: null };
    }
  }

  await generateCountdownInstances(task);
  return { updated: null, next: null };
}
