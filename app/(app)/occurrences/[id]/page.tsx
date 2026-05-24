import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import OccurrenceDetailClient from '@/components/OccurrenceDetailClient';
import type { OccurrenceWithSeries } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function OccurrenceDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: occ } = await supabase
    .from('occurrences')
    .select(`
      *,
      series (
        *,
        category:categories (*)
      )
    `)
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!occ) notFound();

  return <OccurrenceDetailClient occurrence={occ as OccurrenceWithSeries} />;
}
