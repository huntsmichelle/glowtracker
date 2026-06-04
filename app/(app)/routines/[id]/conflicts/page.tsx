import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import type { Routine } from '@/types';
import RoutineConflictsClient from '@/components/RoutineConflictsClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RoutineConflictsPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: routine } = await supabase
    .from('routines')
    .select('id, name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!routine) notFound();

  return (
    <RoutineConflictsClient
      routineId={id}
      userId={user.id}
      routineName={(routine as Pick<Routine, 'name'>).name}
    />
  );
}
