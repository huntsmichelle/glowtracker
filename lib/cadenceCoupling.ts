/**
 * every-N-occurrences (cadence coupling) — CLIENT-SIDE logic.
 *
 * A dependent ritual occurs once every N occurrences of an anchor ritual
 * (e.g. pedicure every 3rd manicure). Storage: `cadence_couplings` (task-to-task)
 * + `instances.linked_anchor_instance_id` (the SPECIFIC anchor occurrence a
 * dependent instance follows).
 *
 * GUARDRAIL: `linked_anchor_instance_id` is TETHER-ONLY. Nothing here (or in
 * instanceEngine) reads it to spawn/regenerate instances — it is a date-follow
 * pointer, never an engine hook. Nulling it is always safe (dependent becomes a
 * normal standalone instance keeping its current date).
 *
 * Counting walks FORWARD from the current tether, never an absolute origin, so a
 * re-tether re-bases the rhythm.
 */

import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import type { CadenceCoupling, InstanceStatus } from '@/types';

function db() {
  return createClient();
}

// Local date helpers (kept here to avoid a cycle with instanceEngine, which
// imports this module's tether/promotion hooks).
function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

type AnchorInstance = {
  id: string;
  due_date_start: string;
  due_date_end: string;
  status: string;
  is_projected: boolean;
};

// ── Reads ──────────────────────────────────────────────────────────────────

export async function fetchCouplingForDependent(dependentTaskId: string): Promise<CadenceCoupling | null> {
  const { data } = await db()
    .from('cadence_couplings')
    .select('*')
    .eq('dependent_task_id', dependentTaskId)
    .maybeSingle();
  return (data as CadenceCoupling) ?? null;
}

export async function fetchCouplingsForAnchor(anchorTaskId: string): Promise<CadenceCoupling[]> {
  const { data } = await db()
    .from('cadence_couplings')
    .select('*')
    .eq('anchor_task_id', anchorTaskId);
  return (data as CadenceCoupling[]) ?? [];
}

// ── Mutual exclusion with spacing ──────────────────────────────────────────
// A pair cannot have BOTH a cadence_couplings row AND a spacing rule in
// routine_task_pairs. Spacing = an active resolution (not 'no_conflict') or a
// proximity rule for that exact pair.
export async function hasSpacingRule(taskAId: string, taskBId: string): Promise<boolean> {
  const { data } = await db()
    .from('routine_task_pairs')
    .select('default_resolution, proximity_enabled, task_a_id, task_b_id')
    .or(
      `and(task_a_id.eq.${taskAId},task_b_id.eq.${taskBId}),` +
      `and(task_a_id.eq.${taskBId},task_b_id.eq.${taskAId})`
    );
  return (data ?? []).some(
    (p: { default_resolution: string | null; proximity_enabled: boolean | null }) =>
      p.proximity_enabled === true ||
      (p.default_resolution != null && p.default_resolution !== 'no_conflict' && p.default_resolution !== 'always_together')
  );
}

// ── Create / delete ────────────────────────────────────────────────────────

export async function createCoupling(params: {
  userId: string;
  anchorTaskId: string;
  dependentTaskId: string;
  intervalN: number;
  countMode: 'all' | 'kept';
}): Promise<{ coupling: CadenceCoupling | null; error: string | null }> {
  const { userId, anchorTaskId, dependentTaskId, intervalN, countMode } = params;

  if (anchorTaskId === dependentTaskId) {
    return { coupling: null, error: 'A ritual cannot be coupled to itself.' };
  }
  if (intervalN < 1) {
    return { coupling: null, error: 'Interval must be at least 1.' };
  }
  if (await hasSpacingRule(anchorTaskId, dependentTaskId)) {
    return { coupling: null, error: 'These rituals already have a spacing rule — remove it before coupling them.' };
  }

  const { data, error } = await db()
    .from('cadence_couplings')
    .insert({
      user_id: userId,
      anchor_task_id: anchorTaskId,
      dependent_task_id: dependentTaskId,
      interval_n: intervalN,
      count_mode: countMode,
    })
    .select()
    .single();

  if (error) {
    // unique(dependent_task_id) violation surfaces here
    return { coupling: null, error: error.message };
  }

  const coupling = data as CadenceCoupling;
  await generateDependentInstances(coupling);
  return { coupling, error: null };
}

