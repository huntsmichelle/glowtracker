import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import TaskForm from '@/components/forms/TaskForm';
import type { Task, Category, TaskFormValues, ProductFormEntry, ServiceProviderFormEntry } from '@/types';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditTaskPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const [{ data: task }, { data: categories }, { data: taskProducts }, { data: spRow }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, category:categories(*)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('categories')
      .select('*')
      .or(`user_id.eq.${user.id},user_id.is.null`)
      .order('name'),
    supabase
      .from('task_products')
      .select('id, track_usage, uses_per_supply_unit, product:products(id, name, description, product_url)')
      .eq('task_id', id),
    supabase
      .from('tasks')
      .select('service_provider:service_providers(id, name, phone, website_url, address)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single(),
  ]);

  if (!task) notFound();

  const t = task as Task & { category?: Category };
  const isExact = t.interval_min_days === t.interval_max_days;

  const initialValues: Partial<TaskFormValues> = {
    name:                  t.name,
    category_id:           t.category_id ?? '',
    description:           t.description ?? '',
    default_cost:          t.default_cost != null ? String(t.default_cost) : '',
    reminder_notes:        t.reminder_notes ?? '',
    intervalType:          isExact ? 'exact' : 'range',
    intervalMin:           t.interval_min_days,
    intervalMax:           t.interval_max_days,
    intervalUnit:          'days',
    default_reminder_days: t.default_reminder_days,
    mode:                  t.mode,
    target_date:           t.target_date ?? '',
    target_label:          t.target_label ?? '',
    days_before_target:    t.days_before_target ?? 7,
    continue_after_target: t.continue_after_target,
    initial_anchor_date:   '',
  };

  type RawTaskProduct = {
    id: string;
    track_usage: boolean;
    uses_per_supply_unit: number | null;
    product: { id: string; name: string; description: string | null; product_url: string | null };
  };

  const initialProducts: ProductFormEntry[] = ((taskProducts ?? []) as unknown as RawTaskProduct[]).map(tp => ({
    id: tp.product.id,
    taskProductId: tp.id,
    name: tp.product.name,
    description: tp.product.description ?? '',
    product_url: tp.product.product_url ?? '',
    track_usage: tp.track_usage,
    uses_per_supply_unit: tp.uses_per_supply_unit != null ? tp.uses_per_supply_unit : '',
  }));

  type SpData = { service_provider: ServiceProviderFormEntry | null } | null;
  const sp = (spRow as SpData)?.service_provider ?? null;
  const initialServiceProvider: ServiceProviderFormEntry | null = sp
    ? { id: (sp as any).id, name: sp.name, phone: sp.phone ?? '', website_url: sp.website_url ?? '', address: sp.address ?? '' }
    : null;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <h1 className="font-display text-3xl text-charcoal">Edit Ritual</h1>
      <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5">
        <TaskForm
          categories={categories ?? []}
          initialValues={initialValues}
          taskId={id}
          initialProducts={initialProducts}
          initialServiceProvider={initialServiceProvider}
          userId={user.id}
        />
      </div>
    </div>
  );
}
