/**
 * Conflict Resolution Engine
 *
 * Applies a user-chosen resolution to a pending routine_conflict.
 * Called from ConflictModal after the user picks an option.
 *
 * Resolution types:
 *   no_conflict  — both tasks stay as scheduled, no changes
 *   ask          — conflict is dismissed; future conflicts will re-prompt
 *   skip_one     — chosen task's instance is skipped; both tasks reanchor from conflict date
 *   auto_adjust  — chosen task's instance is shifted forward/back by N days;
 *                  optionally snaps back to original rhythm after the adjustment
 */

import { addDays, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { today, toISODate, calculateNextWindow, generateProjectedInstances } from '@/lib/instanceEngine';
import { detectPairConflicts } from '@/lib/conflictDetection';
import type {
  RoutineConflict, ConflictResolution,
  DelayTarget, AdjustDirection, SkipTarget, NoConflictOrder, Task,
} from '@/types';

let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) _client = createClient();
  return _client;
}

// ─── Resolution options ───────────────────────────────────────────────────────

/**
 * No Conflict — both tasks stay on the conflict date.
 * Neither task's cadence changes; no instance modifications.
 */
export async function resolveNoConflict(conflict: RoutineConflict): Promise<void> {
  await markResolved(conflict.id, 'no_conflict', {});
}

/**
 * Ask — dismiss this conflict record without changing anything.
 * Future conflicts for this pair will create new pending records (ask again).
 */
export async function resolveAsAsked(conflict: RoutineConflict): Promise<void> {
  await markResolved(conflict.id, 'ask', {});
}

/**
 * Skip One — the chosen task's instance is skipped (status='skipped').
 * Both tasks then reanchor their cadence to the conflict date and
 * regenerate projected instances forward from there.
 */
export async function resolveSkipOne(
  conflict: RoutineConflict,
  skipTarget: SkipTarget
): Promise<void> {
  const skipInstanceId = skipTarget === 'a' ? conflict.instance_a_id : conflict.instance_b_id;
  const keepInstanceId = skipTarget === 'a' ? conflict.instance_b_id : conflict.instance_a_id;

  const [{ data: skipInst }, { data: keepInst }] = await Promise.all([
    db().from('instances').select('task_id, due_date_start, due_date_end').eq('id', skipInstanceId).single(),
    db().from('instances').select('task_id, due_date_start, due_date_end').eq('id', keepInstanceId).single(),
  ]);
  if (!skipInst || !keepInst) return;

  const { data: tasksData } = await db()
    .from('tasks').select('*')
    .in('id', [skipInst.task_id, keepInst.task_id]);
  if (!tasksData?.length) return;

  const skipTask = tasksData.find(t => t.id === skipInst.task_id) as Task;
  const keepTask = tasksData.find(t => t.id === keepInst.task_id) as Task;
  const anchor   = parseISO(conflict.conflict_date);

  // 1. Skip the chosen instance
  await db().from('instances').update({ status: 'skipped' }).eq('id', skipInstanceId);

  // 2. For skipped task: delete projections, create new upcoming from conflict_date
  await db().from('instances').delete().eq('task_id', skipTask.id).eq('is_projected', true);
  const skipNextWindow = calculateNextWindow(anchor, skipTask);
  await db().from('instances').insert({
    task_id:              skipTask.id,
    user_id:              conflict.user_id,
    due_date_start:       skipNextWindow.due_date_start,
    due_date_end:         skipNextWindow.due_date_end,
    interval_anchor_date: toISODate(anchor),
    status:               'upcoming',
    is_projected:         false,
  });
  await generateProjectedInstances(skipTask, parseISO(skipNextWindow.due_date_end));

  // 3. For kept task: update anchor, regenerate projections from its due window end
  await db().from('instances').update({ interval_anchor_date: toISODate(anchor) }).eq('id', keepInstanceId);
  await generateProjectedInstances(keepTask, parseISO(keepInst.due_date_end));

  await markResolved(conflict.id, 'skip_one', { skip_target: skipTarget });
  await redetectAfterResolution(conflict);
}

/**
 * Auto-Adjust — shift one task's instance forward or back by N days.
 *
 * snapBack = false (default): the moved date becomes the new anchor; cadence
 *   continues forward from there (projections regenerate from adjusted date).
 *
 * snapBack = true: one-time nudge. Projections continue from the original
 *   schedule by setting override_next_date to the original start, which
 *   completeInstance() uses as the anchor when regenerating projections.
 */
