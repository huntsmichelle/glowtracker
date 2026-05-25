'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO, isBefore } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  createFirstInstance,
  generateCountdownInstances,
  calculateCountdownWindows,
} from '@/lib/instanceEngine';
import type {
  Category,
  Task,
  TaskFormValues,
  TaskMode,
  IntervalType,
  IntervalUnit,
  ProductFormEntry,
  ServiceProviderFormEntry,
  ServiceProvider,
} from '@/types';

interface Props {
  categories: Category[];
  initialValues?: Partial<TaskFormValues>;
  taskId?: string;                                   // present = edit mode
  initialProducts?: ProductFormEntry[];
  initialServiceProvider?: ServiceProviderFormEntry | null;
  userId: string;
}

type Step = 'mode-choice' | 'anchor-date' | 'details' | 'countdown-preview';

function toDays(value: number, unit: IntervalUnit) {
  return unit === 'weeks' ? value * 7 : value;
}

function formatWindow(start: string, end: string): string {
  if (start === end) return format(parseISO(start), 'MMM d, yyyy');
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d, yyyy')}`;
}

// Preset swatches for custom category creation
const COLOR_SWATCHES = [
  '#EC4899', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#A855F7', '#EF4444',
  '#6366F1', '#6B7280',
];

function emptyProduct(): ProductFormEntry {
  return { name: '', description: '', product_url: '', track_usage: false, uses_per_supply_unit: '' };
}

