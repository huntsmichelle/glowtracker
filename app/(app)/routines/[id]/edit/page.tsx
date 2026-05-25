import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import RoutineForm from '@/components/forms/RoutineForm';
import type { Routine, Category, RoutineFormValues } from '@/types';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditRoutinePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: routine }, { data: categories }] = await Promise.all([
    supabase
      .from('routines')
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

  if (!routine) notFound();

  const r = routine as Routine & { category?: Category };

  // Determine initial interval display values
  const isExact = r.interval_min_days === r.interval_max_days;
  const initialValues: Partial<RoutineFormValues> = {
    name:                 r.name,
    category_id:          r.category_id ?? '',
    description:          r.description ?? '',
    intervalType:         isExact ? 'exact' : 'range',
    intervalMin:          r.interval_min_days,
    intervalMax:          r.interval_max_days,
    intervalUnit:         'days',
    default_reminder_days: r.default_reminder_days,
    mode:                 r.mode,
    target_date:          r.target_date ?? '',
    target_label:         r.target_label ?? '',
    days_before_target:   r.days_before_target ?? 7,
    continue_after_target: r.continue_after_target,
    initial_anchor_date:  '',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">Edit Routine</h1>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <RoutineForm
          categories={categories ?? []}
          initialValues={initialValues}
          routineId={id}
          userId={user.id}
        />
      </div>
    </div>
  );
}
