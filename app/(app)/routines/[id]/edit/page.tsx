import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import type { Routine } from '@/types';
import RoutineEditClient from '@/components/RoutineEditClient';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditRoutinePage({ params }: Props) {
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

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <RoutineEditClient routine={routine as Routine} />
    </div>
  );
}
