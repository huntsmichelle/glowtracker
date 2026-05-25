import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import TaskDetailClient from '@/components/TaskDetailClient';
import type { TaskWithRoutine } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TaskDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: task } = await supabase
    .from('tasks')
    .select(`
      *,
      routine:routines (
        *,
        category:categories (*)
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!task) notFound();

  return <TaskDetailClient task={task as TaskWithRoutine} />;
}
