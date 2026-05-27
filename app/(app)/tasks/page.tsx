import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import type { Task, Category, Routine } from '@/types';
import TasksClient from '@/components/TasksClient';

export const dynamic = 'force-dynamic';

export type TaskRow = Task & { category?: Category; routine?: Pick<Routine, 'id' | 'name' | 'color'> | null };

export default async function TasksListPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { category: selectedCategoryId } = await searchParams;

  const [{ data: tasksList }, { data: nextInstances }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, category:categories(*), routine:routines(id, name, color)')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('instances')
      .select('task_id, due_date_start, status')
      .eq('user_id', user.id)
      .in('status', ['upcoming', 'due', 'snoozed'])
      .eq('is_projected', false)
      .order('due_date_start', { ascending: true }),
  ]);

  // Build earliest instance date + status per task
  const nextDateByTask = new Map<string, string>();
  const nextStatusByTask = new Map<string, string>();
  for (const inst of nextInstances ?? []) {
    if (!nextDateByTask.has(inst.task_id)) {
      nextDateByTask.set(inst.task_id, inst.due_date_start);
      nextStatusByTask.set(inst.task_id, inst.status);
    }
  }

  const tasks = (tasksList ?? []) as TaskRow[];

  return (
    <TasksClient
      tasks={tasks}
      nextDateByTask={Object.fromEntries(nextDateByTask)}
      nextStatusByTask={Object.fromEntries(nextStatusByTask)}
      selectedCategoryId={selectedCategoryId ?? null}
    />
  );
}
