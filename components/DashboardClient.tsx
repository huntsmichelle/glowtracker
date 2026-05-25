'use client';

import { useState, useEffect, useCallback } from 'react';
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

interface Props {
  instances: InstanceWithTask[];
  conflictCounts?: Record<string, number>;
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

// ─── DashboardClient ──────────────────────────────────────────────────────────

export default function DashboardClient({ instances: initial, conflictCounts = {} }: Props) {
  const [instances, setInstances] = useState(initial);

  // ── View mode (list / calendar) ────────────────────────────────────────────
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
  const [calMonth, setCalMonth] = useState(now.getMonth() + 1); // 1-indexed
  const [calInstances, setCalInstances] = useState<InstanceWithTask[]>(initial);
  const [calLoading, setCalLoading]     = useState(false);

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    setCalLoading(true);
    const supabase = createClient();
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const { data } = await supabase
      .from('instances')
      .select('*, task:tasks(*, category:categories(*), routine:routines(id, name, color))')
      .gte('due_date_start', firstDay)
      .lte('due_date_start', lastDay)
      .neq('status', 'skipped')
      .order('due_date_start', { ascending: true });
    setCalInstances((data as InstanceWithTask[]) ?? []);
    setCalLoading(false);
  }, []);

  useEffect(() => {
    if (viewMode === 'calendar') {
      fetchCalendar(calYear, calMonth);
    }
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

    // Spent: completed instances with a logged cost (past 6 months)
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    const { data: spent } = await supabase
      .from('instances')
      .select('actual_completion_date, cost, task:tasks(id, name, category:categories(name, color))')
      .eq('status', 'completed')
      .not('cost', 'is', null)
      .gte('actual_completion_date', format(cutoff, 'yyyy-MM-dd'))
      .order('actual_completion_date', { ascending: false });

    // Planned: upcoming + projected instances with a task default_cost (next 6 months)
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

  // ── Instance list mutations ────────────────────────────────────────────────
  function removeInstance(id: string) {
    setInstances(prev => prev.filter(i => i.id !== id));
  }

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [completeModal, setCompleteModal]           = useState<{ instance: InstanceWithTask } | null>(null);
  const [snoozeModal, setSnoozeModal]               = useState<{ instance: InstanceWithTask } | null>(null);
  const [adjustModal, setAdjustModal]               = useState<{ instance: InstanceWithTask } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ instance: InstanceWithTask } | null>(null);

  const [completionDateMode, setCompletionDateMode] = useState<'scheduled' | 'custom'>('scheduled');
  const [completionDate, setCompletionDate] = useState(format(today(), 'yyyy-MM-dd'));
  const [completionCost, setCompletionCost] = useState('');
  const [snoozeDays, setSnoozeDays]         = useState(3);
  const [loading, setLoading]               = useState<string | null>(null);

  // Event override modal state
  const [eventName, setEventName]         = useState('');
  const [eventDate, setEventDate]         = useState('');
  const [daysBefore, setDaysBefore]       = useState(7);
  const [resumeNormal, setResumeNormal]   = useState(true);
  const [overrideNextDate, setOverrideNextDate] = useState('');

  function openCompleteModal(instance: InstanceWithTask) {
    setCompletionDateMode('scheduled');
    setCompletionDate(format(today(), 'yyyy-MM-dd'));
    setCompletionCost(instance.task?.default_cost != null ? String(instance.task.default_cost) : '');
    setCompleteModal({ instance });
  }

  function openAdjustModal(instance: InstanceWithTask) {
    setEventName('');
    setEventDate('');
    setDaysBefore(7);
    setResumeNormal(true);
    setOverrideNextDate('');
    setAdjustModal({ instance });
  }

  // ── Action handlers ────────────────────────────────────────────────────────

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

  type RoutineInfo = { id: string; name: string; color: string } | null;

  function groupByRoutine(items: InstanceWithTask[]) {
    const map = new Map<string, { routine: RoutineInfo; items: InstanceWithTask[] }>();
    for (const inst of items) {
      const r = (inst.task as unknown as { routine?: RoutineInfo }).routine ?? null;
      const key = r?.id ?? '__none__';
      if (!map.has(key)) map.set(key, { routine: r, items: [] });
      map.get(key)!.items.push(inst);
    }
    return [...map.entries()].sort(([ka, a], [kb, b]) => {
      if (ka === '__none__') return 1;
      if (kb === '__none__') return -1;
      return (a.routine?.name ?? '').localeCompare(b.routine?.name ?? '');
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUB-RENDERS (called as functions — avoids React remount on each render)
  // ─────────────────────────────────────────────────────────────────────────

  function ViewToggle() {
    return (
      <div className="flex rounded-lg border border-gray-200 overflow-hidden">
        {(['list', 'calendar'] as ViewMode[]).map(v => (
          <button
            key={v}
            onClick={() => switchView(v)}
            className={`flex-1 text-xs font-medium py-1.5 transition-colors capitalize ${
              viewMode === v ? 'bg-pink-500 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
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
    const categoryColor = instance.task?.category?.color ?? '#6B7280';
    const isCountdown   = instance.task?.mode === 'countdown';
    const dateLabel = `${format(parseISO(instance.due_date_start), 'MMM d')} – ${format(parseISO(instance.due_date_end), 'MMM d')}`;

    let urgencyLabel: string;
    if (isOverdue)          urgencyLabel = `Overdue by ${differenceInDays(today(), parseISO(instance.due_date_end))}d`;
    else if (daysUntil <= 0) urgencyLabel = 'Due now';
    else                     urgencyLabel = `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;

    const isLoading = loading === instance.id;

    return (
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-pink-200 transition-colors">
        <Link href={`/instances/${instance.id}`} className="block mb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} />
              <div className="min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">{instance.task?.name}</p>
                <p className="text-xs text-gray-400">
                  {instance.task?.category?.name ?? ''}
                  {isCountdown && instance.task?.target_label && (
                    <span className="ml-1 text-purple-400">→ {instance.task.target_label}</span>
                  )}
                  {instance.is_event_override && instance.event_name && (
                    <span className="ml-1 text-amber-500">⏱ {instance.event_name}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-xs text-gray-500">{dateLabel}</p>
              <p className={`text-xs font-medium ${isOverdue ? 'text-red-500' : status === 'due' ? 'text-amber-500' : 'text-gray-400'}`}>
                {urgencyLabel}
              </p>
              {instance.task?.default_cost != null && (
                <p className="text-xs text-gray-300">${instance.task.default_cost.toFixed(2)}</p>
              )}
            </div>
          </div>
        </Link>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={e => { e.stopPropagation(); openCompleteModal(instance); }}
            disabled={isLoading}
            className="flex-1 min-w-[60px] min-h-[44px] bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-lg px-2 transition-colors disabled:opacity-50"
          >
            Done
          </button>
          <button
            onClick={e => { e.stopPropagation(); handleSkip(instance); }}
            disabled={isLoading}
            className="flex-1 min-w-[50px] min-h-[44px] bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs font-medium rounded-lg px-2 transition-colors disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={e => { e.stopPropagation(); setSnoozeDays(3); setSnoozeModal({ instance }); }}
            disabled={isLoading}
            className="flex-1 min-w-[60px] min-h-[44px] bg-amber-50 hover:bg-amber-100 text-amber-600 text-xs font-medium rounded-lg px-2 transition-colors disabled:opacity-50"
          >
            Snooze
          </button>
          <button
            onClick={e => { e.stopPropagation(); openAdjustModal(instance); }}
            disabled={isLoading}
            className="flex-1 min-w-[110px] min-h-[44px] bg-purple-50 hover:bg-purple-100 text-purple-600 text-xs font-medium rounded-lg px-2 transition-colors disabled:opacity-50"
          >
            Adjust for event
          </button>
          <button
            onClick={e => { e.stopPropagation(); setDeleteModal({ instance }); }}
            disabled={isLoading}
            className="flex-1 min-w-[60px] min-h-[44px] bg-red-50 hover:bg-red-100 text-red-500 text-xs font-medium rounded-lg px-2 transition-colors disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    );
  }

  function ListView() {
    if (instances.length === 0) {
      return (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">✨</div>
          <h2 className="text-xl font-semibold text-gray-700 mb-2">All caught up!</h2>
          <p className="text-gray-400 text-sm mb-6">No upcoming tasks right now.</p>
          <Link href="/tasks/new" className="inline-block bg-pink-500 text-white text-sm font-medium rounded-lg px-4 py-2.5">
            Add a task
          </Link>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {due.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3">Due Now</h2>
            <div className="space-y-3">
              {due.map(i => <InstanceCard key={i.id} instance={i} />)}
            </div>
          </section>
        )}
        {upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Upcoming</h2>
            <div className="space-y-5">
              {groupByRoutine(upcoming).map(([key, group]) => (
                <div key={key}>
                  {group.routine && (
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.routine.color }}
                      />
                      <Link
                        href={`/routines/${group.routine.id}`}
                        className="text-xs font-semibold text-gray-500 hover:text-gray-700"
                      >
                        {group.routine.name}
                      </Link>
                      {conflictCounts[group.routine.id] > 0 && (
                        <Link
                          href={`/routines/${group.routine.id}`}
                          className="text-xs font-semibold bg-red-100 text-red-500 rounded-full px-1.5 py-0.5"
                        >
                          {conflictCounts[group.routine.id]} conflict{conflictCounts[group.routine.id] !== 1 ? 's' : ''}
                        </Link>
                      )}
                    </div>
                  )}
                  <div className="space-y-3">
                    {group.items.map(i => <InstanceCard key={i.id} instance={i} />)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  function CalendarView() {
    const daysInMonth   = new Date(calYear, calMonth, 0).getDate();
    const firstWeekday  = new Date(calYear, calMonth - 1, 1).getDay(); // 0=Sun
    const todayStr      = format(today(), 'yyyy-MM-dd');
    const monthLabel    = new Date(calYear, calMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });

    // Build map: dateStr → instances
    const byDate: Record<string, InstanceWithTask[]> = {};
    for (const inst of calInstances) {
      const d = inst.due_date_start;
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(inst);
    }

    const cells: (number | null)[] = [
      ...Array(firstWeekday).fill(null),
      ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
    ];
    // Pad to full weeks
    while (cells.length % 7 !== 0) cells.push(null);

    return (
      <div className="space-y-3">
        {/* Month nav */}
        <div className="flex items-center justify-between">
          <button onClick={() => changeCalMonth(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            ←
          </button>
          <h2 className="text-sm font-semibold text-gray-700">{monthLabel}</h2>
          <button onClick={() => changeCalMonth(1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
            →
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 gap-1">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
            <div key={d} className="text-center text-xs text-gray-400 py-1">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        {calLoading ? (
          <div className="text-center py-8 text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (!day) return <div key={i} />;
              const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const dayInsts = byDate[dateStr] ?? [];
              const isToday  = dateStr === todayStr;

              return (
                <div
                  key={i}
                  className={`min-h-[64px] rounded-lg p-1 ${isToday ? 'bg-pink-50 border border-pink-200' : 'border border-gray-100'}`}
                >
                  <p className={`text-xs text-center mb-0.5 ${isToday ? 'font-bold text-pink-600' : 'text-gray-400'}`}>{day}</p>
                  <div className="space-y-0.5">
                    {dayInsts.slice(0, 3).map(inst => {
                      const isProjected = inst.is_projected;
                      const isCompleted = inst.status === 'completed';
                      return (
                        <Link key={inst.id} href={`/instances/${inst.id}`} onClick={e => e.stopPropagation()}>
                          <div
                            className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate text-white ${
                              isProjected
                                ? 'opacity-35 border border-dashed border-white/50'
                                : isCompleted
                                  ? 'opacity-60'
                                  : ''
                            }`}
                            style={{ backgroundColor: (inst.task as any)?.routine?.color ?? inst.task?.category?.color ?? '#6B7280' }}
                          >
                            {isCompleted ? '✓ ' : ''}{inst.task?.name ?? '—'}
                          </div>
                        </Link>
                      );
                    })}
                    {dayInsts.length > 3 && (
                      <p className="text-[10px] text-gray-400 text-center">+{dayInsts.length - 3}</p>
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

    // ── Spent (completed) ──────────────────────────────────────
    const thisMonthSpent = entries
      .filter(e => e.actual_completion_date.startsWith(thisMonthStr))
      .reduce((s, e) => s + e.cost, 0);

    // ── Planned (upcoming + projected, tasks with a default_cost) ──
    function plannedForMonth(monthStr: string) {
      return planned
        .filter(p => p.due_date_start.startsWith(monthStr) && p.task?.default_cost != null)
        .reduce((s, p) => s + (p.task!.default_cost as number), 0);
    }
    const thisMonthPlanned = plannedForMonth(thisMonthStr);

    // ── 7-month bar chart: 3 past + current + 3 future ────────
    const barMonths: string[] = [];
    for (let i = -3; i <= 3; i++) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() + i);
      barMonths.push(format(d, 'yyyy-MM'));
    }
    const barData = barMonths.map(m => {
      const isPast    = m < thisMonthStr;
      const isCurrent = m === thisMonthStr;
      const spent     = entries
        .filter(e => e.actual_completion_date.startsWith(m))
        .reduce((s, e) => s + e.cost, 0);
      const plan      = !isPast ? plannedForMonth(m) : 0;
      return {
        label: new Date(m + '-01').toLocaleString('default', { month: 'short' }),
        spent,
        planned: plan,
        isPast,
        isCurrent,
        total: spent + plan,
      };
    });
    const maxBar = Math.max(...barData.map(m => m.total), 1);

    // ── Monthly avg (spent only, past months with data) ────────
    const pastWithSpend = barData.filter(m => m.isPast && m.spent > 0);
    const monthlyAvg = pastWithSpend.length > 0
      ? pastWithSpend.reduce((s, m) => s + m.spent, 0) / pastWithSpend.length
      : 0;

    // ── By category (this month, spent + planned) ──────────────
    const catMap: Record<string, { name: string; color: string; spent: number; planned: number }> = {};
    for (const e of entries.filter(e => e.actual_completion_date.startsWith(thisMonthStr))) {
      const name  = e.task?.category?.name  ?? 'Other';
      const color = e.task?.category?.color ?? '#6B7280';
      if (!catMap[name]) catMap[name] = { name, color, spent: 0, planned: 0 };
      catMap[name].spent += e.cost;
    }
    for (const p of planned.filter(p => p.due_date_start.startsWith(thisMonthStr) && p.task?.default_cost != null)) {
      const name  = p.task?.category?.name  ?? 'Other';
      const color = p.task?.category?.color ?? '#6B7280';
      if (!catMap[name]) catMap[name] = { name, color, spent: 0, planned: 0 };
      catMap[name].planned += p.task!.default_cost as number;
    }
    const catList = Object.values(catMap).sort((a, b) => (b.spent + b.planned) - (a.spent + a.planned));
    const maxCat  = Math.max(...catList.map(c => c.spent + c.planned), 1);

    // ── Top 5 tasks by total spend (completed only) ────────────
    const taskMap: Record<string, { name: string; total: number }> = {};
    for (const e of entries) {
      const id   = e.task?.id ?? 'unknown';
      const name = e.task?.name ?? 'Unknown';
      if (!taskMap[id]) taskMap[id] = { name, total: 0 };
      taskMap[id].total += e.cost;
    }
    const top5 = Object.values(taskMap).sort((a, b) => b.total - a.total).slice(0, 5);

    const hasAnyData = entries.length > 0 || planned.length > 0;

    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <button
          onClick={() => setSpendingOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors"
        >
          <h2 className="text-sm font-semibold text-gray-700">Spending</h2>
          <span className="text-gray-400 text-xs">{spendingOpen ? '▲ Hide' : '▼ Show'}</span>
        </button>

        {spendingOpen && (
          <div className="px-5 pb-5 border-t border-gray-100 space-y-5 pt-4">
            {spendingLoading ? (
              <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
            ) : !hasAnyData ? (
              <p className="text-sm text-gray-400 text-center py-4">
                No cost data yet. Add a typical cost to your tasks, then log it when completing.
              </p>
            ) : (
              <>
                {/* Summary row */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-pink-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-0.5">This month</p>
                    <p className="text-xl font-bold text-gray-800">${thisMonthSpent.toFixed(2)}</p>
                    {thisMonthPlanned > 0 && (
                      <p className="text-xs text-purple-500 mt-0.5">+${thisMonthPlanned.toFixed(2)} planned</p>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-0.5">Monthly avg (spent)</p>
                    <p className="text-xl font-bold text-gray-800">${monthlyAvg.toFixed(2)}</p>
                  </div>
                </div>

                {/* By category (this month) */}
                {catList.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">This month by category</p>
                    <div className="space-y-2">
                      {catList.map(cat => (
                        <div key={cat.name} className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                          <span className="text-xs text-gray-600 w-20 truncate">{cat.name}</span>
                          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
                            {/* Spent portion */}
                            <div
                              className="h-full rounded-l-full"
                              style={{ width: `${(cat.spent / maxCat) * 100}%`, backgroundColor: cat.color }}
                            />
                            {/* Planned portion */}
                            <div
                              className="h-full rounded-r-full opacity-30"
                              style={{ width: `${(cat.planned / maxCat) * 100}%`, backgroundColor: cat.color }}
                            />
                          </div>
                          <span className="text-xs text-gray-500 w-14 text-right">
                            ${cat.spent.toFixed(0)}
                            {cat.planned > 0 && <span className="text-purple-400">+{cat.planned.toFixed(0)}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1.5">Solid = spent · Faded = planned</p>
                  </div>
                )}

                {/* 7-month bar chart (3 past + current + 3 future) */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Spent &amp; planned (7 months)
                  </p>
                  <div className="flex items-end gap-1 h-20">
                    {barData.map(m => (
                      <div key={m.label} className="flex-1 flex flex-col items-center gap-0.5">
                        <span className="text-[9px] text-gray-400 text-center leading-tight">
                          {m.total > 0 ? `$${m.total.toFixed(0)}` : ''}
                        </span>
                        <div className="w-full flex flex-col justify-end" style={{ height: '48px' }}>
                          {/* Planned on top (lighter) */}
                          {m.planned > 0 && (
                            <div
                              className="w-full rounded-t"
                              style={{
                                height: `${(m.planned / maxBar) * 48}px`,
                                minHeight: '3px',
                                backgroundColor: m.isCurrent ? '#A855F7' : '#EC4899',
                                opacity: 0.25,
                              }}
                            />
                          )}
                          {/* Spent (solid) */}
                          {m.spent > 0 && (
                            <div
                              className="w-full"
                              style={{
                                height: `${(m.spent / maxBar) * 48}px`,
                                minHeight: '3px',
                                backgroundColor: '#EC4899',
                                opacity: m.isPast ? 0.5 : 1,
                                borderRadius: m.planned > 0 ? '0' : '2px 2px 0 0',
                              }}
                            />
                          )}
                        </div>
                        <span className={`text-[9px] ${m.isCurrent ? 'font-bold text-pink-500' : 'text-gray-400'}`}>
                          {m.label}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-pink-500 inline-block" /> Spent
                    </span>
                    <span className="flex items-center gap-1 text-[10px] text-gray-400">
                      <span className="w-2.5 h-2.5 rounded-sm bg-pink-300 opacity-50 inline-block" /> Planned
                    </span>
                  </div>
                </div>

                {/* Top 5 tasks */}
                {top5.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Top tasks by spend</p>
                    <div className="space-y-1.5">
                      {top5.map((t, i) => (
                        <div key={t.name} className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">{i + 1}. {t.name}</span>
                          <span className="text-xs font-medium text-gray-700">${t.total.toFixed(2)}</span>
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
  // MODALS
  // ─────────────────────────────────────────────────────────────────────────

  function CompleteModal() {
    if (!completeModal) return null;
    const { instance } = completeModal;
    return (
      <Modal onClose={() => setCompleteModal(null)}>
        <h3 className="font-semibold text-gray-800 mb-1">Mark complete</h3>
        <p className="text-sm text-gray-500 mb-4">{instance.task?.name}</p>

        <p className="text-sm font-medium text-gray-700 mb-2">When did you do this?</p>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            onClick={() => setCompletionDateMode('scheduled')}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm border transition-colors text-left ${
              completionDateMode === 'scheduled'
                ? 'bg-green-500 border-green-500 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="block font-medium">Scheduled date</span>
            <span className="block text-xs opacity-75 mt-0.5">
              {format(parseISO(instance.due_date_start), 'MMM d')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setCompletionDateMode('custom')}
            className={`flex-1 rounded-lg px-3 py-2.5 text-sm border transition-colors text-left ${
              completionDateMode === 'custom'
                ? 'bg-green-500 border-green-500 text-white'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="block font-medium">Different date</span>
            <span className="block text-xs opacity-75 mt-0.5">Pick a date</span>
          </button>
        </div>

        {completionDateMode === 'custom' && (
          <input
            type="date" value={completionDate} max={format(today(), 'yyyy-MM-dd')}
            onChange={e => setCompletionDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3"
          />
        )}

        <label className="block text-sm font-medium text-gray-700 mb-1">Cost (optional)</label>
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input
            type="number" min={0} step="0.01" value={completionCost}
            onChange={e => setCompletionCost(e.target.value)}
            placeholder={instance.task?.default_cost != null ? String(instance.task.default_cost) : '0.00'}
            className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-sm"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setCompleteModal(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2">Cancel</button>
          <button
            onClick={() => handleComplete(instance)}
            disabled={loading === instance.id}
            className="flex-1 bg-green-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
          >
            {loading === instance.id ? 'Saving…' : 'Done'}
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
        <h3 className="font-semibold text-gray-800 mb-1">Snooze</h3>
        <p className="text-sm text-gray-500 mb-4">{instance.task?.name}</p>
        <label className="block text-sm font-medium text-gray-700 mb-1">Days to snooze</label>
        <input
          type="number" min={1} max={30} value={snoozeDays}
          onChange={e => setSnoozeDays(Number(e.target.value))}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
        />
        <div className="flex gap-2">
          <button onClick={() => setSnoozeModal(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2">Cancel</button>
          <button
            onClick={() => handleSnooze(instance)}
            disabled={loading === instance.id}
            className="flex-1 bg-amber-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
          >
            {loading === instance.id ? 'Saving…' : 'Snooze'}
          </button>
        </div>
      </Modal>
    );
  }

  function AdjustEventModal() {
    if (!adjustModal) return null;
    const { instance } = adjustModal;
    const adjustedPreview =
      eventDate && daysBefore > 0
        ? format(new Date(new Date(eventDate + 'T00:00:00').getTime() - daysBefore * 86400000), 'MMM d, yyyy')
        : null;

    return (
      <Modal onClose={() => setAdjustModal(null)}>
        <h3 className="font-semibold text-gray-800 mb-1">Adjust for event</h3>
        <p className="text-sm text-gray-500 mb-4">{instance.task?.name}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event name *</label>
            <input
              type="text" value={eventName} onChange={e => setEventName(e.target.value)}
              placeholder="e.g. Vacation to Italy"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Event date *</label>
            <input
              type="date" value={eventDate}
              min={format(today(), 'yyyy-MM-dd')}
              onChange={e => setEventDate(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Days before event</label>
            <input
              type="number" min={1} max={90} value={daysBefore}
              onChange={e => setDaysBefore(Number(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {adjustedPreview && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-700">
              Moves to <span className="font-medium">{adjustedPreview}</span>
              {eventName && ` — ${daysBefore}d before ${eventName}`}.
            </div>
          )}

          <div className="flex items-start gap-2">
            <input
              type="checkbox" id="resumeNormalModal" checked={resumeNormal}
              onChange={e => setResumeNormal(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-gray-300"
            />
            <label htmlFor="resumeNormalModal" className="text-sm text-gray-700">
              Resume normal cadence after event
            </label>
          </div>

          {!resumeNormal && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Next instance date after event</label>
              <input
                type="date" value={overrideNextDate}
                min={eventDate || format(today(), 'yyyy-MM-dd')}
                onChange={e => setOverrideNextDate(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={() => setAdjustModal(null)} className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2">Cancel</button>
          <button
            onClick={() => handleAdjustForEvent(instance)}
            disabled={loading === instance.id || !eventName.trim() || !eventDate}
            className="flex-1 bg-purple-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
          >
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
        <h3 className="font-semibold text-gray-800 mb-1">Delete</h3>
        <p className="text-sm text-gray-500 mb-4">
          What would you like to delete for{' '}
          <span className="font-medium text-gray-700">{instance.task?.name}</span>?
        </p>
        <div className="space-y-2 mb-3">
          <button
            onClick={() => handleDeleteInstance(instance)}
            disabled={isDeleting}
            className="w-full border border-red-200 text-left rounded-lg px-4 py-3 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-red-500">Delete just this instance</span>
            <span className="block text-xs text-gray-400 mt-0.5">The series will continue with the next scheduled instance.</span>
          </button>
          <button
            onClick={() => handleDeleteTask(instance)}
            disabled={isDeleting}
            className="w-full border border-red-300 bg-red-50 text-left rounded-lg px-4 py-3 hover:bg-red-100 transition-colors disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-red-600">Delete entire task and all instances</span>
            <span className="block text-xs text-red-400 mt-0.5">This cannot be undone.</span>
          </button>
        </div>
        {isDeleting && <p className="text-xs text-center text-gray-400 mb-3">Deleting…</p>}
        <button
          onClick={() => setDeleteModal(null)}
          disabled={isDeleting}
          className="w-full border border-gray-200 text-gray-600 text-sm rounded-lg py-2 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </Modal>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ROOT RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Your Tasks</h1>
        <div className="flex items-center gap-2">
          {ViewToggle()}
          <Link href="/tasks/new" className="text-sm bg-pink-500 text-white font-medium rounded-lg px-3 py-1.5">
            + New
          </Link>
        </div>
      </div>

      {/* Spending section */}
      {SpendingSection()}

      {/* Main view */}
      {viewMode === 'list' ? ListView() : CalendarView()}

      {/* Modals */}
      {CompleteModal()}
      {SnoozeModal()}
      {AdjustEventModal()}
      {DeleteModal()}
    </div>
  );
}

// ─── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
