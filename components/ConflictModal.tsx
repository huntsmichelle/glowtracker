'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  resolveDoingBoth,
  resolveWithReset,
  resolveWithDelay,
  savePairDefault,
} from '@/lib/conflictResolution';
import type { ConflictResolution, DelayTarget } from '@/types';

type ConflictInstance = {
  id: string;
  due_date_start: string;
  due_date_end: string;
};

type ConflictPair = {
  id: string;
  default_resolution: ConflictResolution;
  task_a: { id: string; name: string };
  task_b: { id: string; name: string };
};

export type ConflictWithJoins = {
  id: string;
  routine_id: string;
  user_id: string;
  pair_id: string;
  instance_a_id: string;
  instance_b_id: string;
  conflict_date: string;
  status: string;
  pair: ConflictPair;
  instance_a: ConflictInstance;
  instance_b: ConflictInstance;
};

interface Props {
  conflict: ConflictWithJoins;
  onResolved: () => void;
  onClose: () => void;
}

export default function ConflictModal({ conflict, onResolved, onClose }: Props) {
  const [mode, setMode] = useState<ConflictResolution>('do_both');
  const [winner, setWinner] = useState<'a' | 'b'>('a');
  const [delayTarget, setDelayTarget] = useState<DelayTarget>('b');
  const [delayDays, setDelayDays] = useState(7);
  const [saveDefault, setSaveDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const { pair, instance_a, instance_b } = conflict;
  const taskA = pair.task_a;
  const taskB = pair.task_b;

  function fmt(d: string) {
    return format(parseISO(d), 'MMM d');
  }

  async function handleResolve() {
    setSaving(true);
    try {
      if (saveDefault) {
        await savePairDefault(
          conflict.pair_id,
          mode,
          mode === 'delay' ? delayDays : undefined,
          mode === 'delay' ? delayTarget : undefined,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = conflict as any;
      if (mode === 'do_both') {
        await resolveDoingBoth(c);
      } else if (mode === 'reset') {
        const winnerInstanceId = winner === 'a' ? instance_a.id : instance_b.id;
        await resolveWithReset(c, winnerInstanceId);
      } else {
        await resolveWithDelay(c, delayTarget, delayDays);
      }
      onResolved();
    } finally {
      setSaving(false);
    }
  }

  const optionClass = (active: boolean) =>
    `flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
      active ? 'border-pink-300 bg-pink-50' : 'border-gray-200'
    }`;

  const chipClass = (active: boolean) =>
    `flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
      active ? 'border-pink-400 bg-pink-50 text-pink-700 font-medium' : 'border-gray-200 text-gray-600'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div>
          <h2 className="text-base font-bold text-gray-800">Resolve Conflict</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {taskA.name} and {taskB.name} overlap on {fmt(conflict.conflict_date)}
          </p>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">{taskA.name}</span>
            <span className="text-gray-400">{fmt(instance_a.due_date_start)} – {fmt(instance_a.due_date_end)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-700">{taskB.name}</span>
            <span className="text-gray-400">{fmt(instance_b.due_date_start)} – {fmt(instance_b.due_date_end)}</span>
          </div>
        </div>

        <div className="space-y-2">
          <label className={optionClass(mode === 'do_both')}>
            <input type="radio" name="mode" value="do_both" checked={mode === 'do_both'} onChange={() => setMode('do_both')} className="mt-0.5" />
            <div>
              <p className="text-sm font-medium text-gray-800">Do Both</p>
              <p className="text-xs text-gray-400">Keep both as scheduled — no dates change.</p>
            </div>
          </label>

          <label className={optionClass(mode === 'reset')}>
            <input type="radio" name="mode" value="reset" checked={mode === 'reset'} onChange={() => setMode('reset')} className="mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Reset Schedule</p>
              <p className="text-xs text-gray-400 mb-2">The other task rebuilds its schedule from the winner&apos;s date.</p>
              {mode === 'reset' && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => setWinner('a')} className={chipClass(winner === 'a')}>
                    {taskA.name} wins
                  </button>
                  <button type="button" onClick={() => setWinner('b')} className={chipClass(winner === 'b')}>
                    {taskB.name} wins
                  </button>
                </div>
              )}
            </div>
          </label>

          <label className={optionClass(mode === 'delay')}>
            <input type="radio" name="mode" value="delay" checked={mode === 'delay'} onChange={() => setMode('delay')} className="mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-800">Delay One</p>
              <p className="text-xs text-gray-400 mb-2">Push one task forward by a set number of days.</p>
              {mode === 'delay' && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Delay by</span>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={delayDays}
                      onChange={e => setDelayDays(Number(e.target.value))}
                      className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center"
                    />
                    <span className="text-xs text-gray-600">days</span>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setDelayTarget('a')} className={chipClass(delayTarget === 'a')}>
                      Delay {taskA.name}
                    </button>
                    <button type="button" onClick={() => setDelayTarget('b')} className={chipClass(delayTarget === 'b')}>
                      Delay {taskB.name}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={saveDefault} onChange={e => setSaveDefault(e.target.checked)} />
          Save as default for this pair
        </label>

        <div className="flex gap-3 pt-1">
          <button
            onClick={handleResolve}
            disabled={saving}
            className="flex-1 bg-pink-500 text-white text-sm font-medium rounded-xl py-2.5 disabled:opacity-50"
          >
            {saving ? 'Resolving…' : 'Resolve'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-sm text-gray-600 border border-gray-200 rounded-xl py-2.5"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