export async function resolveAutoAdjust(
  conflict: RoutineConflict,
  adjustTarget: DelayTarget,
  days: number,
  direction: AdjustDirection,
  snapBack: boolean
): Promise<void> {
  const targetInstanceId = adjustTarget === 'a' ? conflict.instance_a_id : conflict.instance_b_id;

  const { data: inst } = await db()
    .from('instances')
    .select('task_id, due_date_start, due_date_end')
    .eq('id', targetInstanceId)
    .single();
  if (!inst) return;

  const { data: task } = await db().from('tasks').select('*').eq('id', inst.task_id).single();
  if (!task) return;

  const originalStart = inst.due_date_start;
  const multiplier    = direction === 'forward' ? 1 : -1;
  const newStart = toISODate(addDays(parseISO(inst.due_date_start), days * multiplier));
  const newEnd   = toISODate(addDays(parseISO(inst.due_date_end),   days * multiplier));

  const updatePayload: Record<string, unknown> = { due_date_start: newStart, due_date_end: newEnd };
  if (snapBack) {
    // Store original start so it can be inspected later; set override_next_date so
    // completeInstance() anchors the next projections from the original schedule.
    updatePayload.original_scheduled_date = originalStart;
    updatePayload.override_next_date      = originalStart;
  }
  await db().from('instances').update(updatePayload).eq('id', targetInstanceId);

  if (!snapBack) {
    // Continue cadence from the adjusted date
    await generateProjectedInstances(task as Task, parseISO(newStart));
  }
  // snapBack=true: existing projections already reflect the original rhythm; no change needed.

  await markResolved(conflict.id, 'auto_adjust', {
    resolved_by_delay_days: days,
    resolved_delay_target:  adjustTarget,
    adjust_direction:       direction,
    adjust_snap_back:       snapBack,
  });

  await redetectAfterResolution(conflict);
}

/**
 * Save a pair's default resolution for future conflicts.
 */
export async function savePairDefault(
  pairId: string,
  resolution: ConflictResolution,
  opts?: {
    adjustDays?:        number;
    adjustTarget?:      DelayTarget;
    adjustDirection?:   AdjustDirection;
    adjustSnapBack?:    boolean;
    skipTarget?:        SkipTarget;
    noConflictOrder?:   NoConflictOrder;
    noConflictTimeA?:   string;
    noConflictTimeB?:   string;
  }
): Promise<void> {
  await db()
    .from('routine_task_pairs')
    .update({
      default_resolution:  resolution,
      default_delay_days:  resolution === 'auto_adjust' ? (opts?.adjustDays      ?? null) : null,
      delay_target:        resolution === 'auto_adjust' ? (opts?.adjustTarget    ?? null) : null,
      adjust_direction:    resolution === 'auto_adjust' ? (opts?.adjustDirection ?? null) : null,
      adjust_snap_back:    resolution === 'auto_adjust' ? (opts?.adjustSnapBack  ?? null) : null,
      skip_target:         resolution === 'skip_one'    ? (opts?.skipTarget      ?? null) : null,
      no_conflict_order:   resolution === 'no_conflict' ? (opts?.noConflictOrder ?? null) : null,
      no_conflict_time_a:  resolution === 'no_conflict' ? (opts?.noConflictTimeA ?? null) : null,
      no_conflict_time_b:  resolution === 'no_conflict' ? (opts?.noConflictTimeB ?? null) : null,
    })
    .eq('id', pairId);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function markResolved(
  conflictId: string,
  resolution: ConflictResolution,
  extra: Record<string, unknown>
): Promise<void> {
  await db()
    .from('routine_conflicts')
    .update({
      status:      'resolved',
      resolution,
      resolved_at: new Date().toISOString(),
      ...extra,
    })
    .eq('id', conflictId);
}

async function redetectAfterResolution(conflict: RoutineConflict): Promise<void> {
  const { data: pair } = await db()
    .from('routine_task_pairs')
    .select('*')
    .eq('id', conflict.pair_id)
    .single();

  if (!pair) return;

  const todayStr     = toISODate(today());
  const sixMonthsOut = toISODate(addDays(today(), 182));

  await detectPairConflicts(
    pair,
    conflict.routine_id,
    conflict.user_id,
    todayStr,
    sixMonthsOut
  );
}
