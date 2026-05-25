import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Task, Category } from '@/types';

export default async function TasksListPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: tasksList } = await supabase
    .from('tasks')
    .select('*, category:categories(*)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('name');

  const grouped: Record<string, (Task & { category?: Category })[]> = {};
  const uncategorized: (Task & { category?: Category })[] = [];

  for (const t of tasksList ?? []) {
    const cat = (t as Task & { category?: Category }).category;
    if (cat) {
      if (!grouped[cat.name]) grouped[cat.name] = [];
      grouped[cat.name].push(t as Task & { category?: Category });
    } else {
      uncategorized.push(t as Task & { category?: Category });
    }
  }

  const sortedGroups = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Tasks</h1>
        <Link href="/tasks/new" className="text-sm bg-pink-500 text-white font-medium rounded-lg px-3 py-1.5">
          + New
        </Link>
      </div>

      {(tasksList ?? []).length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-sm mb-4">No tasks yet.</p>
          <Link href="/tasks/new" className="inline-block bg-pink-500 text-white text-sm font-medium rounded-lg px-4 py-2.5">
            Create your first task
          </Link>
        </div>
      ) : (
        <>
          {sortedGroups.map(([catName, items]) => (
            <section key={catName}>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{catName}</h2>
              <div className="space-y-2">
                {items.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </section>
          ))}
          {uncategorized.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Other</h2>
              <div className="space-y-2">
                {uncategorized.map(t => <TaskRow key={t.id} task={t} />)}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function TaskRow({ task }: { task: Task & { category?: Category } }) {
  const intervalLabel =
    task.interval_min_days === task.interval_max_days
      ? `Every ${task.interval_min_days}d`
      : `Every ${task.interval_min_days}–${task.interval_max_days}d`;

  const modeLabel = task.mode === 'countdown' ? ' · Countdown' : '';

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 hover:border-pink-200 transition-colors"
    >
      <div className="flex items-center gap-3">
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: task.category?.color ?? '#6B7280' }}
        />
        <span className="text-sm font-medium text-gray-800">{task.name}</span>
      </div>
      <span className="text-xs text-gray-400">{intervalLabel}{modeLabel}</span>
    </Link>
  );
}
