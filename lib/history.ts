import type { SupabaseClient } from '@supabase/supabase-js';

export interface RitualHistoryRow {
  id: string;
  task_id: string;
  status: string;
  actual_completion_date: string | null;
  due_date_start: string;
}

/**
 * Read-only history of completed/skipped instances.
 * taskId is optional — omit it to load the full account history (so this can
 * lift into Me/Insights later with no rewrite).
 */
export async function loadRitualHistory(
  supabase: SupabaseClient,
  userId: string,
  taskId?: string,
): Promise<RitualHistoryRow[]> {
  let query = supabase
    .from('instances')
    .select('id, task_id, status, actual_completion_date, due_date_start')
    .eq('user_id', userId)
    .in('status', ['completed', 'skipped'])
    .eq('is_projected', false)
    .order('actual_completion_date', { ascending: false, nullsFirst: false })
    .order('due_date_start', { ascending: false });

  if (taskId) query = query.eq('task_id', taskId);

  const { data, error } = await query;
  if (error) {
    console.error('loadRitualHistory error:', error);
    return [];
  }
  return (data ?? []) as RitualHistoryRow[];
}
