import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';
import type { InstanceWithTask } from '@/types';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: instances } = await supabase
    .from('instances')
    .select(`
      *,
      task:tasks (
        *,
        category:categories (*)
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['upcoming', 'due', 'snoozed'])
    .order('due_date_start', { ascending: true });

  return <DashboardClient instances={(instances as InstanceWithTask[]) ?? []} />;
}
