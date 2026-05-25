/**
 * Conflict Resolution Engine
 *
 * Applies a user-chosen resolution to a pending routine_conflict.
 * Called from the ConflictModal after the user picks an option.
 *
 * After applying, re-runs conflict detection for the affected pair
 * to catch any secondary overlaps the resolution may have created.
 */

import { addDays, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { today, toISODate, calculateNextWindow } from '@/lib/instanceEngine';
import { detectPairConflicts } from '@/lib/conflictDetection';
import type { RoutineConflict, ConflictResolution, DelayTarget, Task } from '@/types';

let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) _client = createClient();
  return _client;
}

// ─── Resolution options ───────────────────────────────────────────────────────

/**
 * Do Both — keeps both instances on their current dates. Marks the conflict
 * resolved without changing any instance.
 */
export async function resolveDoingBoth(conflict: RoutineConflict): Promise<void> {
  await markResolved(conflict.id, 'do_both', {});
}

/**
 * Reset — one task's schedule "wins" and both tasks' next projections are
 * recalculated from the winning instance's anchor date.
 *
 * @param winnerInstanceId - which instance's due_date_start becomes the anchor
 */
export async function resolveWithReset(
  conflict: RoutineConflict,
  winnerInstanceId: string
): Promise<void> {
  const loserInstanceId =
    winnerInstanceId === conflict.instance_a_id
      ? conflict.instance_b_id
      : conflict.instance_a_id;

  // Fetch winner instance to get its anchor
  const { data: winner } = await db()
    .from('instances')
    .select('due_date_start, task_id')
    .eq('id', winnerInstanceId)
    .single();

  if (!winner) return;

  const anchor    = parseISO(winner.due_date_start);
  const winnerTaskId = winner.task_id;

  // Fetch loser instance
  const { data: loser } = await db()
    .from('instances')
    .select('task_id')
    .eq('id', loserInstanceId)
    .single();

  if (!loser) return;

  // Fetch both tasks (needed to regenerate windows)
  const { data: tasksData } = await db()
    .from('tasks')
    .select('*')
    .in('id', [winnerTaskId, loser.task_id]);

  if (!tasksData?.length) return;

  const winnerTask = tasksData.find(t => t.id === winnerTaskId) as Task;
  const loserTask  = tasksData.find(t => t.id === loser.task_id) as Task;

  // Rebuild the loser task's next projected window from the winner's anchor.
  // Delete all projected instances for the loser and create a new upcoming one.
  await db()
    .from('instances')
    .delete()
    .eq('task_id', loserTask.id)
    .eq('is_projected', true);

  const newWindow = calculateNextWindow(anchor, loserTask);

  await db().from('instances').update({
    due_date_start: newWindow.due_date_start,
    due_date_end:   newWindow.due_date_end,
    interval_anchor_date: toISODate(anchor),
  }).eq('id', loserInstanceId);

  await markResolved(conflict.id, 'reset', {});

  // Re-detect conflicts for this pair after the change
  await redetectAfterResolution(conflict);
}

/**
 * Delay — push one instance by a given number of days. The delayed task's
 * projections are recalculated from the new date.
 *
 * @param delayTarget - 'a' to push instance_a, 'b' to push instance_b
 * @param days        - how many days to push
 */
export async function resolveWithDelay(
  conflict: RoutineConflict,
  delayTarget: DelayTarget,
  days: number
): Promise<void> {
  const targetInstanceId =
    delayTarget === 'a' ? conflict.instance_a_id : conflict.instance_b_id;

  const { data: inst } = await db()
    .from('instances')
    .select('due_date_start, due_date_end')
    .eq('id', targetInstanceId)
    .single();

  if (!inst) return;

  const newStart = toISODate(addDays(parseISO(inst.due_date_start), days));
  const newEnd   = toISODate(addDays(parseISO(inst.due_date_end),   days));

  await db()
    .from('instances')
    .update({ due_date_start: newStart, due_date_end: newEnd })
    .eq('id', targetInstanceId);

  await markResolved(conflict.id, 'delay', {
    resolved_by_delay_days: days,
    resolved_delay_target:  delayTarget,
  });

  await redetectAfterResolution(conflict);
}

/**
 * Save a pair's default resolution for future conflicts.
 */
export async function savePairDefault(
  pairId: string,
  resolution: ConflictResolution,
  delayDays?: number,
  delayTarget?: DelayTarget
): Promise<void> {
  await db()
    .from('routine_task_pairs')
    .update({
      default_resolution: resolution,
      default_delay_days: delayDays ?? null,
      delay_target:       delayTarget ?? null,
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
