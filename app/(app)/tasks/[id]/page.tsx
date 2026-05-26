import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import type { Task, Instance, Category } from '@/types';
import { deriveStatus } from '@/lib/instanceEngine';

export const dynamic = 'force-dynamic';

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

  const statusStyles: Record<string, string> = {
    upcoming:  'bg-taupe text-warm-mid',
    due:       'bg-dust-lt text-charcoal',
    completed: 'bg-sage-lt text-charcoal',
    skipped:   'bg-taupe text-warm-light',
    snoozed:   'bg-taupe text-warm-mid',
  };

  const statusLabels: Record<string, string> = {
    upcoming:  'Upcoming',
    due:       'Ready',
    completed: 'Kept',
    skipped:   'Passed',
    snoozed:   'Nudged',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: t.category?.color ?? '#9E9890' }}
            />
            <span className="text-xs text-warm-light">{t.category?.name ?? 'No category'}</span>
            {t.mode === 'countdown' && (
              <span className="text-xs text-warm-mid font-medium">Countdown</span>
            )}
          </div>
          <h1 className="font-display text-3xl text-charcoal">{t.name}</h1>
          <p className="text-sm text-warm-mid mt-0.5">{intervalLabel}</p>
          {t.mode === 'countdown' && t.target_date && (
            <p className="text-sm text-warm-mid mt-0.5">
              {t.target_label ? `${t.target_label} · ` : ''}
              Target: {format(parseISO(t.target_date), 'MMM d, yyyy')}
            </p>
          )}
        </div>
        <Link
          href={`/tasks/${id}/edit`}
          className="flex-shrink-0 text-sm border border-glow-border text-warm-mid rounded-pill px-3 py-1.5 hover:bg-taupe transition-colors"
        >
          Edit
        </Link>
      </div>

      {/* Description */}
      {t.description && (
        <div className="bg-stone border border-glow-border rounded-lg p-4">
          <p className="label-overline mb-2">Notes</p>
          <p className="text-sm text-charcoal whitespace-pre-wrap">{t.description}</p>
        </div>
      )}

      {/* Instance history */}
      <div>
        <p className="label-overline mb-3">
          {t.mode === 'countdown' ? 'Scheduled instances' : 'History'}
        </p>
        {(instances ?? []).length === 0 ? (
          <p className="text-sm text-warm-light">No instances yet.</p>
        ) : (
          <div className="space-y-2">
            {(instances as Instance[]).map(instance => {
              const status = deriveStatus(instance);
              return (
                <Link
                  key={instance.id}
                  href={`/instances/${instance.id}`}
                  className="flex items-center justify-between bg-stone border border-glow-border rounded-lg px-4 py-3 card-lift"
                >
                  <div>
                    <p className="text-sm text-charcoal">
                      {format(parseISO(instance.due_date_start), 'MMM d')}
                      {instance.due_date_start !== instance.due_date_end && (
                        <> – {format(parseISO(instance.due_date_end), 'MMM d, yyyy')}</>
                      )}
                      {instance.due_date_start === instance.due_date_end && (
                        <>, {format(parseISO(instance.due_date_start), 'yyyy')}</>
                      )}
                    </p>
                    {instance.actual_completion_date && (
                      <p className="text-xs text-warm-light">
                        Kept {format(parseISO(instance.actual_completion_date), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-pill ${statusStyles[status] ?? ''}`}>
                    {statusLabels[status] ?? status}
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
