/**
 * Conflict Detection Engine
 *
 * Scans all task pairs within a routine for window overlaps
 * (two instances from different tasks whose due windows intersect).
 *
 * Window overlap: start_a <= end_b AND start_b <= end_a
 *
 * When an overlap is found, applies the pair's default_resolution:
 *   'ask'        → creates a pending routine_conflicts row (user resolves manually)
 *   'no_conflict' → auto-resolves, logs as resolved (no instance changes)
 *   'auto_adjust' → auto-applies the adjustment, logs as resolved
 *   'skip_one'    → treated as 'ask' (requires user to choose which task skips)
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
    db().from('routines').select('user_id, conflict_intent').eq('id', routineId).single(),
    db().from('routine_task_pairs').select('*').eq('routine_id', routineId),
  ]);

  if (!routine || !pairs?.length) return;

  const isIndependent = routine.conflict_intent === 'independent';

  const todayStr       = toISODate(today());
  const sixMonthsOut   = toISODate(addDays(today(), 182));

  for (const pair of pairs as RoutineTaskPair[]) {
    await detectPairConflicts(pair, routineId, routine.user_id, todayStr, sixMonthsOut, isIndependent);
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
  toDate: string,
  forceResolved = false
): Promise<void> {
  const [{ data: instancesA }, { data: instancesB }] = await Promise.all([
    db()
      .from('instances')
      .select('id, due_date_start, due_date_end, task_id')
      .eq('task_id', pair.task_a_id)
      .not('status', 'in', '(completed,skipped)')
      .gte('due_date_end', fromDate)
      .lte('due_date_start', toDate),
    db()
      .from('instances')
      .select('id, due_date_start, due_date_end, task_id')
      .eq('task_id', pair.task_b_id)
      .not('status', 'in', '(completed,skipped)')
      .gte('due_date_end', fromDate)
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

      // Deduplicate: one pending conflict per (pair, date).
      // Only blocks insertion when a pending row already exists — resolved
      // rows don't prevent a new pending record if the conflict reappears.
      const { data: existing } = await db()
        .from('routine_conflicts')
        .select('id')
        .eq('pair_id', pair.id)
        .eq('conflict_date', conflictDate)
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) continue;

      const base = {
        routine_id:     routineId,
        user_id:        userId,
        pair_id:        pair.id,
        instance_a_id:  a.id,
        instance_b_id:  b.id,
        conflict_date:  conflictDate,
      };

      // Routine marked independent — log as resolved without user action
      if (forceResolved) {
        await db().from('routine_conflicts').insert({
          ...base,
          status:      'resolved',
          resolution:  'no_conflict',
          resolved_at: new Date().toISOString(),
        });
        continue;
      }

      // 'skip_one' requires user to choose which task skips → treat as 'ask'
      if (pair.default_resolution === 'ask' || pair.default_resolution === 'skip_one') {
        await db().from('routine_conflicts').insert({ ...base, status: 'pending' });
      } else if (pair.default_resolution === 'no_conflict') {
        // No instance changes needed; log as auto-resolved
        await db().from('routine_conflicts').insert({
          ...base,
          status:      'resolved',
          resolution:  'no_conflict',
          resolved_at: new Date().toISOString(),
        });
      } else if (pair.default_resolution === 'auto_adjust') {
        const adjustDays  = pair.default_delay_days ?? 7;
        const adjustTarget = pair.delay_target ?? 'b';
        const direction   = pair.adjust_direction ?? 'forward';
        const targetInst  = adjustTarget === 'a' ? a : b;

        const multiplier = direction === 'forward' ? 1 : -1;
        const newStart = toISODate(addDays(parseISO(targetInst.due_date_start), adjustDays * multiplier));
        const newEnd   = toISODate(addDays(parseISO(targetInst.due_date_end),   adjustDays * multiplier));

        await db()
          .from('instances')
          .update({ due_date_start: newStart, due_date_end: newEnd })
          .eq('id', targetInst.id);

        await db().from('routine_conflicts').insert({
          ...base,
          status:                  'resolved',
          resolution:              'auto_adjust',
          resolved_at:             new Date().toISOString(),
          resolved_by_delay_days:  adjustDays,
          resolved_delay_target:   adjustTarget,
          adjust_direction:        direction,
          adjust_snap_back:        pair.adjust_snap_back ?? false,
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
