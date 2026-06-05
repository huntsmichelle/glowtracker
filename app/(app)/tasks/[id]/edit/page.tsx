import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
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

  const [{ data: task }, { data: categories }, { data: productCategories }, { data: taskProducts }, { data: spRow }] = await Promise.all([
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
      .from('product_categories')
      .select('id, name, slug, parent_id, sort_order, created_at')
      .order('sort_order'),
    supabase
      .from('task_products')
      .select('id, track_usage, purchase_price, uses_per_container, use_amount_override, product:products(id, name, brand, description, product_url, product_category_id, container_size, container_unit, expires_at)')
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
    frequencyType:         t.frequency_type,
    intervalType:          isExact ? 'exact' : 'range',
    intervalMin:           t.interval_min_days,
    intervalMax:           t.interval_max_days,
    intervalUnit:          'days',
    // Twice-daily times live in scheduled_time (AM) + scheduled_time_pm (PM)
    slotATime:             t.frequency_type === 'twice_daily' ? (t.scheduled_time ?? '') : '',
    slotBTime:             t.scheduled_time_pm ?? '',
    scheduledTime:         t.scheduled_time ?? '',
    timeOfDayLabel:        t.time_of_day_label ?? '',
    default_reminder_days: t.default_reminder_days,
    mode:                  t.mode,
    target_date:           t.target_date ?? '',
    target_label:          t.target_label ?? '',
    days_before_target:    t.days_before_target ?? 7,
    continue_after_target: t.continue_after_target,
    initial_anchor_date:   '',
    provider_cost:         t.provider_cost != null ? String(t.provider_cost) : '',
    provider_phone:        t.provider_phone ?? '',
    prep_notes:            t.prep_notes ?? '',
    autocomplete_enabled:  t.autocomplete_enabled,
    reminder_enabled:      t.reminder_enabled,
    // Daily/Twice-daily store the offset in reminder_hours (mobile shape)
    reminder_value:        (t.frequency_type === 'daily' || t.frequency_type === 'twice_daily')
      ? ((t as { reminder_hours?: number | null }).reminder_hours ?? t.reminder_value ?? 0)
      : t.reminder_value,
    reminder_unit:         (t.frequency_type === 'daily' || t.frequency_type === 'twice_daily')
      ? 'hours'
      : t.reminder_unit,
  };

  type RawTaskProduct = {
    id: string;
    track_usage: boolean;
    purchase_price: number | null;
    uses_per_container: number | null;
    use_amount_override: number | null;
    product: {
      id: string; name: string; brand: string | null;
      description: string | null; product_url: string | null;
      product_category_id: string | null;
      container_size: number | null; container_unit: string | null;
      expires_at: string | null;
    };
  };

  const initialProducts: ProductFormEntry[] = ((taskProducts ?? []) as unknown as RawTaskProduct[]).map(tp => ({
    id: tp.product.id,
    taskProductId: tp.id,
    name: tp.product.name,
    brand: tp.product.brand ?? '',
    description: tp.product.description ?? '',
    product_url: tp.product.product_url ?? '',
    product_category_id: tp.product.product_category_id ?? '',
    track_usage: tp.track_usage,
    container_size: tp.product.container_size != null ? tp.product.container_size : '',
    container_unit: tp.product.container_unit ?? '',
    use_amount_override: tp.use_amount_override != null ? tp.use_amount_override : '',
    purchase_price: tp.purchase_price != null ? String(tp.purchase_price) : '',
    uses_per_container: tp.uses_per_container != null ? tp.uses_per_container : '',
    expires_at: tp.product.expires_at ? tp.product.expires_at.slice(0, 7) : '',
  }));

  type SpData = { service_provider: ServiceProviderFormEntry | null } | null;
  const sp = (spRow as SpData)?.service_provider ?? null;
  const initialServiceProvider: ServiceProviderFormEntry | null = sp
    ? { id: (sp as any).id, name: sp.name, phone: sp.phone ?? '', website_url: sp.website_url ?? '', address: sp.address ?? '' }
    : null;

  return (
    <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-charcoal">Edit Ritual</h1>
        <Link
          href={`/tasks/${id}/history`}
          style={{ fontFamily: 'Inter, sans-serif', fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--ink-faint)', textDecoration: 'none' }}
        >
          View history →
        </Link>
      </div>
      <div className="bg-stone border border-glow-border rounded-lg shadow-card p-5">
        <TaskForm
          categories={categories ?? []}
          productCategories={productCategories ?? []}
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
