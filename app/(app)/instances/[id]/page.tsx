import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import InstanceDetailClient from '@/components/InstanceDetailClient';
import type { InstanceWithTask } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function InstanceDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: instance } = await supabase
    .from('instances')
    .select(`
      *,
      task:tasks (
        *,
        category:categories (*)
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!instance) notFound();

  return <InstanceDetailClient instance={instance as InstanceWithTask} />;
}
