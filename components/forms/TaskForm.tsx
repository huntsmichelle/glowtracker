'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import ClockPicker from '@/components/ClockPicker';
import { format, parseISO, isBefore } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  createFirstInstance,
  generateCountdownInstances,
  calculateCountdownWindows,
} from '@/lib/instanceEngine';
import { getCommonTasks, fuzzyMatchCommonTask, type CommonTask } from '@/lib/suggestions';
import { formatUSPhone, stripPhoneFormatting } from '@/lib/costCalculations';
import type {
  Category,
  Task,
  TaskFormValues,
  TaskMode,
  FrequencyType,
  IntervalType,
  IntervalUnit,
  ProductFormEntry,
  ProductCategory,
  ServiceProviderFormEntry,
  ServiceProvider,
} from '@/types';

interface Props {
  categories: Category[];
  productCategories?: ProductCategory[];
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
  return {
    name: '',
    brand: '',
    description: '',
    product_url: '',
    product_category_id: '',
    track_usage: false,
    container_size: '',
    container_unit: 'ml',
    use_amount_override: '',
    purchase_price: '',
    uses_per_container: '',
    expires_at: '',
  };
}

// ─── Toggle switch ────────────────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        flexShrink: 0,
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        overflow: 'hidden',
        backgroundColor: checked ? '#2b2823' : '#cdc6b6',
        transition: 'background-color 0.2s ease',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        border: 'none',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: 'white',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          top: '2px',
          left: checked ? '22px' : '2px',
          transition: 'left 0.2s ease',
        }}
      />
    </button>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  subtitle: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-glow-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start justify-between px-5 py-4 text-left hover:bg-taupe transition-colors"
      >
        <div>
          <p className="label-overline">{title}</p>
          <p className="text-xs text-warm-light mt-0.5">{subtitle}</p>
        </div>
        <span className="text-warm-light text-lg leading-none mt-0.5 flex-shrink-0 ml-3">
          {isOpen ? '−' : '+'}
        </span>
      </button>
      {isOpen && (
        <div className="px-5 pb-5 border-t border-glow-border space-y-4 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

// ─── Dollar input helper ──────────────────────────────────────────────────────

function DollarInput({
  value,
  onChange,
  placeholder = '0.00',
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label?: string;
}) {
  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">
          {label}
        </label>
      )}
      <div className="flex items-center gap-1.5 border border-glow-border rounded-md bg-stone px-3 py-2 focus-within:ring-1 focus-within:ring-charcoal">
        <span className="text-warm-mid text-sm flex-shrink-0">$</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-transparent border-none outline-none text-sm text-charcoal placeholder:text-warm-light p-0"
        />
      </div>
    </div>
  );
}

// ─── Sub-overline label ───────────────────────────────────────────────────────

