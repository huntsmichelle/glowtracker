import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Task } from '@/types';
import UseTemplateFlow from '@/components/UseTemplateFlow';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function FromTemplatePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Fetch the template — allow system templates or user's own
  const { data: template } = await supabase
    .from('routines')
    .select('id, name, template_description, template_task_count, color, template_category')
    .eq('id', id)
    .or(`is_system_template.eq.true,user_id.eq.${user.id}`)
    .single();

  if (!template) notFound();

  // Fetch template tasks (readable via RLS policy 016)
  const { data: templateTasks } = await supabase
    .from('tasks')
    .select('id, name, category_id, description, interval_min_days, interval_max_days, frequency_type, prep_notes, reminder_notes')
    .eq('routine_id', id);

  return (
    <div className="max-w-xl mx-auto px-5 py-12">
      <div className="flex items-center gap-2 mb-8">
        <Link href="/routines/templates" className="text-sm text-warm-light hover:text-charcoal">Templates</Link>
        <span className="text-warm-light">/</span>
        <span className="text-sm text-warm-mid">New routine</span>
      </div>

      <div className="bg-stone border border-glow-border rounded-xl shadow-card p-6">
        <UseTemplateFlow
          templateId={template.id}
          templateName={template.name}
          templateTaskCount={template.template_task_count ?? (templateTasks ?? []).length}
          templateTasks={(templateTasks ?? []) as Pick<Task, 'id' | 'name' | 'category_id' | 'description' | 'interval_min_days' | 'interval_max_days' | 'frequency_type' | 'prep_notes' | 'reminder_notes'>[]}
          userId={user.id}
        />
      </div>
    </div>
  );
}
