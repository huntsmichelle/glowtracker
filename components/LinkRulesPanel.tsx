'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { detectRoutineConflicts } from '@/lib/conflictDetection';
import type { ConflictResolution, AdjustDirection, SkipTarget, DelayTarget, NoConflictOrder, ProximityResolution, LinkType } from '@/types';

interface PairRuleState {
  pairId:            string | null;
  routineId:         string;
  taskAId:           string;
  taskBId:           string;
  taskAName:         string;
  taskBName:         string;
  // Relationship type
  linkType:          LinkType;
  occurrenceInterval: number;
  primaryTaskId:     string; // 'a' or 'b' — resolved to actual ID on save
  // Overlap resolution
  defaultResolution: ConflictResolution;
  defaultDelayDays:  number;
  delayTarget:       DelayTarget;
  adjustDirection:   AdjustDirection;
  adjustSnapBack:    boolean;
  skipTarget:        SkipTarget;
  noConflictOrder:   NoConflictOrder;
  noConflictTimeA:   string;
  noConflictTimeB:   string;
  // Proximity / timing
  proximityEnabled:    boolean;
  proximityDays:       number;
  proximityFirstTask:  'a' | 'b';
  proximityResolution: ProximityResolution;
  suggestedProximity:  number | null;
}

interface Props {
  routineId:     string;
  userId:        string;
  onRulesSaved?: () => void;
}

const TOOLTIPS: Record<ConflictResolution, string> = {
  no_conflict:  'Both tasks stay on this date. Each series continues on its own schedule as normal.',
  ask:          "You'll be prompted to choose what to do each time these two tasks land on the same date.",
  auto_adjust:  'Advance or delay one task by a set number of days. You choose whether it returns to its original schedule or continues from the new date.',
  skip_one:     'One task skips this occurrence. Both series then use this date as their new starting point for future scheduling.',
};

const RESOLUTION_OPTIONS: { value: ConflictResolution; label: string }[] = [
  { value: 'no_conflict',  label: 'No Conflict' },
  { value: 'ask',          label: 'Ask Me Each Time' },
  { value: 'auto_adjust',  label: 'Auto-Adjust' },
  { value: 'skip_one',     label: 'Skip One' },
];

const PROXIMITY_OPTIONS: { value: ProximityResolution; label: string }[] = [
  { value: 'ask',           label: 'Ask me each time' },
  { value: 'looks_good',    label: 'Looks Good' },
  { value: 'auto_adjust',   label: 'Auto-Adjust' },
  { value: 'remind_closer', label: 'Remind Me Closer' },
];

const supabase = createClient();

