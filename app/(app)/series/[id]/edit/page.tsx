import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import SeriesForm from '@/components/forms/SeriesForm';
import type { Series, Category, SeriesFormValues } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditSeriesPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: series }, { data: categories }] = await Promise.all([
    supabase
      .from('series')
      .select('*, category:categories(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('name'),
  ]);

  if (!series) notFound();

  const s = series as Series & { category?: Category };
  const initialValues: Partial<SeriesFormValues> = {
    name: s.name,
    category_id: s.category_id ?? '',
    description: s.description ?? '',
    interval_min_weeks: Math.round(s.interval_min_days / 7),
    interval_max_weeks: Math.round(s.interval_max_days / 7),
    default_reminder_days: s.default_reminder_days,
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Edit Routine</h1>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <SeriesForm
          categories={categories ?? []}
          initialValues={initialValues}
          seriesId={id}
          userId={user.id}
        />
      </div>
    </div>
  );
}
