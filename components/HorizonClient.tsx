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

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'AM' : 'PM';
  const hour   = h % 12 || 12;
  return m === 0 ? `${hour} ${period}` : `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

function formatDateHeader(dateStr: string): string {
  const d = parseISO(dateStr);
  const todayStr = format(today(), 'yyyy-MM-dd');
  if (dateStr === todayStr) return 'Today';
  const tomorrow = new Date(today().getTime() + 86400000);
  if (dateStr === format(tomorrow, 'yyyy-MM-dd')) return 'Tomorrow';
  return format(d, 'EEEE · MMM d');
}

export default function HorizonClient({ instances: initial, userId }: Props) {
  const [instances, setInstances] = useState(initial);
  const [loading, setLoading]     = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  // ── Deduplication — show only next-due instance per task series ────────────
  function deduplicateByTask(items: InstanceWithTask[]): InstanceWithTask[] {
    const byTask = new Map<string, InstanceWithTask[]>();
    for (const inst of items) {
      if (!byTask.has(inst.task_id)) byTask.set(inst.task_id, []);
      byTask.get(inst.task_id)!.push(inst);
    }
    const result: InstanceWithTask[] = [];
    for (const [, taskInstances] of byTask) {
      const sorted = [...taskInstances].sort((a, b) => a.due_date_start.localeCompare(b.due_date_start));
      const earliest = sorted[0];
      if (earliest.task?.frequency_type === 'twice_daily') {
        result.push(...sorted.filter(i => i.due_date_start === earliest.due_date_start));
      } else {
        result.push(earliest);
      }
    }
    return result.sort((a, b) => a.due_date_start.localeCompare(b.due_date_start));
  }

  // ── Date grouping ──────────────────────────────────────────────────────────
  function groupByDate(items: InstanceWithTask[]): Array<{ dateStr: string; items: InstanceWithTask[] }> {
    const map = new Map<string, InstanceWithTask[]>();
    for (const inst of items) {
      const key = inst.due_date_start;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inst);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateStr, items]) => ({ dateStr, items }));
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (instances.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>
            Clear horizon.
          </p>
          <div style={{ width: '40px', height: '1px', backgroundColor: '#cdc6b6' }} />
          <Link href="/tasks/new" style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297', cursor: 'pointer' }}>
            Add your first ritual
          </Link>
        </div>
        {Modals()}
      </div>
    );
  }

  const deduplicated = deduplicateByTask(instances);
  const dateGroups = groupByDate(deduplicated);
  const todayStr = format(today(), 'yyyy-MM-dd');

  return (
    <div className="space-y-6">
      <PageHeader />

      <div className="space-y-6">
        {dateGroups.map(({ dateStr, items }, groupIdx) => (
          <div key={dateStr}>
            {/* Date header */}
            <div style={{ paddingTop: groupIdx === 0 ? '4px' : '24px', paddingBottom: '8px', borderBottom: '1px solid #cdc6b6', marginBottom: '4px' }}>
              <span style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '16px', fontWeight: 500, color: '#000000', letterSpacing: '0.01em' }}>
                {formatDateHeader(dateStr)}
              </span>
            </div>

            {/* Rows for this date */}
            {items.map(inst => {
              const status       = deriveStatus(inst);
              const isToday      = dateStr === todayStr;
              const isDue        = status === 'due';
              const categoryColor = getCategoryColor(inst.task?.category?.name ?? '').dot;
              const isExpanded   = expandedRow === inst.id;
              const isLoading    = loading === inst.id;
              const routine      = (inst.task as unknown as { routine?: { id: string; name: string; color: string } | null }).routine ?? null;
              const prepNote     = inst.task?.reminder_notes ?? inst.task?.description ?? null;

              return (
                <div key={inst.id} style={{ borderBottom: '1px solid #cdc6b6' }}>
                  {/* Default row */}
                  <div
                    style={{ display: 'flex', alignItems: 'center', padding: '12px 0', gap: '10px', cursor: 'pointer' }}
                    onClick={() => setExpandedRow(isExpanded ? null : inst.id)}
                  >
                    {/* Sage dot */}
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: categoryColor, flexShrink: 0 }} />

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {inst.task?.name}
                        </p>
                        {isDue && (
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#8ea394', flexShrink: 0 }}>NOW</span>
                        )}
                      </div>
                      <p style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginTop: '1px' }}>
                        {inst.task?.category?.name ?? ''}
                        {inst.scheduled_time && ` · ${formatTime(inst.scheduled_time)}`}
                      </p>
                    </div>

                    {/* Right action */}
                    {isToday || isDue ? (
                      <button
                        onClick={e => { e.stopPropagation(); openCompleteModal(inst); }}
                        disabled={isLoading}
                        style={{ width: '20px', height: '20px', borderRadius: '50%', border: '1.5px solid #cdc6b6', backgroundColor: 'transparent', flexShrink: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        aria-label="Mark kept"
                      />
                    ) : (
                      <span style={{ fontSize: '14px', color: '#a8a297', flexShrink: 0 }}>›</span>
                    )}
                  </div>

                  {/* Expanded state */}
                  {isExpanded && (
                    <div style={{ paddingBottom: '12px', paddingLeft: '16px' }}>
                      {prepNote && (
                        <p style={{ fontSize: '12px', color: '#6b665e', marginBottom: '8px' }}>
                          {prepNote.slice(0, 80)}{prepNote.length > 80 ? '…' : ''}
                        </p>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <button
                          onClick={() => openCompleteModal(inst)}
                          disabled={isLoading}
                          style={{ fontSize: '11px', color: '#6b665e', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Keep
                        </button>
                        <button
                          onClick={() => !isLoading && handleSkip(inst)}
                          disabled={isLoading}
                          style={{ fontSize: '11px', color: '#6b665e', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Pass
                        </button>
                        <button
                          onClick={() => { setSnoozeDays(3); setSnoozeModal({ instance: inst }); }}
                          disabled={isLoading}
                          style={{ fontSize: '11px', color: '#6b665e', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Defer
                        </button>
                        <button
                          onClick={() => openAdjustModal(inst)}
                          disabled={isLoading}
                          style={{ fontSize: '11px', color: '#6b665e', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Adjust for event
                        </button>
                        <Link
                          href={`/instances/${inst.id}`}
                          style={{ fontSize: '11px', color: '#6b665e', textDecoration: 'none' }}
                        >
                          Details
                        </Link>
                        <button
                          onClick={() => setDeleteModal({ instance: inst })}
                          disabled={isLoading}
                          style={{ fontSize: '11px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          Delete
                        </button>
                      </div>
                      {routine && (
                        <div style={{ marginTop: '8px' }}>
                          <Link href={`/routines/${routine.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b665e', textDecoration: 'none', border: '1px solid #cdc6b6', borderRadius: '100px', padding: '2px 10px', backgroundColor: '#f6f1e6' }}>
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: routine.color, display: 'inline-block' }} />
                            {routine.name}
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
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
            <p className="label-overline mb-4">Defer</p>
            <p className="text-sm text-warm-mid mb-4">{snoozeModal.instance.task?.name}</p>
            <label className="block text-xs font-medium text-warm-mid uppercase tracking-wide mb-1.5">Days to defer forward</label>
            <input type="number" min={1} max={30} value={snoozeDays}
              onChange={e => setSnoozeDays(Number(e.target.value))} className="w-full mb-5" />
            <div className="flex gap-2">
              <button onClick={() => setSnoozeModal(null)} className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe">Cancel</button>
              <button onClick={() => handleSnooze(snoozeModal.instance)} disabled={loading === snoozeModal.instance.id}
                className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50">
                {loading === snoozeModal.instance.id ? 'Saving…' : 'Defer'}
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

  function PageHeader() {
    return (
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-overline mb-1">Looking ahead</p>
          <h1 className="font-display text-3xl text-charcoal">Coming up</h1>
          <p className="text-sm text-warm-mid mt-1">Your rituals on the horizon.</p>
        </div>
        <Link
          href="/tasks/new"
          style={{ flexShrink: 0, border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '6px 16px', textDecoration: 'none' }}
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
