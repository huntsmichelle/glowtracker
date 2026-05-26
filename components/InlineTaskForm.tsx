'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createFirstInstance } from '@/lib/instanceEngine';
import { detectRoutineConflicts } from '@/lib/conflictDetection';
import type { Category, Task, IntervalType, IntervalUnit, ServiceProvider } from '@/types';

const COLOR_SWATCHES = [
  '#8A9E8C', '#A89880', '#6B6660', '#2C2A26',
  '#C4D4C5', '#D4C8B8', '#9E9890', '#E5DFD4',
];

function toDays(value: number, unit: IntervalUnit) {
  return unit === 'weeks' ? value * 7 : value;
}

interface Props {
  routineId: string;
  existingTaskIds: string[];
  categories: Category[];
  userId: string;
  onCreated: (task: Task) => void;
  onCancel: () => void;
}

export default function InlineTaskForm({
  routineId,
  existingTaskIds,
  categories: initialCategories,
  userId,
  onCreated,
  onCancel,
}: Props) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [intervalType, setIntervalType] = useState<IntervalType>('range');
  const [intervalMin, setIntervalMin] = useState(4);
  const [intervalMax, setIntervalMax] = useState(6);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('weeks');
  const [defaultCost, setDefaultCost] = useState('');
  const [description, setDescription] = useState('');

  const [showSP, setShowSP] = useState(false);
  const [spName, setSpName] = useState('');
  const [spPhone, setSpPhone] = useState('');
  const [spWebsite, setSpWebsite] = useState('');
  const [spAddress, setSpAddress] = useState('');
  const [savedProviders, setSavedProviders] = useState<ServiceProvider[]>([]);

  const [localCategories, setLocalCategories] = useState<Category[]>(initialCategories);
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLOR_SWATCHES[0]);
  const [catLoading, setCatLoading] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!categoryId) { setSavedProviders([]); return; }
    const supabase = createClient();
    supabase
      .from('service_providers')
      .select('*')
      .eq('user_id', userId)
      .eq('category_id', categoryId)
      .order('name')
      .then(({ data }) => setSavedProviders((data ?? []) as ServiceProvider[]));
  }, [categoryId, userId]);

  function intervalMinDays() { return toDays(intervalMin, intervalUnit); }
  function intervalMaxDays() { return toDays(intervalType === 'exact' ? intervalMin : intervalMax, intervalUnit); }

  async function handleCreateCategory() {
    if (!newCatName.trim()) return;
    setCatLoading(true);
    const supabase = createClient();
    const { data, error: catErr } = await supabase
      .from('categories')
      .insert({ user_id: userId, name: newCatName.trim(), color: newCatColor, is_default: false })
      .select()
      .single();
    if (!catErr && data) {
      const newCat = data as Category;
      setLocalCategories(prev => [...prev, newCat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(newCat.id);
      setShowNewCat(false);
      setNewCatName('');
    }
    setCatLoading(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('Ritual name is required.'); return; }
    if (intervalMin < 1) { setError('Interval must be at least 1.'); return; }
    if (intervalType === 'range' && intervalMin > intervalMax) { setError('Min interval cannot exceed max.'); return; }

    setSaving(true);
    setError('');
    const supabase = createClient();

    let serviceProviderId: string | null = null;
    if (showSP && spName.trim()) {
      const { data: spData } = await supabase
        .from('service_providers')
        .insert({
          name: spName.trim(),
          phone: spPhone.trim() || null,
          website_url: spWebsite.trim() || null,
          address: spAddress.trim() || null,
          category_id: categoryId || null,
          user_id: userId,
        })
        .select()
        .single();
      serviceProviderId = spData?.id ?? null;
    }

    const { data: taskData, error: taskErr } = await supabase
      .from('tasks')
      .insert({
        name: name.trim(),
        category_id: categoryId || null,
        description: description.trim() || null,
        interval_min_days: intervalMinDays(),
        interval_max_days: intervalMaxDays(),
        default_reminder_days: 2,
        default_cost: defaultCost !== '' ? Number(defaultCost) : null,
        user_id: userId,
        mode: 'standard',
        routine_id: routineId,
        service_provider_id: serviceProviderId,
      })
      .select()
      .single();

    if (taskErr) { setError(taskErr.message); setSaving(false); return; }

    const newTask = taskData as Task;
    await createFirstInstance(newTask);

    if (existingTaskIds.length > 0) {
      const pairInserts = existingTaskIds.map(existingId => {
        const [a, b] = [newTask.id, existingId].sort();
        return { routine_id: routineId, user_id: userId, task_a_id: a, task_b_id: b, default_resolution: 'ask' };
      });
      await supabase.from('routine_task_pairs').insert(pairInserts);
    }

    await detectRoutineConflicts(routineId);

    setSaving(false);
    onCreated(newTask);
  }

  const toggleCls = (active: boolean) =>
    `flex-1 text-xs py-1.5 font-medium transition-colors ${
      active ? 'bg-charcoal text-cream' : 'bg-stone text-warm-mid hover:bg-taupe'
    }`;

  return (
    <form onSubmit={handleSubmit} className="bg-stone border border-glow-border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="label-overline">New Ritual</p>
        <button type="button" onClick={onCancel} className="text-xs text-warm-light hover:text-charcoal">Cancel</button>
      </div>

      <div>
        <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Ritual name *</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Hair Color"
          className="w-full"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Category</label>
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
            onClick={() => setShowNewCat(!showNewCat)}
            className="w-9 h-9 flex items-center justify-center border border-glow-border rounded-lg text-warm-mid hover:text-charcoal hover:border-warm-light transition-colors flex-shrink-0"
          >
            +
          </button>
        </div>
        {showNewCat && (
          <div className="mt-2 bg-taupe rounded-lg border border-glow-border p-3 space-y-2">
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="Category name"
              className="w-full"
            />
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_SWATCHES.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewCatColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform border border-glow-border ${newCatColor === c ? 'scale-125 ring-2 ring-offset-1 ring-charcoal' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowNewCat(false); setNewCatName(''); }} className="flex-1 border border-glow-border text-warm-mid text-xs rounded-pill py-1.5 hover:bg-stone transition-colors">Cancel</button>
              <button type="button" onClick={handleCreateCategory} disabled={catLoading || !newCatName.trim()} className="flex-1 bg-charcoal text-cream text-xs font-medium rounded-pill py-1.5 disabled:opacity-50">
                {catLoading ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Interval</label>
        <div className="flex rounded-lg border border-glow-border overflow-hidden mb-2">
          {(['exact', 'range'] as IntervalType[]).map(t => (
            <button key={t} type="button" onClick={() => setIntervalType(t)} className={toggleCls(intervalType === t)}>
              {t === 'exact' ? 'Exact' : 'Range'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number" min={1} max={365} value={intervalMin}
            onChange={e => setIntervalMin(Number(e.target.value))}
            className="flex-1"
          />
          {intervalType === 'range' && (
            <>
              <span className="text-warm-light">–</span>
              <input
                type="number" min={1} max={365} value={intervalMax}
                onChange={e => setIntervalMax(Number(e.target.value))}
                className="flex-1"
              />
            </>
          )}
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

      <div>
        <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Default cost <span className="normal-case font-normal tracking-normal">(optional)</span></label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-light text-sm">$</span>
          <input
            type="number" min={0} step="0.01" value={defaultCost}
            onChange={e => setDefaultCost(e.target.value)}
            placeholder="0.00"
            className="w-full pl-7"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Notes / prep <span className="normal-case font-normal tracking-normal">(optional)</span></label>
        <textarea
          rows={2}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Instructions, products, etc."
          className="w-full resize-none"
        />
      </div>

      <div className="border border-glow-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => setShowSP(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-taupe transition-colors"
        >
          <span className={`font-medium ${showSP || spName ? 'text-charcoal' : 'text-warm-mid'}`}>
            {showSP || spName ? 'Service Provider' : '+ Add Service Provider'}
          </span>
          <span className="text-warm-light text-lg leading-none">{showSP ? '−' : '+'}</span>
        </button>
        {showSP && (
          <div className="px-4 pb-4 space-y-2 border-t border-glow-border pt-3">
            {savedProviders.length > 0 && (
              <select
                defaultValue=""
                onChange={e => {
                  const sp = savedProviders.find(p => p.id === e.target.value);
                  if (sp) { setSpName(sp.name); setSpPhone(sp.phone ?? ''); setSpWebsite(sp.website_url ?? ''); setSpAddress(sp.address ?? ''); }
                }}
                className="w-full border border-glow-border rounded-md px-3 py-2 text-sm bg-stone"
              >
                <option value="">— or add new —</option>
                {savedProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <input type="text" value={spName} onChange={e => setSpName(e.target.value)} placeholder="Name *" className="w-full" />
            <input type="tel" value={spPhone} onChange={e => setSpPhone(e.target.value)} placeholder="Phone (optional)" className="w-full" />
            <input type="url" value={spWebsite} onChange={e => setSpWebsite(e.target.value)} placeholder="Website (optional)" className="w-full" />
            <textarea rows={2} value={spAddress} onChange={e => setSpAddress(e.target.value)} placeholder="Address (optional)" className="w-full resize-none" />
          </div>
        )}
      </div>

      {error && <p className="text-charcoal bg-dust-lt border border-dust rounded-md px-3 py-2 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-charcoal hover:bg-charcoal/90 text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50"
      >
        {saving ? 'Creating ritual…' : 'Create Ritual'}
      </button>
    </form>
  );
}
