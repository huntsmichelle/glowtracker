import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine } from '@/types';
import TemplateGallery, { type TemplateItem } from '@/components/TemplateGallery';

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

  const [taskCountsRes, conflictCountsRes, systemTemplatesRes] = await Promise.all([
    routineIds.length
      ? supabase.from('tasks').select('routine_id').in('routine_id', routineIds).eq('is_active', true)
      : Promise.resolve({ data: [] }),
    routineIds.length
      ? supabase.from('routine_conflicts').select('routine_id').in('routine_id', routineIds).eq('status', 'pending')
      : Promise.resolve({ data: [] }),
    supabase
      .from('routines')
      .select('id, name, template_description, template_task_count, template_category, color')
      .eq('is_system_template', true)
      .order('name'),
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

  const systemTemplates = (systemTemplatesRes.data ?? []) as TemplateItem[];

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="label-overline mb-1">Collections</p>
          <h1 className="font-display text-3xl text-charcoal">Routines</h1>
          <p className="text-warm-mid text-sm mt-0.5">Your groups and templates.</p>
        </div>
        <Link
          href="/routines/new"
          style={{ border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '7px 20px', textDecoration: 'none' }}
        >
          + New
        </Link>
      </div>

      {routines.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>
            No routines yet.
          </p>
          <div style={{ width: '40px', height: '1px', backgroundColor: '#cdc6b6' }} />
          <Link href="/routines/templates" style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297', cursor: 'pointer' }}>
            Browse the template library
          </Link>
        </div>
      ) : (
        <div style={{ borderTop: '1px solid #cdc6b6' }}>
          {routines.map(r => (
            <Link
              key={r.id}
              href={`/routines/${r.id}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #cdc6b6', cursor: 'pointer' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: r.color }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: '14px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                  {r.description && (
                    <p style={{ fontSize: '12px', color: '#6b665e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>{r.description}</p>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                {r.pending_conflicts > 0 && r.conflict_intent !== 'independent' && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      borderRadius: '100px',
                      padding: '2px 8px',
                      backgroundColor: 'rgba(192,138,110,0.12)',
                      border: '1px solid #c08a6e',
                      color: '#2b2823',
                    }}
                  >
                    {r.pending_conflicts} overlap{r.pending_conflicts !== 1 ? 's' : ''}
                  </span>
                )}
                <span style={{ fontSize: '12px', color: '#a8a297' }}>
                  {r.task_count} ritual{r.task_count !== 1 ? 's' : ''}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Inspiration — category tile grid */}
      <TemplateGallery templates={systemTemplates} userId={user.id} />

      {routines.length > 0 && (
        <div style={{ paddingTop: '8px', borderTop: '1px solid #cdc6b6' }}>
          <Link href="/routines/templates" style={{ fontSize: '13px', color: '#6b665e', cursor: 'pointer' }}
            className="hover:text-charcoal">
            Browse the template library →
          </Link>
        </div>
      )}
    </div>
  );
}
