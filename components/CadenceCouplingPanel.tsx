'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { fetchCouplingForDependent, createCoupling, deleteCoupling } from '@/lib/cadenceCoupling';
import type { CadenceCoupling } from '@/types';

interface Props {
  taskId: string;     // the dependent (current ritual)
  userId: string;
}

// Configure every-N cadence coupling for the current ritual (the dependent):
// "this ritual happens every N occurrences of an anchor ritual."
export default function CadenceCouplingPanel({ taskId, userId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [coupling, setCoupling] = useState<CadenceCoupling | null>(null);
  const [anchorName, setAnchorName] = useState('');
  const [anchorOptions, setAnchorOptions] = useState<{ id: string; name: string }[]>([]);

  const [anchorId, setAnchorId]     = useState('');
  const [intervalN, setIntervalN]   = useState(2);
  const [countMode, setCountMode]   = useState<'all' | 'kept'>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const c = await fetchCouplingForDependent(taskId);
    setCoupling(c);
    if (c) {
      const { data } = await supabase.from('tasks').select('name').eq('id', c.anchor_task_id).maybeSingle();
      setAnchorName(data?.name ?? 'another ritual');
    } else {
      const { data } = await supabase
        .from('tasks')
        .select('id, name')
        .eq('user_id', userId)
        .eq('is_active', true)
        .neq('id', taskId)
        .order('name');
      setAnchorOptions((data as { id: string; name: string }[]) ?? []);
    }
    setLoading(false);
  }, [taskId, userId]);

  useEffect(() => { load(); }, [load]);

  async function handleCouple() {
    if (!anchorId) { setError('Pick an anchor ritual.'); return; }
    setSaving(true);
    setError('');
    const { coupling: c, error: err } = await createCoupling({
      userId, anchorTaskId: anchorId, dependentTaskId: taskId, intervalN, countMode,
    });
    if (err) { setError(err); setSaving(false); return; }
    setCoupling(c);
    setSaving(false);
    router.refresh();
  }

  async function handleRemove() {
    if (!coupling) return;
    setSaving(true);
    await deleteCoupling(coupling.id, taskId);
    setSaving(false);
    await load();
    router.refresh();
  }

  if (loading) return null;

  return (
    <div>
      <p className="label-overline mb-3">Cadence coupling</p>

      {coupling ? (
        <div className="bg-stone border border-glow-border rounded-lg px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-charcoal">
            Repeats every <span className="font-medium">{coupling.interval_n}</span>
            {coupling.interval_n === 1 ? '' : ''} occurrence{coupling.interval_n !== 1 ? 's' : ''} of{' '}
            <span className="font-medium">{anchorName}</span>
            {coupling.count_mode === 'kept' ? ' (kept only)' : ''}.
          </p>
          <button
            type="button"
            onClick={handleRemove}
            disabled={saving}
            className="text-xs text-warm-light hover:text-charcoal flex-shrink-0 disabled:opacity-50"
          >
            {saving ? '…' : 'Remove'}
          </button>
        </div>
      ) : (
        <div className="bg-stone border border-glow-border rounded-lg p-4 space-y-3">
          <p className="text-xs text-warm-mid">
            Tie this ritual to another so it follows that ritual&rsquo;s rhythm — e.g. a pedicure every 3rd manicure.
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-warm-mid">Every</span>
            <input
              type="number"
              min={1}
              max={12}
              value={intervalN}
              onChange={e => setIntervalN(Math.max(1, Number(e.target.value)))}
              className="w-16 text-center"
            />
            <span className="text-sm text-warm-mid">occurrence(s) of</span>
            <select
              value={anchorId}
              onChange={e => setAnchorId(e.target.value)}
              className="border border-glow-border rounded-md px-2 py-2 text-sm bg-stone flex-1 min-w-[140px]"
            >
              <option value="">Select a ritual…</option>
              {anchorOptions.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
          </div>

          {!showAdvanced ? (
            <button type="button" onClick={() => setShowAdvanced(true)} className="text-xs text-warm-mid hover:text-charcoal">
              Advanced — counting
            </button>
          ) : (
            <div className="pl-3 border-l-2 border-glow-border">
              <p className="text-xs font-medium text-warm-mid mb-1.5">Count</p>
              <div className="flex rounded-lg border border-glow-border overflow-hidden max-w-xs">
                {([
                  { v: 'all', label: 'All occurrences' },
                  { v: 'kept', label: 'Only kept' },
                ] as const).map(opt => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setCountMode(opt.v)}
                    className={`flex-1 text-xs py-1.5 font-medium ${countMode === opt.v ? 'bg-charcoal text-cream' : 'bg-stone text-warm-mid hover:bg-taupe'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-dust" style={{ color: 'var(--refresh)' }}>{error}</p>}

          <button
            type="button"
            onClick={handleCouple}
            disabled={saving || anchorOptions.length === 0}
            className="bg-charcoal text-cream text-sm font-medium rounded-pill px-4 py-1.5 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Couple rituals'}
          </button>
          {anchorOptions.length === 0 && (
            <p className="text-xs text-warm-light">Add another ritual first to couple this one to it.</p>
          )}
        </div>
      )}
    </div>
  );
}
