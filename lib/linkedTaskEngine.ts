/**
 * Linked Task Engine
 *
 * Helpers for the two new relationship types added in v4.5:
 *   always_together    — both tasks always scheduled on the same date
 *   every_n_occurrences — paired task fires every Nth instance of the primary
 *
 * Call these functions from the instance generation engine whenever
 * a new instance is created for a task that has linked task relationships.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LinkedTask } from '@/types';

// ── always_together ───────────────────────────────────────────────────────────

/**
 * When a new instance is generated for a task, check if it has any
 * always_together links and sync a matching instance for the paired task.
 */
export async function syncAlwaysTogetherInstances(
  supabase: SupabaseClient,
  triggerTaskId: string,
  triggerDate: string,  // due_date_start (YYYY-MM-DD)
  userId: string,
): Promise<void> {
  const { data: links } = await supabase
    .from('linked_tasks')
    .select('*')
    .eq('link_type', 'always_together')
    .eq('user_id', userId)
    .or(`task_a_id.eq.${triggerTaskId},task_b_id.eq.${triggerTaskId}`);

  if (!links?.length) return;

  for (const link of links as LinkedTask[]) {
    const pairedTaskId = link.task_a_id === triggerTaskId ? link.task_b_id : link.task_a_id;

    const { data: existing } = await supabase
      .from('instances')
      .select('id')
      .eq('task_id', pairedTaskId)
      .eq('due_date_start', triggerDate)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) continue;

    await supabase.from('instances').insert({
      task_id: pairedTaskId,
      user_id: userId,
      due_date_start: triggerDate,
      due_date_end: triggerDate,
      status: 'upcoming',
      is_projected: false,
      generated_by_link_id: link.id,
    });
  }
}

// ── every_n_occurrences ───────────────────────────────────────────────────────

/**
 * When a new instance is generated for the primary task in an
 * every_n_occurrences link, increment the counter and generate a
 * paired instance when the count reaches the interval.
 */
export async function checkEveryNOccurrences(
  supabase: SupabaseClient,
  triggerTaskId: string,
  triggerDate: string,
  userId: string,
): Promise<void> {
  const { data: links } = await supabase
    .from('linked_tasks')
    .select('*')
    .eq('link_type', 'every_n_occurrences')
    .eq('primary_task_id', triggerTaskId)
    .eq('user_id', userId);

  if (!links?.length) return;

  for (const link of links as LinkedTask[]) {
    const newCount = (link.occurrence_count ?? 0) + 1;

    if (newCount >= link.occurrence_interval) {
      // Reset counter
      await supabase
        .from('linked_tasks')
        .update({ occurrence_count: 0 })
        .eq('id', link.id);

      const pairedTaskId = link.task_a_id === link.primary_task_id ? link.task_b_id : link.task_a_id;

      const { data: existing } = await supabase
        .from('instances')
        .select('id')
        .eq('task_id', pairedTaskId)
        .eq('due_date_start', triggerDate)
        .eq('user_id', userId)
        .maybeSingle();

      if (!existing) {
        await supabase.from('instances').insert({
          task_id: pairedTaskId,
          user_id: userId,
          due_date_start: triggerDate,
          due_date_end: triggerDate,
          status: 'upcoming',
          is_projected: false,
          generated_by_link_id: link.id,
        });
      }
    } else {
      await supabase
        .from('linked_tasks')
        .update({ occurrence_count: newCount })
        .eq('id', link.id);
    }
  }
}
