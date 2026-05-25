import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine } from '@/types';

export const dynamic = 'force-dynamic';

type RoutineWithMeta = Routine & {
  task_count: number;
  pending_conflicts: number;
};

export default async function RoutinesListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: routinesList } = await supabase
    .from('routines')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_template', false)
    .order('name');

  const routineIds = (routinesList ?? []).map(r => r.id);

  const [taskCountsRes, conflictCountsRes] = await Promise.all([
    routineIds.length
      ? supabase
          .from('tasks')
          .select('routine_id')
          .in('routine_id', routineIds)
          .eq('is_active', true)
      : Promise.resolve({ data: [] }),
    routineIds.length
      ? supabase
          .from('routine_conflicts')
          .select('routine_id')
          .in('routine_id', routineIds)
          .eq('status', 'pending')
      : Promise.resolve({ data: [] }),
  ]);

  const taskCounts: Record<string, number> = {};
  for (const t of taskCountsRes.data ?? []) {
    taskCounts[t.routine_id] = (taskCounts[t.routine_id] ?? 0) + 1;
  }

  const conflictCounts: Record<string, number> = {};
  for (const c of conflictCountsRes.data ?? []) {
    conflictCounts[c.routine_id] = (conflictCounts[c.routine_id] ?? 0) + 1;
  }

  const routines: RoutineWithMeta[] = (routinesList ?? []).map(r => ({
    ...(r as Routine),
    task_count: taskCounts[r.id] ?? 0,
    pending_conflicts: conflictCounts[r.id] ?? 0,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Routines</h1>
        <Link
          href="/routines/new"
          className="text-sm bg-pink-500 text-white font-medium rounded-lg px-3 py-1.5"
        >
          + New
        </Link>
      </div>

      {routines.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-2">No routines yet.</p>
          <p className="text-gray-400 text-xs mb-6">Group related tasks into a routine to track conflicts and patterns.</p>
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/routines/new"
              className="inline-block bg-pink-500 text-white text-sm font-medium rounded-lg px-4 py-2.5"
            >
              Create your first routine
            </Link>
            <Link
              href="/routines/templates"
              className="inline-block text-pink-500 text-sm font-medium"
            >
              Browse templates
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {routines.map(r => (
            <Link
              key={r.id}
              href={`/routines/${r.id}`}
              className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-pink-200 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: r.color }}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{r.name}</p>
                  {r.description && (
                    <p className="text-xs text-gray-400 truncate">{r.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {r.pending_conflicts > 0 && (
                  <span className="text-xs font-semibold bg-red-100 text-red-600 rounded-full px-2 py-0.5">
                    {r.pending_conflicts} conflict{r.pending_conflicts !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {r.task_count} task{r.task_count !== 1 ? 's' : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <div className="pt-2 border-t border-gray-100">
        <Link
          href="/routines/templates"
          className="text-sm text-pink-500 font-medium"
        >
          Browse templates
        </Link>
      </div>
    </div>
  );
}
