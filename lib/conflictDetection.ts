/**
 * Conflict Detection Engine
 *
 * Two detection passes per task pair:
 *   Pass 1 — Same-day: instances whose due windows overlap (existing behavior)
 *   Pass 2 — Proximity: instances whose start dates are within proximity_days of
 *             each other, with optional asymmetric direction (A before B)
 *
 * When a conflict is found the pair's resolution preference determines the status:
 *   'ask'/'skip_one'  → pending (user resolves manually)
 *   'no_conflict'     → resolved immediately (no instance changes)
 *   'auto_adjust'     → resolved immediately (instance moved automatically)
 *   proximity 'looks_good' / 'remind_closer' → resolved immediately
 *
 * Call detectRoutineConflicts() after any event that changes instance dates.
 */

import { addDays, parseISO, differenceInCalendarDays } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { today, toISODate } from '@/lib/instanceEngine';
import type { RoutineTaskPair } from '@/types';

let _client: ReturnType<typeof createClient> | null = null;
function db() {
  if (!_client) _client = createClient();
  return _client;
}

// ─── Public entry point ───────────────────────────────────────────────────────

export async function detectRoutineConflicts(routineId: string): Promise<void> {
  const [{ data: routine }, { data: pairs }] = await Promise.all([
    db().from('routines').select('user_id, conflict_intent').eq('id', routineId).single(),
    db().from('routine_task_pairs').select('*').eq('routine_id', routineId),
  ]);

  if (!routine || !pairs?.length) return;

  const isIndependent = routine.conflict_intent === 'independent';
  const todayStr     = toISODate(today());
  const sixMonthsOut = toISODate(addDays(today(), 182));

  for (const pair of pairs as RoutineTaskPair[]) {
    // always_together pairs are by design — no conflict detection needed
    if (pair.link_type === 'always_together') continue;
    await detectPairConflicts(pair, routineId, routine.user_id, todayStr, sixMonthsOut, isIndependent);
  }
}

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

  // ── Pass 1: same-day detection ─────────────────────────────────────────────
  for (const a of instancesA) {
    for (const b of instancesB) {
      if (a.due_date_start > b.due_date_end || b.due_date_start > a.due_date_end) continue;

      const conflictDate = a.due_date_start >= b.due_date_start
        ? a.due_date_start
        : b.due_date_start;

      const { data: existing } = await db()
        .from('routine_conflicts')
        .select('id')
        .eq('pair_id', pair.id)
        .eq('conflict_date', conflictDate)
        .eq('conflict_type', 'same_day')
        .eq('status', 'pending')
        .maybeSingle();

      if (existing) continue;

      const base = {
        routine_id:    routineId,
        user_id:       userId,
        pair_id:       pair.id,
        instance_a_id: a.id,
        instance_b_id: b.id,
        conflict_date: conflictDate,
        conflict_type: 'same_day',
      };

      if (forceResolved) {
        await db().from('routine_conflicts').insert({
          ...base, status: 'resolved', resolution: 'no_conflict', resolved_at: new Date().toISOString(),
        });
        continue;
      }

      if (pair.default_resolution === 'ask' || pair.default_resolution === 'skip_one') {
        await db().from('routine_conflicts').insert({ ...base, status: 'pending' });
      } else if (pair.default_resolution === 'no_conflict') {
        await db().from('routine_conflicts').insert({
          ...base, status: 'resolved', resolution: 'no_conflict', resolved_at: new Date().toISOString(),
        });
      } else if (pair.default_resolution === 'auto_adjust') {
        await applyAutoAdjust(base, pair, a, b);
      } else if ((pair.default_resolution as string) === 'replace') {
        const skipInstanceId = (pair as unknown as { skip_target?: string }).skip_target === 'b' ? b.id : a.id;
        await db().from('instances').update({ status: 'skipped' }).eq('id', skipInstanceId);
        await db().from('routine_conflicts').insert({
          ...base, status: 'resolved', resolution: 'replace', resolved_at: new Date().toISOString(),
          skip_target: (pair as unknown as { skip_target?: string }).skip_target ?? 'b',
        });
      }
    }
  }

  // ── Pass 2: proximity detection ────────────────────────────────────────────
  if (!pair.proximity_enabled || !pair.proximity_days) return;

  const windowDays  = pair.proximity_days;
  const firstTask   = pair.proximity_first_task;
  const proxRes     = pair.proximity_resolution ?? 'ask';

  for (const a of instancesA) {
    for (const b of instancesB) {
      // daysApart = B.start - A.start; positive means B is later
      const daysApart = differenceInCalendarDays(parseISO(b.due_date_start), parseISO(a.due_date_start));

      // Skip same-day — handled by pass 1
      if (daysApart === 0) continue;

      // Asymmetric direction check
      let isViolation = false;
      if (firstTask === 'a') {
        // A must come before B by at least windowDays
        isViolation = daysApart < windowDays;
      } else if (firstTask === 'b') {
        // B must come before A by at least windowDays
        isViolation = daysApart > -windowDays;
      } else {
        // Symmetric — flag if too close in either direction
        isViolation = Math.abs(daysApart) < windowDays;
      }

      if (!isViolation) continue;

      // Use the earlier instance's start date as the conflict anchor
      const conflictDate = daysApart >= 0 ? a.due_date_start : b.due_date_start;
      const absDaysApart = Math.abs(daysApart);

      const { data: existing } = await db()
        .from('routine_conflicts')
        .select('id')
        .eq('pair_id', pair.id)
        .eq('instance_a_id', a.id)
        .eq('instance_b_id', b.id)
        .eq('conflict_type', 'proximity')
        .maybeSingle();

      if (existing) continue;

      const base = {
        routine_id:    routineId,
        user_id:       userId,
        pair_id:       pair.id,
        instance_a_id: a.id,
        instance_b_id: b.id,
        conflict_date: conflictDate,
        conflict_type: 'proximity',
        days_apart:    absDaysApart,
      };

      if (forceResolved || proxRes === 'looks_good') {
        await db().from('routine_conflicts').insert({
          ...base, status: 'resolved', resolution: proxRes === 'looks_good' ? 'looks_good' : 'no_conflict',
          resolved_at: new Date().toISOString(),
        });
      } else if (proxRes === 'remind_closer') {
        // Re-surface 7 days before the earlier task
        const remindAt = toISODate(addDays(parseISO(conflictDate), -7));
        await db().from('routine_conflicts').insert({
          ...base, status: 'resolved', resolution: 'remind_closer',
          resolved_at: new Date().toISOString(), remind_at: remindAt,
        });
      } else if (proxRes === 'auto_adjust') {
        await applyAutoAdjust({ ...base, conflict_type: 'proximity' }, pair, a, b);
      } else {
        // 'ask'
        await db().from('routine_conflicts').insert({ ...base, status: 'pending' });
      }
    }
  }
}

