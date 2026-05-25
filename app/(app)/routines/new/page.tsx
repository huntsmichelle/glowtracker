import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import RoutineForm from '@/components/forms/RoutineForm';

export default async function NewRoutinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('name');

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-800">New Routine</h1>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <RoutineForm
          categories={categories ?? []}
          userId={user.id}
        />
      </div>
    </div>
  );
}
