import type { SupabaseClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import { today } from './instanceEngine';

/**
 * Mark instances as kept automatically when autocomplete_enabled = TRUE and the
 * designated auto-complete time has passed.  Idempotent — safe to call on every
 * page load.  Acts only within the current user's RLS context.
 */
export async function autoCompleteInstances(supabase: SupabaseClient): Promise<void> {
  const now = new Date();
  const todayStr = format(today(), 'yyyy-MM-dd');

  const { data: instances } = await supabase
    .from('instances')
    .select(`
      id, due_date_start, slot, scheduled_time,
      task:tasks!inner(autocomplete_enabled, frequency_type, scheduled_time)
    `)
    .eq('status', 'upcoming')
    .eq('auto_completed', false)
    .lte('due_date_start', todayStr);

  if (!instances?.length) return;

  const toComplete = instances.filter(inst => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task = (inst as any).task;
    if (!task?.autocomplete_enabled) return false;
    const autoTime = resolveAutoCompleteTime(inst, task, inst.due_date_start);
    return now >= autoTime;
  });

  if (!toComplete.length) return;

  // Batch by due_date_start so instances sharing a date are updated in one round trip.
  const byDate = new Map<string, string[]>();
  for (const inst of toComplete) {
    const ids = byDate.get(inst.due_date_start) ?? [];
    ids.push(inst.id);
    byDate.set(inst.due_date_start, ids);
  }

  await Promise.all(
    [...byDate.entries()].map(([date, ids]) =>
      supabase
        .from('instances')
        .update({
          status: 'completed',
          actual_completion_date: date,
          calendar_event_date: date,
          auto_completed: true,
        })
        .in('id', ids)
    )
  );
}

/**
 * Quietly retires stale overdue instances.
 * An instance is stale when its status is 'upcoming', due_date_start < today,
 * and the same task already has a newer upcoming/projected instance.
 * Stale instances are skipped (not deleted) so history is preserved.
 * Safe to call on every page load — idempotent.
 */
export async function retireStaleOverdueInstances(supabase: SupabaseClient): Promise<void> {
  const todayStr = format(today(), 'yyyy-MM-dd');

  // Fetch all non-projected upcoming instances that are past due
  const { data: overdue } = await supabase
    .from('instances')
    .select('id, task_id, due_date_start')
    .eq('status', 'upcoming')
    .eq('is_projected', false)
    .lt('due_date_start', todayStr);

  if (!overdue?.length) return;

  // For each task, check if a newer upcoming/projected instance exists
  const taskIds = [...new Set(overdue.map((i: { task_id: string }) => i.task_id))];
  const { data: newer } = await supabase
    .from('instances')
    .select('task_id')
    .in('task_id', taskIds)
    .in('status', ['upcoming', 'projected'])
    .gte('due_date_start', todayStr);

  const tasksWithNewer = new Set((newer ?? []).map((i: { task_id: string }) => i.task_id));
  const staleIds = overdue
    .filter((i: { task_id: string }) => tasksWithNewer.has(i.task_id))
    .map((i: { id: string }) => i.id);

  if (!staleIds.length) return;

  await supabase
    .from('instances')
    .update({ status: 'skipped' })
    .in('id', staleIds);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveAutoCompleteTime(instance: any, task: any, dueDateStart: string): Date {
  // Twice-daily: slot A auto-completes at noon, slot B at end of day
  if (task.frequency_type === 'twice_daily') {
    if (instance.slot === 'a') return new Date(`${dueDateStart}T12:00:00`);
    return new Date(`${dueDateStart}T23:59:59`);
  }

  const time = instance.scheduled_time ?? task.scheduled_time;
  if (time) return new Date(`${dueDateStart}T${time}`);

  return new Date(`${dueDateStart}T23:59:59`);
}
