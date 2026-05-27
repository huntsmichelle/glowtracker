'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { format, parseISO, differenceInDays, addDays } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  completeInstance,
  skipInstance,
  snoozeInstance,
  createEventOverride,
  deleteInstance,
  deleteTask,
  today,
  deriveStatus,
} from '@/lib/instanceEngine';
import type { InstanceWithTask, Task } from '@/types';
import { getCategoryColor } from '@/lib/categoryColors';
import { detectRoutineConflicts } from '@/lib/conflictDetection';
import { getTaskSuggestions, dismissSuggestion, type Suggestion } from '@/lib/suggestions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApproachingItem {
  due_date_start: string;
  task: { name: string; category: { name: string } | null } | null;
}

interface Props {
  instances: InstanceWithTask[];
  conflictCounts?: Record<string, number>;
  userId: string;
  displayName?: string | null;
  heatmapDates?: string[];
  completedCount?: number;
  skippedCount?: number;
  approaching?: ApproachingItem[];
}

type ViewMode = 'list' | 'calendar';

type SpendingEntry = {
  actual_completion_date: string;
  cost: number;
  task: { id: string; name: string; category: { name: string; color: string } | null } | null;
};

type PlannedEntry = {
  due_date_start: string;
  task: { id: string; name: string; default_cost: number | null; category: { name: string; color: string } | null } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine'];
function spellOut(n: number): string {
  return n >= 0 && n <= 9 ? ONES[n] : String(n);
}

function getEditorialGreeting(ritualCount: number): string {
  const hour = new Date().getHours();
  const words = ['zero','one','two','three','four','five','six','seven','eight','nine'];
  const countWord = ritualCount <= 9 ? words[ritualCount] : String(ritualCount);
  const ritualWord = ritualCount === 1 ? 'act' : 'acts';
  if (hour < 12) {
    return ritualCount === 0
      ? 'A quiet morning ahead.'
      : `A quiet morning, ${countWord} small ${ritualWord}.`;
  }
  if (hour < 17) {
    return ritualCount === 0
      ? 'In rhythm this afternoon.'
      : `Good afternoon, ${countWord} ${ritualCount === 1 ? 'ritual' : 'rituals'} today.`;
  }
  return ritualCount === 0
    ? 'Winding down — all tended to.'
    : `An evening to tend to things, ${countWord} ${ritualCount === 1 ? 'ritual' : 'rituals'} left.`;
}

function getDateOverline(): string {
  const d = new Date();
  const day  = d.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
  const date = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' }).toUpperCase();
  return `${day} · ${date}`;
}

function computeStreak(dates: string[]): number {
  if (!dates.length) return 0;
  const set = new Set(dates);
  const todayStr = format(today(), 'yyyy-MM-dd');
  let streak = 0;
  let cur = today();
  while (true) {
    const s = format(cur, 'yyyy-MM-dd');
    if (s === todayStr && !set.has(s)) { cur = new Date(cur.getTime() - 86400000); continue; }
    if (!set.has(s)) break;
    streak++;
    cur = new Date(cur.getTime() - 86400000);
  }
  return streak;
}

// ─── DashboardClient ──────────────────────────────────────────────────────────

export default function DashboardClient({
  instances: initial,
  conflictCounts = {},
  userId,
  displayName,
  heatmapDates = [],
  completedCount = 0,
  skippedCount = 0,
  approaching = [],
}: Props) {
  const [instances, setInstances] = useState(initial);

  // ── Suggestions ────────────────────────────────────────────────────────────
  const [conflicts, setConflicts]   = useState<Suggestion[]>([]);
  const [syncs, setSyncs]           = useState<Suggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    getTaskSuggestions(supabase, userId).then(result => {
      setConflicts(result.conflicts);
      setSyncs(result.syncs);
    });
  }, [userId]);

  async function handleDismiss(s: Suggestion) {
    const supabase = createClient();
    await dismissSuggestion(supabase, userId, s.taskA.id, s.taskB.id, s.relationshipType);
    if (s.relationshipType === 'conflict') {
      setConflicts(prev => prev.filter(x => !(x.taskA.id === s.taskA.id && x.taskB.id === s.taskB.id)));
    } else {
      setSyncs(prev => prev.filter(x => !(x.taskA.id === s.taskA.id && x.taskB.id === s.taskB.id)));
    }
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('dashboard-view') as ViewMode) ?? 'list';
    }
    return 'list';
  });

  function switchView(v: ViewMode) {
    setViewMode(v);
    localStorage.setItem('dashboard-view', v);
  }

  // ── Calendar state ─────────────────────────────────────────────────────────
  const now = today();
  const [calYear, setCalYear]   = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1);
  const [calInstances, setCalInstances] = useState<InstanceWithTask[]>(initial);
  const [calLoading, setCalLoading]     = useState(false);

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    setCalLoading(true);
    const supabase = createClient();
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const { data: scheduled } = await supabase
      .from('instances')
      .select('*, task:tasks(*, category:categories(*), routine:routines(id, name, color))')
      .gte('due_date_start', firstDay)
      .lte('due_date_start', lastDay)
      .not('status', 'in', '(completed,skipped)')
      .order('due_date_start', { ascending: true });

    const { data: completed } = await supabase
      .from('instances')
      .select('*, task:tasks(*, category:categories(*), routine:routines(id, name, color))')
      .eq('status', 'completed')
      .gte('actual_completion_date', firstDay)
      .lte('actual_completion_date', lastDay)
      .order('actual_completion_date', { ascending: true });

    const seen = new Set<string>();
    const merged = [...(scheduled ?? []), ...(completed ?? [])].filter(i => {
      if (seen.has(i.id)) return false;
      seen.add(i.id);
      return true;
    });

    setCalInstances(merged as InstanceWithTask[]);
    setCalLoading(false);
  }, []);

  useEffect(() => {
    if (viewMode === 'calendar') fetchCalendar(calYear, calMonth);
  }, [viewMode, calYear, calMonth, fetchCalendar]);

  function changeCalMonth(delta: number) {
    let m = calMonth + delta;
    let y = calYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    setCalMonth(m);
    setCalYear(y);
  }

  // ── Spending state ─────────────────────────────────────────────────────────
  const [spendingOpen, setSpendingOpen]     = useState(false);
  const [spendingData, setSpendingData]     = useState<SpendingEntry[] | null>(null);
  const [plannedData, setPlannedData]       = useState<PlannedEntry[] | null>(null);
  const [spendingLoading, setSpendingLoading] = useState(false);

  async function fetchSpending() {
    setSpendingLoading(true);
    const supabase = createClient();

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const { data: spent } = await supabase
      .from('instances')
      .select('actual_completion_date, cost, task:tasks(id, name, category:categories(name, color))')
      .eq('status', 'completed')
      .not('cost', 'is', null)
      .gte('actual_completion_date', format(cutoff, 'yyyy-MM-dd'))
      .order('actual_completion_date', { ascending: false });

    const { data: planned } = await supabase
      .from('instances')
      .select('due_date_start, task:tasks(id, name, default_cost, category:categories(name, color))')
      .neq('status', 'completed')
      .neq('status', 'skipped')
      .neq('status', 'snoozed')
      .gte('due_date_start', format(today(), 'yyyy-MM-dd'))
      .lte('due_date_start', format(addDays(today(), 182), 'yyyy-MM-dd'));

    setSpendingData((spent as unknown as SpendingEntry[]) ?? []);
    setPlannedData((planned as unknown as PlannedEntry[]) ?? []);
    setSpendingLoading(false);
  }

  useEffect(() => {
    if (spendingOpen && spendingData === null) fetchSpending();
  }, [spendingOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mutations ──────────────────────────────────────────────────────────────
  function removeInstance(id: string) {
    setInstances(prev => prev.filter(i => i.id !== id));
  }

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [completeModal, setCompleteModal]   = useState<{ instance: InstanceWithTask } | null>(null);
  const [snoozeModal, setSnoozeModal]       = useState<{ instance: InstanceWithTask } | null>(null);
  const [adjustModal, setAdjustModal]       = useState<{ instance: InstanceWithTask } | null>(null);
  const [deleteModal, setDeleteModal]       = useState<{ instance: InstanceWithTask } | null>(null);

  const [completionDateMode, setCompletionDateMode] = useState<'scheduled' | 'custom'>('scheduled');
  const [completionDate, setCompletionDate] = useState(format(today(), 'yyyy-MM-dd'));
  const [completionCost, setCompletionCost] = useState('');
  const [snoozeDays, setSnoozeDays]         = useState(3);
  const [loading, setLoading]               = useState<string | null>(null);

  const [eventName, setEventName]           = useState('');
  const [eventDate, setEventDate]           = useState('');
  const [daysBefore, setDaysBefore]         = useState(7);
  const [resumeNormal, setResumeNormal]     = useState(true);
  const [overrideNextDate, setOverrideNextDate] = useState('');

  function openCompleteModal(instance: InstanceWithTask) {
    setCompletionDateMode('scheduled');
    setCompletionDate(format(today(), 'yyyy-MM-dd'));
    setCompletionCost(instance.task?.default_cost != null ? String(instance.task.default_cost) : '');
    setCompleteModal({ instance });
  }

  function openAdjustModal(instance: InstanceWithTask) {
    setEventName(''); setEventDate(''); setDaysBefore(7); setResumeNormal(true); setOverrideNextDate('');
    setAdjustModal({ instance });
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleComplete(instance: InstanceWithTask) {
    setLoading(instance.id);
    const date = completionDateMode === 'scheduled'
      ? parseISO(instance.due_date_start)
      : new Date(completionDate + 'T00:00:00');
    const cost = completionCost !== '' ? Number(completionCost) : null;
    const { next } = await completeInstance(instance.id, instance.task as Task, date, cost);
    removeInstance(instance.id);
    if (next) {
      setInstances(prev =>
        [...prev, { ...next, task: instance.task } as InstanceWithTask]
          .sort((a, b) => a.due_date_start.localeCompare(b.due_date_start))
      );
    }
    const routineId = (instance.task as unknown as { routine?: { id: string } }).routine?.id;
    if (routineId) detectRoutineConflicts(routineId).catch(console.error);
    setCompleteModal(null);
    setLoading(null);
  }

  async function handleSkip(instance: InstanceWithTask) {
    setLoading(instance.id);
    const { next } = await skipInstance(instance.id, instance.task as Task);
    removeInstance(instance.id);
    if (next) {
      setInstances(prev =>
        [...prev, { ...next, task: instance.task } as InstanceWithTask]
          .sort((a, b) => a.due_date_start.localeCompare(b.due_date_start))
      );
    }
    const routineId = (instance.task as unknown as { routine?: { id: string } }).routine?.id;
    if (routineId) detectRoutineConflicts(routineId).catch(console.error);
    setLoading(null);
  }

  async function handleSnooze(instance: InstanceWithTask) {
    setLoading(instance.id);
    await snoozeInstance(instance.id, snoozeDays, instance.due_date_end);
    removeInstance(instance.id);
    setSnoozeModal(null);
    setLoading(null);
  }

  async function handleAdjustForEvent(instance: InstanceWithTask) {
    if (!eventName.trim() || !eventDate) return;
    setLoading(instance.id);
    const nextDate = !resumeNormal && overrideNextDate ? overrideNextDate : undefined;
    await createEventOverride(instance.id, eventName.trim(), eventDate, daysBefore, nextDate);
    removeInstance(instance.id);
    setAdjustModal(null);
    setLoading(null);
  }

  async function handleDeleteInstance(instance: InstanceWithTask) {
    setLoading(instance.id);
    await deleteInstance(instance.id, instance.task as Task);
    removeInstance(instance.id);
    setDeleteModal(null);
    setLoading(null);
  }

  async function handleDeleteTask(instance: InstanceWithTask) {
    setLoading(instance.id);
    await deleteTask(instance.task_id);
    setInstances(prev => prev.filter(i => i.task_id !== instance.task_id));
    setDeleteModal(null);
    setLoading(null);
  }

  // ── Grouping ───────────────────────────────────────────────────────────────
  const due      = instances.filter(i => deriveStatus(i) === 'due');
  const upcoming = instances.filter(i => deriveStatus(i) !== 'due');

  type RoutineInfo  = { id: string; name: string; color: string } | null;
  type CategoryInfo = { id: string; name: string; color: string } | null;

  function groupByRoutineAndCategory(items: InstanceWithTask[]) {
    type CatGroup   = { category: CategoryInfo; items: InstanceWithTask[] };
    type RoutineGrp = { routine: RoutineInfo; catMap: Map<string, CatGroup> };
    const routineMap = new Map<string, RoutineGrp>();

    for (const inst of items) {
      const r    = (inst.task as unknown as { routine?: RoutineInfo }).routine ?? null;
      const rKey = r?.id ?? '__none__';
      if (!routineMap.has(rKey)) routineMap.set(rKey, { routine: r, catMap: new Map() });

      const cat  = (inst.task?.category as CategoryInfo | undefined) ?? null;
      const cKey = cat?.id ?? '__no-cat__';
      const rGrp = routineMap.get(rKey)!;
      if (!rGrp.catMap.has(cKey)) rGrp.catMap.set(cKey, { category: cat, items: [] });
      rGrp.catMap.get(cKey)!.items.push(inst);
    }

    return [...routineMap.entries()]
      .sort(([ka, a], [kb, b]) => {
        if (ka === '__none__') return 1;
        if (kb === '__none__') return -1;
        return (a.routine?.name ?? '').localeCompare(b.routine?.name ?? '');
      })
      .map(([rKey, { routine, catMap }]) => ({
        key: rKey,
        routine,
        categories: [...catMap.entries()]
          .sort(([, a], [, b]) => {
            if (!a.category) return 1;
            if (!b.category) return -1;
            return a.category.name.localeCompare(b.category.name);
          })
          .map(([cKey, g]) => ({ key: cKey, ...g })),
      }));
  }

  function renderRoutineGroups(items: InstanceWithTask[]) {
    return groupByRoutineAndCategory(items).map(({ key: rKey, routine, categories }) => (
      <div key={rKey} className="space-y-4">
        {routine ? (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: routine.color }} />
            <Link href={`/routines/${routine.id}`} className="label-overline hover:text-charcoal">
              {routine.name}
            </Link>
            {conflictCounts[routine.id] > 0 && (
              <Link
                href={`/routines/${routine.id}`}
                className="text-[11px] font-medium rounded-pill px-2 py-0.5"
                style={{ backgroundColor: 'rgba(192,138,110,0.12)', border: '1px solid #c08a6e', color: '#2b2823' }}
              >
                {conflictCounts[routine.id]} overlap{conflictCounts[routine.id] !== 1 ? 's' : ''}
              </Link>
            )}
          </div>
        ) : (
          <p className="label-overline">Individual Rituals</p>
        )}
        <div className="space-y-4">
          {categories.map(({ key: cKey, category, items: catItems }) => (
            <div key={cKey}>
              <div className="flex items-center gap-1.5 mb-2 pl-3">
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: getCategoryColor(category?.name ?? '').dot }} />
                <span className="text-xs text-warm-light">{category?.name ?? 'Uncategorized'}</span>
              </div>
              <div className="space-y-3">
                {(() => {
                  const seen = new Set<string>();
                  const els: React.ReactNode[] = [];
                  for (const inst of catItems) {
                    if (seen.has(inst.id)) continue;
                    seen.add(inst.id);
                    const paired = catItems.find(
                      o => !seen.has(o.id) &&
                        o.task_id === inst.task_id &&
                        o.due_date_start === inst.due_date_start
                    );
                    if (paired) {
                      seen.add(paired.id);
                      const [slotA, slotB] = inst.slot === 'a' ? [inst, paired] : [paired, inst];
                      els.push(<TwiceDailyPairCard key={`${inst.id}-pair`} slotA={slotA} slotB={slotB} />);
                    } else {
                      els.push(<InstanceCard key={inst.id} instance={inst} />);
                    }
                  }
                  return els;
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>
    ));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUB-COMPONENTS
  // ─────────────────────────────────────────────────────────────────────────

  function ViewToggle() {
    return (
      <div className="flex rounded-md border border-glow-border overflow-hidden">
        {(['list', 'calendar'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`flex-1 text-xs font-medium py-1.5 px-3 transition-colors capitalize ${
              viewMode === v ? 'bg-charcoal text-cream' : 'bg-stone text-warm-mid hover:bg-taupe'
            }`}
          >
            {v === 'list' ? 'List' : 'Calendar'}
          </button>
        ))}
      </div>
    );
  }

  function InstanceCard({ instance }: { instance: InstanceWithTask }) {
    const status    = deriveStatus(instance);
    const daysUntil = differenceInDays(parseISO(instance.due_date_start), today());
    const isOverdue = differenceInDays(today(), parseISO(instance.due_date_end)) > 0;
    const categoryColor = getCategoryColor(instance.task?.category?.name ?? '').dot;
    const isCountdown   = instance.task?.mode === 'countdown';
    const dateLabel = `${format(parseISO(instance.due_date_start), 'MMM d')} – ${format(parseISO(instance.due_date_end), 'MMM d')}`;

    let urgencyLabel: string;
    if (isOverdue)           urgencyLabel = `Ready for refresh — ${differenceInDays(today(), parseISO(instance.due_date_end))}d past window`;
    else if (daysUntil <= 0) urgencyLabel = 'Window open now';
    else                     urgencyLabel = `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;

    const isLoading = loading === instance.id;

    return (
      <div className="bg-stone border border-glow-border rounded-lg shadow-card p-4 card-lift">
        <Link href={`/instances/${instance.id}`} className="block mb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} />
              <div className="min-w-0">
                <p className="font-medium text-charcoal text-sm truncate">{instance.task?.name}</p>
                <p className="text-xs text-warm-light mt-0.5">
                  {instance.task?.category?.name ?? ''}
                  {instance.time_of_day_label && <span className="ml-1">· {instance.time_of_day_label}</span>}
                  {isCountdown && instance.task?.target_label && (
                    <span className="ml-1 text-warm-mid">→ {instance.task.target_label}</span>
                  )}
                  {instance.is_event_override && instance.event_name && (
                    <span className="ml-1 text-dust">⏱ {instance.event_name}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-warm-mid">{dateLabel}</p>
              <p className={`text-xs font-medium mt-0.5 ${isOverdue ? 'text-dust' : status === 'due' ? 'text-sage' : 'text-warm-light'}`}>
                {urgencyLabel}
              </p>
              {instance.task?.default_cost != null && (
                <p className="text-xs text-warm-light mt-0.5">${instance.task.default_cost.toFixed(2)}</p>
              )}
            </div>
          </div>
        </Link>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); openCompleteModal(instance); }}
            disabled={isLoading}
            className="flex-1 min-w-[60px] min-h-[44px] bg-charcoal hover:bg-charcoal/90 text-cream text-xs font-medium rounded-md px-2 disabled:opacity-50"
          >
            Kept
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleSkip(instance); }}
            disabled={isLoading}
            className="flex-1 min-w-[50px] min-h-[44px] bg-taupe hover:bg-glow-border text-warm-mid text-xs font-medium rounded-md px-2 disabled:opacity-50"
          >
            Pass
          </button>
          <button
            onClick={e => { e.stopPropagation(); setSnoozeDays(3); setSnoozeModal({ instance }); }}
            disabled={isLoading}
            className="flex-1 min-w-[60px] min-h-[44px] bg-dust-lt hover:bg-dust/20 text-charcoal text-xs font-medium rounded-md px-2 disabled:opacity-50"
          >
            Defer
          </button>
          <button
            onClick={e => { e.stopPropagation(); openAdjustModal(instance); }}
            disabled={isLoading}
            className="flex-1 min-w-[100px] min-h-[44px] bg-taupe hover:bg-glow-border text-warm-mid text-xs font-medium rounded-md px-2 disabled:opacity-50"
          >
            Adjust for event
          </button>
          <button
            onClick={e => { e.stopPropagation(); setDeleteModal({ instance }); }}
            disabled={isLoading}
            className="flex-1 min-w-[60px] min-h-[44px] bg-dust-lt hover:bg-dust/20 text-warm-mid text-xs font-medium rounded-md px-2 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  function TwiceDailyPairCard({ slotA, slotB }: { slotA: InstanceWithTask; slotB: InstanceWithTask }) {
    const categoryColor = getCategoryColor(slotA.task?.category?.name ?? '').dot;
    const isLoading = loading === slotA.id || loading === slotB.id;

    return (
      <div className="bg-stone border border-glow-border rounded-lg shadow-card p-4 card-lift">
        <Link href={`/instances/${slotA.id}`} className="flex items-center gap-2.5 mb-3">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} />
          <p className="font-medium text-charcoal text-sm">{slotA.task?.name}</p>
        </Link>
        <div className="space-y-2">
          {([slotA, slotB] as InstanceWithTask[]).map(slot => (
            <div key={slot.id} className="pl-3 border-l-2 border-glow-border space-y-1.5">
              <p className="text-xs font-medium text-warm-mid">
                {slot.time_of_day_label ?? (slot.id === slotA.id ? 'First' : 'Second')}
              </p>
              <div className="flex gap-1.5">
                <button onClick={e => { e.stopPropagation(); openCompleteModal(slot); }} disabled={isLoading} className="flex-1 min-h-[36px] bg-charcoal text-cream text-xs font-medium rounded-md px-2 disabled:opacity-50 hover:bg-charcoal/90">Kept</button>
                <button onClick={e => { e.stopPropagation(); handleSkip(slot); }} disabled={isLoading} className="flex-1 min-h-[36px] bg-taupe text-warm-mid text-xs font-medium rounded-md px-2 disabled:opacity-50 hover:bg-glow-border">Pass</button>
                <button onClick={e => { e.stopPropagation(); setSnoozeDays(3); setSnoozeModal({ instance: slot }); }} disabled={isLoading} className="flex-1 min-h-[36px] bg-dust-lt text-charcoal text-xs font-medium rounded-md px-2 disabled:opacity-50 hover:bg-dust/20">Defer</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function ListView() {
    if (instances.length === 0) {
      return (
        <div className="text-center py-20">
          <div className="w-10 h-10 mx-auto mb-4 text-warm-light">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zM12 6v6l4 2" />
            </svg>
          </div>
          <h2 className="font-display text-2xl text-charcoal mb-2">All tended to.</h2>
          <p className="text-warm-mid text-sm mb-8">No rituals due today.</p>
          <Link href="/tasks/new" className="inline-block bg-charcoal text-cream text-sm font-medium rounded-pill px-6 py-3 hover:bg-charcoal/90">
            + Add Ritual
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-8">
        {due.length > 0 && (
          <section>
            <p className="label-overline mb-4" style={{ color: '#c08a6e' }}>Ready for Refresh</p>
            <div className="space-y-5">{renderRoutineGroups(due)}</div>
          </section>
        )}
        {upcoming.length > 0 && (
          <section>
            <p className="label-overline mb-4">On the Horizon</p>
            <div className="space-y-5">{renderRoutineGroups(upcoming)}</div>
          </section>
        )}
      </div>
    );
  }

  function CalendarView() {
    const daysInMonth   = new Date(calYear, calMonth, 0).getDate();
    const firstWeekday  = new Date(calYear, calMonth - 1, 1).getDay();
    const todayStr      = format(today(), 'yyyy-MM-dd');
    const monthLabel    = new Date(calYear, calMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    const byDate: Record<string, InstanceWithTask[]> = {};
    for (const inst of calInstances) {
      const d = inst.status === 'completed' && inst.actual_completion_date
        ? inst.actual_completion_date
        : inst.due_date_start;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(inst);
    }

    const cells: (number | null)[] = [
      ...Array(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <button onClick={() => changeCalMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-taupe text-warm-mid">←</button>
          <h2 className="text-sm font-medium text-charcoal">{monthLabel}</h2>
          <button onClick={() => changeCalMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-taupe text-warm-mid">→</button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-xs text-warm-light py-1">{d}</div>
          ))}
        </div>
        {calLoading ? (
          <div className="text-center py-8 text-sm text-warm-light">Loading…</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayInsts = byDate[dateStr] ?? [];
              const isToday  = dateStr === todayStr;

              return (
                <div key={i} className={`min-h-[64px] rounded-lg p-1 ${isToday ? 'bg-sage-lt border border-sage' : 'border border-glow-border'}`}>
                  <p className={`text-xs text-center mb-0.5 ${isToday ? 'font-bold text-charcoal' : 'text-warm-light'}`}>{day}</p>
                  <div className="space-y-0.5">
                    {dayInsts.slice(0, 3).map(inst => {
                      const isProjected = inst.is_projected;
                      const isCompleted = inst.status === 'completed';
                      return (
                        <Link key={inst.id} href={`/instances/${inst.id}`} onClick={e => e.stopPropagation()}>
                          <div
                            className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white ${isProjected ? 'opacity-35 border border-dashed border-white/50' : isCompleted ? 'opacity-60' : ''}`}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            style={{ backgroundColor: (inst.task as any)?.routine?.color ?? getCategoryColor(inst.task?.category?.name ?? '').dot }}
                          >
                            {isCompleted ? '✓ ' : ''}{inst.task?.name ?? '—'}{inst.time_of_day_label ? ` · ${inst.time_of_day_label}` : ''}
                          </div>
                        </Link>
                      );
                    })}
                    {dayInsts.length > 3 && (
                      <p className="text-[10px] text-warm-light text-center">+{dayInsts.length - 3}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function SpendingSection() {
    const thisMonthStr = format(today(), 'yyyy-MM');
    const entries      = spendingData ?? [];
    const planned      = plannedData ?? [];

    const thisMonthSpent = entries
      .filter(e => e.actual_completion_date.startsWith(thisMonthStr))
      .reduce((s, e) => s + e.cost, 0);

    function plannedForMonth(monthStr: string) {
      return planned
        .filter(p => p.due_date_start.startsWith(monthStr) && p.task?.default_cost != null)
        .reduce((s, p) => s + (p.task!.default_cost as number), 0);
    }
    const thisMonthPlanned = plannedForMonth(thisMonthStr);

    const barMonths: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i);
      barMonths.push(format(d, 'yyyy-MM'));
    }
    const barData = barMonths.map(m => {
      const isPast    = m < thisMonthStr;
      const isCurrent = m === thisMonthStr;
      const spent     = entries.filter(e => e.actual_completion_date.startsWith(m)).reduce((s, e) => s + e.cost, 0);
      const plan      = !isPast ? plannedForMonth(m) : 0;
      const [y, mo]   = m.split('-').map(Number);
      return { label: new Date(y, mo - 1, 1).toLocaleString('default', { month: 'short' }), spent, planned: plan, isPast, isCurrent, total: spent + plan };
    });
    const maxBar = Math.max(...barData.map(m => m.total), 1);

    const pastWithSpend = barData.filter(m => m.isPast && m.spent > 0);
    const monthlyAvg = pastWithSpend.length > 0
      ? pastWithSpend.reduce((s, m) => s + m.spent, 0) / pastWithSpend.length : 0;

    const catMap: Record<string, { name: string; color: string; spent: number; planned: number }> = {};
    for (const e of entries.filter(e => e.actual_completion_date.startsWith(thisMonthStr))) {
      const name = e.task?.category?.name ?? 'Other';
      if (!catMap[name]) catMap[name] = { name, color: getCategoryColor(name).dot, spent: 0, planned: 0 };
      catMap[name].spent += e.cost;
    }
    for (const p of planned.filter(p => p.due_date_start.startsWith(thisMonthStr) && p.task?.default_cost != null)) {
      const name = p.task?.category?.name ?? 'Other';
      if (!catMap[name]) catMap[name] = { name, color: getCategoryColor(name).dot, spent: 0, planned: 0 };
      catMap[name].planned += p.task!.default_cost as number;
    }
    const catList = Object.values(catMap).sort((a, b) => (b.spent + b.planned) - (a.spent + a.planned));
    const maxCat  = Math.max(...catList.map(c => c.spent + c.planned), 1);

    const taskMap: Record<string, { name: string; total: number }> = {};
    for (const e of entries) {
      const id = e.task?.id ?? 'unknown'; const name = e.task?.name ?? 'Unknown';
      if (!taskMap[id]) taskMap[id] = { name, total: 0 };
      taskMap[id].total += e.cost;
    }
    const top5 = Object.values(taskMap).sort((a, b) => b.total - a.total).slice(0, 5);

    const hasAnyData = entries.length > 0 || planned.length > 0;

    return (
      <div className="bg-stone border border-glow-border rounded-lg shadow-card overflow-hidden">
        <button
          onClick={() => setSpendingOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-taupe transition-colors"
        >
          <p className="label-overline">Spending</p>
          <span className="text-warm-light text-xs">{spendingOpen ? '▲' : '▼'}</span>
        </button>

        {spendingOpen && (
          <div className="px-5 pb-5 border-t border-glow-border space-y-5 pt-4">
            {spendingLoading ? (
              <p className="text-sm text-warm-light text-center py-4">Loading…</p>
            ) : !hasAnyData ? (
              <p className="text-sm text-warm-light text-center py-4">
                No cost data yet. Add a typical cost to your rituals, then log it when marking kept.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-taupe rounded-md p-4">
                    <p className="label-overline mb-1">This month</p>
                    <p className="font-display text-2xl text-charcoal">${thisMonthSpent.toFixed(2)}</p>
                    {thisMonthPlanned > 0 && <p className="text-xs text-warm-mid mt-0.5">+${thisMonthPlanned.toFixed(2)} planned</p>}
                  </div>
                  <div className="bg-taupe rounded-md p-4">
                    <p className="label-overline mb-1">Monthly avg</p>
                    <p className="font-display text-2xl text-charcoal">${monthlyAvg.toFixed(2)}</p>
                  </div>
                </div>

                {catList.length > 0 && (
                  <div>
                    <p className="label-overline mb-3">This month by category</p>
                    <div className="space-y-2">
                      {catList.map(cat => (
                        <div key={cat.name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-xs text-warm-mid w-20 truncate">{cat.name}</span>
                          <div className="flex-1 h-2 bg-taupe rounded-full overflow-hidden flex">
                            <div className="h-full rounded-l-full" style={{ width: `${(cat.spent / maxCat) * 100}%`, backgroundColor: cat.color }} />
                            <div className="h-full rounded-r-full opacity-30" style={{ width: `${(cat.planned / maxCat) * 100}%`, backgroundColor: cat.color }} />
                          </div>
                          <span className="text-xs text-warm-mid w-14 text-right">
                            ${cat.spent.toFixed(0)}{cat.planned > 0 && <span className="text-warm-light">+{cat.planned.toFixed(0)}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-warm-light mt-1.5">Solid = spent · Faded = planned</p>
                  </div>
                )}

                <div>
                  <p className="label-overline mb-3">Spent &amp; planned — 7 months</p>
                  <div className="flex items-end gap-1 h-20">
                    {barData.map(m => (
                      <div key={m.label} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-warm-light text-center leading-tight">{m.total > 0 ? `$${m.total.toFixed(0)}` : ''}</span>
                        <div className="w-full flex flex-col justify-end" style={{ height: '48px' }}>
                          {m.planned > 0 && <div className="w-full rounded-t" style={{ height: `${(m.planned / maxBar) * 48}px`, minHeight: '3px', backgroundColor: '#c08a6e', opacity: 0.25 }} />}
                          {m.spent > 0 && <div className="w-full" style={{ height: `${(m.spent / maxBar) * 48}px`, minHeight: '3px', backgroundColor: '#8ea394', opacity: m.isPast ? 0.5 : 1, borderRadius: m.planned > 0 ? '0' : '2px 2px 0 0' }} />}
                        </div>
                        <span className={`text-[9px] ${m.isCurrent ? 'font-bold text-charcoal' : 'text-warm-light'}`}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-warm-light"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: '#8ea394' }} /> Spent</span>
                    <span className="flex items-center gap-1 text-[10px] text-warm-light"><span className="w-2.5 h-2.5 rounded-sm inline-block opacity-40" style={{ backgroundColor: '#c08a6e' }} /> Planned</span>
                  </div>
                </div>

                {top5.length > 0 && (
                  <div>
                    <p className="label-overline mb-3">Top rituals by spend</p>
                    <div className="space-y-1.5">
                      {top5.map((t, i) => (
                        <div key={t.name} className="flex items-center justify-between">
                          <span className="text-xs text-warm-mid">{i + 1}. {t.name}</span>
                          <span className="text-xs font-medium text-charcoal">${t.total.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RIGHT PANEL — Rhythm + Shelf Restock
  // ─────────────────────────────────────────────────────────────────────────

  function RhythmCard() {
    const total  = completedCount + skippedCount;
    const keptPct = total > 0 ? Math.round((completedCount / total) * 100) : null;
    const streak  = computeStreak(heatmapDates);

    // 12-week heatmap: 84 cells, oldest at top-left
    const todayStr = format(today(), 'yyyy-MM-dd');
    const completedSet = new Set(heatmapDates);
    const cells: { date: string; has: boolean; isToday: boolean }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = format(new Date(Date.now() - i * 86400000), 'yyyy-MM-dd');
      cells.push({ date: d, has: completedSet.has(d), isToday: d === todayStr });
    }

    return (
      <div className="space-y-5">
        <p className="label-overline">Rhythm</p>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-stone border border-glow-border rounded-lg p-3 text-center">
            <p className="font-display text-xl text-charcoal">{keptPct != null ? `${keptPct}%` : '—'}</p>
            <p className="text-[10px] text-warm-light mt-0.5">kept</p>
          </div>
          <div className="bg-stone border border-glow-border rounded-lg p-3 text-center">
            <p className="font-display text-xl text-charcoal">{streak}</p>
            <p className="text-[10px] text-warm-light mt-0.5">day streak</p>
          </div>
          <div className="bg-stone border border-glow-border rounded-lg p-3 text-center">
            <p className="font-display text-xl text-charcoal">{due.length}</p>
            <p className="text-[10px] text-warm-light mt-0.5">refresh</p>
          </div>
        </div>

        {/* Heatmap: 12 weeks × 7 days */}
        <div>
          <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
            {Array.from({ length: 12 }, (_, week) => (
              <div key={week} className="flex flex-col gap-[3px]">
                {cells.slice(week * 7, week * 7 + 7).map((cell, d) => (
                  <div
                    key={d}
                    title={cell.date}
                    className="rounded-sm"
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      backgroundColor: cell.has
                        ? '#8ea394'
                        : cell.isToday
                          ? '#ede8db'
                          : '#cdc6b6',
                      opacity: cell.has ? 1 : 0.5,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-warm-light mt-1.5">12 weeks · today →</p>
        </div>

        {/* Approaching maintenance */}
        {approaching.length > 0 && (
          <div>
            <p className="label-overline mb-2">Coming up</p>
            <div className="space-y-1.5">
              {approaching.map((a, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-xs text-warm-mid truncate pr-2">{a.task?.name ?? '—'}</span>
                  <span className="text-[11px] text-warm-light flex-shrink-0">
                    {format(parseISO(a.due_date_start), 'MMM d')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MOBILE ATRIUM
  // ─────────────────────────────────────────────────────────────────────────

  function AtriumHeader() {
    const h = new Date().getHours();
    const period = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
    const firstName = displayName?.split(' ')[0] ?? null;
    const dueToday = instances.length;

    return (
      <div className="px-5 pt-6 pb-4">
        <p className="label-overline mb-1">{getDateOverline()}</p>
        <h1 className="font-display text-3xl text-charcoal leading-tight">
          Good {period}{firstName ? `, ${firstName}` : ''}.
        </h1>
        {dueToday > 0 ? (
          <p className="text-warm-mid text-sm mt-1">
            {spellOut(dueToday)} ritual{dueToday !== 1 ? 's' : ''} today.
          </p>
        ) : (
          <p className="text-warm-mid text-sm mt-1">All tended to.</p>
        )}
      </div>
    );
  }

  function AtriumCategoryGrid() {
    // Build category → instance counts
    const catMap: Record<string, { name: string; dueCount: number; overdueCount: number }> = {};
    for (const inst of instances) {
      const cat = inst.task?.category?.name ?? 'Uncategorized';
      if (!catMap[cat]) catMap[cat] = { name: cat, dueCount: 0, overdueCount: 0 };
      const status = deriveStatus(inst);
      if (status === 'due') catMap[cat].dueCount++;
      else catMap[cat].overdueCount++;
    }
    const cats = Object.values(catMap).sort((a, b) => (b.dueCount + b.overdueCount) - (a.dueCount + a.overdueCount));

    if (cats.length === 0) return null;

    return (
      <div className="px-5 py-4">
        <p className="label-overline mb-3">Categories</p>
        <div className="grid grid-cols-2 gap-3">
          {cats.map(cat => {
            const color = getCategoryColor(cat.name);
            return (
              <Link
                key={cat.name}
                href="/tasks"
                className="bg-stone border border-glow-border rounded-lg px-4 py-3 card-lift"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color.dot }} />
                  <div className="flex gap-1">
                    {cat.dueCount > 0 && (
                      <span className="text-[10px] font-medium bg-sage-lt text-charcoal rounded-pill px-1.5 py-0.5">
                        {cat.dueCount} today
                      </span>
                    )}
                    {cat.overdueCount > 0 && (
                      <span className="text-[10px] font-medium rounded-pill px-1.5 py-0.5"
                        style={{ backgroundColor: 'rgba(192,138,110,0.15)', color: '#2b2823' }}>
                        {cat.overdueCount} refresh
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm font-medium text-charcoal">{cat.name}</p>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  function AtriumStatsRow() {
    const total   = completedCount + skippedCount;
    const keptPct = total > 0 ? Math.round((completedCount / total) * 100) : null;
    const streak  = computeStreak(heatmapDates);

    return (
      <div className="px-5 py-2">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-stone border border-glow-border rounded-lg p-3 text-center">
            <p className="font-display text-xl text-charcoal">{keptPct != null ? `${keptPct}%` : '—'}</p>
            <p className="text-[10px] text-warm-light mt-0.5">kept (30d)</p>
          </div>
          <div className="bg-stone border border-glow-border rounded-lg p-3 text-center">
            <p className="font-display text-xl text-charcoal">{streak}</p>
            <p className="text-[10px] text-warm-light mt-0.5">day streak</p>
          </div>
          <div className="bg-stone border border-glow-border rounded-lg p-3 text-center">
            <p className="font-display text-xl text-charcoal">{due.length}</p>
            <p className="text-[10px] text-warm-light mt-0.5">refresh</p>
          </div>
        </div>
      </div>
    );
  }

  function AtriumHeatmap() {
    if (heatmapDates.length === 0) return null;
    const completedSet = new Set(heatmapDates);
    const todayStr = format(today(), 'yyyy-MM-dd');
    const cells: { date: string; has: boolean; isToday: boolean }[] = [];
    for (let i = 83; i >= 0; i--) {
      const d = format(new Date(Date.now() - i * 86400000), 'yyyy-MM-dd');
      cells.push({ date: d, has: completedSet.has(d), isToday: d === todayStr });
    }

    return (
      <div className="px-5 py-4">
        <p className="label-overline mb-3">Activity</p>
        <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}>
          {Array.from({ length: 12 }, (_, week) => (
            <div key={week} className="flex flex-col gap-[3px]">
              {cells.slice(week * 7, week * 7 + 7).map((cell, d) => (
                <div
                  key={d}
                  className="rounded-sm"
                  style={{ width: '100%', aspectRatio: '1', backgroundColor: cell.has ? '#8ea394' : '#cdc6b6', opacity: cell.has ? 1 : 0.45 }}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="text-[10px] text-warm-light mt-1.5">Past 12 weeks</p>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MODALS
  // ─────────────────────────────────────────────────────────────────────────

  function CompleteModal() {
    if (!completeModal) return null;
    const { instance } = completeModal;
    return (
      <Modal onClose={() => setCompleteModal(null)}>
        <p className="label-overline mb-4">Mark Kept</p>
        <p className="text-sm text-warm-mid mb-5">{instance.task?.name}</p>

        <p className="text-xs font-medium text-warm-mid uppercase tracking-wide mb-2">When did you do this?</p>
        <div className="flex gap-2 mb-4">
          <button type="button" onClick={() => setCompletionDateMode('scheduled')}
            className={`flex-1 rounded-md px-3 py-2.5 text-sm border text-left ${completionDateMode === 'scheduled' ? 'bg-charcoal border-charcoal text-cream' : 'bg-taupe border-glow-border text-charcoal hover:bg-stone'}`}>
            <span className="block font-medium">Scheduled date</span>
            <span className="block text-xs opacity-75 mt-0.5">{format(parseISO(instance.due_date_start), 'MMM d')}</span>
          </button>
          <button type="button" onClick={() => setCompletionDateMode('custom')}
            className={`flex-1 rounded-md px-3 py-2.5 text-sm border text-left ${completionDateMode === 'custom' ? 'bg-charcoal border-charcoal text-cream' : 'bg-taupe border-glow-border text-charcoal hover:bg-stone'}`}>
            <span className="block font-medium">Different date</span>
            <span className="block text-xs opacity-75 mt-0.5">Pick a date</span>
          </button>
        </div>

        {completionDateMode === 'custom' && (
          <input type="date" value={completionDate} max={format(today(), 'yyyy-MM-dd')}
            onChange={e => setCompletionDate(e.target.value)} className="w-full mb-4" />
        )}

        <label className="block text-xs font-medium text-warm-mid uppercase tracking-wide mb-1.5">Cost (optional)</label>
        <div className="relative mb-5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-light text-sm">$</span>
          <input type="number" min={0} step="0.01" value={completionCost}
            onChange={e => setCompletionCost(e.target.value)}
            placeholder={instance.task?.default_cost != null ? String(instance.task.default_cost) : '0.00'}
            className="w-full pl-7" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCompleteModal(null)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe">Cancel</button>
          <button onClick={() => handleComplete(instance)} disabled={loading === instance.id}
            className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50 hover:bg-charcoal/90">
            {loading === instance.id ? 'Saving…' : 'Mark Kept'}
          </button>
        </div>
      </Modal>
    );
  }

  function SnoozeModal() {
    if (!snoozeModal) return null;
    const { instance } = snoozeModal;
    return (
      <Modal onClose={() => setSnoozeModal(null)}>
        <p className="label-overline mb-4">Defer</p>
        <p className="text-sm text-warm-mid mb-4">{instance.task?.name}</p>
        <label className="block text-xs font-medium text-warm-mid uppercase tracking-wide mb-1.5">Days to defer forward</label>
        <input type="number" min={1} max={30} value={snoozeDays}
          onChange={e => setSnoozeDays(Number(e.target.value))} className="w-full mb-5" />
        <div className="flex gap-2">
          <button onClick={() => setSnoozeModal(null)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe">Cancel</button>
          <button onClick={() => handleSnooze(instance)} disabled={loading === instance.id}
            className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50 hover:bg-charcoal/90">
            {loading === instance.id ? 'Saving…' : 'Defer'}
          </button>
        </div>
      </Modal>
    );
  }

  function AdjustEventModal() {
    if (!adjustModal) return null;
    const { instance } = adjustModal;
    const adjustedPreview = eventDate && daysBefore > 0
      ? format(new Date(new Date(eventDate + 'T00:00:00').getTime() - daysBefore * 86400000), 'MMM d, yyyy')
      : null;

    return (
      <Modal onClose={() => setAdjustModal(null)}>
        <p className="label-overline mb-1">Adjust for event</p>
        <p className="text-sm text-warm-mid mb-4">{instance.task?.name}</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Event name *</label>
            <input type="text" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. Vacation to Italy" className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Event date *</label>
            <input type="date" value={eventDate} min={format(today(), 'yyyy-MM-dd')} onChange={e => setEventDate(e.target.value)} className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Days before event</label>
            <input type="number" min={1} max={90} value={daysBefore} onChange={e => setDaysBefore(Number(e.target.value))} className="w-full" />
          </div>
          {adjustedPreview && (
            <div className="bg-taupe border border-glow-border rounded-md p-3 text-xs text-warm-mid">
              Moves to <span className="font-medium text-charcoal">{adjustedPreview}</span>
              {eventName && ` — ${daysBefore}d before ${eventName}`}.
            </div>
          )}
          <div className="flex items-start gap-2">
            <input type="checkbox" id="resumeNormalModal" checked={resumeNormal}
              onChange={e => setResumeNormal(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-glow-border" />
            <label htmlFor="resumeNormalModal" className="text-sm text-charcoal">Resume normal cadence after event</label>
          </div>
          {!resumeNormal && (
            <div>
              <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Next instance date after event</label>
              <input type="date" value={overrideNextDate} min={eventDate || format(today(), 'yyyy-MM-dd')} onChange={e => setOverrideNextDate(e.target.value)} className="w-full" />
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={() => setAdjustModal(null)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2 hover:bg-taupe transition-colors">Cancel</button>
          <button onClick={() => handleAdjustForEvent(instance)} disabled={loading === instance.id || !eventName.trim() || !eventDate}
            className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2 disabled:opacity-50">
            {loading === instance.id ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </Modal>
    );
  }

  function DeleteModal() {
    if (!deleteModal) return null;
    const { instance } = deleteModal;
    const isDeleting = loading === instance.id;
    return (
      <Modal onClose={() => setDeleteModal(null)}>
        <p className="label-overline mb-1">Remove</p>
        <p className="text-sm text-warm-mid mb-4">
          What would you like to remove for{' '}
          <span className="font-medium text-charcoal">{instance.task?.name}</span>?
        </p>
        <div className="space-y-2 mb-3">
          <button onClick={() => handleDeleteInstance(instance)} disabled={isDeleting}
            className="w-full border border-glow-border text-left rounded-lg px-4 py-3 hover:bg-taupe transition-colors disabled:opacity-50">
            <span className="block text-sm font-semibold text-charcoal">Remove just this instance</span>
            <span className="block text-xs text-warm-light mt-0.5">The series will continue with the next scheduled instance.</span>
          </button>
          <button onClick={() => handleDeleteTask(instance)} disabled={isDeleting}
            className="w-full border border-dust bg-dust-lt text-left rounded-lg px-4 py-3 hover:bg-dust/20 transition-colors disabled:opacity-50">
            <span className="block text-sm font-semibold text-charcoal">Remove entire ritual and all instances</span>
            <span className="block text-xs text-warm-mid mt-0.5">This cannot be undone.</span>
          </button>
        </div>
        {isDeleting && <p className="text-xs text-center text-warm-light mb-3">Removing…</p>}
        <button onClick={() => setDeleteModal(null)} disabled={isDeleting}
          className="w-full border border-glow-border text-warm-mid text-sm rounded-pill py-2 hover:bg-taupe transition-colors disabled:opacity-50">
          Cancel
        </button>
      </Modal>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DESKTOP CARDS
  // ─────────────────────────────────────────────────────────────────────────

  function InSequenceList() {
    if (instances.length === 0) {
      const nextApproaching = approaching[0] ?? null;
      return (
        <div className="flex flex-col items-center justify-center h-full py-12 px-5 gap-3 text-center">
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>
            All tended to.
          </p>
          <div style={{ width: '40px', height: '1px', backgroundColor: '#cdc6b6' }} />
          {nextApproaching ? (
            <p style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297' }}>
              Next: {nextApproaching.task?.name ?? '—'} · {format(parseISO(nextApproaching.due_date_start), 'MMM d')}
            </p>
          ) : (
            <p style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297' }}>
              Nothing due today.
            </p>
          )}
        </div>
      );
    }

    return (
      <div>
        {instances.map((instance, i) => {
          const isNow = i === 0;
          const isOverdue = differenceInDays(today(), parseISO(instance.due_date_end)) > 0;
          const isLoadingThis = loading === instance.id;
          const dateLabel = format(parseISO(instance.due_date_start), 'MMM d');

          async function instantKeep() {
            setLoading(instance.id);
            const { next } = await completeInstance(instance.id, instance.task as Task, today(), null);
            removeInstance(instance.id);
            if (next) {
              setInstances(prev =>
                [...prev, { ...next, task: instance.task } as InstanceWithTask]
                  .sort((a, b) => a.due_date_start.localeCompare(b.due_date_start))
              );
            }
            const routineId = (instance.task as unknown as { routine?: { id: string } }).routine?.id;
            if (routineId) detectRoutineConflicts(routineId).catch(console.error);
            setLoading(null);
          }

          async function instantPass() {
            setLoading(instance.id);
            const { next } = await skipInstance(instance.id, instance.task as Task);
            removeInstance(instance.id);
            if (next) {
              setInstances(prev =>
                [...prev, { ...next, task: instance.task } as InstanceWithTask]
                  .sort((a, b) => a.due_date_start.localeCompare(b.due_date_start))
              );
            }
            const routineId = (instance.task as unknown as { routine?: { id: string } }).routine?.id;
            if (routineId) detectRoutineConflicts(routineId).catch(console.error);
            setLoading(null);
          }

          return (
            <div
              key={instance.id}
              className={`flex items-center gap-3 px-5 py-3 border-b border-glow-border last:border-b-0 ${isNow ? 'bg-cream/40' : ''}`}
            >
              {/* Date / NOW */}
              <div className="w-[52px] flex-shrink-0 flex justify-center">
                {isNow ? (
                  <span
                    className="text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full"
                    style={{ background: '#2b2823', color: '#efe9dd' }}
                  >
                    NOW
                  </span>
                ) : (
                  <span className={`text-[11px] font-mono ${isOverdue ? 'text-dust font-medium' : 'text-warm-light'}`}>
                    {dateLabel}
                  </span>
                )}
              </div>

              {/* Name + meta */}
              <Link href={`/instances/${instance.id}`} className="flex-1 min-w-0 block">
                <p className="text-sm font-medium text-charcoal truncate">{instance.task?.name}</p>
                <p className="text-[11px] text-warm-light mt-0.5 truncate">
                  {instance.task?.category?.name ?? ''}
                  {isOverdue && <span className="text-dust ml-1">· ready</span>}
                </p>
              </Link>

              {/* ✓ keep + ✕ pass */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <button
                  onClick={instantKeep}
                  disabled={isLoadingThis}
                  title="Mark kept"
                  style={{
                    width: '28px', height: '28px', borderRadius: '50%',
                    border: '1.5px solid #cdc6b6', backgroundColor: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#a8a297', transition: 'all 0.15s ease',
                    fontSize: '13px', opacity: isLoadingThis ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!isLoadingThis) { e.currentTarget.style.borderColor = '#8ea394'; e.currentTarget.style.color = '#8ea394'; } }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#cdc6b6'; e.currentTarget.style.color = '#a8a297'; }}
                >
                  {isLoadingThis ? '…' : '✓'}
                </button>
                <button
                  onClick={instantPass}
                  disabled={isLoadingThis}
                  title="Pass"
                  style={{
                    width: '20px', height: '20px', borderRadius: '50%',
                    border: 'none', backgroundColor: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', color: '#cdc6b6', fontSize: '14px',
                    transition: 'color 0.15s ease', opacity: isLoadingThis ? 0.4 : 1,
                  }}
                  onMouseEnter={e => { if (!isLoadingThis) e.currentTarget.style.color = '#a8a297'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#cdc6b6'; }}
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function RhythmCalendarCard() {
    const now = today();
    const year = now.getFullYear();
    const month = now.getMonth();
    const monthLabel = now.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const rawFirstDay = new Date(year, month, 1).getDay();
    const firstMondayOffset = (rawFirstDay + 6) % 7;

    const completedSet = new Set(heatmapDates);
    const todayStr = format(now, 'yyyy-MM-dd');

    const cells: (number | null)[] = [
      ...Array(firstMondayOffset).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];

    const total = completedCount + skippedCount;
    const keptPct = total > 0 ? Math.round((completedCount / total) * 100) : null;
    const streak = computeStreak(heatmapDates);

    return (
      <div className="space-y-4">
        {/* Full month calendar */}
        <div>
          <p style={{ fontSize: '12px', color: '#6b665e', marginBottom: '12px' }}>{monthLabel}</p>
          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, idx) => (
              <div key={idx} style={{ textAlign: 'center', fontSize: '10px', color: '#a8a297', paddingBottom: '2px' }}>{d}</div>
            ))}
          </div>
          {/* Calendar grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {cells.map((day, idx) => {
              if (!day) return <div key={idx} style={{ aspectRatio: '1' }} />;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isCompleted = completedSet.has(dateStr);
              const isToday = dateStr === todayStr;
              const isFuture = dateStr > todayStr;

              let bg = '#e8e2d5';
              let color = '#6b665e';
              let fontWeight: number | string = 400;

              if (isCompleted) { bg = '#2b2823'; color = '#f6f1e6'; }
              else if (isToday) { bg = '#8ea394'; color = '#f6f1e6'; fontWeight = 500; }
              else if (isFuture) { bg = '#ede8df'; color = '#a8a297'; }

              return (
                <div
                  key={idx}
                  title={dateStr}
                  style={{
                    aspectRatio: '1',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: bg,
                  }}
                >
                  <span style={{ fontSize: '13px', color, fontWeight, lineHeight: 1 }}>{day}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stats — three-box grid */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-glow-border">
          <div className="text-center">
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '22px', color: '#2b2823', fontWeight: 400, lineHeight: 1 }}>
              {keptPct != null ? `${keptPct}%` : '—'}
            </p>
            <p style={{ fontSize: '10px', color: '#a8a297', marginTop: '3px', letterSpacing: '0.06em' }}>kept</p>
          </div>
          <div className="text-center">
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '22px', color: '#2b2823', fontWeight: 400, lineHeight: 1 }}>
              {streak}
            </p>
            <p style={{ fontSize: '10px', color: '#a8a297', marginTop: '3px', letterSpacing: '0.06em' }}>day streak</p>
          </div>
          <div className="text-center">
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '22px', color: '#c08a6e', fontWeight: 400, lineHeight: 1 }}>
              {due.length}
            </p>
            <p style={{ fontSize: '10px', color: '#a8a297', marginTop: '3px', letterSpacing: '0.06em' }}>refresh</p>
          </div>
        </div>

        {/* Approaching */}
        {approaching.length > 0 && (
          <div className="pt-4 border-t border-glow-border">
            <p className="label-overline mb-2">Coming up</p>
            <div className="space-y-1.5">
              {approaching.map((a, i) => {
                const daysUntil = differenceInDays(parseISO(a.due_date_start), today());
                const when = daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;
                return (
                  <p key={i} className="text-xs text-warm-mid leading-snug">
                    <span className="font-medium text-charcoal">{a.task?.name ?? '—'}</span>{' '}{when}.
                  </p>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function DesktopSpendingPanel() {
    const thisMonthStr = format(today(), 'yyyy-MM');
    const entries = spendingData ?? [];
    const planned = plannedData ?? [];

    if (spendingLoading) {
      return <p className="text-sm text-warm-light text-center py-8">Loading…</p>;
    }

    const hasAnyData = entries.length > 0 || planned.length > 0;
    if (!hasAnyData) {
      return (
        <p className="text-sm text-warm-light text-center py-8">
          No cost data yet. Add a typical cost to your rituals, then log it when marking kept.
        </p>
      );
    }

    const thisMonthSpent = entries
      .filter(e => e.actual_completion_date.startsWith(thisMonthStr))
      .reduce((s, e) => s + e.cost, 0);

    function plannedForMonth(m: string) {
      return planned
        .filter(p => p.due_date_start.startsWith(m) && p.task?.default_cost != null)
        .reduce((s, p) => s + (p.task!.default_cost as number), 0);
    }
    const thisMonthPlanned = plannedForMonth(thisMonthStr);

    const pastMonthSpend: Record<string, number> = {};
    for (const e of entries) {
      const m = e.actual_completion_date.slice(0, 7);
      if (m < thisMonthStr) pastMonthSpend[m] = (pastMonthSpend[m] ?? 0) + e.cost;
    }
    const pastVals = Object.values(pastMonthSpend);
    const monthlyAvg = pastVals.length > 0 ? pastVals.reduce((s, v) => s + v, 0) / pastVals.length : 0;

    const catMap: Record<string, { name: string; color: string; spent: number; planned: number }> = {};
    for (const e of entries.filter(e => e.actual_completion_date.startsWith(thisMonthStr))) {
      const name = e.task?.category?.name ?? 'Other';
      if (!catMap[name]) catMap[name] = { name, color: getCategoryColor(name).dot, spent: 0, planned: 0 };
      catMap[name].spent += e.cost;
    }
    for (const p of planned.filter(p => p.due_date_start.startsWith(thisMonthStr) && p.task?.default_cost != null)) {
      const name = p.task?.category?.name ?? 'Other';
      if (!catMap[name]) catMap[name] = { name, color: getCategoryColor(name).dot, spent: 0, planned: 0 };
      catMap[name].planned += p.task!.default_cost as number;
    }
    const catList = Object.values(catMap).sort((a, b) => (b.spent + b.planned) - (a.spent + a.planned));
    const maxCat = Math.max(...catList.map(c => c.spent + c.planned), 1);

    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-taupe rounded-md p-4">
            <p className="label-overline mb-1">Spent</p>
            <p className="font-display text-2xl text-charcoal">${thisMonthSpent.toFixed(2)}</p>
            {thisMonthPlanned > 0 && <p className="text-xs text-warm-mid mt-0.5">+${thisMonthPlanned.toFixed(2)} planned</p>}
          </div>
          <div className="bg-taupe rounded-md p-4">
            <p className="label-overline mb-1">Monthly avg</p>
            <p className="font-display text-2xl text-charcoal">${monthlyAvg.toFixed(2)}</p>
          </div>
        </div>
        {catList.length > 0 && (
          <div>
            <p className="label-overline mb-3">By category</p>
            <div className="space-y-2">
              {catList.map(cat => (
                <div key={cat.name} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                  <span className="text-xs text-warm-mid w-24 truncate">{cat.name}</span>
                  <div className="flex-1 h-1.5 bg-taupe rounded-full overflow-hidden flex">
                    <div className="h-full" style={{ width: `${(cat.spent / maxCat) * 100}%`, backgroundColor: cat.color }} />
                    <div className="h-full opacity-30" style={{ width: `${(cat.planned / maxCat) * 100}%`, backgroundColor: cat.color }} />
                  </div>
                  <span className="text-xs text-warm-mid w-14 text-right">${cat.spent.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ROOT RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const greeting = getEditorialGreeting(instances.length);
  const dateOverline = getDateOverline();
  const totalConflicts = Object.values(conflictCounts).reduce((s, n) => s + n, 0);

  return (
    <>
      {/* ── Desktop: header + three equal cards ──────────────────────────── */}
      <div className="hidden lg:flex flex-col h-screen">

        {/* Page header */}
        <header className="flex-shrink-0 px-8 pt-7 pb-5 border-b border-glow-border">
          <p className="label-overline mb-1.5">{dateOverline}</p>
          <h1 className="font-display text-3xl text-charcoal leading-tight">{greeting}</h1>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-warm-mid text-sm">
              {spellOut(instances.length)} ritual{instances.length !== 1 ? 's' : ''} today
            </p>
            {totalConflicts > 0 && (
              <span
                className="text-[11px] font-medium rounded-pill px-2.5 py-0.5"
                style={{ backgroundColor: 'rgba(192,138,110,0.12)', border: '1px solid #c08a6e', color: '#2b2823' }}
              >
                {totalConflicts} overlap{totalConflicts !== 1 ? 's' : ''}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => { setSpendingOpen(o => !o); if (spendingData === null) fetchSpending(); }}
                className="text-sm border border-glow-border text-warm-mid rounded-pill px-4 py-1.5 hover:bg-taupe transition-colors"
              >
                This month
              </button>
              <Link href="/tasks/new" className="text-sm bg-charcoal text-cream font-medium rounded-pill px-4 py-1.5 hover:bg-charcoal/90">
                + Log a ritual
              </Link>
            </div>
          </div>
        </header>

        {/* Three equal cards */}
        <div className="flex-1 min-h-0 flex gap-5 px-8 py-6">

          {/* Card: In sequence */}
          <div
            className="flex-1 min-w-0 flex flex-col bg-stone border border-glow-border rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(43,40,35,0.06)' }}
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-glow-border">
              <p className="label-overline">In sequence</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {InSequenceList()}
            </div>
          </div>

          {/* Card: Rhythm */}
          <div
            className="flex-1 min-w-0 flex flex-col bg-stone border border-glow-border rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(43,40,35,0.06)' }}
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-glow-border">
              <p className="label-overline">Rhythm</p>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {RhythmCalendarCard()}
            </div>
          </div>

          {/* Card: Shelf */}
          <div
            className="flex-1 min-w-0 flex flex-col bg-stone border border-glow-border rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(43,40,35,0.06)' }}
          >
            <div className="flex-shrink-0 px-5 pt-5 pb-3 border-b border-glow-border flex items-center justify-between">
              <p className="label-overline">Shelf</p>
              <Link href="/tasks" className="text-[11px] text-warm-light hover:text-charcoal transition-colors">
                See all →
              </Link>
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', padding: '24px', textAlign: 'center' }}>
                <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '20px', color: '#2b2823' }}>
                  Product tracking coming soon.
                </p>
                <div style={{ width: '40px', height: '1px', backgroundColor: '#cdc6b6' }} />
                <p style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297' }}>
                  Your shelf will live here
                </p>
              </div>
            </div>
          </div>

        </div>

        {/* "This month" spending overlay */}
        {spendingOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-24"
            style={{ background: 'rgba(44,42,38,0.35)', backdropFilter: 'blur(4px)' }}
            onClick={() => setSpendingOpen(false)}
          >
            <div
              className="bg-[#FFFFFF] rounded-xl w-full max-w-lg mx-8 border border-glow-border max-h-[65vh] overflow-y-auto"
              style={{ boxShadow: 'var(--shadow-modal)' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-glow-border">
                <p className="label-overline">This month</p>
                <button
                  onClick={() => setSpendingOpen(false)}
                  className="text-warm-light hover:text-charcoal transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-5">
                {DesktopSpendingPanel()}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile: Atrium layout ─────────────────────────────────────────── */}
      <div className="lg:hidden">
        {AtriumHeader()}
        {AtriumCategoryGrid()}
        {AtriumStatsRow()}
        {AtriumHeatmap()}

        {/* Today instance list below Atrium */}
        <div className="px-5 pt-4 pb-8 space-y-8">
          {/* Suggestions (collapsed) */}
          {(conflicts.length > 0 || syncs.length > 0) && (
            <div className="bg-stone border border-glow-border rounded-lg shadow-card overflow-hidden">
              <button onClick={() => setSuggestionsOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-taupe transition-colors">
                <div className="flex items-center gap-2">
                  <p className="label-overline">Suggestions</p>
                  <span className="text-xs font-medium bg-dust-lt text-charcoal rounded-pill px-2 py-0.5">{conflicts.length + syncs.length}</span>
                </div>
                <span className="text-warm-light text-xs">{suggestionsOpen ? '▲' : '▼'}</span>
              </button>
              {suggestionsOpen && (
                <div className="px-5 pb-5 border-t border-glow-border pt-4 space-y-4">
                  {[...conflicts, ...syncs].map(s => (
                    <div key={`${s.taskA.id}__${s.taskB.id}`} className="border-l-[3px] border-glow-border pl-4 py-1 space-y-1">
                      <p className="text-sm text-charcoal">{s.taskA.name} + {s.taskB.name}</p>
                      <button onClick={() => handleDismiss(s)} className="text-xs text-warm-light hover:text-charcoal">Dismiss</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* View toggle */}
          <div className="flex items-center justify-between">
            <p className="label-overline">Today</p>
            <div className="flex items-center gap-2">
              {ViewToggle()}
              <Link href="/tasks/new" className="text-sm bg-charcoal text-cream font-medium rounded-pill px-3 py-1.5 hover:bg-charcoal/90">+ Add</Link>
            </div>
          </div>

          {viewMode === 'list' ? ListView() : CalendarView()}
        </div>
      </div>

      {/* Modals (shared) */}
      {CompleteModal()}
      {SnoozeModal()}
      {AdjustEventModal()}
      {DeleteModal()}
    </>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-4"
      style={{ background: 'rgba(44,42,38,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#FFFFFF] rounded-lg w-full max-w-sm p-6 border border-glow-border"
        style={{ boxShadow: 'var(--shadow-modal)' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
