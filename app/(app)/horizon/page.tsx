import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import HorizonClient from '@/components/HorizonClient';
import type { InstanceWithTask } from '@/types';
import { retireStaleOverdueInstances } from '@/lib/autoComplete';

export const dynamic = 'force-dynamic';

export default async function HorizonPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  await retireStaleOverdueInstances(supabase);

  const { data: instances } = await supabase
    .from('instances')
    .select(`
      *,
      task:tasks (
        *,
        category:categories (*),
        routine:routines (id, name, color),
        service_provider:service_providers (name)
      )
    `)
    .eq('user_id', user.id)
    .eq('status', 'upcoming')
    .eq('is_projected', false)
    .order('due_date_start', { ascending: true });

  const allInstances = (instances as InstanceWithTask[]) ?? [];
  const todayStr = new Date().toISOString().split('T')[0];

  // Summary bar counts
  const ahead30 = new Date();
  ahead30.setDate(ahead30.getDate() + 30);
  const ahead30Str = ahead30.toISOString().split('T')[0];
  const instancesIn30 = allInstances.filter(i => i.due_date_start >= todayStr && i.due_date_start <= ahead30Str);
  const catSet = new Set(instancesIn30.map(i => i.task?.category?.id).filter(Boolean));

  return (
    <>
      <div className="max-w-2xl mx-auto px-5 py-8">
        <HorizonClient
          instances={allInstances}
          userId={user.id}
          summaryCount={instancesIn30.length}
          summaryCategoryCount={catSet.size}
        />
      </div>
      <a
        href="/add"
        style={{
          position: 'fixed',
          bottom: '32px',
          right: '32px',
          backgroundColor: 'var(--ink)',
          color: 'var(--cream)',
          fontFamily: 'Inter, sans-serif',
          fontSize: '15px',
          fontWeight: 500,
          padding: '14px 24px',
          borderRadius: '100px',
          textDecoration: 'none',
          boxShadow: '0 4px 20px rgba(53,39,32,0.15)',
          zIndex: 40,
          letterSpacing: '0.01em',
        }}
      >
        + New
      </a>
    </>
  );
}
