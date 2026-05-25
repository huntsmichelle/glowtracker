'use client';

import { useState } from 'react';
import { savePairDefault } from '@/lib/conflictResolution';
import type { ConflictResolution, DelayTarget } from '@/types';

type PairWithTasks = {
  id: string;
  routine_id: string;
  user_id: string;
  task_a_id: string;
  task_b_id: string;
  default_resolution: ConflictResolution;
  default_delay_days: number | null;
  delay_target: DelayTarget | null;
  task_a: { id: string; name: string };
  task_b: { id: string; name: string };
};

interface PairState {
  resolution: ConflictResolution;
  delayDays: number;
  delayTarget: DelayTarget;
}

interface Props {
  pairs: PairWithTasks[];
}

export default function LinkRulesPanel({ pairs }: Props) {
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, PairState>>(
    Object.fromEntries(
      pairs.map(p => [p.id, {
        resolution: p.default_resolution,
        delayDays: p.default_delay_days ?? 7,
        delayTarget: p.delay_target ?? 'b',
      }])
    )
  );

  function update(pairId: string, patch: Partial<PairState>) {
    setStates(s => ({ ...s, [pairId]: { ...s[pairId], ...patch } }));
  }

  async function save(pair: PairWithTasks) {
    const s = states[pair.id];
    setSaving(pair.id);
    setSaved(null);
    await savePairDefault(
      pair.id,
      s.resolution,
      s.resolution === 'delay' ? s.delayDays : undefined,
      s.resolution === 'delay' ? s.delayTarget : undefined,
    );
    setSaving(null);
    setSaved(pair.id);
    setTimeout(() => setSaved(null), 2000);
  }

  if (pairs.length === 0) {
    return (
      <p className="text-sm text-gray-400 text-center py-4">
        Add at least 2 tasks to configure conflict rules.
      </p>
    );
  }

  const resolutionOptions: { value: ConflictResolution; label: string }[] = [
    { value: 'ask',    label: 'Ask me' },
    { value: 'do_both', label: 'Do both' },
    { value: 'delay',  label: 'Auto-delay' },
    { value: 'reset',  label: 'Reset' },
  ];

  return (
    <div className="space-y-3">
      {pairs.map(pair => {
        const s = states[pair.id];
        return (
          <div key={pair.id} className="bg-white border border-gray-100 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-gray-800">
              {pair.task_a.name} <span className="text-gray-400 font-normal">vs</span> {pair.task_b.name}
            </p>

            <div className="flex gap-2 flex-wrap">
              {resolutionOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => update(pair.id, { resolution: opt.value })}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    s.resolution === opt.value
                      ? 'border-pink-400 bg-pink-50 text-pink-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {s.resolution === 'delay' && (
              <div className="flex items-center gap-2 text-xs flex-wrap">
                <span className="text-gray-600">Delay by</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={s.delayDays}
                  onChange={e => update(pair.id, { delayDays: Number(e.target.value) })}
                  className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-center"
                />
                <span className="text-gray-600">days —</span>
                <select
                  value={s.delayTarget}
                  onChange={e => update(pair.id, { delayTarget: e.target.value as DelayTarget })}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
                >
                  <option value="a">delay {pair.task_a.name}</option>
                  <option value="b">delay {pair.task_b.name}</option>
                </select>
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                onClick={() => save(pair)}
                disabled={saving === pair.id}
                className="text-xs bg-gray-800 text-white rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {saving === pair.id ? 'Saving…' : 'Save rule'}
              </button>
              {saved === pair.id && (
                <span className="text-xs text-green-600">Saved</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
