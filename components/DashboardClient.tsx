'use client';

import { useState } from 'react';
import Link from 'next/link';
import { format, parseISO, differenceInDays } from 'date-fns';
import { completeTask, skipTask, snoozeTask, today, deriveStatus } from '@/lib/taskEngine';
import type { TaskWithRoutine, Routine } from '@/types';

interface Props {
  tasks: TaskWithRoutine[];
}

export default function DashboardClient({ tasks: initial }: Props) {
  const [tasks, setTasks]           = useState(initial);
  const [completeModal, setCompleteModal] = useState<{ task: TaskWithRoutine } | null>(null);
  const [snoozeModal, setSnoozeModal]     = useState<{ task: TaskWithRoutine } | null>(null);
  const [completionDate, setCompletionDate] = useState(format(today(), 'yyyy-MM-dd'));
  const [snoozeDays, setSnoozeDays]         = useState(3);
  const [loading, setLoading]               = useState<string | null>(null);

  function removeTask(id: string) {
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  async function handleComplete(task: TaskWithRoutine) {
    setLoading(task.id);
    const date = new Date(completionDate + 'T00:00:00');
    await completeTask(task.id, task.routine as Routine, date);
    removeTask(task.id);
    setCompleteModal(null);
    setLoading(null);
  }

  async function handleSkip(task: TaskWithRoutine) {
    setLoading(task.id);
    await skipTask(task.id, task.routine as Routine);
    removeTask(task.id);
    setLoading(null);
  }

  async function handleSnooze(task: TaskWithRoutine) {
    setLoading(task.id);
    await snoozeTask(task.id, snoozeDays, task.due_date_end);
    removeTask(task.id);
    setSnoozeModal(null);
    setLoading(null);
  }

  const due      = tasks.filter(t => deriveStatus(t) === 'due');
  const upcoming = tasks.filter(t => deriveStatus(t) !== 'due');

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">✨</div>
        <h2 className="text-xl font-semibold text-gray-700 mb-2">All caught up!</h2>
        <p className="text-gray-400 text-sm mb-6">No upcoming routines right now.</p>
        <Link href="/routines/new" className="inline-block bg-pink-500 text-white text-sm font-medium rounded-lg px-4 py-2.5">
          Add a routine
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">Your Routines</h1>
        <Link href="/routines/new" className="text-sm bg-pink-500 text-white font-medium rounded-lg px-3 py-1.5">
          + New
        </Link>
      </div>

      {due.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-3">Due Now</h2>
          <div className="space-y-3">
            {due.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                loading={loading === task.id}
                onComplete={() => { setCompletionDate(format(today(), 'yyyy-MM-dd')); setCompleteModal({ task }); }}
                onSkip={() => handleSkip(task)}
                onSnooze={() => { setSnoozeDays(3); setSnoozeModal({ task }); }}
              />
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Upcoming</h2>
          <div className="space-y-3">
            {upcoming.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                loading={loading === task.id}
                onComplete={() => { setCompletionDate(format(today(), 'yyyy-MM-dd')); setCompleteModal({ task }); }}
                onSkip={() => handleSkip(task)}
                onSnooze={() => { setSnoozeDays(3); setSnoozeModal({ task }); }}
              />
            ))}
          </div>
        </section>
      )}

      {/* Complete Modal */}
      {completeModal && (
        <Modal onClose={() => setCompleteModal(null)}>
          <h3 className="font-semibold text-gray-800 mb-1">Log completion</h3>
          <p className="text-sm text-gray-500 mb-4">{completeModal.task.routine?.name}</p>
          <label className="block text-sm font-medium text-gray-700 mb-1">Actual date</label>
          <input
            type="date"
            value={completionDate}
            max={format(today(), 'yyyy-MM-dd')}
            onChange={e => setCompletionDate(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setCompleteModal(null)}
              className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2"
            >
              Cancel
            </button>
            <button
              onClick={() => handleComplete(completeModal.task)}
              disabled={loading === completeModal.task.id}
              className="flex-1 bg-green-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
            >
              {loading === completeModal.task.id ? 'Saving…' : 'Mark complete'}
            </button>
          </div>
        </Modal>
      )}

      {/* Snooze Modal */}
      {snoozeModal && (
        <Modal onClose={() => setSnoozeModal(null)}>
          <h3 className="font-semibold text-gray-800 mb-1">Snooze</h3>
          <p className="text-sm text-gray-500 mb-4">{snoozeModal.task.routine?.name}</p>
          <label className="block text-sm font-medium text-gray-700 mb-1">Days to snooze</label>
          <input
            type="number"
            min={1}
            max={30}
            value={snoozeDays}
            onChange={e => setSnoozeDays(Number(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setSnoozeModal(null)}
              className="flex-1 border border-gray-200 text-gray-600 text-sm rounded-lg py-2"
            >
              Cancel
            </button>
            <button
              onClick={() => handleSnooze(snoozeModal.task)}
              disabled={loading === snoozeModal.task.id}
              className="flex-1 bg-amber-500 text-white text-sm font-medium rounded-lg py-2 disabled:opacity-50"
            >
              {loading === snoozeModal.task.id ? 'Saving…' : 'Snooze'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── TaskCard ─────────────────────────────────────────────────────────────────

interface CardProps {
  task: TaskWithRoutine;
  loading: boolean;
  onComplete: () => void;
  onSkip: () => void;
  onSnooze: () => void;
}

function TaskCard({ task, loading, onComplete, onSkip, onSnooze }: CardProps) {
  const status    = deriveStatus(task);
  const daysUntil = differenceInDays(parseISO(task.due_date_start), today());
  const isOverdue = differenceInDays(today(), parseISO(task.due_date_end)) > 0;

  const dateLabel = `${format(parseISO(task.due_date_start), 'MMM d')} – ${format(parseISO(task.due_date_end), 'MMM d')}`;

  let urgencyLabel: string;
  if (isOverdue) {
    urgencyLabel = `Overdue by ${differenceInDays(today(), parseISO(task.due_date_end))}d`;
  } else if (daysUntil <= 0) {
    urgencyLabel = 'Due now';
  } else {
    urgencyLabel = `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`;
  }

  const categoryColor = task.routine?.category?.color ?? '#6B7280';
  const isCountdown   = task.routine?.mode === 'countdown';

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="block bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:border-pink-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: categoryColor }}
          />
          <div className="min-w-0">
            <p className="font-medium text-gray-800 text-sm truncate">{task.routine?.name}</p>
            <p className="text-xs text-gray-400">
              {task.routine?.category?.name ?? ''}
              {isCountdown && task.routine?.target_label && (
                <span className="ml-1 text-purple-400">→ {task.routine.target_label}</span>
              )}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-xs text-gray-500">{dateLabel}</p>
          <p className={`text-xs font-medium ${isOverdue ? 'text-red-500' : status === 'due' ? 'text-amber-500' : 'text-gray-400'}`}>
            {urgencyLabel}
          </p>
        </div>
      </div>

      <div className="flex gap-2" onClick={e => e.preventDefault()}>
        <button
          onClick={onComplete}
          disabled={loading}
          className="flex-1 bg-green-50 hover:bg-green-100 text-green-700 text-xs font-medium rounded-lg py-1.5 transition-colors disabled:opacity-50"
        >
          Done
        </button>
        <button
          onClick={onSkip}
          disabled={loading}
          className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-500 text-xs font-medium rounded-lg py-1.5 transition-colors disabled:opacity-50"
        >
          Skip
        </button>
        <button
          onClick={onSnooze}
          disabled={loading}
          className="flex-1 bg-amber-50 hover:bg-amber-100 text-amber-600 text-xs font-medium rounded-lg py-1.5 transition-colors disabled:opacity-50"
        >
          Snooze
        </button>
      </div>
    </Link>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
