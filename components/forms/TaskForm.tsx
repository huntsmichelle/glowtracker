'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO, isBefore } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  createFirstInstance,
  generateCountdownInstances,
  calculateCountdownWindows,
} from '@/lib/instanceEngine';
import { getCommonTasks, fuzzyMatchCommonTask, type CommonTask } from '@/lib/suggestions';
import type {
  Category,
  Task,
  TaskFormValues,
  TaskMode,
  FrequencyType,
  IntervalType,
  IntervalUnit,
  ProductFormEntry,
  ServiceProviderFormEntry,
  ServiceProvider,
} from '@/types';

interface Props {
  categories: Category[];
  initialValues?: Partial<TaskFormValues>;
  taskId?: string;
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

const COLOR_SWATCHES = [
  '#8A9E8C', '#A89880', '#6B6660', '#2C2A26',
  '#C4D4C5', '#D4C8B8', '#9E9890', '#E5DFD4',
  '#EDE8DF', '#F5F0E8',
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

  const [step, setStep] = useState<Step>(isEdit ? 'details' : 'mode-choice');
  const [mode, setMode] = useState<TaskMode>(initialValues?.mode ?? 'standard');

  const [anchorType, setAnchorType] = useState<'today' | 'past'>('today');
  const [anchorDate, setAnchorDate] = useState(initialValues?.initial_anchor_date ?? '');

  const [name, setName]               = useState(initialValues?.name ?? '');
  const [categoryId, setCategoryId]   = useState(initialValues?.category_id ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [reminderDays, setReminderDays]     = useState(initialValues?.default_reminder_days ?? 2);
  const [defaultCost, setDefaultCost]       = useState(initialValues?.default_cost ?? '');
  const [reminderNotes, setReminderNotes]   = useState(initialValues?.reminder_notes ?? '');

  const [frequencyType, setFrequencyType] = useState<FrequencyType>(
    initialValues?.frequencyType ?? 'interval'
  );

  const [intervalType, setIntervalType] = useState<IntervalType>(
    initialValues?.intervalType ?? 'range'
  );
  const [intervalMin, setIntervalMin] = useState(initialValues?.intervalMin ?? 4);
  const [intervalMax, setIntervalMax] = useState(initialValues?.intervalMax ?? 6);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>(
    initialValues?.intervalUnit ?? 'weeks'
  );

  const [slotALabel, setSlotALabel] = useState(initialValues?.slotALabel ?? 'Morning');
  const [slotATime,  setSlotATime]  = useState(initialValues?.slotATime  ?? '');
  const [slotBLabel, setSlotBLabel] = useState(initialValues?.slotBLabel ?? 'Evening');
  const [slotBTime,  setSlotBTime]  = useState(initialValues?.slotBTime  ?? '');

  const [scheduledTime,    setScheduledTime]    = useState(initialValues?.scheduledTime    ?? '');
  const [timeOfDayLabel,   setTimeOfDayLabel]   = useState(initialValues?.timeOfDayLabel   ?? '');
  const [showTimeOfDay,    setShowTimeOfDay]     = useState(
    !!(initialValues?.scheduledTime || initialValues?.timeOfDayLabel)
  );

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

  const [localCategories, setLocalCategories] = useState<Category[]>(initialCategories);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_SWATCHES[0]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  const [productEntries, setProductEntries] = useState<ProductFormEntry[]>(
    initialProducts ?? []
  );
  const [removedTaskProductIds, setRemovedTaskProductIds] = useState<string[]>([]);

  const [showServiceProvider, setShowServiceProvider] = useState(
    !!initialServiceProvider?.name
  );
  const [serviceProviderEntry, setServiceProviderEntry] = useState<ServiceProviderFormEntry>(
    initialServiceProvider ?? { name: '', phone: '', website_url: '', address: '' }
  );
  const [savedProviders, setSavedProviders] = useState<ServiceProvider[]>([]);

  const [commonTasks, setCommonTasks]           = useState<CommonTask[]>([]);
  const [matchedCommonTask, setMatchedCommonTask] = useState<CommonTask | null>(null);
  const fuzzyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    getCommonTasks(supabase).then(setCommonTasks);
  }, []);

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

