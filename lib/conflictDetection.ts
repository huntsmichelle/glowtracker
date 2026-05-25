/**
 * Conflict Detection Engine
 *
 * Scans all task pairs within a routine for window overlaps
 * (two instances from different tasks whose due windows intersect).
 *
 * Window overlap: start_a <= end_b AND start_b <= end_a
 *
 * When an overlap is found, applies the pair's default_resolution:
 *   'ask'     → creates a pending routine_conflicts row (user resolves manually)
 *   'do_both' → auto-resolves, logs as resolved (no instance changes)
 *   'delay'   → auto-applies the delay, logs as resolved
 *   'reset'   → treated as 'ask' (needs user to choose which task wins)
 *
 * Call detectRoutineConflicts() after any event that changes instance dates:
 *   - task added to routine
 *   - instance completed (projections regenerated)
 *   - instance rescheduled (snooze / event override)
 *   - projected instance promoted to upcoming
 */

import { format, addDays, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { today, toISODate } from '@/lib/instanceEngine';
import type { RoutineTaskPair } from '@/types';

let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) _client = createClient();
  return _client;
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Detect (and optionally auto-resolve) conflicts for every task pair
 * in a routine. Safe to call repeatedly — deduplicates against existing rows.
 */
export async function detectRoutineConflicts(routineId: string): Promise<void> {
  const [{ data: routine }, { data: pairs }] = await Promise.all([
    db().from('routines').select('user_id').eq('id', routineId).single(),
    db().from('routine_task_pairs').select('*').eq('routine_id', routineId),
  ]);

  if (!routine || !pairs?.length) return;

  const todayStr       = toISODate(today());
  const sixMonthsOut   = toISODate(addDays(today(), 182));

  for (const pair of pairs as RoutineTaskPair[]) {
    await detectPairConflicts(pair, routineId, routine.user_id, todayStr, sixMonthsOut);
  }
}

/**
 * Detect conflicts for a specific task pair only.
 * Useful after resolving a conflict to check if the resolution created new ones.
 */
export async function detectPairConflicts(
  pair: RoutineTaskPair,
  routineId: string,
  userId: string,
  fromDate: string,
  toDate: string
): Promise<void> {
  const [{ data: instancesA }, { data: instancesB }] = await Promise.all([
    db()
      .from('instances')
      .select('id, due_date_start, due_date_end, task_id')
      .eq('task_id', pair.task_a_id)
      .not('status', 'in', '(completed,skipped)')
      .gte('due_date_start', fromDate)
      .lte('due_date_start', toDate),
    db()
      .from('instances')
      .select('id, due_date_start, due_date_end, task_id')
      .eq('task_id', pair.task_b_id)
      .not('status', 'in', '(completed,skipped)')
      .gte('due_date_start', fromDate)
      .lte('due_date_start', toDate),
  ]);

  if (!instancesA?.length || !instancesB?.length) return;

  for (const a of instancesA) {
    for (const b of instancesB) {
      // Standard interval-overlap test
      if (a.due_date_start > b.due_date_end || b.due_date_start > a.due_date_end) continue;

      // The conflict date is the start of the overlap period
      const conflictDate = a.due_date_start >= b.due_date_start
        ? a.due_date_start
        : b.due_date_start;

      // Deduplicate — skip if this exact pair of instances is already recorded
      const { data: existing } = await db()
        .from('routine_conflicts')
        .select('id')
        .eq('pair_id', pair.id)
        .eq('instance_a_id', a.id)
        .eq('instance_b_id', b.id)
        .limit(1);

      if (existing?.length) continue;

      const base = {
        routine_id:     routineId,
        user_id:        userId,
        pair_id:        pair.id,
        instance_a_id:  a.id,
        instance_b_id:  b.id,
        conflict_date:  conflictDate,
      };

      // 'reset' requires user to pick a winner → treat as 'ask'
      if (pair.default_resolution === 'ask' || pair.default_resolution === 'reset') {
        await db().from('routine_conflicts').insert({ ...base, status: 'pending' });
      } else if (pair.default_resolution === 'do_both') {
        // No instance changes needed; log as auto-resolved
        await db().from('routine_conflicts').insert({
          ...base,
          status:      'resolved',
          resolution:  'do_both',
          resolved_at: new Date().toISOString(),
        });
      } else if (pair.default_resolution === 'delay') {
        const delayDays   = pair.default_delay_days ?? 7;
        const delayTarget = pair.delay_target ?? 'b';
        const targetInst  = delayTarget === 'a' ? a : b;

        // Push the target instance's window forward
        const newStart = toISODate(addDays(parseISO(targetInst.due_date_start), delayDays));
        const newEnd   = toISODate(addDays(parseISO(targetInst.due_date_end),   delayDays));

        await db()
          .from('instances')
          .update({ due_date_start: newStart, due_date_end: newEnd })
          .eq('id', targetInst.id);

        await db().from('routine_conflicts').insert({
          ...base,
          status:                  'resolved',
          resolution:              'delay',
          resolved_at:             new Date().toISOString(),
          resolved_by_delay_days:  delayDays,
          resolved_delay_target:   delayTarget,
        });
      }
    }
  }
}

// ─── Helpers used by conflictResolution.ts ────────────────────────────────────

/** Fetch pending conflicts for a routine (for the conflict panel UI). */
export async function fetchPendingConflicts(routineId: string) {
  const { data } = await db()
    .from('routine_conflicts')
    .select(`
      *,
      pair:routine_task_pairs (
        *,
        task_a:tasks (id, name),
        task_b:tasks (id, name)
      ),
      instance_a:instances (id, due_date_start, due_date_end, status),
      instance_b:instances (id, due_date_start, due_date_end, status)
    `)
    .eq('routine_id', routineId)
    .eq('status', 'pending')
    .order('conflict_date', { ascending: true });

  return data ?? [];
}
