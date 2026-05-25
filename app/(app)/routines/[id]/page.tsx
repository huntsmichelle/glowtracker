import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Routine, Task } from '@/types';
import RoutineDetailClient from '@/components/RoutineDetailClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoutineDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: routine } = await supabase
    .from('routines')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!routine) notFound();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);
  const ninetyOut = new Date(today);
  ninetyOut.setDate(ninetyOut.getDate() + 90);
  const ninetyStr = ninetyOut.toISOString().slice(0, 10);

  const [tasksRes, pairsRes, conflictsRes, availableRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, category:categories(*)')
      .eq('routine_id', id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('routine_task_pairs')
      .select('*, task_a:tasks(id, name), task_b:tasks(id, name)')
      .eq('routine_id', id)
      .order('created_at'),
    supabase
      .from('routine_conflicts')
      .select(`
        *,
        pair:routine_task_pairs(
          id,
          default_resolution,
          task_a:tasks(id, name),
          task_b:tasks(id, name)
        ),
        instance_a:instances(id, due_date_start, due_date_end),
        instance_b:instances(id, due_date_start, due_date_end)
      `)
      .eq('routine_id', id)
      .eq('status', 'pending')
      .order('conflict_date'),
    supabase
      .from('tasks')
      .select('id, name, category_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .is('routine_id', null)
      .order('name'),
  ]);

  const tasks = (tasksRes.data ?? []) as Task[];

  type TimelineInst = {
    id: string;
    task_id: string;
    due_date_start: string;
    due_date_end: string;
    status: string;
    is_projected: boolean;
  };

  // Fetch timeline instances for each task in the routine
  const taskIds = tasks.map(t => t.id);
  let timelineInstances: TimelineInst[] = [];
  if (taskIds.length) {
    const res = await supabase
      .from('instances')
      .select('id, task_id, due_date_start, due_date_end, status, is_projected')
      .in('task_id', taskIds)
      .not('status', 'in', '(completed,skipped)')
      .gte('due_date_start', todayStr)
      .lte('due_date_start', ninetyStr)
      .order('due_date_start');
    timelineInstances = (res.data ?? []) as TimelineInst[];
  }

  const instancesByTask: Record<string, TimelineInst[]> = {};
  for (const inst of timelineInstances) {
    if (!instancesByTask[inst.task_id]) instancesByTask[inst.task_id] = [];
    instancesByTask[inst.task_id].push(inst);
  }

  const timelineTasks = tasks.map(t => ({
    id: t.id,
    name: t.name,
    instances: instancesByTask[t.id] ?? [],
  }));

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 mb-4">
        <Link href="/routines" className="text-sm text-gray-400 hover:text-gray-600">
          Routines
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-600 truncate">{(routine as Routine).name}</span>
      </div>

      <RoutineDetailClient
        routine={routine as Routine}
        tasks={tasks}
        pairs={(pairsRes.data ?? []) as never}
        conflicts={(conflictsRes.data ?? []) as never}
        availableTasks={(availableRes.data ?? []) as Task[]}
        timelineTasks={timelineTasks}
      />
    </div>
  );
}
