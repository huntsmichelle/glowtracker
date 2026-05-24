import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';
import type { OccurrenceWithSeries } from '@/types';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: occurrences } = await supabase
    .from('occurrences')
    .select(`
      *,
      series (
        *,
        category:categories (*)
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['upcoming', 'due', 'snoozed'])
    .order('due_date_start', { ascending: true });

  return <DashboardClient occurrences={(occurrences as OccurrenceWithSeries[]) ?? []} />;
}