export async function deleteCoupling(couplingId: string, dependentTaskId: string): Promise<void> {
  await db().from('cadence_couplings').delete().eq('id', couplingId);
  // Detach the dependent's tethered upcoming instances — they become standalone,
  // keeping their current dates (safe; no regeneration).
  await db()
    .from('instances')
    .update({ linked_anchor_instance_id: null })
    .eq('task_id', dependentTaskId)
    .not('linked_anchor_instance_id', 'is', null);
}

// ── Generation ('all' mode is deterministic) ───────────────────────────────

async function fetchAnchorInstances(anchorTaskId: string): Promise<AnchorInstance[]> {
  const { data } = await db()
    .from('instances')
    .select('id, due_date_start, due_date_end, status, is_projected')
    .eq('task_id', anchorTaskId)
    .not('status', 'in', '(completed,skipped)')
    .gte('due_date_start', toISODate(today()))
    .order('due_date_start', { ascending: true });
  return (data as AnchorInstance[]) ?? [];
}

/**
 * Rebuilds the dependent's coupled instances. 'all' mode: place a dependent
 * tethered to every Nth upcoming anchor occurrence. 'kept' mode: not pre-placed
 * (it can't be projected) — generated reactively via onAnchorOccurrenceKept().
 * Existing non-historical dependent instances are cleared first.
 */
export async function generateDependentInstances(coupling: CadenceCoupling): Promise<void> {
  // Clear the dependent's upcoming/projected instances (keep completed/skipped history).
  await db()
    .from('instances')
    .delete()
    .eq('task_id', coupling.dependent_task_id)
    .not('status', 'in', '(completed,skipped)');

  if (coupling.count_mode !== 'all') return; // 'kept' is reactive

  const anchors = await fetchAnchorInstances(coupling.anchor_task_id);
  if (!anchors.length) return;

  const { data: depTask } = await db()
    .from('tasks')
    .select('id, user_id')
    .eq('id', coupling.dependent_task_id)
    .single();
  if (!depTask) return;

  const inserts = [];
  // Every Nth: positions N, 2N, 3N… (1-indexed) → array index k*N-1.
  for (let k = 1; k * coupling.interval_n - 1 < anchors.length; k++) {
    const anchor = anchors[k * coupling.interval_n - 1];
    inserts.push({
      task_id:                   coupling.dependent_task_id,
      user_id:                   depTask.user_id,
      due_date_start:            anchor.due_date_start,
      due_date_end:              anchor.due_date_end,
      interval_anchor_date:      anchor.due_date_start,
      status:                    (anchor.is_projected ? 'projected' : 'upcoming') as InstanceStatus,
      is_projected:              anchor.is_projected,
      linked_anchor_instance_id: anchor.id,
    });
  }

  if (inserts.length) {
    await db().from('instances').insert(inserts);
  }
}

// ── Tether: anchor moves → dependent follows ───────────────────────────────
// Call whenever an anchor occurrence's date changes. Directional: only the
// dependent moves; the anchor is never dragged.
export async function followAnchorMove(
  anchorInstanceId: string,
  newDateStart: string,
  newDateEnd: string,
): Promise<void> {
  await db()
    .from('instances')
    .update({ due_date_start: newDateStart, due_date_end: newDateEnd })
    .eq('linked_anchor_instance_id', anchorInstanceId)
    .not('status', 'in', '(completed,skipped)');
}

// ── Detach (dependent moved independently) ─────────────────────────────────
export async function detachDependentInstance(dependentInstanceId: string): Promise<void> {
  await db()
    .from('instances')
    .update({ linked_anchor_instance_id: null })
    .eq('id', dependentInstanceId);
}

// ── Skip on the dependent (two options) ────────────────────────────────────

// (a) Just skip — no tether change; next dependent follows the normal count.
export async function skipDependentJustSkip(dependentInstanceId: string): Promise<void> {
  await db().from('instances').update({ status: 'skipped' }).eq('id', dependentInstanceId);
}

