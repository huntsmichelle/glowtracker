import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine, Task } from '@/types';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoutineTemplateDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Allow system templates (any user) and user's own templates
  const { data: template } = await supabase
    .from('routines')
    .select('*, tasks(*)')
    .eq('id', id)
    .or(`is_system_template.eq.true,user_id.eq.${user.id}`)
    .eq('is_template', true)
    .single();

  if (!template) notFound();

  const t = template as Routine & { tasks?: Task[] };

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/routines" className="text-sm text-warm-light hover:text-charcoal">Routines</Link>
        <span className="text-warm-light">/</span>
        <Link href="/routines/templates" className="text-sm text-warm-light hover:text-charcoal">Templates</Link>
        <span className="text-warm-light">/</span>
        <span className="text-sm text-warm-mid truncate">{t.name}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
        <h1 className="font-display text-3xl text-charcoal">{t.name}</h1>
      </div>

      {(t.template_description ?? t.description) && (
        <p className="text-sm text-warm-mid">{t.template_description ?? t.description}</p>
      )}

      {(t.tasks ?? []).length > 0 && (
        <div>
          <p className="label-overline mb-2">Includes</p>
          <div className="space-y-1.5">
            {(t.tasks ?? []).map(task => (
              <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-stone border border-glow-border rounded-lg text-sm text-charcoal">
                <span className="w-2 h-2 rounded-full bg-glow-border flex-shrink-0" />
                {task.name}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-glow-border flex items-center justify-between">
        <Link href="/routines/templates" className="text-sm text-warm-light hover:text-charcoal">
          ← All templates
        </Link>
        <Link
          href={`/routines/new/from-template/${t.id}`}
          style={{
            border: '1px solid #2b2823',
            backgroundColor: 'transparent',
            color: '#2b2823',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '100px',
            padding: '7px 20px',
            textDecoration: 'none',
          }}
        >
          Use template →
        </Link>
      </div>
    </div>
  );
}
