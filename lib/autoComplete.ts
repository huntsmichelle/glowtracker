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

  await Promise.all(
    toComplete.map(inst =>
      supabase
        .from('instances')
        .update({
          status: 'completed',
          actual_completion_date: inst.due_date_start,
          calendar_event_date: inst.due_date_start,
          auto_completed: true,
        })
        .eq('id', inst.id)
    )
  );
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
