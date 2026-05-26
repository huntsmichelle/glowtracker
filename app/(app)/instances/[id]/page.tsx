import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import InstanceDetailClient from '@/components/InstanceDetailClient';
import type { InstanceWithTask } from '@/types';

export const dynamic = 'force-dynamic';

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

  return (
    <div className="max-w-2xl mx-auto px-5 py-8">
      <InstanceDetailClient instance={instance as InstanceWithTask} />
    </div>
  );
}