  function intervalMinDays() {
    if (frequencyType === 'daily' || frequencyType === 'twice_daily') return 1;
    return toDays(intervalMin, intervalUnit);
  }
  function intervalMaxDays() {
    if (frequencyType === 'daily' || frequencyType === 'twice_daily') return 1;
    return toDays(intervalType === 'exact' ? intervalMin : intervalMax, intervalUnit);
  }

  function validateInterval(): string {
    if (frequencyType !== 'interval') return '';
    if (intervalMin < 1) return 'Interval must be at least 1.';
    if (intervalType === 'range' && intervalMin > intervalMax) {
      return 'Minimum interval cannot exceed maximum.';
    }
    return '';
  }

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

    if (catErr) { setCategoryLoading(false); return; }
    const newCat = data as Category;
    setLocalCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
    setCategoryId(newCat.id);
    setShowNewCategory(false);
    setNewCategoryName('');
    setCategoryLoading(false);
  }

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

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError('');

    if (!name.trim()) { setError('Ritual name is required.'); return; }
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

    const isTwiceD = frequencyType === 'twice_daily';
    const taskPayload = {
      name:                 name.trim(),
      category_id:          categoryId || null,
      description:          description.trim() || null,
      interval_min_days:    intervalMinDays(),
      interval_max_days:    intervalMaxDays(),
      default_reminder_days: reminderDays,
      default_cost:         defaultCost !== '' ? Number(defaultCost) : null,
      reminder_notes:       reminderNotes.trim() || null,
      user_id:              userId,
      mode,
      frequency_type:  mode === 'standard' ? frequencyType : 'interval',
      slot_a_label:    isTwiceD ? (slotALabel.trim() || 'Morning') : null,
      slot_a_time:     isTwiceD && slotATime  ? slotATime  : null,
      slot_b_label:    isTwiceD ? (slotBLabel.trim() || 'Evening') : null,
      slot_b_time:     isTwiceD && slotBTime  ? slotBTime  : null,
      scheduled_time:    (!isTwiceD && showTimeOfDay && scheduledTime)   ? scheduledTime   : null,
      time_of_day_label: (!isTwiceD && showTimeOfDay && timeOfDayLabel.trim()) ? timeOfDayLabel.trim() : null,
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

    for (const tpId of removedTaskProductIds) {
      await supabase.from('task_products').delete().eq('id', tpId);
    }

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
        await supabase.from('products').update(productPayload).eq('id', product.id);
      } else {
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
      'Remove this ritual and all its history? This cannot be undone.'
    );
    if (!confirmed) return;

    setLoading(true);
    const supabase = createClient();
    await supabase.from('tasks').delete().eq('id', taskId);
    router.push('/tasks');
    router.refresh();
  }

  // ─── Sub-renders ───────────────────────────────────────────────────────────

  function ErrorBanner() {
    if (!error) return null;
    return (
      <div className="bg-dust-lt border border-dust text-charcoal text-sm rounded-lg px-3 py-2">
        {error}
      </div>
    );
  }

  function fieldLabel(text: string) {
    return (
      <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">
        {text}
      </label>
    );
  }

  const chipCls = (active: boolean) =>
    `text-xs px-3 py-1.5 rounded-pill border transition-colors ${
      active
        ? 'border-charcoal bg-charcoal text-cream font-medium'
        : 'border-glow-border text-warm-mid hover:border-warm-light'
    }`;

  const toggleCls = (active: boolean) =>
    `flex-1 text-xs py-1.5 font-medium transition-colors ${
      active ? 'bg-charcoal text-cream' : 'bg-stone text-warm-mid hover:bg-taupe'
    }`;

  function IntervalFields() {
    return (
      <div>
        {fieldLabel('Interval')}
        <p className="text-xs text-warm-light mb-2">How often this ritual recurs.</p>
        <div className="flex rounded-lg border border-glow-border overflow-hidden mb-3">
          {(['exact', 'range'] as IntervalType[]).map(t => (
            <button
              key={t} type="button" onClick={() => setIntervalType(t)}
              className={toggleCls(intervalType === t)}
            >
              {t === 'exact' ? 'Exact' : 'Range (min – max)'}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="text-xs text-warm-light mb-1 block">
              {intervalType === 'exact' ? 'Every' : 'Min'}
            </label>
            <input
              type="number" min={1} max={365} value={intervalMin}
              onChange={e => setIntervalMin(Number(e.target.value))}
              className="w-full"
            />
          </div>
          {intervalType === 'range' && (
            <>
              <span className="text-warm-light mb-2">–</span>
              <div className="flex-1">
                <label className="text-xs text-warm-light mb-1 block">Max</label>
                <input
                  type="number" min={1} max={365} value={intervalMax}
                  onChange={e => setIntervalMax(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-warm-light mb-1 block">Unit</label>
            <select
              value={intervalUnit}
              onChange={e => setIntervalUnit(e.target.value as IntervalUnit)}
              className="border border-glow-border rounded-md px-2 py-2 text-sm bg-stone"
            >
              <option value="days">days</option>
              <option value="weeks">weeks</option>
            </select>
          </div>
        </div>
      </div>
    );
  }

  function FrequencyFields() {
    return (
      <div className="space-y-3">
        <div>
          {fieldLabel('Frequency')}
          <div className="flex gap-1.5 flex-wrap">
            {([
              { value: 'interval',    label: 'Custom interval' },
              { value: 'daily',       label: 'Daily' },
              { value: 'twice_daily', label: 'Twice daily' },
            ] as { value: FrequencyType; label: string }[]).map(opt => (
              <button key={opt.value} type="button" onClick={() => setFrequencyType(opt.value)} className={chipCls(frequencyType === opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {frequencyType === 'interval' && (
          <div className="pl-3 border-l-2 border-glow-border space-y-2">
            <p className="text-xs text-warm-light">How often this ritual recurs.</p>
            <div className="flex rounded-lg border border-glow-border overflow-hidden">
              {(['exact', 'range'] as IntervalType[]).map(t => (
                <button
                  key={t} type="button" onClick={() => setIntervalType(t)}
                  className={toggleCls(intervalType === t)}
                >
                  {t === 'exact' ? 'Exact' : 'Range (min – max)'}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="text-xs text-warm-light mb-1 block">{intervalType === 'exact' ? 'Every' : 'Min'}</label>
                <input
                  type="number" min={1} max={365} value={intervalMin}
                  onChange={e => setIntervalMin(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              {intervalType === 'range' && (
                <>
                  <span className="text-warm-light mb-2">–</span>
                  <div className="flex-1">
                    <label className="text-xs text-warm-light mb-1 block">Max</label>
                    <input
                      type="number" min={1} max={365} value={intervalMax}
                      onChange={e => setIntervalMax(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-warm-light mb-1 block">Unit</label>
                <select
                  value={intervalUnit}
                  onChange={e => setIntervalUnit(e.target.value as IntervalUnit)}
                  className="border border-glow-border rounded-md px-2 py-2 text-sm bg-stone"
                >
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {frequencyType === 'twice_daily' && (
          <div className="pl-3 border-l-2 border-glow-border space-y-2">
            <p className="text-xs text-warm-light">Two occurrences per day. Each slot can have its own label and time.</p>
            {([
              { slot: 'A', label: slotALabel, setLabel: setSlotALabel, time: slotATime, setTime: setSlotATime },
              { slot: 'B', label: slotBLabel, setLabel: setSlotBLabel, time: slotBTime, setTime: setSlotBTime },
            ] as const).map(s => (
              <div key={s.slot} className="flex items-center gap-2">
                <span className="text-xs font-medium text-warm-mid w-5 flex-shrink-0">
                  {s.slot === 'A' ? '1st' : '2nd'}
                </span>
                <input
                  type="text"
                  value={s.label}
                  onChange={e => s.setLabel(e.target.value)}
                  placeholder={s.slot === 'A' ? 'Morning' : 'Evening'}
                  maxLength={20}
                  className="flex-1"
                />
                <input
                  type="time"
                  value={s.time}
                  onChange={e => s.setTime(e.target.value)}
                  className=""
                />
              </div>
            ))}
          </div>
        )}

        {frequencyType !== 'twice_daily' && (
          <div>
            {!showTimeOfDay ? (
              <button type="button" onClick={() => setShowTimeOfDay(true)} className="text-xs text-warm-mid hover:text-charcoal">
                + Add time of day
              </button>
            ) : (
              <div className="pl-3 border-l-2 border-glow-border space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-warm-mid">Time of day (optional)</p>
                  <button type="button" onClick={() => { setShowTimeOfDay(false); setScheduledTime(''); setTimeOfDayLabel(''); }} className="text-xs text-warm-light hover:text-charcoal">Remove</button>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    className=""
                  />
                  <input
                    type="text"
                    value={timeOfDayLabel}
                    onChange={e => setTimeOfDayLabel(e.target.value)}
                    placeholder="Label (e.g. After shower)"
                    maxLength={20}
                    className="flex-1"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function CategoryField() {
    return (
      <div>
        {fieldLabel('Category')}
        <div className="flex gap-2">
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="flex-1 border border-glow-border rounded-md px-3 py-2 text-sm bg-stone"
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
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center border border-glow-border rounded-lg text-warm-mid hover:text-charcoal hover:border-warm-light transition-colors text-lg"
          >
            +
          </button>
        </div>

        {showNewCategory && (
          <div className="mt-2 bg-taupe rounded-lg border border-glow-border p-3 space-y-2">
            <p className="label-overline">New category</p>
            <input
              type="text"
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              placeholder="Category name"
              className="w-full"
            />
            <div>
              <p className="text-xs text-warm-light mb-1.5">Color</p>
              <div className="flex gap-1.5 flex-wrap">
                {COLOR_SWATCHES.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewCategoryColor(color)}
                    className={`w-6 h-6 rounded-full transition-transform border ${
                      newCategoryColor === color ? 'scale-125 ring-2 ring-offset-1 ring-charcoal' : 'hover:scale-110 border-glow-border'
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
                className="flex-1 border border-glow-border text-warm-mid text-xs rounded-pill py-1.5 hover:bg-stone transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={categoryLoading || !newCategoryName.trim()}
                className="flex-1 bg-charcoal text-cream text-xs font-medium rounded-pill py-1.5 disabled:opacity-50"
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
          {fieldLabel('Ritual name *')}
          <input
            required type="text" value={name}
            onChange={e => {
              const val = e.target.value;
              setName(val);
              if (fuzzyTimerRef.current) clearTimeout(fuzzyTimerRef.current);
              fuzzyTimerRef.current = setTimeout(() => {
                const match = fuzzyMatchCommonTask(val, commonTasks);
                setMatchedCommonTask(match);
                if (match && !isEdit) {
                  if (match.interval_min_days != null) {
                    setIntervalMin(Math.round(match.interval_min_days / 7));
                    setIntervalUnit('weeks');
                  }
                  if (match.interval_max_days != null) {
                    setIntervalMax(Math.round(match.interval_max_days / 7));
                    setIntervalType('range');
                  }
                }
              }, 400);
            }}
            placeholder="e.g. Hair Color"
            className="w-full"
          />
          {matchedCommonTask && (
            <div className="mt-1.5 space-y-1">
              <p className="text-xs text-warm-mid">Suggested interval based on common practice.</p>
              {matchedCommonTask.prep_steps && (
                <p className="text-xs text-warm-light">Prep: {matchedCommonTask.prep_steps}</p>
              )}
              {matchedCommonTask.suggested_notes && (
                <p className="text-xs text-warm-light">Notes: {matchedCommonTask.suggested_notes}</p>
              )}
            </div>
          )}
        </div>

        {CategoryField()}

        <div>
          {fieldLabel('Description / notes')}
          <p className="text-xs text-warm-light mb-2">Instructions, products, etc. — shown on every instance.</p>
          <textarea
            rows={4} value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Use Wella 6N + 20-vol developer, apply root-to-tip..."
            className="w-full resize-none"
          />
        </div>

        <div>
          {fieldLabel('Typical cost ($)')}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-light text-sm">$</span>
            <input
              type="number" min={0} step="0.01" value={defaultCost}
              onChange={e => setDefaultCost(e.target.value)}
              placeholder="0.00"
              className="w-full pl-7"
            />
          </div>
          <p className="text-xs text-warm-light mt-1">Pre-fills the cost field when you log a completion. Optional.</p>
        </div>

        <div>
          {fieldLabel('Reminder notes')}
          <textarea
            rows={3} value={reminderNotes}
            onChange={e => setReminderNotes(e.target.value)}
            placeholder="Notes to include with reminders (e.g. don't shave beforehand)..."
            className="w-full resize-none"
          />
          <p className="text-xs text-warm-light mt-1">Shown on the instance detail when it's due. Optional.</p>
        </div>

        <div>
          {fieldLabel('Reminder offset (days before due)')}
          <input
            type="number" min={0} max={14} value={reminderDays}
            onChange={e => setReminderDays(Number(e.target.value))}
            className="w-full"
          />
          <p className="text-xs text-warm-light mt-1">0 = on the due date. Reminders coming soon.</p>
        </div>
      </>
    );
  }

  function ServiceProviderSection() {
    return (
      <div className="border border-glow-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowServiceProvider(s => !s)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm hover:bg-taupe transition-colors"
        >
          <span className={`font-medium ${showServiceProvider || serviceProviderEntry.name ? 'text-charcoal' : 'text-warm-mid'}`}>
            {showServiceProvider || serviceProviderEntry.name ? 'Service Provider' : '+ Add Service Provider'}
          </span>
          <span className="text-warm-light text-lg leading-none">{showServiceProvider ? '−' : '+'}</span>
        </button>

        {showServiceProvider && (
          <div className="px-4 pb-4 space-y-3 border-t border-glow-border">
            {savedProviders.length > 0 && (
              <div className="pt-3">
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">
                  Use a saved provider
                </label>
                <select
                  defaultValue=""
                  onChange={e => {
                    const sp = savedProviders.find(p => p.id === e.target.value);
                    if (sp) applySavedProvider(sp);
                  }}
                  className="w-full border border-glow-border rounded-md px-3 py-2 text-sm bg-stone"
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
              <label className="text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide block">Name *</label>
              <input
                type="text"
                value={serviceProviderEntry.name}
                onChange={e => setServiceProviderEntry(s => ({ ...s, name: e.target.value }))}
                placeholder="e.g. Sarah at Color Bar Salon"
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide block">Phone</label>
              <input
                type="tel"
                value={serviceProviderEntry.phone}
                onChange={e => setServiceProviderEntry(s => ({ ...s, phone: e.target.value }))}
                placeholder="(optional)"
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide block">Website / Scheduler URL</label>
              <input
                type="url"
                value={serviceProviderEntry.website_url}
                onChange={e => setServiceProviderEntry(s => ({ ...s, website_url: e.target.value }))}
                placeholder="https://... (optional)"
                className="w-full"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide block">Address</label>
              <textarea
                rows={2}
                value={serviceProviderEntry.address}
                onChange={e => setServiceProviderEntry(s => ({ ...s, address: e.target.value }))}
                placeholder="Street, City, State ZIP (optional)"
                className="w-full resize-none"
              />
            </div>

            {serviceProviderEntry.name && (
              <button
                type="button"
                onClick={() => {
                  setServiceProviderEntry({ name: '', phone: '', website_url: '', address: '' });
                  setShowServiceProvider(false);
                }}
                className="text-xs text-warm-light hover:text-charcoal"
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
        <p className="label-overline mb-2">Products</p>

        {productEntries.length > 0 && (
          <div className="space-y-3 mb-3">
            {productEntries.map((product, i) => (
              <div key={i} className="bg-taupe rounded-lg border border-glow-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="label-overline">Product {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeProduct(i)}
                    className="text-xs text-warm-light hover:text-charcoal"
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
                  className="w-full"
                />

                <textarea
                  rows={2}
                  value={product.description}
                  onChange={e => updateProduct(i, { ...product, description: e.target.value })}
                  placeholder="Description (optional)"
                  className="w-full resize-none"
                />

                <input
                  type="url"
                  value={product.product_url}
                  onChange={e => updateProduct(i, { ...product, product_url: e.target.value })}
                  placeholder="Product link (optional) — https://..."
                  className="w-full"
                />

                <div className="flex items-center gap-2 opacity-50 cursor-not-allowed select-none">
                  <input type="checkbox" disabled checked={false} className="h-4 w-4 rounded border-glow-border" />
                  <span className="text-sm text-warm-mid">Track usage</span>
                  <span className="text-xs text-warm-light bg-taupe px-2 py-0.5 rounded-pill border border-glow-border">Coming soon</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {productEntries.length < 10 ? (
          <button type="button" onClick={addProduct} className="text-sm text-warm-mid hover:text-charcoal font-medium">
            + Add Product
          </button>
        ) : (
          <p className="text-xs text-warm-light">Maximum 10 products per ritual.</p>
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
          <h2 className="font-display text-2xl text-charcoal mb-1">I am…</h2>
          <p className="text-sm text-warm-mid">Choose how this ritual is scheduled.</p>
        </div>
        <div className="space-y-3">
          {[
            {
              value: 'standard' as TaskMode,
              title: 'Starting a new ritual',
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
              className={`w-full text-left rounded-lg border-2 px-5 py-4 transition-colors ${
                mode === opt.value ? 'border-charcoal bg-taupe' : 'border-glow-border hover:border-warm-light'
              }`}
            >
              <p className="font-medium text-charcoal text-sm mb-0.5">{opt.title}</p>
              <p className="text-xs text-warm-light">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: anchor-date
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'anchor-date') {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setStep('mode-choice')} className="text-sm text-warm-light hover:text-charcoal">← Back</button>
        <div>
          <h2 className="font-display text-2xl text-charcoal mb-1">When did you last do this?</h2>
          <p className="text-sm text-warm-mid">Your first instance will be scheduled from this date.</p>
        </div>
        <div className="space-y-3">
          {(['today', 'past'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setAnchorType(t)}
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${
                anchorType === t ? 'border-charcoal bg-taupe' : 'border-glow-border hover:border-warm-light'
              }`}
            >
              <p className="text-sm font-medium text-charcoal">
                {t === 'today' ? 'Today' : 'Enter a past date'}
              </p>
              <p className="text-xs text-warm-light">
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
              className="w-full"
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setStep('details')}
          className="w-full bg-charcoal hover:bg-charcoal/90 text-cream font-medium text-sm rounded-pill py-2.5 transition-colors"
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
        <button type="button" onClick={() => setStep('details')} className="text-sm text-warm-light hover:text-charcoal">← Back to details</button>
        <div>
          <h2 className="font-display text-2xl text-charcoal mb-1">Scheduled instances</h2>
          <p className="text-sm text-warm-mid">
            {previewWindows.length} instance{previewWindows.length !== 1 ? 's' : ''} from today to your target
            {targetLabel ? ` (${targetLabel})` : ''}.
          </p>
        </div>
        <div className="space-y-2">
          {previewWindows.map((w, i) => (
            <div key={i} className="flex items-center justify-between bg-stone border border-glow-border rounded-lg px-4 py-2.5">
              <span className="text-xs text-warm-light">Instance {i + 1}</span>
              <span className="text-sm text-charcoal font-medium">{formatWindow(w.due_date_start, w.due_date_end)}</span>
            </div>
          ))}
          <div className="flex items-center justify-between bg-taupe rounded-lg border border-glow-border px-4 py-2.5">
            <span className="text-xs text-warm-mid font-medium">Target</span>
            <span className="text-sm text-charcoal font-medium">
              {format(parseISO(targetDate), 'MMM d, yyyy')}
              {targetLabel && ` — ${targetLabel}`}
            </span>
          </div>
        </div>
        {ErrorBanner()}
        <div className="flex gap-3">
          <button type="button" onClick={() => setStep('details')} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe transition-colors">Adjust</button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={loading}
            className="flex-1 bg-charcoal hover:bg-charcoal/90 disabled:opacity-50 text-cream font-medium text-sm rounded-pill py-2.5 transition-colors"
          >
            {loading ? 'Creating…' : 'Create ritual'}
          </button>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: details
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
        <button type="button" onClick={() => setStep(mode === 'standard' ? 'anchor-date' : 'mode-choice')} className="text-sm text-warm-light hover:text-charcoal">← Back</button>
      )}

      {isEdit && (
        <div className="bg-taupe border border-glow-border rounded-lg px-3 py-2">
          <p className="text-xs text-warm-mid font-medium">
            {mode === 'countdown' ? 'Countdown ritual' : 'Standard ritual'} — mode cannot be changed after creation.
          </p>
        </div>
      )}

      {ErrorBanner()}
      {CoreFields()}
      {mode === 'standard' ? FrequencyFields() : IntervalFields()}

      {mode === 'countdown' && (
        <>
          <div>
            {fieldLabel('Target date *')}
            <input
              type="date"
              value={targetDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={e => setTargetDate(e.target.value)}
              className="w-full"
            />
          </div>
          <div>
            {fieldLabel('Event name (optional)')}
            <input
              type="text"
              value={targetLabel}
              onChange={e => setTargetLabel(e.target.value)}
              placeholder="e.g. Wedding, Photoshoot"
              className="w-full"
            />
          </div>
          <div>
            {fieldLabel('Final instance should be this many days before target')}
            <input
              type="number" min={1} max={60} value={daysBeforeTarget}
              onChange={e => setDaysBeforeTarget(Number(e.target.value))}
              className="w-full"
            />
            <p className="text-xs text-warm-light mt-1">e.g. 7 = last instance due about one week before your event.</p>
          </div>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="continueAfterTarget"
              checked={continueAfterTarget}
              onChange={e => setContinueAfterTarget(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-glow-border"
            />
            <div>
              <label htmlFor="continueAfterTarget" className="text-sm font-medium text-charcoal">
                Continue after target event
              </label>
              <p className="text-xs text-warm-light mt-0.5">
                After your event date passes, switch to standard forward-scheduling with the same interval.
              </p>
            </div>
          </div>
        </>
      )}

      {ServiceProviderSection()}
      {ProductsSection()}

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={() => router.back()} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe transition-colors">Cancel</button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-charcoal hover:bg-charcoal/90 disabled:opacity-50 text-cream font-medium text-sm rounded-pill py-2.5 transition-colors"
        >
          {loading
            ? 'Saving…'
            : isEdit
            ? 'Save changes'
            : mode === 'countdown'
            ? 'Preview instances →'
            : 'Create ritual'}
        </button>
      </div>

      {isEdit && (
        <button type="button" onClick={handleDelete} disabled={loading} className="w-full text-warm-light text-sm py-2 hover:text-charcoal hover:underline underline-offset-2">
          Remove this ritual
        </button>
      )}
    </form>
  );
}
