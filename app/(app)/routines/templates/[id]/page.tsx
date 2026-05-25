import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine, Task } from '@/types';
import RoutineFromTemplateClient from '@/components/RoutineFromTemplateClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoutineTemplateDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: template } = await supabase
    .from('routines')
    .select('*, tasks(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('is_template', true)
    .single();

  if (!template) notFound();

  const t = template as Routine & { tasks?: Task[] };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/routines" className="text-sm text-gray-400 hover:text-gray-600">
          Routines
        </Link>
        <span className="text-gray-300">/</span>
        <Link href="/routines/templates" className="text-sm text-gray-400 hover:text-gray-600">
          Templates
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600 truncate">{t.name}</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
        <h1 className="text-xl font-bold text-gray-800">{t.name}</h1>
      </div>

      {t.description && (
        <p className="text-sm text-gray-500">{t.description}</p>
      )}

      {(t.tasks ?? []).length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Includes</h2>
          <div className="space-y-1.5">
            {(t.tasks ?? []).map(task => (
              <div key={task.id} className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-100 text-sm text-gray-700">
                <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />
                {task.name}
              </div>
            ))}
          </div>
        </div>
      )}

      <RoutineFromTemplateClient template={t} />
    </div>
  );
}