// (b) Do it next time — re-point the tether to the immediately-following anchor
// occurrence and RE-BASE the count from there. Does NOT preserve original cadence.
export async function skipDependentDoNextTime(
  dependentInstance: { id: string; linked_anchor_instance_id: string | null },
  coupling: CadenceCoupling,
): Promise<void> {
  if (!dependentInstance.linked_anchor_instance_id) {
    // Already detached — just skip it.
    await skipDependentJustSkip(dependentInstance.id);
    return;
  }

  // Current tethered anchor occurrence's date.
  const { data: currentAnchor } = await db()
    .from('instances')
    .select('id, due_date_start')
    .eq('id', dependentInstance.linked_anchor_instance_id)
    .single();
  if (!currentAnchor) {
    await skipDependentJustSkip(dependentInstance.id);
    return;
  }

  // The very next anchor occurrence after the current tether.
  const { data: nextAnchor } = await db()
    .from('instances')
    .select('id, due_date_start, due_date_end')
    .eq('task_id', coupling.anchor_task_id)
    .not('status', 'in', '(completed,skipped)')
    .gt('due_date_start', currentAnchor.due_date_start)
    .order('due_date_start', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!nextAnchor) {
    // No following anchor occurrence — fall back to a plain skip.
    await skipDependentJustSkip(dependentInstance.id);
    return;
  }

  // Re-tether this dependent occurrence to the next anchor; rebuild the rest of
  // the schedule walking forward from the new base.
  await db()
    .from('instances')
    .update({
      due_date_start: nextAnchor.due_date_start,
      due_date_end: nextAnchor.due_date_end,
      linked_anchor_instance_id: nextAnchor.id,
    })
    .eq('id', dependentInstance.id);

  await generateDependentInstances(coupling);
}

// ── Reactive generation for count_mode='kept' ──────────────────────────────
// Call after an ANCHOR occurrence is kept. Creates a dependent tethered to that
// occurrence when N kept occurrences have accumulated since the last dependent.
export async function onAnchorOccurrenceKept(
  anchorInstance: { id: string; due_date_start: string; due_date_end: string },
  coupling: CadenceCoupling,
): Promise<void> {
  if (coupling.count_mode !== 'kept') return;

  // Count kept anchor occurrences up to and including this one.
  const { count: keptCount } = await db()
    .from('instances')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', coupling.anchor_task_id)
    .eq('status', 'completed')
    .lte('due_date_start', anchorInstance.due_date_start);

  if (!keptCount || keptCount % coupling.interval_n !== 0) return;

  const { data: depTask } = await db()
    .from('tasks')
    .select('id, user_id')
    .eq('id', coupling.dependent_task_id)
    .single();
  if (!depTask) return;

  await db().from('instances').insert({
    task_id:                   coupling.dependent_task_id,
    user_id:                   depTask.user_id,
    due_date_start:            anchorInstance.due_date_start,
    due_date_end:              anchorInstance.due_date_end,
    interval_anchor_date:      anchorInstance.due_date_start,
    status:                    'upcoming' as InstanceStatus,
    is_projected:              false,
    linked_anchor_instance_id: anchorInstance.id,
  });
}

// ── Promotion when the ANCHOR RITUAL is deleted ────────────────────────────
// MUST run BEFORE deleting the anchor task (the FK cascade would otherwise drop
// the coupling and silently orphan the dependent). Seeds each dependent's own
// cadence (existing tasks.interval_min/max_days) to the effective interval, and
// detaches its tethered instances.
export async function promoteDependentsOnAnchorDelete(anchorTaskId: string): Promise<void> {
  const couplings = await fetchCouplingsForAnchor(anchorTaskId);
  if (!couplings.length) return;

  const { data: anchorTask } = await db()
    .from('tasks')
    .select('interval_min_days, interval_max_days')
    .eq('id', anchorTaskId)
    .single();
  if (!anchorTask) return;

  for (const c of couplings) {
    const seedMin = (anchorTask.interval_min_days ?? 28) * c.interval_n;
    const seedMax = (anchorTask.interval_max_days ?? anchorTask.interval_min_days ?? 28) * c.interval_n;

    await db()
      .from('tasks')
      .update({ interval_min_days: seedMin, interval_max_days: seedMax })
      .eq('id', c.dependent_task_id);

    // Detach the dependent's tethered instances — they keep their dates.
    await db()
      .from('instances')
      .update({ linked_anchor_instance_id: null })
      .eq('task_id', c.dependent_task_id)
      .not('linked_anchor_instance_id', 'is', null);
  }
  // The coupling rows are removed by ON DELETE CASCADE when the anchor task is
  // deleted next.
}
