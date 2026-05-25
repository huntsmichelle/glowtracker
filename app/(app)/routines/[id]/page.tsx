import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import type { Task, Routine, Category } from '@/types';
import { deriveStatus } from '@/lib/taskEngine';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoutineDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: routine } = await supabase
    .from('routines')
    .select('*, category:categories(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!routine) notFound();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('routine_id', id)
    .order('due_date_start', { ascending: false });

  const r = routine as Routine & { category?: Category };

  const intervalLabel =
    r.interval_min_days === r.interval_max_days
      ? `Every ${r.interval_min_days} days`
      : `Every ${r.interval_min_days}–${r.interval_max_days} days`;

  const statusColors: Record<string, string> = {
    upcoming:  'bg-blue-50 text-blue-700',
    due:       'bg-amber-50 text-amber-700',
    completed: 'bg-green-50 text-green-700',
    skipped:   'bg-gray-100 text-gray-500',
    snoozed:   'bg-purple-50 text-purple-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: r.category?.color ?? '#6B7280' }}
            />
            <span className="text-xs text-gray-400">{r.category?.name ?? 'No category'}</span>
            {r.mode === 'countdown' && (
              <span className="text-xs text-purple-400 font-medium">Countdown</span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-800">{r.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{intervalLabel}</p>
          {r.mode === 'countdown' && r.target_date && (
            <p className="text-sm text-purple-500 mt-0.5">
              {r.target_label ? `${r.target_label} · ` : ''}
              Target: {format(parseISO(r.target_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>
        <Link
          href={`/routines/${id}/edit`}
          className="flex-shrink-0 text-sm border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5"
        >
          Edit
        </Link>
      </div>

      {/* Description */}
      {r.description && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{r.description}</p>
        </div>
      )}

      {/* Task history */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {r.mode === 'countdown' ? 'Scheduled tasks' : 'History'}
        </h2>
        {(tasks ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No tasks yet.</p>
        ) : (
          <div className="space-y-2">
            {(tasks as Task[]).map(task => {
              const status = deriveStatus(task);
              return (
                <Link
                  key={task.id}
                  href={`/tasks/${task.id}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-pink-200 transition-colors"
                >
                  <div>
                    <p className="text-sm text-gray-700">
                      {format(parseISO(task.due_date_start), 'MMM d')}
                      {task.due_date_start !== task.due_date_end && (
                        <> – {format(parseISO(task.due_date_end), 'MMM d, yyyy')}</>
                      )}
                      {task.due_date_start === task.due_date_end && (
                        <>, {format(parseISO(task.due_date_start), 'yyyy')}</>
                      )}
                    </p>
                    {task.actual_completion_date && (
                      <p className="text-xs text-gray-400">
                        Done {format(parseISO(task.actual_completion_date), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColors[status] ?? ''}`}>
                    {status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
