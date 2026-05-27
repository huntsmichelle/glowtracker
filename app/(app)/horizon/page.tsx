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
        routine:routines (id, name, color)
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['upcoming', 'due', 'snoozed'])
    .order('due_date_start', { ascending: true });

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <HorizonClient
        instances={(instances as InstanceWithTask[]) ?? []}
        userId={user.id}
      />
    </div>
  );
}
