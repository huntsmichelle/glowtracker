import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import NewRoutineClient from '@/components/NewRoutineClient';

export const dynamic = 'force-dynamic';

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
    <div className="max-w-2xl mx-auto px-5 py-8">
      <NewRoutineClient categories={categories ?? []} userId={user.id} />
    </div>
  );
}