export default function LinkRulesPanel({ routineId, userId, onRulesSaved }: Props) {
  const [pairRules, setPairRules]         = useState<Record<string, PairRuleState>>({});
  const [saveStatus, setSaveStatus]       = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys]   = useState<Set<string>>(new Set());
  const [timingExpanded, setTimingExpanded] = useState(false);
  const [timingKeys, setTimingKeys]       = useState<Set<string>>(new Set());
  const [loading, setLoading]             = useState(true);

  useEffect(() => {
    async function loadPairRules() {
      setLoading(true);
      const [{ data: tasks }, { data: pairs }, { data: relationships }] = await Promise.all([
        supabase.from('tasks').select('id, name').eq('routine_id', routineId).order('id'),
        supabase.from('routine_task_pairs').select('*').eq('routine_id', routineId),
        supabase.from('common_task_relationships').select('task_a_name, task_b_name, suggested_proximity_days'),
      ]);

      if (!tasks || tasks.length < 2) {
        setPairRules({});
        setLoading(false);
        return;
      }

      const lower = (s: string) => s.toLowerCase();
      const rules: Record<string, PairRuleState> = {};

      for (let i = 0; i < tasks.length; i++) {
        for (let j = i + 1; j < tasks.length; j++) {
          const taskA = tasks[i];
          const taskB = tasks[j];
          const key = `${taskA.id}__${taskB.id}`;
          const existing = pairs?.find(p =>
            (p.task_a_id === taskA.id && p.task_b_id === taskB.id) ||
            (p.task_a_id === taskB.id && p.task_b_id === taskA.id)
          );

          // Look up suggested proximity from common_task_relationships
          let suggestedProximity: number | null = null;
          if (relationships) {
            for (const rel of relationships) {
              const matchA = lower(taskA.name).includes(lower(rel.task_a_name)) || lower(rel.task_a_name).includes(lower(taskA.name));
              const matchB = lower(taskB.name).includes(lower(rel.task_b_name)) || lower(rel.task_b_name).includes(lower(taskB.name));
              const matchAB = lower(taskA.name).includes(lower(rel.task_b_name)) || lower(rel.task_b_name).includes(lower(taskA.name));
              const matchBA = lower(taskB.name).includes(lower(rel.task_a_name)) || lower(rel.task_a_name).includes(lower(taskB.name));
              if ((matchA && matchB) || (matchAB && matchBA)) {
                suggestedProximity = rel.suggested_proximity_days ?? null;
                break;
              }
            }
          }

          rules[key] = {
            pairId:            existing?.id ?? null,
            routineId,
            taskAId:           taskA.id,
            taskBId:           taskB.id,
            taskAName:         taskA.name,
            taskBName:         taskB.name,
            // every_n_occurrences moved to the cadence-coupling feature; coerce legacy rows
            linkType:          (existing?.link_type === 'always_together' ? 'always_together' : 'conflict') as LinkType,
            occurrenceInterval: 2,
            primaryTaskId:     'a',
            defaultResolution: (existing?.default_resolution ?? 'ask') as ConflictResolution,
            defaultDelayDays:  existing?.default_delay_days ?? 7,
            delayTarget:       (existing?.delay_target      ?? 'b') as DelayTarget,
            adjustDirection:   (existing?.adjust_direction  ?? 'forward') as AdjustDirection,
            adjustSnapBack:    existing?.adjust_snap_back   ?? false,
            skipTarget:        (existing?.skip_target       ?? 'b') as SkipTarget,
            noConflictOrder:   (existing?.no_conflict_order ?? 'a_first') as NoConflictOrder,
            noConflictTimeA:   existing?.no_conflict_time_a ?? '',
            noConflictTimeB:   existing?.no_conflict_time_b ?? '',
            proximityEnabled:    existing?.proximity_enabled   ?? false,
            proximityDays:       existing?.proximity_days      ?? suggestedProximity ?? 14,
            proximityFirstTask:  (existing?.proximity_first_task ?? 'a') as 'a' | 'b',
            proximityResolution: (existing?.proximity_resolution ?? 'ask') as ProximityResolution,
            suggestedProximity,
          };
        }
      }

      setPairRules(rules);
      setLoading(false);
    }

    loadPairRules();
  }, [routineId]);

  function update(key: string, patch: Partial<PairRuleState>) {
    setPairRules(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  function toggleExpand(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleTiming(key: string) {
    setTimingKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function saveAllRules() {
    setSaveStatus('saving');
    setSaveError(null);

    const payload = Object.values(pairRules).map(rule => ({
      ...(rule.pairId ? { id: rule.pairId } : {}),
      routine_id:         rule.routineId,
      user_id:            userId,
      task_a_id:          rule.taskAId,
      task_b_id:          rule.taskBId,
      // Relationship type (every_n_occurrences moved to cadence coupling)
      link_type:          rule.linkType,
      // Overlap resolution (only relevant when link_type = 'conflict')
      default_resolution: rule.linkType === 'conflict' ? rule.defaultResolution : 'no_conflict',
      default_delay_days: rule.linkType === 'conflict' && rule.defaultResolution === 'auto_adjust' ? rule.defaultDelayDays   : null,
      delay_target:       rule.linkType === 'conflict' && rule.defaultResolution === 'auto_adjust' ? rule.delayTarget        : null,
      adjust_direction:   rule.linkType === 'conflict' && rule.defaultResolution === 'auto_adjust' ? rule.adjustDirection    : null,
      adjust_snap_back:   rule.linkType === 'conflict' && rule.defaultResolution === 'auto_adjust' ? rule.adjustSnapBack     : null,
      skip_target:        rule.linkType === 'conflict' && rule.defaultResolution === 'skip_one'    ? rule.skipTarget         : null,
      no_conflict_order:  rule.linkType === 'conflict' && rule.defaultResolution === 'no_conflict' ? rule.noConflictOrder    : null,
      no_conflict_time_a: rule.linkType === 'conflict' && rule.defaultResolution === 'no_conflict' && rule.noConflictTimeA ? rule.noConflictTimeA : null,
      no_conflict_time_b: rule.linkType === 'conflict' && rule.defaultResolution === 'no_conflict' && rule.noConflictTimeB ? rule.noConflictTimeB : null,
      // Proximity / timing
      proximity_enabled:    rule.linkType === 'conflict' ? rule.proximityEnabled : false,
      proximity_days:       rule.linkType === 'conflict' && rule.proximityEnabled ? rule.proximityDays       : null,
      proximity_first_task: rule.linkType === 'conflict' && rule.proximityEnabled ? rule.proximityFirstTask  : null,
      proximity_resolution: rule.linkType === 'conflict' && rule.proximityEnabled ? rule.proximityResolution : 'ask',
    }));

    const { data: savedPairs, error } = await supabase
      .from('routine_task_pairs')
      .upsert(payload, { onConflict: 'routine_id,task_a_id,task_b_id' })
      .select('id, default_resolution');

    if (error) {
      setSaveStatus('error');
      setSaveError(error.message);
      return;
    }

    if (savedPairs) {
      setPairRules(prev => {
        const next = { ...prev };
        for (const saved of savedPairs) {
          const entry = Object.entries(next).find(([, r]) => r.pairId === saved.id || r.pairId === null);
          if (entry) {
            const [k, r] = entry;
            if (r.pairId === null) next[k] = { ...r, pairId: saved.id };
          }
        }
        return next;
      });
    }

    // Resolve all pending same-day conflicts — rules saved, detection will regenerate
    await supabase
      .from('routine_conflicts')
      .update({ status: 'resolved', resolution: 'no_conflict', resolved_at: new Date().toISOString() })
      .eq('routine_id', routineId)
      .eq('status', 'pending');

    detectRoutineConflicts(routineId).catch(() => {});
    onRulesSaved?.();
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 3000);
  }

  const chipClass = (active: boolean) =>
    `flex-1 text-xs py-1.5 px-1.5 rounded-pill border transition-colors text-center ${
      active ? 'border-charcoal bg-charcoal text-cream font-medium' : 'border-glow-border text-warm-mid hover:border-warm-light'
    }`;

  if (loading) {
    return <p className="text-sm text-warm-light text-center py-4">Loading rules…</p>;
  }

  const keys = Object.keys(pairRules);
  if (keys.length === 0) {
    return (
      <p className="text-sm text-warm-light text-center py-4">
        Add at least 2 rituals to configure overlap rules.
      </p>
    );
  }

  const hasAnyTimingRule = keys.some(k => pairRules[k].proximityEnabled);
  const timingSubtitle = hasAnyTimingRule
    ? `${keys.filter(k => pairRules[k].proximityEnabled).length} rule${keys.filter(k => pairRules[k].proximityEnabled).length !== 1 ? 's' : ''} active`
    : 'No timing rules set';

  return (
    <div className="space-y-6">
      {/* ── Overlap resolution rules ─────────────────────────────────────── */}
      <div className="space-y-2">
        {keys.map(key => {
          const rule = pairRules[key];
          const isExpanded = expandedKeys.has(key);

          // Summary label for the collapsed row
          let summaryLabel: string;
          if (rule.linkType === 'always_together') summaryLabel = 'Always together';
          else if (rule.linkType === 'every_n_occurrences') summaryLabel = `Every ${rule.occurrenceInterval} occurrences`;
          else summaryLabel = RESOLUTION_OPTIONS.find(o => o.value === rule.defaultResolution)?.label ?? rule.defaultResolution;

          return (
            <div key={key} className="bg-stone border border-glow-border rounded-lg overflow-hidden">
              <button
                type="button"
                onClick={() => toggleExpand(key)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-taupe transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">
                    {rule.taskAName} <span className="text-warm-light font-normal">vs</span> {rule.taskBName}
                  </p>
                  <p className="text-xs text-warm-light mt-0.5">{summaryLabel}</p>
                </div>
                <span className="text-xs text-warm-light flex-shrink-0 ml-3">{isExpanded ? '▲' : '▼'}</span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-glow-border pt-3 space-y-4">

                  {/* ── Relationship type selector ── */}
                  <div>
                    <p className="text-xs text-warm-mid mb-2">Relationship type</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {([
                        { value: 'conflict',            label: 'Overlap rule' },
                        { value: 'always_together',     label: 'Always together' },
                      ] as { value: LinkType; label: string }[]).map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => update(key, { linkType: opt.value })}
                          className={`text-xs px-2.5 py-1.5 rounded-pill border transition-colors ${
                            rule.linkType === opt.value
                              ? 'border-charcoal bg-charcoal text-cream font-medium'
                              : 'border-glow-border text-warm-mid hover:border-warm-light'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Always Together description ── */}
                  {rule.linkType === 'always_together' && (
                    <div className="pl-3 border-l-2 border-glow-border">
                      <p className="text-xs text-warm-light">
                        <strong className="text-warm-mid">{rule.taskAName}</strong> and <strong className="text-warm-mid">{rule.taskBName}</strong> will always be scheduled on the same date. No overlap alerts will fire for this pair.
                      </p>
                    </div>
                  )}


                  {/* ── Overlap rule options (only when linkType = 'conflict') ── */}
                  {rule.linkType === 'conflict' && (
                    <div className="space-y-3">
                      <div className="flex gap-1.5 flex-wrap">
                        {RESOLUTION_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            type="button"
                            title={TOOLTIPS[opt.value]}
                            onClick={() => update(key, { defaultResolution: opt.value })}
                            className={`text-xs px-2.5 py-1.5 rounded-pill border transition-colors ${
                              rule.defaultResolution === opt.value
                                ? 'border-charcoal bg-charcoal text-cream font-medium'
                                : 'border-glow-border text-warm-mid hover:border-warm-light'
                            }`}
                          >
                            {opt.label}
                          </button>
                    ))}
                  </div>

                  {rule.defaultResolution === 'auto_adjust' && (
                    <div className="space-y-2.5 pl-3 border-l-2 border-glow-border">
                      <div>
                        <p className="text-xs text-warm-mid mb-1">Which ritual moves?</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => update(key, { delayTarget: 'a' })} className={chipClass(rule.delayTarget === 'a')}>{rule.taskAName}</button>
                          <button type="button" onClick={() => update(key, { delayTarget: 'b' })} className={chipClass(rule.delayTarget === 'b')}>{rule.taskBName}</button>
                        </div>
                      </div>
                      <div>
                        <p className="text-xs text-warm-mid mb-1">Direction</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => update(key, { adjustDirection: 'forward' })} className={chipClass(rule.adjustDirection === 'forward')}>Delay (later)</button>
                          <button type="button" onClick={() => update(key, { adjustDirection: 'back' })} className={chipClass(rule.adjustDirection === 'back')}>Advance (earlier)</button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-warm-mid">By</span>
                        <input type="number" min={1} max={90} value={rule.defaultDelayDays} onChange={e => update(key, { defaultDelayDays: Number(e.target.value) })} className="w-16 text-center" />
                        <span className="text-xs text-warm-mid">days</span>
                      </div>
                      <div>
                        <p className="text-xs text-warm-mid mb-1">After adjustment</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => update(key, { adjustSnapBack: false })} className={chipClass(!rule.adjustSnapBack)}>Continue from new date</button>
                          <button type="button" onClick={() => update(key, { adjustSnapBack: true })} className={chipClass(rule.adjustSnapBack)}>Snap back to original rhythm</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {rule.defaultResolution === 'skip_one' && (
                    <div className="pl-3 border-l-2 border-glow-border">
                      <p className="text-xs text-warm-mid mb-1">Which ritual skips?</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => update(key, { skipTarget: 'a' })} className={chipClass(rule.skipTarget === 'a')}>{rule.taskAName}</button>
                        <button type="button" onClick={() => update(key, { skipTarget: 'b' })} className={chipClass(rule.skipTarget === 'b')}>{rule.taskBName}</button>
                      </div>
                    </div>
                  )}

                  {rule.defaultResolution === 'no_conflict' && (
                    <div className="pl-3 border-l-2 border-glow-border space-y-2">
                      <p className="text-xs text-warm-light">Optional: set which ritual happens first and when.</p>
                      <div>
                        <p className="text-xs text-warm-mid mb-1">Order</p>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => update(key, { noConflictOrder: 'a_first' })} className={chipClass(rule.noConflictOrder === 'a_first')}>▲ {rule.taskAName} first</button>
                          <button type="button" onClick={() => update(key, { noConflictOrder: 'b_first' })} className={chipClass(rule.noConflictOrder === 'b_first')}>▲ {rule.taskBName} first</button>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <p className="text-xs text-warm-mid mb-1">{rule.taskAName} at</p>
                          <input type="time" value={rule.noConflictTimeA} onChange={e => update(key, { noConflictTimeA: e.target.value })} className="w-full" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-warm-mid mb-1">{rule.taskBName} at</p>
                          <input type="time" value={rule.noConflictTimeB} onChange={e => update(key, { noConflictTimeB: e.target.value })} className="w-full" />
                        </div>
                      </div>
                    </div>
                  )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Timing Rules section ─────────────────────────────────────────── */}
      <div className="border-t border-glow-border pt-4">
        <button
          type="button"
          onClick={() => setTimingExpanded(v => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <div>
            <p className="label-overline">Timing Rules</p>
            <p className="text-xs text-warm-light mt-0.5">
              {timingExpanded ? 'Set minimum spacing between rituals' : timingSubtitle}
            </p>
          </div>
          <span className="text-xs text-warm-light flex-shrink-0 ml-3">{timingExpanded ? '▲' : '▼'}</span>
        </button>

        {timingExpanded && (
          <div className="space-y-2 mt-3">
            {keys.map(key => {
              const rule = pairRules[key];
              const isOpen = timingKeys.has(key);

              return (
                <div key={key} className="bg-stone border border-glow-border rounded-lg overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleTiming(key)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-taupe transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm text-charcoal truncate">
                        {rule.taskAName} <span className="text-warm-light">→</span> {rule.taskBName}
                      </p>
                      {rule.proximityEnabled && (
                        <span className="text-xs text-warm-light flex-shrink-0">
                          {rule.proximityDays}d min
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-warm-light flex-shrink-0 ml-3">
                      {rule.proximityEnabled ? (isOpen ? '▲' : '▼') : (isOpen ? '▲' : 'Add timing rule +')}
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-glow-border pt-3 space-y-3">
                      {/* Enable toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.proximityEnabled}
                          onChange={e => update(key, { proximityEnabled: e.target.checked })}
                        />
                        <span className="text-xs text-warm-mid font-medium">Enable timing rule for this pair</span>
                      </label>

                      {rule.proximityEnabled && (
                        <div className="space-y-3 pl-3 border-l-2 border-glow-border">
                          {/* Direction and days */}
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => update(key, { proximityFirstTask: rule.proximityFirstTask === 'a' ? 'b' : 'a' })}
                                className="text-xs font-medium text-charcoal border border-glow-border rounded-pill px-2.5 py-1 hover:border-warm-light transition-colors"
                              >
                                {rule.proximityFirstTask === 'a' ? rule.taskAName : rule.taskBName} ▾
                              </button>
                              <span className="text-xs text-warm-mid">should come at least</span>
                              <input
                                type="number"
                                min={1}
                                value={rule.proximityDays}
                                onChange={e => update(key, { proximityDays: Number(e.target.value) })}
                                placeholder={rule.suggestedProximity ? String(rule.suggestedProximity) : '14'}
                                className="w-16 text-center"
                              />
                              <span className="text-xs text-warm-mid">days before</span>
                              <span className="text-xs font-medium text-charcoal">
                                {rule.proximityFirstTask === 'a' ? rule.taskBName : rule.taskAName}
                              </span>
                            </div>
                            {rule.suggestedProximity && (
                              <p className="text-xs text-warm-light">
                                {rule.taskAName} and {rule.taskBName} are typically spaced at least {rule.suggestedProximity} days apart.
                              </p>
                            )}
                          </div>

                          {/* Resolution when too close */}
                          <div>
                            <p className="text-xs text-warm-mid mb-1.5">If too close:</p>
                            <div className="flex gap-1.5 flex-wrap">
                              {PROXIMITY_OPTIONS.map(opt => (
                                <button
                                  key={opt.value}
                                  type="button"
                                  onClick={() => update(key, { proximityResolution: opt.value })}
                                  className={`text-xs px-2.5 py-1.5 rounded-pill border transition-colors ${
                                    rule.proximityResolution === opt.value
                                      ? 'border-charcoal bg-charcoal text-cream font-medium'
                                      : 'border-glow-border text-warm-mid hover:border-warm-light'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Remove button */}
                          <button
                            type="button"
                            onClick={() => update(key, { proximityEnabled: false })}
                            className="text-xs text-warm-light hover:text-charcoal"
                          >
                            Remove timing rule
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Save button ──────────────────────────────────────────────────── */}
      <div className="pt-2">
        <button
          onClick={saveAllRules}
          disabled={saveStatus === 'saving'}
          className="w-full bg-charcoal hover:bg-charcoal/90 text-cream text-sm font-medium rounded-pill py-3 transition-colors disabled:opacity-50"
        >
          {saveStatus === 'saving' ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Saving…
            </span>
          ) : 'Save All Rules'}
        </button>
        {saveStatus === 'saved' && (
          <p className="text-xs text-sage text-center mt-2">Rules saved.</p>
        )}
        {saveStatus === 'error' && saveError && (
          <p className="text-xs text-dust text-center mt-2">{saveError}</p>
        )}
      </div>
    </div>
  );
}
