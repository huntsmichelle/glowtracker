import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Task, Category, Routine } from '@/types';
import { getCategoryColor } from '@/lib/categoryColors';

export const dynamic = 'force-dynamic';

type TaskRow = Task & { category?: Category; routine?: Pick<Routine, 'id' | 'name' | 'color'> | null };

export default async function TasksListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: tasksList } = await supabase
    .from('tasks')
    .select('*, category:categories(*), routine:routines(id, name, color)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name');

  const grouped: Record<string, TaskRow[]> = {};
  const uncategorized: TaskRow[] = [];

  for (const t of tasksList ?? []) {
    const row = t as TaskRow;
    if (row.category) {
      if (!grouped[row.category.name]) grouped[row.category.name] = [];
      grouped[row.category.name].push(row);
    } else {
      uncategorized.push(row);
    }
  }

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  const total = (tasksList ?? []).length;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="label-overline mb-1">Library</p>
          <h1 className="font-display text-3xl text-charcoal">Rituals</h1>
          {total > 0 && (
            <p className="text-warm-mid text-sm mt-1">{total} ritual{total !== 1 ? 's' : ''} in your library</p>
          )}
        </div>
        <Link
          href="/tasks/new"
          className="bg-charcoal text-cream text-sm font-medium rounded-pill px-5 py-2.5 hover:bg-charcoal/90"
        >
          + Add Ritual
        </Link>
      </div>

      {total === 0 ? (
        <div className="text-center py-20">
          <div className="w-10 h-10 mx-auto mb-4 text-warm-light">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM12 6v6l4 2" />
            </svg>
          </div>
          <h2 className="font-display text-2xl text-charcoal mb-2">Your shelf is quiet.</h2>
          <p className="text-warm-mid text-sm mb-8">Add your first ritual to begin keeping rhythm.</p>
          <Link
            href="/tasks/new"
            className="inline-block bg-charcoal text-cream text-sm font-medium rounded-pill px-6 py-3 hover:bg-charcoal/90"
          >
            + Add Ritual
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroups.map(([catName, items]) => (
            <section key={catName}>
              <p className="label-overline mb-3">{catName}</p>
              <div className="space-y-2">
                {items.map(t => <TaskRowItem key={t.id} task={t} />)}
              </div>
            </section>
          ))}
          {uncategorized.length > 0 && (
            <section>
              <p className="label-overline mb-3">Other</p>
              <div className="space-y-2">
                {uncategorized.map(t => <TaskRowItem key={t.id} task={t} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function TaskRowItem({ task }: { task: TaskRow }) {
  const intervalLabel =
    task.interval_min_days === task.interval_max_days
      ? `Every ${task.interval_min_days}d`
      : `Every ${task.interval_min_days}–${task.interval_max_days}d`;

  const modeLabel = task.mode === 'countdown' ? ' · Countdown' : '';

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex items-center justify-between bg-stone border border-glow-border rounded-lg shadow-card px-4 py-3.5 card-lift"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: getCategoryColor(task.category?.name ?? '').dot }}
        />
        <span className="text-sm font-medium text-charcoal truncate">{task.name}</span>
        {task.routine && (
          <span
            className="hidden sm:inline-flex items-center text-[11px] font-medium px-2.5 py-0.5 rounded-pill flex-shrink-0"
            style={{
              border: '1px solid #cdc6b6',
              backgroundColor: '#f6f1e6',
              color: '#6b665e',
            }}
          >
            {task.routine.name}
          </span>
        )}
      </div>
      <span className="text-xs text-warm-light flex-shrink-0 ml-3">{intervalLabel}{modeLabel}</span>
    </Link>
  );
}