function SubOverline({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-warm-light uppercase tracking-widest mb-3 mt-1">
      {children}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TaskForm({
  categories: initialCategories,
  productCategories,
  initialValues,
  taskId,
  initialProducts,
  initialServiceProvider,
  userId,
}: Props) {
  const router = useRouter();
  const isEdit = !!taskId;

  const [step, setStep] = useState<Step>(isEdit ? 'details' : 'mode-choice');
  const [mode, setMode] = useState<TaskMode>(initialValues?.mode ?? 'standard');

  const [anchorType, setAnchorType] = useState<'today' | 'past'>('today');
  const [anchorDate, setAnchorDate] = useState(initialValues?.initial_anchor_date ?? '');

  // ── Section 1: Core Details ──
  const [name, setName]               = useState(initialValues?.name ?? '');
  const [categoryId, setCategoryId]   = useState(initialValues?.category_id ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');

  // ── Section 2: Frequency ──
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
  const [scheduledTime,  setScheduledTime]  = useState(initialValues?.scheduledTime  ?? '');
  const [timeOfDayLabel, setTimeOfDayLabel] = useState(initialValues?.timeOfDayLabel ?? '');
  const [showTimeOfDay,  setShowTimeOfDay]  = useState(
    !!(initialValues?.scheduledTime || initialValues?.timeOfDayLabel)
  );
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(
    initialValues?.autocomplete_enabled ?? false
  );

  // ── Section 3: Services & Products ──
  const [providerCost, setProviderCost] = useState(initialValues?.provider_cost ?? '');
  const [providerPhone, setProviderPhone] = useState(
    initialValues?.provider_phone ? formatUSPhone(initialValues.provider_phone) : ''
  );
  const [showServiceProvider, setShowServiceProvider] = useState(
    !!initialServiceProvider?.name
  );
  const [serviceProviderEntry, setServiceProviderEntry] = useState<ServiceProviderFormEntry>(
    initialServiceProvider ?? { name: '', phone: '', website_url: '', address: '' }
  );
  const [savedProviders, setSavedProviders] = useState<ServiceProvider[]>([]);
  const [productEntries, setProductEntries] = useState<ProductFormEntry[]>(
    initialProducts ?? []
  );
  const [removedTaskProductIds, setRemovedTaskProductIds] = useState<string[]>([]);

  // ── Section 4: Reminders & Prep ──
  const [prepNotes, setPrepNotes] = useState(initialValues?.prep_notes ?? '');
  const [reminderEnabled, setReminderEnabled] = useState(
    initialValues?.reminder_enabled ?? false
  );
  const [reminderValue, setReminderValue] = useState(initialValues?.reminder_value ?? 2);
  const [reminderUnit, setReminderUnit] = useState<'minutes' | 'hours' | 'days' | 'weeks'>(
    initialValues?.reminder_unit ?? 'days'
  );

  // ── Section open states (all open by default) ──
  const [s1Open, setS1Open] = useState(true);
  const [s2Open, setS2Open] = useState(true);
  const [s3Open, setS3Open] = useState(true);
  const [s4Open, setS4Open] = useState(true);

  // ── Section 3 subsection open states (collapsed on load) ──
  const [spOpen, setSpOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);

  // ── Clock picker ──
  const [clockTarget, setClockTarget] = useState<'scheduled' | 'slotA' | 'slotB' | null>(null);

  // ── Countdown mode ──
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

  // ── Category creation ──
  const [localCategories, setLocalCategories] = useState<Category[]>(initialCategories);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState(COLOR_SWATCHES[0]);
  const [categoryLoading, setCategoryLoading] = useState(false);

  // ── Common task suggestions ──
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

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  // ── Category actions ──────────────────────────────────────────────────────

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

  const [autoFlash, setAutoFlash] = useState<Set<string>>(new Set());

  function flashField(key: string) {
    setAutoFlash(prev => new Set(prev).add(key));
    setTimeout(() => setAutoFlash(prev => { const n = new Set(prev); n.delete(key); return n; }), 800);
  }

  function handleProductBlur(i: number, field: 'container_size' | 'use_amount_override' | 'uses_per_container') {
    const p = productEntries[i];
    const size = p.container_size !== '' ? Number(p.container_size) : null;
    const amt  = p.use_amount_override !== '' ? Number(p.use_amount_override) : null;
    const uses = p.uses_per_container !== '' ? Number(p.uses_per_container) : null;
    if (field !== 'uses_per_container' && size != null && amt != null && amt > 0) {
      const calc = Math.round(size / amt);
      updateProduct(i, { ...p, uses_per_container: calc });
      flashField(`${i}-uses_per_container`);
    } else if (field === 'uses_per_container' && size != null && uses != null && uses > 0) {
      const calc = parseFloat((size / uses).toFixed(2));
      updateProduct(i, { ...p, use_amount_override: calc });
      flashField(`${i}-use_amount_override`);
    }
  }

  // ── Product actions ───────────────────────────────────────────────────────

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

  // ── Provider actions ──────────────────────────────────────────────────────

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

  // ── Countdown preview ─────────────────────────────────────────────────────

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

  // ── Submit ────────────────────────────────────────────────────────────────

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

    // Save service provider
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
    const providerCostNum = providerCost !== '' ? Number(providerCost) : null;
    const phoneDigits = stripPhoneFormatting(providerPhone) || null;

    const taskPayload = {
      name:                  name.trim(),
      category_id:           categoryId || null,
      description:           description.trim() || null,
      interval_min_days:     intervalMinDays(),
      interval_max_days:     intervalMaxDays(),
      // New cost model
      provider_cost:         providerCostNum,
      provider_phone:        phoneDigits,
      default_cost:          providerCostNum,   // keep in sync for backward compat
      // New reminder structure
      autocomplete_enabled:  autocompleteEnabled,
      prep_notes:            prepNotes.trim() || null,
      reminder_notes:        prepNotes.trim() || null,  // backward compat alias
      reminder_enabled:      reminderEnabled,
      reminder_value:        reminderValue,
      reminder_unit:         reminderUnit,
      default_reminder_days: reminderEnabled
        ? (reminderUnit === 'days' ? reminderValue
          : reminderUnit === 'hours' ? Math.round(reminderValue / 24)
          : reminderUnit === 'weeks' ? reminderValue * 7
          : 0) // 'minutes' — below 1-day granularity, store as 0
        : 0,
      user_id:               userId,
      is_active:             true,
      mode,
      frequency_type:        mode === 'standard' ? frequencyType : 'interval',
      slot_a_label:          isTwiceD ? (slotALabel.trim() || 'Morning') : null,
      slot_a_time:           isTwiceD && slotATime  ? slotATime  : null,
      slot_b_label:          isTwiceD ? (slotBLabel.trim() || 'Evening') : null,
      slot_b_time:           isTwiceD && slotBTime  ? slotBTime  : null,
      scheduled_time:        (!isTwiceD && showTimeOfDay && scheduledTime) ? scheduledTime : null,
      time_of_day_label:     (!isTwiceD && showTimeOfDay && timeOfDayLabel.trim()) ? timeOfDayLabel.trim() : null,
      initial_anchor_date:   mode === 'standard' && anchorType === 'past' && anchorDate ? anchorDate : null,
      target_date:           mode === 'countdown' ? targetDate : null,
      target_label:          mode === 'countdown' ? (targetLabel.trim() || null) : null,
      days_before_target:    mode === 'countdown' ? daysBeforeTarget : null,
      continue_after_target: mode === 'countdown' ? continueAfterTarget : true,
      service_provider_id:   serviceProviderId,
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
      if (insertErr) { console.error('Task creation error:', insertErr); setError(insertErr.message); setLoading(false); return; }

      const newTask = data as Task;
      resolvedTaskId = newTask.id;

      if (mode === 'countdown') {
        await generateCountdownInstances(newTask);
      } else {
        await createFirstInstance(newTask);
      }
    }

    // Remove deleted products
    for (const tpId of removedTaskProductIds) {
      await supabase.from('task_products').delete().eq('id', tpId);
    }

    // Save products
    for (const product of productEntries) {
      if (!product.name.trim()) continue;

      const productPayload = {
        name:                product.name.trim(),
        brand:               product.brand.trim() || null,
        notes:               product.description.trim() || null,
        product_url:         product.product_url.trim() || null,
        product_category_id: product.product_category_id || null,
        container_size:      product.container_size !== '' ? Number(product.container_size) : null,
        container_unit:      product.container_unit.trim() || null,
        expires_at:          product.expires_at ? product.expires_at + '-01' : null,
        user_id:             userId,
      };

      const tpCostPayload = {
        track_usage:         product.track_usage,
        purchase_price:      product.purchase_price !== '' ? Number(product.purchase_price) : null,
        uses_per_container:  product.uses_per_container !== '' ? Number(product.uses_per_container) : null,
        use_amount_override: product.use_amount_override !== '' ? Number(product.use_amount_override) : null,
      };

      if (product.id) {
        // Update existing product and its task_products cost fields
        await supabase.from('products').update(productPayload).eq('id', product.id);
        if (product.taskProductId) {
          await supabase.from('task_products').update(tpCostPayload).eq('id', product.taskProductId);
        }
      } else {
        // Insert new product then link it
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
            ...tpCostPayload,
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

  // ─────────────────────────────────────────────────────────────────────────
  // SUB-COMPONENTS
  // ─────────────────────────────────────────────────────────────────────────

  function ErrorBanner() {
    if (!error) return null;
    return (
      <div className="bg-dust-lt border border-dust text-charcoal text-sm rounded-lg px-3 py-2">
        {error}
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

  function FrequencyFields() {
    return (
      <div className="space-y-3">
        {mode === 'countdown' ? (
          /* Countdown: interval only */
          <div>
            {fieldLabel('Interval')}
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
                <label className="text-xs text-warm-light mb-1 block">{intervalType === 'exact' ? 'Every' : 'Min'}</label>
                <input type="number" min={1} max={365} value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))} className="w-full" />
              </div>
              {intervalType === 'range' && (
                <>
                  <span className="text-warm-light mb-2">–</span>
                  <div className="flex-1">
                    <label className="text-xs text-warm-light mb-1 block">Max</label>
                    <input type="number" min={1} max={365} value={intervalMax} onChange={e => setIntervalMax(Number(e.target.value))} className="w-full" />
                  </div>
                </>
              )}
              <div>
                <label className="text-xs text-warm-light mb-1 block">Unit</label>
                <select value={intervalUnit} onChange={e => setIntervalUnit(e.target.value as IntervalUnit)} className="border border-glow-border rounded-md px-2 py-2 text-sm bg-stone">
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                </select>
              </div>
            </div>
          </div>
        ) : (
          /* Standard: full frequency selector */
          <>
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
                <div className="flex rounded-lg border border-glow-border overflow-hidden">
                  {(['exact', 'range'] as IntervalType[]).map(t => (
                    <button key={t} type="button" onClick={() => setIntervalType(t)} className={toggleCls(intervalType === t)}>
                      {t === 'exact' ? 'Exact' : 'Range (min – max)'}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-warm-light mb-1 block">{intervalType === 'exact' ? 'Every' : 'Min'}</label>
                    <input type="number" min={1} max={365} value={intervalMin} onChange={e => setIntervalMin(Number(e.target.value))} className="w-full" />
                  </div>
                  {intervalType === 'range' && (
                    <>
                      <span className="text-warm-light mb-2">–</span>
                      <div className="flex-1">
                        <label className="text-xs text-warm-light mb-1 block">Max</label>
                        <input type="number" min={1} max={365} value={intervalMax} onChange={e => setIntervalMax(Number(e.target.value))} className="w-full" />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="text-xs text-warm-light mb-1 block">Unit</label>
                    <select value={intervalUnit} onChange={e => setIntervalUnit(e.target.value as IntervalUnit)} className="border border-glow-border rounded-md px-2 py-2 text-sm bg-stone">
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
                  { slot: 'A', label: slotALabel, setLabel: setSlotALabel, time: slotATime, clockKey: 'slotA' as const },
                  { slot: 'B', label: slotBLabel, setLabel: setSlotBLabel, time: slotBTime, clockKey: 'slotB' as const },
                ] as const).map(s => (
                  <div key={s.slot} className="flex items-center gap-2">
                    <span className="text-xs font-medium text-warm-mid w-5 flex-shrink-0">{s.slot === 'A' ? '1st' : '2nd'}</span>
                    <input type="text" value={s.label} onChange={e => s.setLabel(e.target.value)} placeholder={s.slot === 'A' ? 'Morning' : 'Evening'} maxLength={20} className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setClockTarget(s.clockKey)}
                      className="border border-glow-border rounded-md px-3 py-2 text-sm bg-stone text-charcoal min-w-[80px] text-left"
                    >
                      {s.time ? s.time : <span className="text-warm-light">Time</span>}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {frequencyType !== 'twice_daily' && (
              <div>
                {!showTimeOfDay ? (
                  <button type="button" onClick={() => setShowTimeOfDay(true)} className="text-xs text-warm-mid hover:text-charcoal">+ Add time of day</button>
                ) : (
                  <div className="pl-3 border-l-2 border-glow-border space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-warm-mid">Time of day (optional)</p>
                      <button type="button" onClick={() => { setShowTimeOfDay(false); setScheduledTime(''); setTimeOfDayLabel(''); }} className="text-xs text-warm-light hover:text-charcoal">Remove</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setClockTarget('scheduled')}
                        className="border border-glow-border rounded-md px-3 py-2 text-sm bg-stone text-charcoal min-w-[80px] text-left"
                      >
                        {scheduledTime ? scheduledTime : <span className="text-warm-light">Time</span>}
                      </button>
                      <input type="text" value={timeOfDayLabel} onChange={e => setTimeOfDayLabel(e.target.value)} placeholder="Label (e.g. After shower)" maxLength={20} className="flex-1" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Autocomplete toggle */}
        <div className="bg-taupe border border-glow-border rounded-lg px-4 py-3 flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-charcoal">Make this a habit</p>
            <p className="text-xs text-warm-light mt-0.5">
              Mark as kept automatically when due. Best for rituals you never skip.
            </p>
          </div>
          <ToggleSwitch
            checked={autocompleteEnabled}
            onChange={v => {
              setAutocompleteEnabled(v);
              if (v) setReminderEnabled(false);
            }}
          />
        </div>
      </div>
    );
  }

  function ServicesAndProductsSection() {
    const providerNum = providerCost !== '' ? Number(providerCost) : 0;
    const productSum = productEntries.reduce((sum, p) => {
      if (p.purchase_price !== '' && p.uses_per_container !== '' && Number(p.uses_per_container) > 0) {
        return sum + Number(p.purchase_price) / Number(p.uses_per_container);
      }
      return sum;
    }, 0);
    const totalCost = providerNum + productSum;
    const hasCostData = providerNum > 0 || productSum > 0;

    const spName = serviceProviderEntry.name.trim();
    const spSummary = spName || 'No provider set';
    const productSummary = productEntries.length > 0
      ? `${productEntries.length} product${productEntries.length !== 1 ? 's' : ''} linked`
      : 'No products linked';

    return (
      <div className="space-y-4">
        {/* Service provider — collapsible */}
        <div style={{ border: '1px solid #cdc6b6', borderRadius: '10px', backgroundColor: '#f6f1e6', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setSpOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '2px' }}>Service Provider</p>
              {!spOpen && <p style={{ fontSize: '12px', color: '#6b665e' }}>{spSummary}</p>}
            </div>
            <span style={{ fontSize: '16px', color: '#a8a297', transform: spOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', marginLeft: '8px' }}>›</span>
          </button>

          {spOpen && (
            <div style={{ borderTop: '1px solid #cdc6b6', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {savedProviders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Use a saved provider</label>
                  <select
                    defaultValue=""
                    onChange={e => {
                      const sp = savedProviders.find(p => p.id === e.target.value);
                      if (sp) applySavedProvider(sp);
                    }}
                    className="w-full border border-glow-border rounded-md px-3 py-2 text-sm bg-stone"
                  >
                    <option value="">— or fill in below —</option>
                    {savedProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Provider name</label>
                <input
                  type="text"
                  value={serviceProviderEntry.name}
                  onChange={e => { setServiceProviderEntry(s => ({ ...s, name: e.target.value })); setShowServiceProvider(true); }}
                  placeholder="e.g. Sarah at Color Bar Salon"
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Phone</label>
                <input
                  type="tel"
                  value={providerPhone}
                  onChange={e => setProviderPhone(e.target.value)}
                  onBlur={e => {
                    const d = stripPhoneFormatting(e.target.value);
                    if (d.length === 10) setProviderPhone(formatUSPhone(d));
                  }}
                  placeholder="(XXX) XXX-XXXX"
                  className="w-full"
                />
                {providerPhone && stripPhoneFormatting(providerPhone).length > 0 &&
                  stripPhoneFormatting(providerPhone).length !== 10 && (
                  <p className="text-xs text-dust mt-1">Enter a 10-digit US number.</p>
                )}
              </div>
              <DollarInput label="Cost per visit" value={providerCost} onChange={setProviderCost} />
            </div>
          )}
        </div>

        {/* Products — collapsible */}
        <div style={{ border: '1px solid #cdc6b6', borderRadius: '10px', backgroundColor: '#f6f1e6', overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setProductsOpen(o => !o)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          >
            <div>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '2px' }}>Products Used</p>
              {!productsOpen && <p style={{ fontSize: '12px', color: '#6b665e' }}>{productSummary}</p>}
            </div>
            <span style={{ fontSize: '16px', color: '#a8a297', transform: productsOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease', marginLeft: '8px' }}>›</span>
          </button>

          {productsOpen && (
            <div style={{ borderTop: '1px solid #cdc6b6', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {productEntries.length > 0 && (
                <div className="space-y-3">
                  {productEntries.map((product, i) => {
                    const costPerUse =
                      product.purchase_price !== '' &&
                      product.uses_per_container !== '' &&
                      Number(product.uses_per_container) > 0
                        ? Number(product.purchase_price) / Number(product.uses_per_container)
                        : null;

                    // Two-level category picker helpers
                    const topLevelCats = (productCategories ?? []).filter(c => !c.parent_id);
                    const selectedCatObj = (productCategories ?? []).find(c => c.id === product.product_category_id);
                    const derivedTopId = selectedCatObj?.parent_id ?? (selectedCatObj ? product.product_category_id : '');
                    const subCats = derivedTopId ? (productCategories ?? []).filter(c => c.parent_id === derivedTopId) : [];

                    return (
                      <div key={i} className="bg-taupe rounded-lg border border-glow-border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="label-overline">Product {i + 1}</span>
                          <button type="button" onClick={() => removeProduct(i)} className="text-xs text-warm-light hover:text-charcoal">Remove</button>
                        </div>
                        <input type="text" value={product.name} onChange={e => updateProduct(i, { ...product, name: e.target.value })} placeholder="Product name *" className="w-full" />
                        <input type="text" value={product.brand} onChange={e => updateProduct(i, { ...product, brand: e.target.value })} placeholder="Brand (optional)" className="w-full" />
                        {/* Two-level category picker */}
                        {topLevelCats.length > 0 && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Category</label>
                              <select
                                value={derivedTopId}
                                onChange={e => {
                                  const topId = e.target.value;
                                  const subs = (productCategories ?? []).filter(c => c.parent_id === topId);
                                  updateProduct(i, { ...product, product_category_id: subs.length > 0 ? '' : topId });
                                }}
                                className="w-full border border-glow-border rounded-md px-2 py-2 text-sm bg-stone"
                              >
                                <option value="">Select…</option>
                                {topLevelCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                              </select>
                            </div>
                            {subCats.length > 0 && (
                              <div>
                                <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Subcategory</label>
                                <select
                                  value={product.product_category_id}
                                  onChange={e => updateProduct(i, { ...product, product_category_id: e.target.value })}
                                  className="w-full border border-glow-border rounded-md px-2 py-2 text-sm bg-stone"
                                >
                                  <option value="">Select…</option>
                                  {subCats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                        {/* Container size + unit */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Container size</label>
                            <div className="flex gap-1.5">
                              <input
                                type="number" min={0}
                                value={product.container_size === '' ? '' : product.container_size}
                                onChange={e => updateProduct(i, { ...product, container_size: e.target.value === '' ? '' : Number(e.target.value) })}
                                onBlur={() => handleProductBlur(i, 'container_size')}
                                placeholder="e.g. 150" className="w-full" style={{ flex: 1 }}
                              />
                              <select value={product.container_unit} onChange={e => updateProduct(i, { ...product, container_unit: e.target.value })} className="border border-glow-border rounded-md px-2 py-2 text-sm bg-stone" style={{ flexShrink: 0 }}>
                                {['ml', 'fl oz', 'g', 'oz', 'kit', 'strips'].map(u => <option key={u} value={u}>{u}</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Uses per container</label>
                            <input
                              type="number" min={1}
                              value={product.uses_per_container === '' ? '' : product.uses_per_container}
                              onChange={e => updateProduct(i, { ...product, uses_per_container: e.target.value === '' ? '' : Number(e.target.value) })}
                              onBlur={() => handleProductBlur(i, 'uses_per_container')}
                              placeholder="e.g. 60" className="w-full"
                              style={autoFlash.has(`${i}-uses_per_container`) ? { borderColor: '#8ea394', backgroundColor: 'rgba(142,163,148,0.08)', transition: 'border-color 0.2s, background-color 0.2s' } : {}}
                            />
                          </div>
                        </div>
                        {costPerUse != null && (
                          <p className="text-xs text-warm-light">≈ ${costPerUse.toFixed(2)} per use</p>
                        )}
                        {/* Amount per use */}
                        <div>
                          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Amount per use</label>
                          <div className="flex gap-1.5 items-center">
                            <input
                              type="number" min={0} step="0.1"
                              value={product.use_amount_override === '' ? '' : product.use_amount_override}
                              onChange={e => updateProduct(i, { ...product, use_amount_override: e.target.value === '' ? '' : Number(e.target.value) })}
                              onBlur={() => handleProductBlur(i, 'use_amount_override')}
                              placeholder="Leave blank to calculate" className="w-full"
                              style={autoFlash.has(`${i}-use_amount_override`) ? { borderColor: '#8ea394', backgroundColor: 'rgba(142,163,148,0.08)', transition: 'border-color 0.2s, background-color 0.2s' } : {}}
                            />
                            {product.container_unit && <span className="text-xs text-warm-mid whitespace-nowrap">{product.container_unit}</span>}
                          </div>
                        </div>
                        {/* Purchase price */}
                        <DollarInput label="Purchase price" value={product.purchase_price} onChange={v => updateProduct(i, { ...product, purchase_price: v })} />
                        {/* Expiration date */}
                        <div>
                          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Expiration (optional)</label>
                          <input
                            type="month"
                            value={product.expires_at}
                            onChange={e => updateProduct(i, { ...product, expires_at: e.target.value })}
                            className="w-full"
                          />
                        </div>
                        {/* Track usage toggle */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: '13px', color: '#6b665e' }}>Track usage</span>
                          <ToggleSwitch checked={product.track_usage} onChange={v => updateProduct(i, { ...product, track_usage: v })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {productEntries.length < 10 && (
                <button type="button" onClick={addProduct} className="text-xs text-warm-mid hover:text-charcoal font-medium text-left">+ Add product</button>
              )}
            </div>
          )}
        </div>

        {/* Cost summary */}
        {hasCostData && (
          <div className="border-t border-glow-border pt-4">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-medium text-charcoal">Estimated cost per session</p>
              <p className="font-display text-lg text-charcoal">${totalCost.toFixed(2)}</p>
            </div>
            {providerNum > 0 && productSum > 0 && (
              <p className="text-xs text-warm-mid mt-0.5">
                Service: ${providerNum.toFixed(2)} · Products: ${productSum.toFixed(2)}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  function RemindersAndPrepSection() {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Prep Notes</label>
          <textarea
            rows={3}
            value={prepNotes}
            onChange={e => setPrepNotes(e.target.value)}
            placeholder="What should you do or know before this ritual? e.g. arrive makeup-free, stop retinoids 3 days before."
            className="w-full resize-none"
          />
        </div>

        <div className={`flex items-start gap-3 ${autocompleteEnabled ? 'opacity-40' : ''}`}>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-charcoal">Prompt for this ritual</p>
            {autocompleteEnabled ? (
              <p className="text-xs text-warm-light mt-0.5">Auto-complete rituals don't need a prompt.</p>
            ) : (
              <p className="text-xs text-warm-light mt-0.5">Show a reminder before this ritual is due.</p>
            )}
          </div>
          <ToggleSwitch
            checked={reminderEnabled}
            onChange={setReminderEnabled}
            disabled={autocompleteEnabled}
          />
        </div>

        {reminderEnabled && !autocompleteEnabled && (
          <div className="pl-3 border-l-2 border-glow-border">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-warm-mid">Remind me</span>
              <input
                type="number"
                min={1}
                max={99}
                value={reminderValue}
                onChange={e => setReminderValue(Number(e.target.value))}
                className="w-16 text-center"
              />
              <select
                value={reminderUnit}
                onChange={e => setReminderUnit(e.target.value as 'minutes' | 'hours' | 'days' | 'weeks')}
                className="border border-glow-border rounded-md px-2 py-2 text-sm bg-stone"
              >
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
                <option value="days">days</option>
                <option value="weeks">weeks</option>
              </select>
              <span className="text-sm text-warm-mid">before</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP: mode-choice
  // ═══════════════════════════════════════════════════════════════════════════

  if (step === 'mode-choice') {
    return (
      <div className="space-y-6">
        <div>
          <h2 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '24px', fontWeight: 400, color: '#352720' }}>
            What are you planning?
          </h2>
        </div>
        <div className="space-y-3">
          {[
            {
              value: 'standard' as TaskMode,
              title: 'Ongoing maintenance',
              desc: 'Track something you do repeatedly and schedule the next occurrence from completion.',
            },
            {
              value: 'countdown' as TaskMode,
              title: 'Preparing for an event',
              desc: 'Work backward from a specific date like a wedding, vacation, or photoshoot.',
            },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setMode(opt.value); setStep(opt.value === 'standard' ? 'anchor-date' : 'details'); }}
              style={{
                width: '100%', textAlign: 'left', borderRadius: '12px',
                border: `2px solid ${mode === opt.value ? '#352720' : '#ddd4c4'}`,
                padding: '18px 20px', cursor: 'pointer', display: 'block',
                backgroundColor: mode === opt.value ? '#f3ecd9' : '#faf4e6',
                transition: 'border-color 0.15s ease',
              }}
            >
              <p style={{ fontWeight: 500, color: '#352720', fontSize: '14px', marginBottom: '4px' }}>{opt.title}</p>
              <p style={{ fontSize: '13px', color: '#6b5c52', lineHeight: 1.4 }}>{opt.desc}</p>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => { if (mode) setStep(mode === 'standard' ? 'anchor-date' : 'details'); }}
            style={{ border: '1px solid #352720', backgroundColor: 'transparent', color: '#352720', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '8px 20px', cursor: 'pointer' }}
          >
            Continue →
          </button>
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
              onClick={() => { setAnchorType(t); if (t === 'today') setStep('details'); }}
              className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${
                anchorType === t ? 'border-charcoal bg-taupe' : 'border-glow-border hover:border-warm-light'
              }`}
            >
              <p className="text-sm font-medium text-charcoal">{t === 'today' ? 'Today' : 'Enter a past date'}</p>
              <p className="text-xs text-warm-light">
                {t === 'today' ? 'Start the countdown from right now.' : 'Use a real past date so the schedule starts from reality.'}
              </p>
            </button>
          ))}
          {anchorType === 'past' && (
            <input type="date" value={anchorDate} max={format(new Date(), 'yyyy-MM-dd')} onChange={e => setAnchorDate(e.target.value)} className="w-full" />
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
  // STEP: details — four sections
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <>
    {clockTarget && (
      <ClockPicker
        value={clockTarget === 'scheduled' ? scheduledTime || null : clockTarget === 'slotA' ? slotATime || null : slotBTime || null}
        onChange={t => {
          if (clockTarget === 'scheduled') setScheduledTime(t);
          else if (clockTarget === 'slotA') setSlotATime(t);
          else setSlotBTime(t);
          setClockTarget(null);
        }}
        onClose={() => setClockTarget(null)}
      />
    )}
    <form
      onSubmit={e => {
        e.preventDefault();
        mode === 'countdown' && !isEdit ? buildPreview() : handleSubmit(e);
      }}
      className="space-y-4"
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

      {/* Countdown-specific fields (above sections) */}
      {mode === 'countdown' && (
        <div className="space-y-3 bg-taupe border border-glow-border rounded-lg px-4 py-4">
          <p className="label-overline">Countdown settings</p>
          <div>
            {fieldLabel('Target date *')}
            <input type="date" value={targetDate} min={format(new Date(), 'yyyy-MM-dd')} onChange={e => setTargetDate(e.target.value)} className="w-full" />
          </div>
          <div>
            {fieldLabel('Event name (optional)')}
            <input type="text" value={targetLabel} onChange={e => setTargetLabel(e.target.value)} placeholder="e.g. Wedding, Photoshoot" className="w-full" />
          </div>
          <div>
            {fieldLabel('Final instance: days before target')}
            <input type="number" min={1} max={60} value={daysBeforeTarget} onChange={e => setDaysBeforeTarget(Number(e.target.value))} className="w-full" />
            <p className="text-xs text-warm-light mt-1">e.g. 7 = last instance due about one week before your event.</p>
          </div>
          <div className="flex items-start gap-3">
            <input type="checkbox" id="continueAfterTarget" checked={continueAfterTarget} onChange={e => setContinueAfterTarget(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-glow-border" />
            <div>
              <label htmlFor="continueAfterTarget" className="text-sm font-medium text-charcoal">Continue after target event</label>
              <p className="text-xs text-warm-light mt-0.5">Switch to forward-scheduling after your event date passes.</p>
            </div>
          </div>
        </div>
      )}

      {/* Section 1: Core Details */}
      <Section title="CORE DETAILS" subtitle="What are we tracking" isOpen={s1Open} onToggle={() => setS1Open(o => !o)}>
        {CategoryField()}

        <div>
          {fieldLabel('Ritual name *')}
          <input
            required
            type="text"
            value={name}
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
            placeholder="Name this ritual"
            className="w-full font-display text-lg"
          />
          {matchedCommonTask && (
            <div className="mt-1.5 space-y-1">
              <p className="text-xs text-warm-mid">Suggested interval based on common practice.</p>
              {matchedCommonTask.prep_steps && <p className="text-xs text-warm-light">Prep: {matchedCommonTask.prep_steps}</p>}
            </div>
          )}
        </div>

        <div>
          {fieldLabel('Description / instructions')}
          <textarea
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What does this involve? Any notes on technique or approach."
            className="w-full resize-none"
          />
        </div>
      </Section>

      {/* Section 2: Frequency */}
      <Section title="FREQUENCY" subtitle="How often" isOpen={s2Open} onToggle={() => setS2Open(o => !o)}>
        {FrequencyFields()}
      </Section>

      {/* Section 3: Services & Products */}
      <Section title="SERVICES & PRODUCTS" subtitle="Costs and what you use" isOpen={s3Open} onToggle={() => setS3Open(o => !o)}>
        {ServicesAndProductsSection()}
      </Section>

      {/* Section 4: Reminders & Prep */}
      <Section title="REMINDERS & PREP" subtitle="Prompts and preparation" isOpen={s4Open} onToggle={() => setS4Open(o => !o)}>
        {RemindersAndPrepSection()}
      </Section>

      {/* Actions */}
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
    </>
  );
}
