import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Task, Category, Routine } from '@/types';
import { getCategoryColor } from '@/lib/categoryColors';
import { format, parseISO } from 'date-fns';

export const dynamic = 'force-dynamic';

type TaskRow = Task & { category?: Category; routine?: Pick<Routine, 'id' | 'name' | 'color'> | null };

function humanizeInterval(min: number, max: number): string {
  if (min === max) {
    if (min === 1) return 'Daily';
    if (min === 7) return 'Weekly';
    if (min === 14) return 'Every 2 weeks';
    if (min === 30 || min === 31) return 'Monthly';
    if (min % 7 === 0) return `Every ${min / 7} weeks`;
    return `Every ${min} days`;
  }
  if (min % 7 === 0 && max % 7 === 0) return `Every ${min / 7}–${max / 7} weeks`;
  return `Every ${min}–${max} days`;
}

export default async function TasksListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: tasksList }, { data: nextInstances }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, category:categories(*), routine:routines(id, name, color)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('instances')
      .select('task_id, due_date_start')
      .eq('user_id', user.id)
      .in('status', ['upcoming', 'due', 'snoozed'])
      .eq('is_projected', false)
      .order('due_date_start', { ascending: true }),
  ]);

  // Build earliest instance date per task
  const nextDateByTask = new Map<string, string>();
  for (const inst of nextInstances ?? []) {
    if (!nextDateByTask.has(inst.task_id)) {
      nextDateByTask.set(inst.task_id, inst.due_date_start);
    }
  }

  // Sort tasks: soonest upcoming first, no-instance tasks at end (by name)
  const sorted = [...(tasksList ?? []) as TaskRow[]].sort((a, b) => {
    const da = nextDateByTask.get(a.id);
    const db = nextDateByTask.get(b.id);
    if (da && db) return da.localeCompare(db);
    if (da) return -1;
    if (db) return 1;
    return a.name.localeCompare(b.name);
  });

  const grouped: Record<string, TaskRow[]> = {};
  const uncategorized: TaskRow[] = [];

  for (const t of sorted) {
    const row = t as TaskRow;
    if (row.category) {
      if (!grouped[row.category.name]) grouped[row.category.name] = [];
      grouped[row.category.name].push(row);
    } else {
      uncategorized.push(row);
    }
  }

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  const total = sorted.length;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="label-overline mb-1">Library</p>
          <h1 className="font-display text-3xl text-charcoal">Rituals</h1>
          {total > 0 && (
            <p className="text-warm-mid text-sm mt-1">{total} ritual{total !== 1 ? 's' : ''}</p>
          )}
        </div>
        <Link
          href="/tasks/new"
          style={{ border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '7px 20px', textDecoration: 'none' }}
        >
          + Add Ritual
        </Link>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>
            No rituals yet.
          </p>
          <div style={{ width: '40px', height: '1px', backgroundColor: '#cdc6b6' }} />
          <Link href="/tasks/new" style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297', cursor: 'pointer' }}>
            Add your first ritual
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroups.map(([catName, items]) => (
            <section key={catName}>
              <p className="label-overline mb-3" style={{ letterSpacing: '0.18em' }}>
                {catName.toUpperCase()} · {items.length}
              </p>
              <div style={{ borderTop: '1px solid #cdc6b6' }}>
                {items.map(t => <TaskRowItem key={t.id} task={t} nextDate={nextDateByTask.get(t.id)} />)}
              </div>
            </section>
          ))}
          {uncategorized.length > 0 && (
            <section>
              <p className="label-overline mb-3" style={{ letterSpacing: '0.18em' }}>
                OTHER · {uncategorized.length}
              </p>
              <div style={{ borderTop: '1px solid #cdc6b6' }}>
                {uncategorized.map(t => <TaskRowItem key={t.id} task={t} nextDate={nextDateByTask.get(t.id)} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRowItem({ task, nextDate }: { task: TaskRow; nextDate?: string }) {
  const intervalLabel = humanizeInterval(task.interval_min_days, task.interval_max_days);
  const modeLabel = task.mode === 'countdown' ? ' · Countdown' : '';
  const nextLabel = nextDate ? format(parseISO(nextDate), 'MMM d') : null;

  return (
    <Link
      href={`/tasks/${task.id}`}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #cdc6b6', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span
          style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: getCategoryColor(task.category?.name ?? '').dot }}
        />
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: '12px' }}>
        {nextLabel && <span style={{ fontSize: '12px', color: '#8ea394', fontWeight: 500 }}>{nextLabel}</span>}
        <span style={{ fontSize: '11px', color: '#a8a297' }}>{intervalLabel}{modeLabel}</span>
      </div>
    </Link>
  );
}