// ─── Shared helper ────────────────────────────────────────────────────────────

async function applyAutoAdjust(
  base: Record<string, unknown>,
  pair: RoutineTaskPair,
  a: { id: string; due_date_start: string; due_date_end: string },
  b: { id: string; due_date_start: string; due_date_end: string }
) {
  const adjustDays   = pair.default_delay_days ?? 7;
  const adjustTarget = pair.delay_target ?? 'b';
  const direction    = pair.adjust_direction ?? 'forward';
  const targetInst   = adjustTarget === 'a' ? a : b;
  const multiplier   = direction === 'forward' ? 1 : -1;

  const newStart = toISODate(addDays(parseISO(targetInst.due_date_start), adjustDays * multiplier));
  const newEnd   = toISODate(addDays(parseISO(targetInst.due_date_end),   adjustDays * multiplier));

  await db().from('instances').update({ due_date_start: newStart, due_date_end: newEnd }).eq('id', targetInst.id);

  await db().from('routine_conflicts').insert({
    ...base,
    status:                 'resolved',
    resolution:             'auto_adjust',
    resolved_at:            new Date().toISOString(),
    resolved_by_delay_days: adjustDays,
    resolved_delay_target:  adjustTarget,
    adjust_direction:       direction,
    adjust_snap_back:       pair.adjust_snap_back ?? false,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
