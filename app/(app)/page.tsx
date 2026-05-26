import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';
import type { InstanceWithTask } from '@/types';
import { format, subDays } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const cutoff84 = format(subDays(new Date(), 84), 'yyyy-MM-dd');
  const cutoff30 = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const ahead7   = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');

  const [
    instancesRes,
    profileRes,
    heatmapRes,
    statsRes,
    approachingRes,
  ] = await Promise.all([
    // Today + overdue instances only (due_date_start ≤ today)
    supabase
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
      .lte('due_date_start', todayStr)
      .order('due_date_start', { ascending: true }),

    // Profile (first name for greeting)
    supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single(),

    // Heatmap: completed dates for past 84 days
    supabase
      .from('instances')
      .select('actual_completion_date')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .not('actual_completion_date', 'is', null)
      .gte('actual_completion_date', cutoff84)
      .order('actual_completion_date', { ascending: true }),

    // Stats: completed + skipped count for past 30 days
    supabase
      .from('instances')
      .select('status, actual_completion_date')
      .eq('user_id', user.id)
      .in('status', ['completed', 'skipped'])
      .gte('actual_completion_date', cutoff30),

    // Approaching maintenance: next 7 days (not yet due today)
    supabase
      .from('instances')
      .select('due_date_start, task:tasks(name, category:categories(name))')
      .eq('user_id', user.id)
      .in('status', ['upcoming', 'due'])
      .eq('is_projected', false)
      .gt('due_date_start', todayStr)
      .lte('due_date_start', ahead7)
      .order('due_date_start', { ascending: true })
      .limit(5),
  ]);

  const instances = (instancesRes.data as InstanceWithTask[]) ?? [];

  // Conflict counts
  const routineIds = [
    ...new Set(
      instances
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

  const heatmapDates = (heatmapRes.data ?? [])
    .map(r => r.actual_completion_date as string)
    .filter(Boolean);

  const completedCount = (statsRes.data ?? []).filter(r => r.status === 'completed').length;
  const skippedCount   = (statsRes.data ?? []).filter(r => r.status === 'skipped').length;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approaching = (approachingRes.data ?? []) as any as Array<{
    due_date_start: string;
    task: { name: string; category: { name: string } | null } | null;
  }>;

  const displayName = (profileRes.data?.display_name ?? null) as string | null;

  return (
    <DashboardClient
      instances={instances}
      conflictCounts={conflictCounts}
      userId={user.id}
      displayName={displayName}
      heatmapDates={heatmapDates}
      completedCount={completedCount}
      skippedCount={skippedCount}
      approaching={approaching}
    />
  );
}
