import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCategoryColor } from '@/lib/categoryColors';
import { format, parseISO } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const systemUserId = 'db24c2d7-e677-45af-add3-a155a87c75e0';

  const [routinesRes, categoriesRes, upcomingRes] = await Promise.all([
    supabase
      .from('routines')
      .select('id, name, color, routine_type')
      .eq('user_id', user.id)
      .neq('is_system_template', true)
      .order('name'),

    supabase
      .from('categories')
      .select('id, name')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('name'),

    // Upcoming instances with task + category info (for category counts)
    supabase
      .from('instances')
      .select('task_id, due_date_start, task:tasks(name, category_id, category:categories(id, name), routine_id)')
      .eq('user_id', user.id)
      .eq('status', 'upcoming')
      .eq('is_projected', false)
      .eq('archived', false)
      .order('due_date_start', { ascending: true }),
  ]);

  const routines = routinesRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const upcomingInstances = (upcomingRes.data ?? []) as any[];

  // Build per-routine data: task count + next ritual
  const routineMap: Record<string, { ritualCount: number; nextName: string | null; nextDate: string | null }> = {};
  for (const r of routines) {
    routineMap[r.id] = { ritualCount: 0, nextName: null, nextDate: null };
  }

  const seenTasks = new Set<string>();
  for (const inst of upcomingInstances) {
    const task = Array.isArray(inst.task) ? inst.task[0] : inst.task;
    if (!task) continue;
    const routineId = task.routine_id;
    if (!routineId || !routineMap[routineId]) continue;

    if (!seenTasks.has(inst.task_id)) {
      seenTasks.add(inst.task_id);
      routineMap[routineId].ritualCount++;
    }

    if (!routineMap[routineId].nextDate || inst.due_date_start < routineMap[routineId].nextDate!) {
      routineMap[routineId].nextName = task.name;
      routineMap[routineId].nextDate = inst.due_date_start;
    }
  }

  // Build per-category ritual count (distinct tasks with upcoming instances in next 6 months)
  const sixMonthsOut = new Date();
  sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
  const sixMonthsStr = format(sixMonthsOut, 'yyyy-MM-dd');

  const catTaskCount: Record<string, Set<string>> = {};
  const catNextDate: Record<string, string> = {};
  for (const inst of upcomingInstances) {
    if (inst.due_date_start > sixMonthsStr) continue;
    const task = Array.isArray(inst.task) ? inst.task[0] : inst.task;
    if (!task) continue;
    const catArr = Array.isArray(task.category) ? task.category : [task.category];
    const cat = catArr[0];
    if (!cat?.name) continue;
    if (!catTaskCount[cat.name]) catTaskCount[cat.name] = new Set();
    catTaskCount[cat.name].add(inst.task_id);
    if (!catNextDate[cat.name] || inst.due_date_start < catNextDate[cat.name]) {
      catNextDate[cat.name] = inst.due_date_start;
    }
  }

  const activeCategories = categories.filter(c => catTaskCount[c.name] && catTaskCount[c.name].size > 0);

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

      {/* In Motion — active user routines */}
      {routines.length > 0 && (
        <section>
          <p className="label-overline mb-4">In motion</p>
          <div className="space-y-3">
            {routines.map(r => {
              const meta = routineMap[r.id];
              return (
                <Link
                  key={r.id}
                  href={`/routines/${r.id}`}
                  style={{
                    display: 'block', backgroundColor: '#faf4e6', border: '1px solid #ddd4c4',
                    borderRadius: '12px', padding: '16px', textDecoration: 'none',
                    borderLeft: `3px solid ${r.color ?? '#ddd4c4'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '15px', fontWeight: 500, color: '#352720', marginBottom: '2px' }}>{r.name}</p>
                      <p style={{ fontSize: '11px', color: '#a8998e' }}>
                        {meta.ritualCount} ritual{meta.ritualCount !== 1 ? 's' : ''}
                        {meta.nextName && meta.nextDate && ` · Next: ${meta.nextName} ${formatWhen(meta.nextDate)}`}
                      </p>
                      {meta.ritualCount === 0 && (
                        <span style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#6e8c82', backgroundColor: 'rgba(110,140,130,0.15)', borderRadius: '100px', padding: '2px 8px', display: 'inline-block', marginTop: '4px' }}>
                          UPCOMING
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '14px', color: '#a8998e', flexShrink: 0 }}>›</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Browse by Categories */}
      {activeCategories.length > 0 && (
        <section>
          <p className="label-overline mb-4">Browse by category</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
            {activeCategories.map(cat => {
              const color = getCategoryColor(cat.name);
              const count = catTaskCount[cat.name]?.size ?? 0;
              return (
                <Link
                  key={cat.id}
                  href={`/tasks?category=${cat.id}`}
                  style={{
                    display: 'block', textDecoration: 'none',
                    backgroundColor: '#faf4e6', border: '1px solid #ddd4c4',
                    borderTop: `3px solid ${color.dot}`,
                    borderRadius: '10px', padding: '14px',
                  }}
                >
                  <p style={{ fontSize: '15px', fontWeight: 500, color: '#352720', marginBottom: '4px' }}>{cat.name}</p>
                  <p style={{ fontSize: '11px', color: '#a8998e' }}>{count} ritual{count !== 1 ? 's' : ''}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Individual Rituals — link only */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p className="label-overline">Individual rituals</p>
          <Link href="/tasks" style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8998e', textDecoration: 'none' }}>
            SEE ALL →
          </Link>
        </div>
      </section>
    </div>
  );
}
