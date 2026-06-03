import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import type { Task, Instance } from '@/types';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

// Read-only history of completed/skipped instances for a ritual.
// Structured (query + presentational list) so it can lift into Me/Insights later.
export default async function RitualHistoryPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: task }, { data: history }] = await Promise.all([
    supabase
      .from('tasks')
      .select('id, name')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('instances')
      .select('id, status, actual_completion_date, due_date_start')
      .eq('task_id', id)
      .eq('user_id', user.id)
      .in('status', ['completed', 'skipped'])
      .eq('is_projected', false)
      .order('actual_completion_date', { ascending: false, nullsFirst: false })
      .order('due_date_start', { ascending: false }),
  ]);

  if (!task) notFound();
  const t = task as Pick<Task, 'id' | 'name'>;
  const rows = (history ?? []) as Pick<Instance, 'id' | 'status' | 'actual_completion_date' | 'due_date_start'>[];

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <div>
        <Link href={`/tasks/${id}`} style={{ fontSize: '13px', color: '#a8998e', textDecoration: 'none' }}>
          ← {t.name}
        </Link>
        <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#352720', marginTop: '8px' }}>
          History
        </h1>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '20px', color: '#a8998e' }}>
            Nothing kept or passed yet.
          </p>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid var(--divider)' }}>
          {rows.map(r => {
            const dateStr = r.actual_completion_date ?? r.due_date_start;
            const kept = r.status === 'completed';
            return (
              <div
                key={r.id}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--divider)' }}
              >
                <span style={{ fontSize: '14px', color: '#352720' }}>
                  {format(parseISO(dateStr), 'EEEE, MMM d, yyyy')}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: kept ? 'var(--sage)' : 'var(--ink-faint)',
                }}>
                  {kept ? 'Kept' : 'Passed'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
