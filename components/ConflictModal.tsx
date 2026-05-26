'use client';

import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  resolveNoConflict,
  resolveAsAsked,
  resolveSkipOne,
  resolveAutoAdjust,
  savePairDefault,
} from '@/lib/conflictResolution';
import type { ConflictResolution, AdjustDirection, SkipTarget, DelayTarget, NoConflictOrder } from '@/types';

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

const TOOLTIPS: Record<ConflictResolution, string> = {
  no_conflict:  'Both rituals stay on this date. Each series continues on its own schedule as normal.',
  ask:          "You'll be prompted to choose what to do each time these two rituals land on the same date.",
  auto_adjust:  'Advance or delay one ritual by a set number of days. You choose whether it returns to its original schedule or continues from the new date.',
  skip_one:     'One ritual skips this occurrence. Both series then use this date as their new starting point for future scheduling.',
};

export default function ConflictModal({ conflict, onResolved, onClose }: Props) {
  const [mode, setMode]                     = useState<ConflictResolution>('no_conflict');
  const [skipTarget, setSkipTarget]         = useState<SkipTarget>('b');
  const [adjustTarget, setAdjustTarget]     = useState<DelayTarget>('b');
  const [adjustDirection, setAdjustDir]     = useState<AdjustDirection>('forward');
  const [adjustDays, setAdjustDays]         = useState(7);
  const [snapBack, setSnapBack]             = useState(false);
  const [noConflictOrder, setNoConflictOrder] = useState<NoConflictOrder>('a_first');
  const [noConflictTimeA, setNoConflictTimeA] = useState('');
  const [noConflictTimeB, setNoConflictTimeB] = useState('');
  const [saveDefault, setSaveDefault]       = useState(false);
  const [saving, setSaving]                 = useState(false);

  const { pair, instance_a, instance_b } = conflict;
  const taskA = pair.task_a;
  const taskB = pair.task_b;

  function fmt(d: string) { return format(parseISO(d), 'MMM d'); }

  const optionClass = (active: boolean) =>
    `flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
      active ? 'border-charcoal bg-taupe' : 'border-glow-border hover:border-warm-light'
    }`;

  const chipClass = (active: boolean) =>
    `flex-1 text-xs py-1.5 px-2 rounded-pill border transition-colors text-center ${
      active ? 'border-charcoal bg-charcoal text-cream font-medium' : 'border-glow-border text-warm-mid hover:border-warm-light'
    }`;

  async function handleResolve() {
    setSaving(true);
    try {
      if (saveDefault) {
        await savePairDefault(conflict.pair_id, mode, {
          adjustDays:       mode === 'auto_adjust' ? adjustDays       : undefined,
          adjustTarget:     mode === 'auto_adjust' ? adjustTarget     : undefined,
          adjustDirection:  mode === 'auto_adjust' ? adjustDirection  : undefined,
          adjustSnapBack:   mode === 'auto_adjust' ? snapBack         : undefined,
          skipTarget:       mode === 'skip_one'    ? skipTarget       : undefined,
          noConflictOrder:  mode === 'no_conflict' ? noConflictOrder  : undefined,
          noConflictTimeA:  mode === 'no_conflict' ? noConflictTimeA  : undefined,
          noConflictTimeB:  mode === 'no_conflict' ? noConflictTimeB  : undefined,
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = conflict as any;
      if (mode === 'no_conflict') {
        await resolveNoConflict(c);
      } else if (mode === 'ask') {
        await resolveAsAsked(c);
      } else if (mode === 'skip_one') {
        await resolveSkipOne(c, skipTarget);
      } else {
        await resolveAutoAdjust(c, adjustTarget, adjustDays, adjustDirection, snapBack);
      }
      onResolved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-charcoal/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-stone border border-glow-border rounded-lg shadow-modal w-full max-w-sm mx-4 p-5 space-y-4 max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div>
          <p className="label-overline mb-0.5">Overlap Detected</p>
          <p className="text-xs text-warm-mid">
            {taskA.name} and {taskB.name} overlap on {fmt(conflict.conflict_date)}
          </p>
        </div>

        {/* Date summary */}
        <div className="bg-taupe rounded-md p-3 space-y-1.5 text-xs">
          <div className="flex justify-between">
            <span className="font-medium text-charcoal">{taskA.name}</span>
            <span className="text-warm-light">{fmt(instance_a.due_date_start)} – {fmt(instance_a.due_date_end)}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-charcoal">{taskB.name}</span>
            <span className="text-warm-light">{fmt(instance_b.due_date_start)} – {fmt(instance_b.due_date_end)}</span>
          </div>
        </div>

        {/* Options */}
        <div className="space-y-2">

          {/* No Conflict */}
          <label className={optionClass(mode === 'no_conflict')} title={TOOLTIPS.no_conflict}>
            <input type="radio" name="mode" value="no_conflict" checked={mode === 'no_conflict'} onChange={() => setMode('no_conflict')} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-charcoal">No Overlap</p>
              <p className="text-xs text-warm-light mb-2">Both rituals stay on this date — no dates change.</p>
              {mode === 'no_conflict' && (
                <div className="space-y-2" onClick={e => e.preventDefault()}>
                  <p className="text-xs text-warm-mid">Optional: set order and times for this date.</p>
                  <div>
                    <p className="text-xs text-warm-mid mb-1">Which happens first?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setNoConflictOrder('a_first')} className={chipClass(noConflictOrder === 'a_first')}>▲ {taskA.name}</button>
                      <button type="button" onClick={() => setNoConflictOrder('b_first')} className={chipClass(noConflictOrder === 'b_first')}>▲ {taskB.name}</button>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <p className="text-xs text-warm-mid mb-1">{taskA.name} at</p>
                      <input type="time" value={noConflictTimeA} onChange={e => setNoConflictTimeA(e.target.value)} className="w-full" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-warm-mid mb-1">{taskB.name} at</p>
                      <input type="time" value={noConflictTimeB} onChange={e => setNoConflictTimeB(e.target.value)} className="w-full" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </label>

          {/* Ask Me Each Time */}
          <label className={optionClass(mode === 'ask')} title={TOOLTIPS.ask}>
            <input type="radio" name="mode" value="ask" checked={mode === 'ask'} onChange={() => setMode('ask')} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-charcoal">Ask Me Each Time</p>
              <p className="text-xs text-warm-light">Dismiss this one; prompt me again next time.</p>
            </div>
          </label>

          {/* Auto-Adjust */}
          <label className={optionClass(mode === 'auto_adjust')} title={TOOLTIPS.auto_adjust}>
            <input type="radio" name="mode" value="auto_adjust" checked={mode === 'auto_adjust'} onChange={() => setMode('auto_adjust')} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-charcoal">Auto-Adjust</p>
              <p className="text-xs text-warm-light mb-2">Shift one ritual forward or back by a set number of days.</p>
              {mode === 'auto_adjust' && (
                <div className="space-y-2.5 mt-1" onClick={e => e.preventDefault()}>
                  <div>
                    <p className="text-xs text-warm-mid mb-1">Which ritual moves?</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAdjustTarget('a')} className={chipClass(adjustTarget === 'a')}>{taskA.name}</button>
                      <button type="button" onClick={() => setAdjustTarget('b')} className={chipClass(adjustTarget === 'b')}>{taskB.name}</button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-warm-mid mb-1">Direction</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setAdjustDir('forward')} className={chipClass(adjustDirection === 'forward')}>Delay (later)</button>
                      <button type="button" onClick={() => setAdjustDir('back')} className={chipClass(adjustDirection === 'back')}>Advance (earlier)</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-warm-mid">By</span>
                    <input
                      type="number" min={1} max={90} value={adjustDays}
                      onChange={e => setAdjustDays(Number(e.target.value))}
                      className="w-16 text-center"
                    />
                    <span className="text-xs text-warm-mid">days</span>
                  </div>
                  <div>
                    <p className="text-xs text-warm-mid mb-1">After adjustment</p>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSnapBack(false)} className={chipClass(!snapBack)}>Continue from new date</button>
                      <button type="button" onClick={() => setSnapBack(true)} className={chipClass(snapBack)}>Snap back to original rhythm</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </label>

          {/* Skip One */}
          <label className={optionClass(mode === 'skip_one')} title={TOOLTIPS.skip_one}>
            <input type="radio" name="mode" value="skip_one" checked={mode === 'skip_one'} onChange={() => setMode('skip_one')} className="mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-charcoal">Skip One</p>
              <p className="text-xs text-warm-light mb-2">One ritual skips this occurrence; both reanchor from this date.</p>
              {mode === 'skip_one' && (
                <div onClick={e => e.preventDefault()}>
                  <p className="text-xs text-warm-mid mb-1">Which ritual skips?</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setSkipTarget('a')} className={chipClass(skipTarget === 'a')}>{taskA.name}</button>
                    <button type="button" onClick={() => setSkipTarget('b')} className={chipClass(skipTarget === 'b')}>{taskB.name}</button>
                  </div>
                </div>
              )}
            </div>
          </label>
        </div>

        {/* Resolution Guide */}
        <details className="text-xs border border-glow-border rounded-lg overflow-hidden">
          <summary className="px-3 py-2 cursor-pointer text-warm-mid hover:bg-taupe font-medium">Resolution Guide</summary>
          <div className="px-3 pb-3 pt-1 space-y-2 border-t border-glow-border">
            {(Object.entries(TOOLTIPS) as [ConflictResolution, string][]).map(([key, desc]) => (
              <div key={key}>
                <p className="font-medium text-charcoal">
                  {key === 'no_conflict' ? 'No Overlap' : key === 'ask' ? 'Ask Me Each Time' : key === 'auto_adjust' ? 'Auto-Adjust' : 'Skip One'}
                </p>
                <p className="text-warm-light">{desc}</p>
              </div>
            ))}
          </div>
        </details>

        {/* Save as default */}
        <label className="flex items-center gap-2 text-xs text-warm-mid cursor-pointer">
          <input type="checkbox" checked={saveDefault} onChange={e => setSaveDefault(e.target.checked)} />
          Save as default for this pair
        </label>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={handleResolve}
            disabled={saving}
            className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50 hover:bg-charcoal/90"
          >
            {saving ? 'Resolving…' : 'Resolve'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-sm text-warm-mid border border-glow-border rounded-pill py-2.5 hover:bg-taupe transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
