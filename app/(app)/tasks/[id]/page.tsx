import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import type { Task, Instance, Category } from '@/types';
import { deriveStatus } from '@/lib/instanceEngine';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: task } = await supabase
    .from('tasks')
    .select('*, category:categories(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!task) notFound();

  const { data: instances } = await supabase
    .from('instances')
    .select('*')
    .eq('task_id', id)
    .order('due_date_start', { ascending: false });

  const t = task as Task & { category?: Category };

  const intervalLabel =
    t.interval_min_days === t.interval_max_days
      ? `Every ${t.interval_min_days} days`
      : `Every ${t.interval_min_days}–${t.interval_max_days} days`;

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
              style={{ backgroundColor: t.category?.color ?? '#6B7280' }}
            />
            <span className="text-xs text-gray-400">{t.category?.name ?? 'No category'}</span>
            {t.mode === 'countdown' && (
              <span className="text-xs text-purple-400 font-medium">Countdown</span>
            )}
          </div>
          <h1 className="text-xl font-bold text-gray-800">{t.name}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{intervalLabel}</p>
          {t.mode === 'countdown' && t.target_date && (
            <p className="text-sm text-purple-500 mt-0.5">
              {t.target_label ? `${t.target_label} · ` : ''}
              Target: {format(parseISO(t.target_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>
        <Link
          href={`/tasks/${id}/edit`}
          className="flex-shrink-0 text-sm border border-gray-200 text-gray-600 rounded-lg px-3 py-1.5"
        >
          Edit
        </Link>
      </div>

      {/* Description */}
      {t.description && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Notes</h2>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.description}</p>
        </div>
      )}

      {/* Instance history */}
      <div>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          {t.mode === 'countdown' ? 'Scheduled instances' : 'History'}
        </h2>
        {(instances ?? []).length === 0 ? (
          <p className="text-sm text-gray-400">No instances yet.</p>
        ) : (
          <div className="space-y-2">
            {(instances as Instance[]).map(instance => {
              const status = deriveStatus(instance);
              return (
                <Link
                  key={instance.id}
                  href={`/instances/${instance.id}`}
                  className="flex items-center justify-between bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-pink-200 transition-colors"
                >
                  <div>
                    <p className="text-sm text-gray-700">
                      {format(parseISO(instance.due_date_start), 'MMM d')}
                      {instance.due_date_start !== instance.due_date_end && (
                        <> – {format(parseISO(instance.due_date_end), 'MMM d, yyyy')}</>
                      )}
                      {instance.due_date_start === instance.due_date_end && (
                        <>, {format(parseISO(instance.due_date_start), 'yyyy')}</>
                      )}
                    </p>
                    {instance.actual_completion_date && (
                      <p className="text-xs text-gray-400">
                        Done {format(parseISO(instance.actual_completion_date), 'MMM d, yyyy')}
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
