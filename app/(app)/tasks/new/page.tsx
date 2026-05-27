import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import TaskForm from '@/components/forms/TaskForm';

export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: categories }, { data: productCategories }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('name'),
    supabase
      .from('product_categories')
      .select('id, name, slug, parent_id, sort_order, created_at')
      .order('sort_order'),
  ]);

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <h1 className="font-display text-3xl text-charcoal">New Ritual</h1>
      <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5">
        <TaskForm
          categories={categories ?? []}
          productCategories={productCategories ?? []}
          userId={user.id}
        />
      </div>
    </div>
  );
}
