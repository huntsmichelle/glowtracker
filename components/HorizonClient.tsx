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
  summaryCount?: number;
  summaryCategoryCount?: number;
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

export default function HorizonClient({ instances: initial, userId, summaryCount = 0, summaryCategoryCount = 0 }: Props) {
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

  // ── Deduplication ─────────────────────────────────────────────────────────
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

  // ── Render ─────────────────────────────────────────────────────────────────

  const todayStr = format(today(), 'yyyy-MM-dd');
  const endOfWeek = new Date();
  endOfWeek.setDate(endOfWeek.getDate() + 6);
  const weekEnd = format(endOfWeek, 'yyyy-MM-dd');

  const deduplicated = deduplicateByTask(instances);
  const readyNow = deduplicated.filter(i => i.due_date_start <= todayStr);
  const thisWeek = deduplicated.filter(i => i.due_date_start > todayStr && i.due_date_start <= weekEnd);
  const later    = deduplicated.filter(i => i.due_date_start > weekEnd);

  function SectionHeader({ label, accent }: { label: string; accent?: boolean }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
        <span style={{
          fontFamily: 'EB Garamond, Georgia, serif',
          fontSize: '16px',
          fontWeight: 500,
          color: accent ? '#6e8c82' : '#352720',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#ddd4c4' }} />
      </div>
    );
  }

  function RitualRow({ inst }: { inst: InstanceWithTask }) {
    const status = deriveStatus(inst);
    const isDue = status === 'due';
    const categoryColor = getCategoryColor(inst.task?.category?.name ?? '').dot;
    const isExpanded = expandedRow === inst.id;
    const isLoading = loading === inst.id;
    const routine = (inst.task as unknown as { routine?: { id: string; name: string; color: string } | null }).routine ?? null;
    const provider = (inst.task as unknown as { service_provider?: { name: string } | null }).service_provider ?? null;
    const prepNote = inst.task?.reminder_notes ?? inst.task?.description ?? null;

    const nameLabel = provider ? `${inst.task?.name} · ${provider.name}` : inst.task?.name;

    let windowLabel: string | null = null;
    if (inst.due_date_end && inst.due_date_end !== inst.due_date_start) {
      windowLabel = `${format(parseISO(inst.due_date_start), 'MMM d')} – ${format(parseISO(inst.due_date_end), 'MMM d')}`;
    } else {
      windowLabel = format(parseISO(inst.due_date_start), 'MMM d');
    }

    return (
      <div style={{ borderBottom: '1px solid #ddd4c4' }}>
        {/* Collapsed row */}
        <div
          style={{ display: 'flex', alignItems: 'center', padding: '12px 0', gap: '10px', cursor: 'pointer' }}
          onClick={() => setExpandedRow(isExpanded ? null : inst.id)}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: categoryColor, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '14px', fontWeight: 500, color: '#352720', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {nameLabel}
            </p>
          </div>
          <span style={{ fontSize: '11px', color: '#a8998e', flexShrink: 0 }}>
            {inst.task?.category?.name ?? ''}
          </span>
          <span style={{ fontSize: '13px', color: '#a8998e', flexShrink: 0 }}>
            {isExpanded ? '∨' : '›'}
          </span>
        </div>

        {/* Expanded state */}
        {isExpanded && (
          <div style={{ paddingBottom: '14px', paddingLeft: '16px' }}>
            {/* Context */}
            <div style={{ marginBottom: '10px' }}>
              <p style={{ fontSize: '12px', color: '#6b5c52' }}>
                {isDue ? 'Ready today' : `Window: ${windowLabel}`}
              </p>
              {prepNote && (
                <p style={{ fontSize: '12px', color: '#6b5c52', marginTop: '2px' }}>
                  {prepNote.slice(0, 100)}{prepNote.length > 100 ? '…' : ''}
                </p>
              )}
            </div>

            {/* Action bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexWrap: 'wrap' }}>
              {/* Keep — sage tint pill */}
              <button
                onClick={() => openCompleteModal(inst)}
                disabled={isLoading}
                style={{
                  fontSize: '11px', fontWeight: 500, color: '#6e8c82',
                  backgroundColor: 'rgba(110,140,130,0.28)', border: 'none',
                  borderRadius: '100px', padding: '4px 12px', cursor: 'pointer',
                  marginRight: '10px',
                }}
              >
                Keep
              </button>

              {/* Text actions separated by · */}
              <span style={{ fontSize: '11px', color: '#6b5c52' }}>
                <button onClick={() => !isLoading && handleSkip(inst)} disabled={isLoading}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b5c52', fontSize: '11px', padding: 0 }}>
                  Skip once
                </button>
                <span style={{ color: '#ddd4c4', margin: '0 6px' }}>·</span>
                <button onClick={() => { setSnoozeDays(3); setSnoozeModal({ instance: inst }); }} disabled={isLoading}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b5c52', fontSize: '11px', padding: 0 }}>
                  Move
                </button>
                <span style={{ color: '#ddd4c4', margin: '0 6px' }}>·</span>
                <button onClick={() => openAdjustModal(inst)} disabled={isLoading}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b5c52', fontSize: '11px', padding: 0 }}>
                  Plan around event
                </button>
              </span>

              <span style={{ color: '#ddd4c4', margin: '0 6px' }}>·</span>
              <Link href={`/instances/${inst.id}`}
                style={{ fontSize: '11px', color: '#a8998e', textDecoration: 'none' }}>
                Details
              </Link>
              <span style={{ color: '#ddd4c4', margin: '0 6px' }}>·</span>
              <Link href={`/tasks/${inst.task_id}/edit`}
                style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '13px', color: '#a8998e', textDecoration: 'none' }}>
                Edit ritual
              </Link>
            </div>

            {routine && (
              <div style={{ marginTop: '8px' }}>
                <Link href={`/routines/${routine.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: '#6b5c52', textDecoration: 'none', border: '1px solid #ddd4c4', borderRadius: '100px', padding: '2px 10px', backgroundColor: '#faf4e6' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: routine.color, display: 'inline-block' }} />
                  {routine.name}
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#352720' }}>
            Clear horizon.
          </p>
          <div style={{ width: '40px', height: '1px', backgroundColor: '#ddd4c4' }} />
          <Link href="/tasks/new" style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8998e', cursor: 'pointer' }}>
            Add your first ritual
          </Link>
        </div>
        {Modals()}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Summary bar */}
      {summaryCount > 0 && (
        <p style={{ fontSize: '13px', color: '#6b5c52' }}>
          {summaryCount} ritual{summaryCount !== 1 ? 's' : ''} across {summaryCategoryCount} {summaryCategoryCount !== 1 ? 'categories' : 'category'} in the next 30 days
        </p>
      )}

      {/* Ready now section */}
      {readyNow.length > 0 && (
        <div className="space-y-0">
          <SectionHeader label="Ready now" accent />
          {readyNow.map(inst => <RitualRow key={inst.id} inst={inst} />)}
        </div>
      )}

      {/* This week section */}
      {thisWeek.length > 0 && (
        <div className="space-y-0">
          <SectionHeader label="This week" />
          {thisWeek.map(inst => <RitualRow key={inst.id} inst={inst} />)}
        </div>
      )}

      {/* Later section */}
      {later.length > 0 && (
        <div className="space-y-0">
          <SectionHeader label="Later" />
          {later.map(inst => <RitualRow key={inst.id} inst={inst} />)}
        </div>
      )}

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
          <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#352720' }}>
            Horizon
          </h1>
        </div>
        <Link
          href="/tasks/new"
          style={{ flexShrink: 0, border: '1px solid #352720', backgroundColor: 'transparent', color: '#352720', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '6px 16px', textDecoration: 'none' }}
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
