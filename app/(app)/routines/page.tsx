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
      ? supabase.from('tasks').select('routine_id').in('routine_id', routineIds).eq('is_active', true)
      : Promise.resolve({ data: [] }),
    routineIds.length
      ? supabase.from('routine_conflicts').select('routine_id').in('routine_id', routineIds).eq('status', 'pending')
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="label-overline mb-1">Collections</p>
          <h1 className="font-display text-3xl text-charcoal">Routines</h1>
          {routines.length > 0 && (
            <p className="text-warm-mid text-sm mt-1">{routines.length} routine{routines.length !== 1 ? 's' : ''} configured</p>
          )}
        </div>
        <Link
          href="/routines/new"
          className="bg-charcoal text-cream text-sm font-medium rounded-pill px-5 py-2.5 hover:bg-charcoal/90"
        >
          + New
        </Link>
      </div>

      {routines.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 mx-auto mb-4 text-warm-light">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </div>
          <h2 className="font-display text-2xl text-charcoal mb-2">No routines yet.</h2>
          <p className="text-warm-mid text-sm mb-8">Group related rituals to track overlaps and patterns.</p>
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/routines/new"
              className="inline-block bg-charcoal text-cream text-sm font-medium rounded-pill px-6 py-3 hover:bg-charcoal/90"
            >
              Create your first routine
            </Link>
            <Link href="/routines/templates" className="text-sm text-warm-mid hover:text-charcoal underline-offset-2 hover:underline">
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
              className="flex items-center justify-between bg-stone border border-glow-border rounded-lg shadow-card px-4 py-4 card-lift"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: r.color }} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">{r.name}</p>
                  {r.description && (
                    <p className="text-xs text-warm-mid truncate mt-0.5">{r.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                {r.pending_conflicts > 0 && r.conflict_intent !== 'independent' && (
                  <span className="text-xs font-medium bg-dust-lt text-charcoal rounded-pill px-2.5 py-1">
                    {r.pending_conflicts} overlap{r.pending_conflicts !== 1 ? 's' : ''}
                  </span>
                )}
                <span className="text-xs text-warm-light">
                  {r.task_count} ritual{r.task_count !== 1 ? 's' : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {routines.length > 0 && (
        <div className="pt-2 border-t border-glow-border">
          <Link href="/routines/templates" className="text-sm text-warm-mid hover:text-charcoal underline-offset-2 hover:underline">
            Browse templates →
          </Link>
        </div>
      )}
    </div>
  );
}
