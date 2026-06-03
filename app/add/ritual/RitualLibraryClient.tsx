'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getCategoryColor, getCategoryIcon } from '@/lib/categoryColors';

// Mirrors the "Maintain Something" grid on /add — same labels, icons, colors.
const BROWSE_CATEGORIES = ['Hair', 'Skin', 'Nails', 'Brows & Lashes', 'Hair Removal', 'Wellness'];

const CADENCE_OPTIONS = [
  { label: 'Every week',    days: 7 },
  { label: 'Every 2 weeks', days: 14 },
  { label: 'Every month',   days: 30 },
  { label: 'Every 6 weeks', days: 42 },
  { label: 'Every 8 weeks', days: 56 },
  { label: 'Custom',        days: 0 },
];

// Human-readable cadence derived from a task's interval window (no
// recommended_cadence_label column exists on common_tasks).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cadenceLabel(task: any): string | null {
  const min = task.interval_min_days;
  const max = task.interval_max_days;
  if (!min && !max) return null;
  const mid = Math.round(((min ?? max) + (max ?? min)) / 2);
  if (mid <= 1)  return 'Daily';
  if (mid <= 10) return 'Weekly';
  if (mid <= 20) return 'Every 2 weeks';
  if (mid <= 38) return 'Monthly';
  if (mid <= 70) return `Every ${Math.round(mid / 7)} weeks`;
  return `Every ${Math.round(mid / 30)} months`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RitualLibraryClient({ tasks }: { tasks: any[] }) {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selected, setSelected] = useState<any>(null);
  const [query, setQuery]         = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [cadenceIndex, setCadenceIndex] = useState<number | null>(null);
  const [customDays, setCustomDays]     = useState('');
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  const filtered = query.trim()
    ? tasks.filter(t =>
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        (t.category ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : tasks;

  const inCategory = selectedCategory
    ? tasks.filter(t => t.category === selectedCategory)
    : [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function handleSelectTask(task: any) {
    setSelected(task);
    setError('');
    // Pre-select closest cadence option to task's midpoint
    const mid = Math.round(((task.interval_min_days ?? 14) + (task.interval_max_days ?? 14)) / 2);
    const optWithDays = CADENCE_OPTIONS.filter(o => o.days > 0);
    const diffs = optWithDays.map(o => Math.abs(o.days - mid));
    const minDiff = Math.min(...diffs);
    const idx = CADENCE_OPTIONS.findIndex(o => o.days > 0 && Math.abs(o.days - mid) === minDiff);
    setCadenceIndex(idx >= 0 ? idx : null);
  }

  // Index of the "recommended" cadence option
  function recommendedIndex(task: typeof selected): number {
    if (!task) return -1;
    const mid = Math.round(((task.interval_min_days ?? 14) + (task.interval_max_days ?? 14)) / 2);
    const optWithDays = CADENCE_OPTIONS.filter(o => o.days > 0);
    const diffs = optWithDays.map(o => Math.abs(o.days - mid));
    const minDiff = Math.min(...diffs);
    return CADENCE_OPTIONS.findIndex(o => o.days > 0 && Math.abs(o.days - mid) === minDiff);
  }

  async function handleAdd() {
    if (!selected || cadenceIndex === null) return;
    const cadenceOption = CADENCE_OPTIONS[cadenceIndex];
    const intervalDays = cadenceOption.days === 0
      ? (parseInt(customDays) || selected.interval_min_days || 30)
      : cadenceOption.days;

    setSaving(true);
    setError('');

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Not signed in.'); setSaving(false); return; }

    const { data: catData } = await supabase
      .from('categories')
      .select('id')
      .eq('name', selected.category)
      .maybeSingle();

    const { error: insertErr } = await supabase.from('tasks').insert({
      user_id:              user.id,
      name:                 selected.name,
      category_id:          catData?.id ?? null,
      frequency_type:       'interval',
      interval_min_days:    intervalDays,
      interval_max_days:    intervalDays,
      mode:                 'standard',
      is_active:            true,
      autocomplete_enabled: false,
      prep_notes:           selected.prep_steps ?? null,
      reminder_notes:       selected.prep_steps ?? null,
      default_reminder_days: 0,
    });

    if (insertErr) {
      console.error('Add ritual error:', insertErr);
      setError(insertErr.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    router.push('/');
  }

  // ── Detail / cadence picker ────────────────────────────────────────────────
  if (selected) {
    const recIdx = recommendedIndex(selected);
    return (
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '40px 24px' }}>
        <button
          onClick={() => setSelected(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--sage)', marginBottom: '24px', padding: 0 }}
        >
          Back
        </button>

        <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '28px', fontWeight: 400, color: 'var(--ink)', marginBottom: '8px' }}>
          How often?
        </h1>
        <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--ink-soft)', marginBottom: '24px' }}>
          {selected.name} · {selected.category}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '32px' }}>
          {CADENCE_OPTIONS.map((opt, i) => (
            <div key={opt.label}>
              <button
                onClick={() => setCadenceIndex(i)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px',
                  background: cadenceIndex === i ? 'rgba(110,140,130,0.08)' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--divider)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                {/* Radio dot */}
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  border: `1.5px solid ${cadenceIndex === i ? 'var(--sage)' : 'var(--divider)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {cadenceIndex === i && (
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'var(--sage)' }} />
                  )}
                </div>
                <div>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', color: 'var(--ink)', display: 'block' }}>
                    {opt.label}
                  </span>
                  {i === recIdx && (
                    <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '11px', color: 'var(--sage)', display: 'block', marginTop: '2px' }}>
                      Recommended
                    </span>
                  )}
                </div>
              </button>

              {opt.days === 0 && cadenceIndex === i && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px 10px 46px', borderBottom: '1px solid var(--divider)' }}>
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--ink-soft)' }}>Every</span>
                  <input
                    type="number"
                    value={customDays}
                    onChange={e => setCustomDays(e.target.value)}
                    placeholder="30"
                    min={1}
                    style={{ width: '64px', padding: '6px', border: '1px solid var(--divider)', borderRadius: '8px', fontFamily: 'Inter, sans-serif', fontSize: '15px', textAlign: 'center', backgroundColor: 'var(--paper-soft)', color: 'var(--ink)', outline: 'none' }}
                  />
                  <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '14px', color: 'var(--ink-soft)' }}>days</span>
                </div>
              )}
            </div>
          ))}
        </div>

        {error && (
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--refresh)', marginBottom: '12px' }}>{error}</p>
        )}

        <button
          onClick={handleAdd}
          disabled={cadenceIndex === null || saving}
          style={{
            width: '100%',
            backgroundColor: cadenceIndex === null || saving ? 'var(--ink-faint)' : 'var(--ink)',
            color: 'var(--cream)',
            border: 'none',
            borderRadius: '100px',
            padding: '16px',
            fontFamily: 'Inter, sans-serif',
            fontSize: '15px',
            fontWeight: 500,
            cursor: cadenceIndex === null || saving ? 'default' : 'pointer',
            transition: 'background-color 0.15s ease',
          }}
        >
          {saving ? 'Adding…' : `Add ${selected.name}`}
        </button>
      </main>
    );
  }

  // ── Search / list ──────────────────────────────────────────────────────────
  return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '40px 24px' }}>
      <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '32px', fontWeight: 400, color: 'var(--ink)', marginBottom: '24px' }}>
        Add a Ritual
      </h1>

      <input
        type="text"
        placeholder="Search rituals..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoFocus
        style={{
          width: '100%',
          backgroundColor: 'var(--paper-soft)',
          border: '1px solid var(--divider)',
          borderRadius: '100px',
          padding: '12px 20px',
          fontFamily: 'Inter, sans-serif',
          fontSize: '15px',
          color: 'var(--ink)',
          marginBottom: '16px',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      {/* Searching → flat result list across all categories */}
      {query.trim() && (
        <div>
          {filtered.length === 0 ? (
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '16px', color: 'var(--ink-faint)', padding: '24px 0', textAlign: 'center' }}>
              No rituals found.
            </p>
          ) : (
            filtered.map((task, i) => (
              <RitualRow key={task.id} task={task} showDivider={i > 0} onSelect={handleSelectTask} />
            ))
          )}
        </div>
      )}

      {/* No search, no category → category tile grid (mirrors Maintain Something) */}
      {!query.trim() && !selectedCategory && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {BROWSE_CATEGORIES.map(cat => {
            const catColor = getCategoryColor(cat);
            const Icon = getCategoryIcon(cat);
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  backgroundColor: 'var(--paper-soft)',
                  borderRadius: '12px',
                  border: '1px solid var(--divider)',
                  borderTop: `3px solid ${catColor.dot}`,
                  padding: '14px 12px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Icon size={20} color={catColor.dot} strokeWidth={1.5} />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--ink)' }}>{cat}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* No search, category selected → filtered list with back option */}
      {!query.trim() && selectedCategory && (
        <div>
          <button
            onClick={() => setSelectedCategory(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: '13px', color: 'var(--sage)', marginBottom: '12px', padding: 0 }}
          >
            ← All categories
          </button>
          {inCategory.length === 0 ? (
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '16px', color: 'var(--ink-faint)', padding: '24px 0', textAlign: 'center' }}>
              No rituals in {selectedCategory} yet.
            </p>
          ) : (
            inCategory.map((task, i) => (
              <RitualRow key={task.id} task={task} showDivider={i > 0} onSelect={handleSelectTask} />
            ))
          )}
        </div>
      )}
    </main>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RitualRow({ task, showDivider, onSelect }: { task: any; showDivider: boolean; onSelect: (t: any) => void }) {
  const cadence = cadenceLabel(task);
  return (
    <div>
      {showDivider && <div style={{ height: '1px', backgroundColor: 'var(--divider)' }} />}
      <button
        onClick={() => onSelect(task)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 4px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{ flex: 1 }}>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '15px', fontWeight: 500, color: 'var(--ink)', margin: 0 }}>
            {task.name}
          </p>
          <p style={{ fontFamily: 'Inter, sans-serif', fontSize: '12px', color: 'var(--ink-soft)', margin: '3px 0 0' }}>
            {task.category}{cadence ? ` · ${cadence}` : ''}
          </p>
        </div>
        <span style={{ fontSize: '18px', color: 'var(--ink-faint)', flexShrink: 0 }}>›</span>
      </button>
    </div>
  );
}
