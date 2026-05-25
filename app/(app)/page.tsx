import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';
import type { InstanceWithTask } from '@/types';

export const dynamic = 'force-dynamic';

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
        category:categories (*),
        routine:routines (id, name, color)
      )
    `)
    .eq('user_id', user.id)
    .in('status', ['upcoming', 'due', 'snoozed'])
    .eq('is_projected', false)
    .order('due_date_start', { ascending: true });

  // Collect unique routine IDs to fetch conflict counts
  const routineIds = [
    ...new Set(
      (instances ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((i: any) => i.task?.routine?.id as string | undefined)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  let conflictCounts: Record<string, number> = {};
  if (routineIds.length) {
    const { data: conflicts } = await supabase
      .from('routine_conflicts')
      .select('routine_id')
      .in('routine_id', routineIds)
      .eq('status', 'pending');
    for (const c of conflicts ?? []) {
      conflictCounts[c.routine_id] = (conflictCounts[c.routine_id] ?? 0) + 1;
    }
  }

  return (
    <DashboardClient
      instances={(instances as InstanceWithTask[]) ?? []}
      conflictCounts={conflictCounts}
    />
  );
}
