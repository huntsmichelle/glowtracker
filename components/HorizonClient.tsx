'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
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

interface Props {
  instances: InstanceWithTask[];
  userId: string;
}

type RoutineInfo = { id: string; name: string; color: string } | null;

const ROUTINE_BADGE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid #cdc6b6',
  backgroundColor: '#f6f1e6',
  color: '#6b665e',
  borderRadius: '100px',
  padding: '2px 10px',
  fontSize: '11px',
  fontWeight: 500,
  letterSpacing: '0.03em',
};

const CARD_STYLE: React.CSSProperties = {
  backgroundColor: '#f6f1e6',
  border: '1px solid #cdc6b6',
  borderRadius: '16px',
  boxShadow: '0 1px 3px rgba(43,40,35,0.06)',
  overflow: 'hidden',
};

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour   = h % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

export default function HorizonClient({ instances: initial, userId }: Props) {
  const [instances, setInstances] = useState(initial);
  const [loading, setLoading]     = useState<string | null>(null);

  // ── Modals ─────────────────────────────────────────────────────────────────
  const [completeModal, setCompleteModal] = useState<{ instance: InstanceWithTask } | null>(null);
  const [snoozeModal, setSnoozeModal]     = useState<{ instance: InstanceWithTask } | null>(null);
  const [adjustModal, setAdjustModal]     = useState<{ instance: InstanceWithTask } | null>(null);
  const [deleteModal, setDeleteModal]     = useState<{ instance: InstanceWithTask } | null>(null);

  const [completionDate, setCompletionDate] = useState(format(today(), 'yyyy-MM-dd'));
  const [completionCost, setCompletionCost] = useState('');
  const [snoozeDays, setSnoozeDays]         = useState(3);
  const [eventName, setEventName]           = useState('');
  const [eventDate, setEventDate]           = useState('');
  const [daysBefore, setDaysBefore]         = useState(7);
  const [resumeNormal, setResumeNormal]     = useState(true);
  const [overrideNextDate, setOverrideNextDate] = useState('');

  function removeInstance(id: string) {
    setInstances(prev => prev.filter(i => i.id !== id));
  }

  function openCompleteModal(inst: InstanceWithTask) {
    setCompletionDate(format(today(), 'yyyy-MM-dd'));
    setCompletionCost(inst.task?.default_cost != null ? String(inst.task.default_cost) : '');
    setCompleteModal({ instance: inst });
  }

  function openAdjustModal(inst: InstanceWithTask) {
    setEventName(''); setEventDate(''); setDaysBefore(7); setResumeNormal(true); setOverrideNextDate('');
    setAdjustModal({ instance: inst });
  }

  async function handleComplete(inst: InstanceWithTask) {
    setLoading(inst.id);
    const date = new Date(completionDate + 'T00:00:00');
    const cost = completionCost !== '' ? Number(completionCost) : null;
    const { next } = await completeInstance(inst.id, inst.task as Task, date, cost);
    removeInstance(inst.id);
    if (next) setInstances(prev => [...prev, { ...next, task: inst.task } as InstanceWithTask].sort((a, b) => a.due_date_start.localeCompare(b.due_date_start)));
    const routineId = (inst.task as unknown as { routine?: { id: string } }).routine?.id;
    if (routineId) detectRoutineConflicts(routineId).catch(console.error);
    setCompleteModal(null);
    setLoading(null);
  }

  async function handleSkip(inst: InstanceWithTask) {
    setLoading(inst.id);
    const { next } = await skipInstance(inst.id, inst.task as Task);
    removeInstance(inst.id);
    if (next) setInstances(prev => [...prev, { ...next, task: inst.task } as InstanceWithTask].sort((a, b) => a.due_date_start.localeCompare(b.due_date_start)));
    setLoading(null);
  }

  async function handleSnooze(inst: InstanceWithTask) {
    setLoading(inst.id);
    await snoozeInstance(inst.id, snoozeDays, inst.due_date_end);
    removeInstance(inst.id);
    setSnoozeModal(null);
    setLoading(null);
  }

  async function handleAdjustForEvent(inst: InstanceWithTask) {
    if (!eventName.trim() || !eventDate) return;
    setLoading(inst.id);
    const nextDate = !resumeNormal && overrideNextDate ? overrideNextDate : undefined;
    await createEventOverride(inst.id, eventName.trim(), eventDate, daysBefore, nextDate);
    removeInstance(inst.id);
    setAdjustModal(null);
    setLoading(null);
  }

  async function handleDeleteInstance(inst: InstanceWithTask) {
    setLoading(inst.id);
    await deleteInstance(inst.id, inst.task as Task);
    removeInstance(inst.id);
    setDeleteModal(null);
    setLoading(null);
  }

  async function handleDeleteTask(inst: InstanceWithTask) {
    setLoading(inst.id);
    await deleteTask(inst.task_id);
    setInstances(prev => prev.filter(i => i.task_id !== inst.task_id));
    setDeleteModal(null);
    setLoading(null);
  }

  // ── Grouping (by routine, no category sub-headers) ─────────────────────────

  type RoutineGroup = { routine: RoutineInfo; items: InstanceWithTask[] };

  function groupByRoutine(items: InstanceWithTask[]): RoutineGroup[] {
    const map = new Map<string, RoutineGroup>();
    for (const inst of items) {
      const r    = (inst.task as unknown as { routine?: RoutineInfo }).routine ?? null;
      const rKey = r?.id ?? '__none__';
      if (!map.has(rKey)) map.set(rKey, { routine: r, items: [] });
      map.get(rKey)!.items.push(inst);
    }
    return [...map.entries()]
      .sort(([ka], [kb]) => {
        if (ka === '__none__') return 1;
        if (kb === '__none__') return -1;
        return 0;
      })
      .map(([, g]) => g);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (instances.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="text-center py-20">
          <p className="font-display text-2xl text-charcoal mb-2">Clear horizon.</p>
          <p className="text-warm-mid text-sm mb-8">No rituals coming up. Add one to get started.</p>
          <Link href="/tasks/new" className="inline-block bg-charcoal text-cream text-sm font-medium rounded-pill px-6 py-3 hover:bg-charcoal/90">
            + Add Ritual
          </Link>
        </div>
        {Modals()}
      </div>
    );
  }

  const groups = groupByRoutine(instances);

  return (
    <div className="space-y-6">
      <PageHeader />

      <div className="space-y-4">
        {groups.map(({ routine, items }) => (
          <div key={routine?.id ?? '__none__'} style={CARD_STYLE}>
            {/* Group header */}
            <div className="px-5 py-3.5 border-b" style={{ borderColor: '#cdc6b6' }}>
              {routine ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: routine.color }} />
                  <Link href={`/routines/${routine.id}`}>
                    <span style={ROUTINE_BADGE}>{routine.name}</span>
                  </Link>
                </div>
              ) : (
                <p className="label-overline">Individual Rituals</p>
              )}
            </div>

            {/* Instance rows */}
            {items.map((inst, idx) => {
              const status      = deriveStatus(inst);
              const categoryColor = getCategoryColor(inst.task?.category?.name ?? '').dot;
              const prepNote    = inst.task?.reminder_notes ?? inst.task?.description ?? null;
              const isLoading   = loading === inst.id;
              const dateLabel   = format(parseISO(inst.due_date_start), 'MMM d');

              return (
                <div
                  key={inst.id}
                  className={idx > 0 ? 'border-t' : ''}
                  style={{ borderColor: '#cdc6b6' }}
                >
                  {/* Top row: date | info | circle+pass */}
                  <div className="flex gap-3 px-5 pt-3.5 pb-1">
                    {/* Date column */}
                    <div className="w-[52px] flex-shrink-0 pt-0.5">
                      <p className="text-[11px] text-warm-light font-mono">{dateLabel}</p>
                      {inst.scheduled_time && (
                        <p className="text-[10px] text-warm-light mt-0.5">{formatTime(inst.scheduled_time)}</p>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <Link href={`/instances/${inst.id}`} className="block">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: categoryColor }} />
                          <p className="text-sm font-medium text-charcoal truncate">{inst.task?.name}</p>
                          {status === 'due' && (
                            <span className="flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: 'rgba(142,163,148,0.15)', border: '1px solid #8ea394', color: '#2b2823' }}>
                              NOW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-warm-mid mt-0.5 truncate">
                          {inst.task?.category?.name ?? ''}
                          {prepNote ? ` · ${prepNote.slice(0, 32)}${prepNote.length > 32 ? '…' : ''}` : ''}
                        </p>
                      </Link>
                    </div>

                    {/* Circle + Pass */}
                    <div className="flex flex-col items-end gap-1 flex-shrink-0 pt-0.5">
                      <button
                        onClick={() => openCompleteModal(inst)}
                        disabled={isLoading}
                        className="w-5 h-5 rounded-full transition-colors disabled:opacity-40"
                        style={{ border: '1.5px solid #cdc6b6' }}
                        aria-label="Mark kept"
                      />
                      <span
                        role="button"
                        onClick={() => !isLoading && handleSkip(inst)}
                        className="text-[10px] cursor-pointer select-none"
                        style={{ color: '#a8a297' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#6b665e')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#a8a297')}
                      >
                        Pass
                      </span>
                    </div>
                  </div>

                  {/* Action buttons row */}
                  <div className="flex flex-wrap gap-1.5 px-5 pb-3.5 pt-1">
                    <button
                      onClick={() => openCompleteModal(inst)}
                      disabled={isLoading}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-charcoal text-cream hover:bg-charcoal/90 disabled:opacity-50"
                    >
                      Kept
                    </button>
                    <button
                      onClick={() => !isLoading && handleSkip(inst)}
                      disabled={isLoading}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md text-warm-mid hover:text-charcoal disabled:opacity-50"
                      style={{ backgroundColor: '#ede8db' }}
                    >
                      Pass
                    </button>
                    <button
                      onClick={() => { setSnoozeDays(3); setSnoozeModal({ instance: inst }); }}
                      disabled={isLoading}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md text-warm-mid hover:text-charcoal disabled:opacity-50"
                      style={{ backgroundColor: '#ede8db' }}
                    >
                      Nudge
                    </button>
                    <button
                      onClick={() => openAdjustModal(inst)}
                      disabled={isLoading}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md text-warm-mid hover:text-charcoal disabled:opacity-50"
                      style={{ backgroundColor: '#ede8db' }}
                    >
                      Adjust for event
                    </button>
                    <button
                      onClick={() => setDeleteModal({ instance: inst })}
                      disabled={isLoading}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-md text-warm-mid hover:text-charcoal disabled:opacity-50"
                      style={{ backgroundColor: '#e8c9b8' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {Modals()}
    </div>
  );

  // ── Modals ─────────────────────────────────────────────────────────────────

  function Modals() {
    return (
      <>
        {/* Complete modal */}
        {completeModal && (
          <Modal onClose={() => setCompleteModal(null)}>
            <p className="label-overline mb-4">Mark Kept</p>
            <p className="text-sm text-warm-mid mb-4">{completeModal.instance.task?.name}</p>
            <label className="block text-xs font-medium text-warm-mid uppercase tracking-wide mb-1.5">Date kept</label>
            <input type="date" value={completionDate} max={format(today(), 'yyyy-MM-dd')}
              onChange={e => setCompletionDate(e.target.value)} className="w-full mb-4" />
            <label className="block text-xs font-medium text-warm-mid uppercase tracking-wide mb-1.5">Cost (optional)</label>
            <div className="relative mb-5">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-warm-light text-sm">$</span>
              <input type="number" min={0} step="0.01" value={completionCost}
                onChange={e => setCompletionCost(e.target.value)}
                placeholder={completeModal.instance.task?.default_cost != null ? String(completeModal.instance.task.default_cost) : '0.00'}
                className="w-full pl-7" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCompleteModal(null)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe">Cancel</button>
              <button onClick={() => handleComplete(completeModal.instance)} disabled={loading === completeModal.instance.id}
                className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50">
                {loading === completeModal.instance.id ? 'Saving…' : 'Mark Kept'}
              </button>
            </div>
          </Modal>
        )}

        {/* Snooze modal */}
        {snoozeModal && (
          <Modal onClose={() => setSnoozeModal(null)}>
            <p className="label-overline mb-4">Nudge</p>
            <p className="text-sm text-warm-mid mb-4">{snoozeModal.instance.task?.name}</p>
            <label className="block text-xs font-medium text-warm-mid uppercase tracking-wide mb-1.5">Days to nudge forward</label>
            <input type="number" min={1} max={30} value={snoozeDays}
              onChange={e => setSnoozeDays(Number(e.target.value))} className="w-full mb-5" />
            <div className="flex gap-2">
              <button onClick={() => setSnoozeModal(null)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe">Cancel</button>
              <button onClick={() => handleSnooze(snoozeModal.instance)} disabled={loading === snoozeModal.instance.id}
                className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50">
                {loading === snoozeModal.instance.id ? 'Saving…' : 'Nudge'}
              </button>
            </div>
          </Modal>
        )}

        {/* Adjust modal */}
        {adjustModal && (() => {
          const adjustedPreview = eventDate && daysBefore > 0
            ? format(new Date(new Date(eventDate + 'T00:00:00').getTime() - daysBefore * 86400000), 'MMM d, yyyy')
            : null;
          return (
            <Modal onClose={() => setAdjustModal(null)}>
              <p className="label-overline mb-1">Adjust for event</p>
              <p className="text-sm text-warm-mid mb-4">{adjustModal.instance.task?.name}</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Event name *</label>
                  <input type="text" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="e.g. Vacation" className="w-full" />
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
                    Moves to <span className="font-medium text-charcoal">{adjustedPreview}</span>.
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={resumeNormal} onChange={e => setResumeNormal(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  <label className="text-sm text-charcoal">Resume normal cadence after event</label>
                </div>
                {!resumeNormal && (
                  <div>
                    <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Next date after event</label>
                    <input type="date" value={overrideNextDate} min={eventDate || format(today(), 'yyyy-MM-dd')} onChange={e => setOverrideNextDate(e.target.value)} className="w-full" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setAdjustModal(null)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2 hover:bg-taupe">Cancel</button>
                <button onClick={() => handleAdjustForEvent(adjustModal.instance)}
                  disabled={loading === adjustModal.instance.id || !eventName.trim() || !eventDate}
                  className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2 disabled:opacity-50">
                  {loading === adjustModal.instance.id ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </Modal>
          );
        })()}

        {/* Delete modal */}
        {deleteModal && (
          <Modal onClose={() => setDeleteModal(null)}>
            <p className="label-overline mb-1">Remove</p>
            <p className="text-sm text-warm-mid mb-4">
              Remove <span className="font-medium text-charcoal">{deleteModal.instance.task?.name}</span>?
            </p>
            <div className="space-y-2 mb-3">
              <button onClick={() => handleDeleteInstance(deleteModal.instance)} disabled={loading === deleteModal.instance.id}
                className="w-full border border-glow-border text-left rounded-lg px-4 py-3 hover:bg-taupe transition-colors disabled:opacity-50">
                <span className="block text-sm font-semibold text-charcoal">This instance only</span>
                <span className="block text-xs text-warm-light mt-0.5">Series continues normally.</span>
              </button>
              <button onClick={() => handleDeleteTask(deleteModal.instance)} disabled={loading === deleteModal.instance.id}
                className="w-full border border-dust bg-dust-lt text-left rounded-lg px-4 py-3 hover:bg-dust/20 transition-colors disabled:opacity-50">
                <span className="block text-sm font-semibold text-charcoal">Entire ritual + all instances</span>
                <span className="block text-xs text-warm-mid mt-0.5">Cannot be undone.</span>
              </button>
            </div>
            <button onClick={() => setDeleteModal(null)} className="w-full border border-glow-border text-warm-mid text-sm rounded-pill py-2 hover:bg-taupe">Cancel</button>
          </Modal>
        )}
      </>
    );
  }

  // ── Sub-components ─────────────────────────────────────────────────────────

  function PageHeader() {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-overline mb-1">Looking ahead</p>
          <h1 className="font-display text-3xl text-charcoal">Coming up</h1>
          <p className="text-sm text-warm-mid mt-1">All your rituals, looking ahead.</p>
        </div>
        <Link
          href="/tasks/new"
          className="flex-shrink-0 bg-charcoal text-cream text-sm font-medium rounded-pill px-4 py-2 hover:bg-charcoal/90"
        >
          + Add ritual
        </Link>
      </div>
    );
  }
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-4"
      style={{ background: 'rgba(44,42,38,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-[#FFFFFF] rounded-lg w-full max-w-sm p-6 border border-glow-border"
        style={{ boxShadow: '0 8px 24px rgba(43,40,35,0.14)' }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
