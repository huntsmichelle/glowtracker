import { createClient } from '@/lib/supabase/client';

export type Suggestion = {
  taskA: { id: string; name: string; routine_id: string | null };
  taskB: { id: string; name: string; routine_id: string | null };
  suggestionText: string | null;
  relationshipType: 'conflict' | 'sync';
};

export type SuggestionsResult = {
  conflicts: Suggestion[];
  syncs: Suggestion[];
};

export type CommonTask = {
  id: string;
  name: string;
  category: string;
  interval_min_days: number | null;
  interval_max_days: number | null;
  prep_steps: string | null;
  suggested_notes: string | null;
};

type SupabaseClient = ReturnType<typeof createClient>;

export async function getTaskSuggestions(
  supabase: SupabaseClient,
  userId: string
): Promise<SuggestionsResult> {
  const [
    { data: userTasks },
    { data: relationships },
    { data: existingPairs },
    { data: dismissals },
  ] = await Promise.all([
    supabase.from('tasks').select('id, name, routine_id').eq('user_id', userId),
    supabase.from('common_task_relationships').select('*'),
    supabase.from('routine_task_pairs').select('task_a_id, task_b_id'),
    supabase.from('user_suggestion_dismissals').select('task_a_id, task_b_id').eq('user_id', userId),
  ]);

  if (!userTasks?.length) return { conflicts: [], syncs: [] };

  const result: SuggestionsResult = { conflicts: [], syncs: [] };

  for (const rel of relationships ?? []) {
    const matchA = userTasks.find(t =>
      t.name.toLowerCase().includes(rel.task_a_name.toLowerCase()) ||
      rel.task_a_name.toLowerCase().includes(t.name.toLowerCase())
    );
    const matchB = userTasks.find(t =>
      t.name.toLowerCase().includes(rel.task_b_name.toLowerCase()) ||
      rel.task_b_name.toLowerCase().includes(t.name.toLowerCase())
    );

    if (!matchA || !matchB || matchA.id === matchB.id) continue;

    const alreadyLinked = existingPairs?.some(p =>
      (p.task_a_id === matchA.id && p.task_b_id === matchB.id) ||
      (p.task_a_id === matchB.id && p.task_b_id === matchA.id)
    );
    if (alreadyLinked) continue;

    const dismissed = dismissals?.some(d =>
      (d.task_a_id === matchA.id && d.task_b_id === matchB.id) ||
      (d.task_a_id === matchB.id && d.task_b_id === matchA.id)
    );
    if (dismissed) continue;

    const suggestion: Suggestion = {
      taskA: matchA,
      taskB: matchB,
      suggestionText: rel.suggestion_text ?? null,
      relationshipType: rel.relationship_type as 'conflict' | 'sync',
    };

    if (rel.relationship_type === 'conflict') {
      result.conflicts.push(suggestion);
    } else {
      result.syncs.push(suggestion);
    }
  }

  return result;
}

export async function dismissSuggestion(
  supabase: SupabaseClient,
  userId: string,
  taskAId: string,
  taskBId: string,
  suggestionType: 'conflict' | 'sync'
): Promise<void> {
  await supabase.from('user_suggestion_dismissals').insert({
    user_id: userId,
    task_a_id: taskAId,
    task_b_id: taskBId,
    suggestion_type: suggestionType,
  });
}

export async function getCommonTasks(supabase: SupabaseClient): Promise<CommonTask[]> {
  const { data } = await supabase.from('common_tasks').select('*').order('name');
  return (data as CommonTask[]) ?? [];
}

export function fuzzyMatchCommonTask(
  name: string,
  commonTasks: CommonTask[]
): CommonTask | null {
  if (!name.trim()) return null;
  const lower = name.toLowerCase().trim();
  return (
    commonTasks.find(t => t.name.toLowerCase() === lower) ??
    commonTasks.find(
      t =>
        t.name.toLowerCase().includes(lower) ||
        lower.includes(t.name.toLowerCase())
    ) ??
    null
  );
}
