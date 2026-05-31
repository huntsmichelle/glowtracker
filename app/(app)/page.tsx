import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardClient from '@/components/DashboardClient';
import type { InstanceWithTask, ProductAlert, Product, ProductCategory } from '@/types';
import { format, subDays } from 'date-fns';
import { autoCompleteInstances, retireStaleOverdueInstances } from '@/lib/autoComplete';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Run autocomplete and retire stale overdues before fetching
  await Promise.all([
    autoCompleteInstances(supabase),
    retireStaleOverdueInstances(supabase),
  ]);

  const todayStr    = format(new Date(), 'yyyy-MM-dd');
  const cutoff84    = format(subDays(new Date(), 84), 'yyyy-MM-dd');
  const cutoff30    = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const cutoff7     = format(subDays(new Date(), 6), 'yyyy-MM-dd');
  const ahead7      = format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd');
  const ahead30     = format(new Date(Date.now() + 30 * 86400000), 'yyyy-MM-dd');
  const monthStart  = format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');

  const [
    instancesRes,
    profileRes,
    heatmapRes,
    statsRes,
    approachingRes,
    alertsRes,
    shelfRes,
    shelfCatsRes,
    weekCompletedRes,
    horizonWeekRes,
    horizonMonthRes,
    nextRitualRes,
    monthCompletedRes,
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

    // Product alerts — pending only, max 2 shown
    supabase
      .from('product_alerts')
      .select('*, product:products(name), task:tasks(name)')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(2),

    // Shelf: full product data (same columns as shelf page for filter pills + uses display + reorder link)
    supabase
      .from('products')
      .select('*')
      .eq('user_id', user.id)
      .order('name')
      .limit(40),

    // Product categories for shelf filter pills
    supabase
      .from('product_categories')
      .select('id, name, slug, parent_id, sort_order, created_at')
      .order('sort_order', { ascending: true }),

    // Rolling 7-day completed count
    supabase
      .from('instances')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('actual_completion_date', cutoff7)
      .lte('actual_completion_date', todayStr),

    // Horizon: upcoming this week
    supabase
      .from('instances')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'upcoming')
      .eq('is_projected', false)
      .gte('due_date_start', todayStr)
      .lte('due_date_start', ahead7),

    // Horizon: upcoming this month
    supabase
      .from('instances')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'upcoming')
      .eq('is_projected', false)
      .gte('due_date_start', todayStr)
      .lte('due_date_start', ahead30),

    // Next upcoming ritual after today (for "all tended to" state)
    supabase
      .from('instances')
      .select('due_date_start, task:tasks(name, category:categories(name))')
      .eq('user_id', user.id)
      .eq('status', 'upcoming')
      .eq('is_projected', false)
      .gt('due_date_start', todayStr)
      .order('due_date_start', { ascending: true })
      .limit(1)
      .maybeSingle(),

    // Monthly completions + category breakdown for insights footer
    supabase
      .from('instances')
      .select('task:tasks(name, category:categories(name))')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .gte('actual_completion_date', monthStart)
      .lte('actual_completion_date', todayStr),
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
  const productAlerts = (alertsRes.data ?? []) as ProductAlert[];

  const shelfProducts = (shelfRes.data ?? []) as Product[];
  const shelfProductCategories = (shelfCatsRes.data ?? []) as ProductCategory[];

  const weekCompleted = weekCompletedRes.count ?? 0;
  const horizonWeekCount = horizonWeekRes.count ?? 0;
  const horizonMonthCount = horizonMonthRes.count ?? 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextRitual = nextRitualRes.data as any;

  // Monthly insights: most-tended category + longest maintained task
  const monthRecords = (monthCompletedRes.data ?? []) as Array<{ task?: { name?: string; category?: { name?: string } | null } | null }>;
  const monthCompletedCount = monthRecords.length;
  const catCounts: Record<string, number> = {};
  const taskCounts: Record<string, number> = {};
  for (const r of monthRecords) {
    const cat = (Array.isArray(r.task?.category) ? r.task?.category?.[0]?.name : r.task?.category?.name) ?? null;
    if (cat) catCounts[cat] = (catCounts[cat] ?? 0) + 1;
    const tname = r.task?.name ?? null;
    if (tname) taskCounts[tname] = (taskCounts[tname] ?? 0) + 1;
  }
  const mostTendedCategory = Object.keys(catCounts).sort((a, b) => catCounts[b] - catCounts[a])[0] ?? null;
  const longestMaintained = Object.keys(taskCounts).sort((a, b) => taskCounts[b] - taskCounts[a])[0] ?? null;

  // Compute ready (due today) and past window counts from instances
  const readyCount = instances.filter(i => i.due_date_start === todayStr).length;
  const pastWindowCount = instances.filter(i => i.due_date_start < todayStr).length;

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
      productAlerts={productAlerts}
      shelfProducts={shelfProducts}
      shelfProductCategories={shelfProductCategories}
      weekCompleted={weekCompleted}
      readyCount={readyCount}
      pastWindowCount={pastWindowCount}
      horizonWeekCount={horizonWeekCount}
      horizonMonthCount={horizonMonthCount}
      nextRitual={nextRitual}
      monthCompletedCount={monthCompletedCount}
      mostTendedCategory={mostTendedCategory}
      longestMaintained={longestMaintained}
    />
  );
}