export default function TaskForm({
  categories: initialCategories,
  initialValues,
  taskId,
  initialProducts,
  initialServiceProvider,
  userId,
}: Props) {
  const router  = useRouter();
  const isEdit  = !!taskId;

  // ── Step / mode ───────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>(isEdit ? 'details' : 'mode-choice');
  const [mode, setMode] = useState<TaskMode>(initialValues?.mode ?? 'standard');

  // ── Standard-mode anchor ──────────────────────────────────────────────────
  const [anchorType, setAnchorType] = useState<'today' | 'past'>('today');
  const [anchorDate, setAnchorDate] = useState(initialValues?.initial_anchor_date ?? '');

  // ── Core fields ───────────────────────────────────────────────────────────
  const [name, setName]               = useState(initialValues?.name ?? '');
  const [categoryId, setCategoryId]   = useState(initialValues?.category_id ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [reminderDays, setReminderDays] = useState(initialValues?.default_reminder_days ?? 2);

  // ── Interval ──────────────────────────────────────────────────────────────
  const [intervalType, setIntervalType] = useState<IntervalType>(
    initialValues?.intervalType ?? 'range'
  );
  const [intervalMin, setIntervalMin] = useState(initialValues?.intervalMin ?? 4);
  const [intervalMax, setIntervalMax] = useState(initialValues?.intervalMax ?? 6);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    initialValues?.intervalUnit ?? 'weeks'
  );

  // ── Countdown mode ────────────────────────────────────────────────────────
  const [targetDate, setTargetDate]           = useState(initialValues?.target_date ?? '');
  const [targetLabel, setTargetLabel]         = useState(initialValues?.target_label ?? '');
  const [daysBeforeTarget, setDaysBeforeTarget] = useState(
    initialValues?.days_before_target ?? 7
  );
  const [continueAfterTarget, setContinueAfterTarget] = useState(
    initialValues?.continue_after_target ?? true
  );
  const [previewWindows, setPreviewWindows] = useState<
    Array<{ due_date_start: string; due_date_end: string }>
  >([]);

  // ── Categories (local list — updated when user creates one) ───────────────
  const [localCategories, setLocalCategories] = useState<Category[]>(initialCategories);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_SWATCHES[0]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  // ── Products ──────────────────────────────────────────────────────────────
  const [productEntries, setProductEntries] = useState<ProductFormEntry[]>(
    initialProducts ?? []
  );
  const [removedTaskProductIds, setRemovedTaskProductIds] = useState<string[]>([]);

  // ── Service provider ──────────────────────────────────────────────────────
  const [showServiceProvider, setShowServiceProvider] = useState(
    !!initialServiceProvider?.name
  );
  const [serviceProviderEntry, setServiceProviderEntry] = useState<ServiceProviderFormEntry>(
    initialServiceProvider ?? { name: '', phone: '', website_url: '', address: '' }
  );
  const [savedProviders, setSavedProviders] = useState<ServiceProvider[]>([]);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch saved service providers when category changes
  useEffect(() => {
    if (!categoryId) { setSavedProviders([]); return; }
    const supabase = createClient();
    supabase
      .from('service_providers')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .order('name')
      .then(({ data }) => setSavedProviders(data ?? []));
  }, [categoryId, userId]);

  // ─── Interval helpers ──────────────────────────────────────────────────────

  function intervalMinDays() { return toDays(intervalMin, intervalUnit); }
  function intervalMaxDays() {
    return toDays(intervalType === 'exact' ? intervalMin : intervalMax, intervalUnit);
  }

  function validateInterval(): string {
    if (intervalMin < 1) return 'Interval must be at least 1.';
    if (intervalType === 'range' && intervalMin > intervalMax) {
      return 'Minimum interval cannot exceed maximum.';
    }
    return '';
  }

  // ─── Category creation ─────────────────────────────────────────────────────

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setCategoryLoading(true);
    const supabase = createClient();
    const { data, error: catErr } = await supabase
      .from('categories')
      .insert({
        user_id: userId,
        name: newCategoryName.trim(),
        color: newCategoryColor,
        is_default: false,
      })
      .select()
      .single();

    if (catErr) {
      setCategoryLoading(false);
      return;
    }
    const newCat = data as Category;
    setLocalCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
    setCategoryId(newCat.id);
    setShowNewCategory(false);
    setNewCategoryName('');
    setCategoryLoading(false);
  }

  // ─── Products helpers ──────────────────────────────────────────────────────

  function addProduct() {
    if (productEntries.length >= 10) return;
    setProductEntries(prev => [...prev, emptyProduct()]);
  }

  function updateProduct(index: number, updated: ProductFormEntry) {
    setProductEntries(prev => prev.map((p, i) => (i === index ? updated : p)));
  }

  function removeProduct(index: number) {
    const entry = productEntries[index];
    if (entry.taskProductId) {
      setRemovedTaskProductIds(prev => [...prev, entry.taskProductId!]);
    }
    setProductEntries(prev => prev.filter((_, i) => i !== index));
  }

  // ─── Service provider helpers ──────────────────────────────────────────────

  function applySavedProvider(provider: ServiceProvider) {
    setServiceProviderEntry({
      id:          provider.id,
      name:        provider.name,
      phone:       provider.phone ?? '',
      website_url: provider.website_url ?? '',
      address:     provider.address ?? '',
    });
    setShowServiceProvider(true);
  }

  // ─── Preview calculation ───────────────────────────────────────────────────

  function buildPreview() {
    const err = validateInterval();
    if (err) { setError(err); return; }
    if (!targetDate) { setError('Please enter a target date.'); return; }

    const windows = calculateCountdownWindows({
      target_date: targetDate,
      days_before_target: daysBeforeTarget,
      interval_min_days: intervalMinDays(),
      interval_max_days: intervalMaxDays(),
    });

    if (windows.length === 0) {
      setError(
        'No instances fall between today and your target date with this interval. ' +
        'Try a shorter interval or a later target date.'
      );
      return;
    }

    setError('');
    setPreviewWindows(windows);
    setStep('countdown-preview');
  }

  // ─── Main submit ───────────────────────────────────────────────────────────

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');

    if (!name.trim()) { setError('Task name is required.'); return; }
    const intervalErr = validateInterval();
    if (intervalErr) { setError(intervalErr); return; }
    if (mode === 'countdown') {
      if (!targetDate) { setError('Please enter a target date.'); return; }
      if (isBefore(parseISO(targetDate), new Date())) {
        setError('Target date must be in the future.'); return;
      }
    }

    setLoading(true);
    const supabase = createClient();

    // Step 1: Save service provider (need its ID before saving the task)
    let serviceProviderId: string | null = null;

    if (showServiceProvider && serviceProviderEntry.name.trim()) {
      const spPayload = {
        name:        serviceProviderEntry.name.trim(),
        phone:       serviceProviderEntry.phone.trim() || null,
        website_url: serviceProviderEntry.website_url.trim() || null,
        address:     serviceProviderEntry.address.trim() || null,
        category_id: categoryId || null,
        user_id:     userId,
      };

      if (serviceProviderEntry.id) {
        const { error: spErr } = await supabase
          .from('service_providers')
          .update(spPayload)
          .eq('id', serviceProviderEntry.id);
        if (!spErr) serviceProviderId = serviceProviderEntry.id;
      } else {
        const { data: spData } = await supabase
          .from('service_providers')
          .insert(spPayload)
          .select()
          .single();
        serviceProviderId = spData?.id ?? null;
      }
    }

    // Step 2: Build task payload
    const taskPayload = {
      name:                 name.trim(),
      category_id:          categoryId || null,
      description:          description.trim() || null,
      interval_min_days:    intervalMinDays(),
      interval_max_days:    intervalMaxDays(),
      default_reminder_days: reminderDays,
      user_id:              userId,
      mode,
      initial_anchor_date:
        mode === 'standard' && anchorType === 'past' && anchorDate ? anchorDate : null,
      target_date:           mode === 'countdown' ? targetDate : null,
      target_label:          mode === 'countdown' ? targetLabel.trim() || null : null,
      days_before_target:    mode === 'countdown' ? daysBeforeTarget : null,
      continue_after_target: mode === 'countdown' ? continueAfterTarget : true,
      service_provider_id:  serviceProviderId,
    };

    let resolvedTaskId: string;

    if (isEdit) {
      const { error: updateErr } = await supabase
        .from('tasks')
        .update(taskPayload)
        .eq('id', taskId);
      if (updateErr) { setError(updateErr.message); setLoading(false); return; }
      resolvedTaskId = taskId!;
    } else {
      const { data, error: insertErr } = await supabase
        .from('tasks')
        .insert(taskPayload)
        .select()
        .single();
      if (insertErr) { setError(insertErr.message); setLoading(false); return; }

      const newTask = data as Task;
      resolvedTaskId = newTask.id;

      if (mode === 'countdown') {
        await generateCountdownInstances(newTask);
      } else {
        await createFirstInstance(newTask);
      }
    }

    // Step 3: Remove deleted product links
    for (const tpId of removedTaskProductIds) {
      await supabase.from('task_products').delete().eq('id', tpId);
    }

    // Step 4: Save product entries
    for (const product of productEntries) {
      if (!product.name.trim()) continue;

      const productPayload = {
        name:                  product.name.trim(),
        notes:                 product.description.trim() || null,
        product_url:           product.product_url.trim() || null,
        uses_per_supply_unit:  product.uses_per_supply_unit !== '' ? product.uses_per_supply_unit : null,
        user_id:               userId,
      };

      if (product.id) {
        // Update existing product entity
        await supabase.from('products').update(productPayload).eq('id', product.id);
      } else {
        // Create new product + task_products junction
        const { data: newProduct } = await supabase
          .from('products')
          .insert(productPayload)
          .select()
          .single();

        if (newProduct) {
          await supabase.from('task_products').insert({
            task_id:     resolvedTaskId,
            product_id:  newProduct.id,
            user_id:     userId,
            track_usage: false,
          });
        }
      }
    }

    router.push(`/tasks/${resolvedTaskId}`);
    router.refresh();
  }

  async function handleDelete() {
    if (!isEdit) return;
    const confirmed = window.confirm(
      'Delete this task and all its history? This cannot be undone.'
    );
    if (!confirmed) return;

    setLoading(true);
    const supabase = createClient();
    await supabase.from('tasks').delete().eq('id', taskId);
    router.push('/tasks');
    router.refresh();
  }

  // ─── Helper sub-renders (called as functions, not JSX components) ──────────

  function ErrorBanner() {
    if (!error) return null;
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  function IntervalFields() {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Interval</label>
        <p className="text-xs text-gray-400 mb-2">How often this task recurs.</p>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden mb-3">
          {(['exact', 'range'] as IntervalType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setIntervalType(t)}
              className={`flex-1 text-sm py-1.5 font-medium transition-colors ${
                intervalType === t
                  ? 'bg-pink-500 text-white'
                  : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}
            >
              {t === 'exact' ? 'Exact' : 'Range (min – max)'}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">
              {intervalType === 'exact' ? 'Every' : 'Min'}
            </label>
            <input
              type="number" min={1} max={365} value={intervalMin}
              onChange={e => setIntervalMin(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          {intervalType === 'range' && (
            <>
              <span className="text-gray-400 mb-2">–</span>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Max</label>
                <input
                  type="number" min={1} max={365} value={intervalMax}
                  onChange={e => setIntervalMax(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Unit</label>
            <select
              value={intervalUnit}
              onChange={e => setIntervalUnit(e.target.value as IntervalUnit)}
              className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  function CategoryField() {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
        <div className="flex gap-2">
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 bg-white"
          >
            <option value="">No category</option>
            {localCategories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewCategory(!showNewCategory)}
            title="Create a new category"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg text-gray-500 hover:text-pink-500 hover:border-pink-300 transition-colors text-lg"
          >
            +
          </button>
        </div>

        {showNewCategory && (
          <div className="mt-2 bg-gray-50 rounded-xl border border-gray-200 p-3 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">New category</p>
            <input
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Category name"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <div>
              <p className="text-xs text-gray-400 mb-1.5">Color</p>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_SWATCHES.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCategoryColor(color)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      newCategoryColor === color ? 'scale-125 ring-2 ring-offset-1 ring-gray-400' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
                className="flex-1 border border-gray-200 text-gray-500 text-xs rounded-lg py-1.5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={categoryLoading || !newCategoryName.trim()}
                className="flex-1 bg-pink-500 text-white text-xs font-medium rounded-lg py-1.5 disabled:opacity-50"
              >
                {categoryLoading ? 'Saving…' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  function CoreFields() {
    return (
      <>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Task name *</label>
          <input
            required type="text" value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Hair Color"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
        </div>

        {CategoryField()}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description / notes</label>
          <p className="text-xs text-gray-400 mb-2">Instructions, products, etc. — shown on every instance.</p>
          <textarea
            rows={4} value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Use Wella 6N + 20-vol developer, apply root-to-tip..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reminder offset (days before due)
          </label>
          <input
            type="number" min={0} max={14} value={reminderDays}
            onChange={e => setReminderDays(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
          />
          <p className="text-xs text-gray-400 mt-1">0 = on the due date. Reminders coming in Phase 2.</p>
        </div>
      </>
    );
  }

  function ServiceProviderSection() {
    return (
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowServiceProvider(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
        >
          <span className={`font-medium ${showServiceProvider || serviceProviderEntry.name ? 'text-gray-700' : 'text-pink-500'}`}>
            {showServiceProvider || serviceProviderEntry.name ? 'Service Provider' : '+ Add Service Provider'}
          </span>
          <span className="text-gray-400 text-lg leading-none">{showServiceProvider ? '−' : '+'}</span>
        </button>

        {showServiceProvider && (
          <div className="px-4 pb-4 space-y-3 border-t border-gray-100">
            {/* Autocomplete from saved providers in same category */}
            {savedProviders.length > 0 && (
              <div className="pt-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Use a saved provider
                </label>
                <select
                  defaultValue=""
                  onChange={e => {
                    const sp = savedProviders.find(p => p.id === e.target.value);
                    if (sp) applySavedProvider(sp);
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"
                >
                  <option value="">— or add a new one —</option>
                  {savedProviders.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
            {!savedProviders.length && <div className="pt-2" />}

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Name *</label>
              <input
                type="text"
                value={serviceProviderEntry.name}
                onChange={e => setServiceProviderEntry(s => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Sarah at Color Bar Salon"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Phone</label>
              <input
                type="tel"
                value={serviceProviderEntry.phone}
                onChange={e => setServiceProviderEntry(s => ({ ...s, phone: e.target.value }))}
                placeholder="(optional)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Website / Scheduler URL</label>
              <input
                type="url"
                value={serviceProviderEntry.website_url}
                onChange={e => setServiceProviderEntry(s => ({ ...s, website_url: e.target.value }))}
                placeholder="https://... (optional)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Address</label>
              <textarea
                rows={2}
                value={serviceProviderEntry.address}
                onChange={e => setServiceProviderEntry(s => ({ ...s, address: e.target.value }))}
                placeholder="Street, City, State ZIP (optional)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
              />
            </div>

            {serviceProviderEntry.name && (
              <button
                type="button"
                onClick={() => {
                  setServiceProviderEntry({ name: '', phone: '', website_url: '', address: '' });
                  setShowServiceProvider(false);
                }}
                className="text-xs text-gray-400 hover:text-red-400"
              >
                Remove provider
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  function ProductsSection() {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>

        {productEntries.length > 0 && (
          <div className="space-y-3 mb-3">
            {productEntries.map((product, i) => (
              <div key={i} className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Product {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProduct(i)}
                    className="text-xs text-red-400 hover:text-red-600"
                  >
                    Remove
                  </button>
                </div>

                <input
                  type="text"
                  required={product.name !== ''}
                  value={product.name}
                  onChange={e => updateProduct(i, { ...product, name: e.target.value })}
                  placeholder="Product name *"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"
                />

                <textarea
                  rows={2}
                  value={product.description}
                  onChange={e => updateProduct(i, { ...product, description: e.target.value })}
                  placeholder="Description (optional)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 resize-none"
                />

                <div className="relative">
                  <input
                    type="url"
                    value={product.product_url}
                    onChange={e => updateProduct(i, { ...product, product_url: e.target.value })}
                    placeholder="Product link (optional) — https://..."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-pink-400"
                  />
                </div>

                {/* Track usage — disabled in v1.2 */}
                <div className="flex items-center gap-2 opacity-50 cursor-not-allowed select-none">
                  <input
                    type="checkbox"
                    disabled
                    checked={false}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-500">Track usage</span>
                  <span className="text-xs text-gray-400 bg-gray-200 px-2 py-0.5 rounded-full">
                    Coming soon
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {productEntries.length < 10 ? (
          <button
            type="button"
            onClick={addProduct}
            className="text-sm text-pink-500 hover:text-pink-600 font-medium"
          >
            + Add Product
          </button>
        ) : (
          <p className="text-xs text-gray-400">Maximum 10 products per task.</p>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: mode-choice
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'mode-choice') {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">I am…</h2>
          <p className="text-sm text-gray-400">Choose how this task is scheduled.</p>
        </div>
        <div className="space-y-3">
          {[
            {
              value: 'standard' as TaskMode,
              title: 'Starting a new task',
              desc: 'Track a recurring habit going forward. Instances are scheduled one at a time, anchored to each completion.',
            },
            {
              value: 'countdown' as TaskMode,
              title: 'Planning for a future event',
              desc: 'Work backwards from a target date (e.g. a wedding). All instances are pre-generated and anchored to your event.',
            },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setMode(opt.value); setStep(opt.value === 'standard' ? 'anchor-date' : 'details'); }}
              className={`w-full text-left rounded-xl border-2 px-5 py-4 transition-colors ${
                mode === opt.value ? 'border-pink-500 bg-pink-50' : 'border-gray-200 hover:border-pink-200'
              }`}
            >
              <p className="font-semibold text-gray-800 text-sm mb-0.5">{opt.title}</p>
              <p className="text-xs text-gray-400">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: anchor-date (standard, create only)
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'anchor-date') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setStep('mode-choice')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">When did you last do this?</h2>
          <p className="text-sm text-gray-400">Your first instance will be scheduled from this date.</p>
        </div>
        <div className="space-y-3">
          {(['today', 'past'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setAnchorType(t)}
              className={`w-full text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                anchorType === t ? 'border-pink-500 bg-pink-50' : 'border-gray-200 hover:border-pink-200'
              }`}
            >
              <p className="text-sm font-medium text-gray-800">
                {t === 'today' ? 'Today' : 'Enter a past date'}
              </p>
              <p className="text-xs text-gray-400">
                {t === 'today'
                  ? 'Start the countdown from right now.'
                  : 'Use a real past date so the schedule starts from reality.'}
              </p>
            </button>
          ))}
          {anchorType === 'past' && (
            <input
              type="date"
              value={anchorDate}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setAnchorDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setStep('details')}
          className="w-full bg-pink-500 hover:bg-pink-600 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
        >
          Continue
        </button>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: countdown-preview
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'countdown-preview') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setStep('details')} className="text-sm text-gray-400 hover:text-gray-600">← Back to details</button>
        <div>
          <h2 className="text-base font-semibold text-gray-800 mb-1">Scheduled instances</h2>
          <p className="text-sm text-gray-400">
            {previewWindows.length} instance{previewWindows.length !== 1 ? 's' : ''} from today to your target
            {targetLabel ? ` (${targetLabel})` : ''}.
          </p>
        </div>
        <div className="space-y-2">
          {previewWindows.map((w, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2.5">
              <span className="text-xs text-gray-400">Instance {i + 1}</span>
              <span className="text-sm text-gray-700 font-medium">{formatWindow(w.due_date_start, w.due_date_end)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between bg-pink-50 rounded-lg border border-pink-200 px-4 py-2.5">
            <span className="text-xs text-pink-500 font-medium">Target</span>
            <span className="text-sm text-pink-700 font-medium">
              {format(parseISO(targetDate), 'MMM d, yyyy')}
              {targetLabel && ` — ${targetLabel}`}
            </span>
          </div>
        </div>
        {ErrorBanner()}
        <div className="flex gap-3">
          <button type="button" onClick={() => setStep('details')} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2.5">Adjust</button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={loading}
            className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
          >
            {loading ? 'Creating…' : 'Create task'}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: details (both modes, all edit renders)
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        mode === 'countdown' && !isEdit ? buildPreview() : handleSubmit(e);
      }}
      className="space-y-5"
    >
      {!isEdit && (
        <button type="button" onClick={() => setStep(mode === 'standard' ? 'anchor-date' : 'mode-choice')} className="text-sm text-gray-400 hover:text-gray-600">← Back</button>
      )}

      {isEdit && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          <p className="text-xs text-blue-600 font-medium">
            {mode === 'countdown' ? 'Countdown task' : 'Standard task'} — mode cannot be changed after creation.
          </p>
        </div>
      )}

      {ErrorBanner()}
      {CoreFields()}
      {IntervalFields()}

      {/* Countdown-specific fields */}
      {mode === 'countdown' && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Target date *</label>
            <input
              type="date"
              value={targetDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setTargetDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event name (optional)</label>
            <input
              type="text"
              value={targetLabel}
              onChange={e => setTargetLabel(e.target.value)}
              placeholder="e.g. Wedding, Photoshoot"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Final instance should be this many days before target
            </label>
            <input
              type="number" min={1} max={60} value={daysBeforeTarget}
              onChange={e => setDaysBeforeTarget(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <p className="text-xs text-gray-400 mt-1">e.g. 7 = last instance due about one week before your event.</p>
          </div>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="continueAfterTarget"
              checked={continueAfterTarget}
              onChange={e => setContinueAfterTarget(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-pink-500 focus:ring-pink-400"
            />
            <div>
              <label htmlFor="continueAfterTarget" className="text-sm font-medium text-gray-700">
                Continue after target event
              </label>
              <p className="text-xs text-gray-400 mt-0.5">
                After your event date passes, switch to standard forward-scheduling with the same interval.
              </p>
            </div>
          </div>
        </>
      )}

      {ServiceProviderSection()}
      {ProductsSection()}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2.5">Cancel</button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-pink-500 hover:bg-pink-600 disabled:opacity-50 text-white font-medium text-sm rounded-lg py-2.5 transition-colors"
        >
          {loading
            ? 'Saving…'
            : isEdit
            ? 'Save changes'
            : mode === 'countdown'
            ? 'Preview instances →'
            : 'Create task'}
        </button>
      </div>

      {isEdit && (
        <button type="button" onClick={handleDelete} disabled={loading} className="w-full text-red-500 text-sm py-2 hover:underline">
          Delete this task
        </button>
      )}
    </form>
  );
}
