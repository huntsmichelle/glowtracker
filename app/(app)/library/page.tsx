import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCategoryColor, getCategoryIcon } from '@/lib/categoryColors';
import { format, parseISO } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const todayStr = new Date().toISOString().split('T')[0];
  const sixMonthsOut = new Date();
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  const sixMonthsStr = sixMonthsOut.toISOString().split('T')[0];

  // Fetch everything in parallel
  const [routinesRes, tasksRes, upcomingRes, lastCompletedRes] = await Promise.all([
    // User's active routines (not system templates)
    supabase
      .from('routines')
      .select('id, name, color, routine_type, created_at')
      .eq('user_id', user.id)
      .eq('is_system_template', false)
      .order('created_at', { ascending: true }),

    // All user's active tasks with category
    supabase
      .from('tasks')
      .select('id, name, routine_id, category_id, category:categories(id, name)')
      .eq('user_id', user.id)
      .eq('is_active', true),

    // Upcoming (non-projected) instances in next 6 months for category counts + next ritual
    supabase
      .from('instances')
      .select('id, task_id, due_date_start')
      .eq('user_id', user.id)
      .eq('status', 'upcoming')
      .eq('is_projected', false)
      .gte('due_date_start', todayStr)
      .lte('due_date_start', sixMonthsStr)
      .order('due_date_start', { ascending: true }),

    // Most recent completed instance per routine (for cycle progress)
    supabase
      .from('instances')
      .select('task_id, actual_completion_date')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('actual_completion_date', 'is', null)
      .order('actual_completion_date', { ascending: false })
      .limit(200),
  ]);

  const routines = routinesRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allTasks = (tasksRes.data ?? []) as any[];
  const upcomingInstances = upcomingRes.data ?? [];
  const completedInstances = lastCompletedRes.data ?? [];

  // Build task lookup by id
  const taskById: Record<string, typeof allTasks[0]> = {};
  for (const t of allTasks) taskById[t.id] = t;

  // Build task sets per routine
  const routineTaskIds: Record<string, Set<string>> = {};
  for (const t of allTasks) {
    if (!t.routine_id) continue;
    if (!routineTaskIds[t.routine_id]) routineTaskIds[t.routine_id] = new Set();
    routineTaskIds[t.routine_id].add(t.id);
  }

  // Build next upcoming instance per task (from ordered query, already ascending)
  const nextInstByTask: Record<string, string> = {};
  for (const inst of upcomingInstances) {
    if (!nextInstByTask[inst.task_id]) nextInstByTask[inst.task_id] = inst.due_date_start;
  }

  // Build last completed per task
  const lastCompByTask: Record<string, string> = {};
  for (const inst of completedInstances) {
    if (!lastCompByTask[inst.task_id]) lastCompByTask[inst.task_id] = inst.actual_completion_date;
  }

  // Build per-routine summary
  type RoutineMeta = {
    taskCount: number;
    nextTaskName: string | null;
    nextDate: string | null;
    lastCompletedDate: string | null;
  };
  const routineMeta: Record<string, RoutineMeta> = {};
  for (const r of routines) {
    const tids = routineTaskIds[r.id] ?? new Set<string>();
    let nextDate: string | null = null;
    let nextTaskName: string | null = null;
    let lastCompletedDate: string | null = null;

    for (const tid of tids) {
      const nd = nextInstByTask[tid];
      if (nd && (!nextDate || nd < nextDate)) {
        nextDate = nd;
        nextTaskName = taskById[tid]?.name ?? null;
      }
      const lc = lastCompByTask[tid];
      if (lc && (!lastCompletedDate || lc > lastCompletedDate)) lastCompletedDate = lc;
    }

    routineMeta[r.id] = { taskCount: tids.size, nextTaskName, nextDate, lastCompletedDate };
  }

  // Build per-category ritual count (distinct tasks with upcoming instances in next 6 months)
  type CatInfo = { id: string; name: string; count: number };
  const catMap: Record<string, CatInfo> = {};
  const seenTasksForCat = new Set<string>();

  for (const inst of upcomingInstances) {
    if (seenTasksForCat.has(inst.task_id)) continue;
    seenTasksForCat.add(inst.task_id);
    const task = taskById[inst.task_id];
    if (!task) continue;
    const cat = Array.isArray(task.category) ? task.category[0] : task.category;
    if (!cat?.id || !cat?.name) continue;
    if (!catMap[cat.id]) catMap[cat.id] = { id: cat.id, name: cat.name, count: 0 };
    catMap[cat.id].count++;
  }
  const activeCategories = Object.values(catMap).sort((a, b) => a.name.localeCompare(b.name));

  function formatWhen(dateStr: string): string {
    const d = parseISO(dateStr);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
    if (diff <= 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff <= 6) return format(d, 'EEEE');
    return format(d, 'MMM d');
  }


  return (
    <div className="max-w-5xl mx-auto px-5 py-8 space-y-10">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="label-overline mb-1">Library</p>
          <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '32px', fontWeight: 400, color: '#352720', lineHeight: 1.1 }}>
            Your rituals
          </h1>
        </div>
        <Link
          href="/tasks/new"
          style={{ border: '1px solid #352720', backgroundColor: 'transparent', color: '#352720', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '7px 20px', textDecoration: 'none' }}
        >
          + New ritual
        </Link>
      </div>

      {/* ── Section 1: IN MOTION ─────────────────────────────────────────── */}
      <section>
        <p className="label-overline mb-4">In motion</p>
        {routines.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '18px', color: '#a8998e', marginBottom: '8px' }}>
              No routines yet.
            </p>
            <div style={{ width: '40px', height: '1px', backgroundColor: '#ddd4c4', margin: '0 auto 10px' }} />
            <Link href="/routines/new" style={{ fontSize: '11px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8998e', textDecoration: 'none' }}>
              Create your first routine →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {routines.map(r => {
              const meta = routineMeta[r.id];
              const accent = r.color ?? '#ddd4c4';

              // Cycle progress: (today - lastCompleted) / (nextDue - lastCompleted)
              let progressPct = 0;
              if (meta.lastCompletedDate && meta.nextDate) {
                const now = Date.now();
                const last = new Date(meta.lastCompletedDate + 'T00:00:00').getTime();
                const next = new Date(meta.nextDate + 'T00:00:00').getTime();
                progressPct = next > last ? Math.min(1, (now - last) / (next - last)) : 0;
              }

              return (
                <Link
                  key={r.id}
                  href={`/routines/${r.id}`}
                  style={{
                    display: 'block', backgroundColor: '#faf4e6',
                    border: '1px solid #ddd4c4',
                    borderLeft: `3px solid ${accent}`,
                    borderRadius: '12px', padding: '16px', textDecoration: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '18px', fontWeight: 500, color: '#352720', marginBottom: '2px', lineHeight: 1.2 }}>
                        {r.name}
                      </p>
                      <p style={{ fontSize: '11px', color: '#a8998e', marginBottom: '8px' }}>
                        {meta.taskCount} ritual{meta.taskCount !== 1 ? 's' : ''}
                        {meta.nextTaskName && meta.nextDate
                          ? ` · Next: ${meta.nextTaskName}, ${formatWhen(meta.nextDate)}`
                          : ''}
                      </p>
                      {meta.taskCount === 0 && (
                        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6e8c82', backgroundColor: 'rgba(110,140,130,0.15)', borderRadius: '100px', padding: '2px 8px', display: 'inline-block' }}>
                          UPCOMING
                        </span>
                      )}
                      {/* Cycle progress bar */}
                      {progressPct > 0 && (
                        <div style={{ marginTop: '8px', height: '3px', backgroundColor: '#ddd4c4', borderRadius: '2px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progressPct * 100}%`, backgroundColor: accent, borderRadius: '2px', transition: 'width 0.3s ease' }} />
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: '14px', color: '#a8998e', flexShrink: 0, marginTop: '2px' }}>›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Section 2: BROWSE BY CATEGORIES ──────────────────────────────── */}
      {activeCategories.length > 0 && (
        <section>
          <p className="label-overline mb-4">Browse by category</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {activeCategories.map(cat => {
              const catColor = getCategoryColor(cat.name);
              const Icon = getCategoryIcon(cat.name);
              return (
                <Link
                  key={cat.id}
                  href={`/tasks?category=${cat.id}`}
                  style={{
                    backgroundColor: 'var(--paper-soft)',
                    borderRadius: '12px',
                    border: '1px solid var(--divider)',
                    borderTop: `3px solid ${catColor.dot}`,
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <Icon size={20} color={catColor.dot} strokeWidth={1.5} />
                    <span style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '22px', color: 'var(--ink-faint)' }}>
                      {cat.count}
                    </span>
                  </div>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 500, color: 'var(--ink)' }}>
                    {cat.name}
                  </span>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'var(--ink-faint)' }}>
                    {cat.count} {cat.count === 1 ? 'ritual' : 'rituals'}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Section 3: ALL RITUALS (link only — no rows) ──────────────────── */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--ink-faint)', marginBottom: '4px' }}>
              ALL RITUALS
            </p>
            <h2 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '22px', fontWeight: 400, color: 'var(--ink)', lineHeight: 1.2 }}>
              Individual Rituals
            </h2>
          </div>
          <Link
            href="/tasks"
            style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', textDecoration: 'none' }}
          >
            SEE ALL →
          </Link>
        </div>
      </section>
    </div>
  );
}
