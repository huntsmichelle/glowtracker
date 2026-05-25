'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { detectRoutineConflicts } from '@/lib/conflictDetection';
import ConflictModal, { type ConflictWithJoins } from '@/components/ConflictModal';
import LinkRulesPanel from '@/components/LinkRulesPanel';
import RoutineTimeline from '@/components/RoutineTimeline';
import type { Routine, Task, ConflictResolution, DelayTarget } from '@/types';

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

type TimelineTask = {
  id: string;
  name: string;
  instances: {
    id: string;
    due_date_start: string;
    due_date_end: string;
    status: string;
    is_projected: boolean;
  }[];
};

interface Props {
  routine: Routine;
  tasks: Task[];
  pairs: PairWithTasks[];
  conflicts: ConflictWithJoins[];
  availableTasks: Task[];
  timelineTasks: TimelineTask[];
}

export default function RoutineDetailClient({
  routine,
  tasks,
  pairs,
  conflicts,
  availableTasks,
  timelineTasks,
}: Props) {
  const router = useRouter();

  const [activeConflict, setActiveConflict] = useState<ConflictWithJoins | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showLinkRules, setShowLinkRules] = useState(false);
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);

  const conflictInstanceIds = new Set(
    conflicts.flatMap(c => [c.instance_a_id, c.instance_b_id])
  );

  async function handleAddTask(taskId: string) {
    setAddingTaskId(taskId);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from('tasks').update({ routine_id: routine.id }).eq('id', taskId);

    const existingTaskIds = tasks.map(t => t.id);
    const pairInserts = existingTaskIds.map(existingId => {
      const [a, b] = [taskId, existingId].sort();
      return {
        routine_id: routine.id,
        user_id: user.id,
        task_a_id: a,
        task_b_id: b,
        default_resolution: 'ask' as ConflictResolution,
      };
    });

    if (pairInserts.length > 0) {
      await supabase.from('routine_task_pairs').insert(pairInserts);
    }

    await detectRoutineConflicts(routine.id);
    setAddingTaskId(null);
    setShowAddTask(false);
    router.refresh();
  }

  async function handleRemoveTask(taskId: string) {
    setRemovingTaskId(taskId);
    const supabase = createClient();

    await supabase.from('tasks').update({ routine_id: null }).eq('id', taskId);
    await supabase
      .from('routine_task_pairs')
      .delete()
      .eq('routine_id', routine.id)
      .or(`task_a_id.eq.${taskId},task_b_id.eq.${taskId}`);

    setRemovingTaskId(null);
    router.refresh();
  }

  async function handleConflictResolved() {
    setActiveConflict(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: routine.color }} />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-800 truncate">{routine.name}</h1>
            {routine.description && (
              <p className="text-sm text-gray-400 mt-0.5">{routine.description}</p>
            )}
          </div>
        </div>
        <Link
          href={`/routines/${routine.id}/edit`}
          className="flex-shrink-0 text-sm text-gray-500 hover:text-gray-700 ml-3"
        >
          Edit
        </Link>
      </div>

      {/* Pending conflicts */}
      {conflicts.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-red-400 uppercase tracking-wide mb-2">
            Conflicts ({conflicts.length})
          </h2>
          <div className="space-y-2">
            {conflicts.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-red-700 truncate">
                    {c.pair.task_a.name} <span className="text-red-400">×</span> {c.pair.task_b.name}
                  </p>
                  <p className="text-xs text-red-400 mt-0.5">Overlap on {c.conflict_date}</p>
                </div>
                <button
                  onClick={() => setActiveConflict(c)}
                  className="text-xs font-medium bg-red-500 text-white rounded-lg px-3 py-1.5 flex-shrink-0 ml-3"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Timeline */}
      {timelineTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Next 90 days
          </h2>
          <RoutineTimeline
            tasks={timelineTasks}
            conflictInstanceIds={conflictInstanceIds}
            color={routine.color}
          />
        </section>
      )}

      {/* Tasks */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Tasks ({tasks.length})
          </h2>
          <button
            onClick={() => setShowAddTask(v => !v)}
            className="text-xs font-medium text-pink-500"
          >
            {showAddTask ? 'Cancel' : '+ Add Task'}
          </button>
        </div>

        {showAddTask && (
          <div className="mb-3 bg-gray-50 rounded-xl p-3 space-y-1">
            {availableTasks.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">
                No unassigned tasks.{' '}
                <Link href="/tasks/new" className="text-pink-500">Create one first.</Link>
              </p>
            ) : (
              availableTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleAddTask(t.id)}
                  disabled={addingTaskId === t.id}
                  className="w-full text-left text-sm text-gray-700 px-3 py-2 rounded-lg hover:bg-white border border-transparent hover:border-gray-200 transition-colors disabled:opacity-50"
                >
                  {addingTaskId === t.id ? 'Adding…' : t.name}
                </button>
              ))
            )}
          </div>
        )}

        {tasks.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No tasks in this routine yet.</p>
        ) : (
          <div className="space-y-2">
            {tasks.map(t => (
              <div
                key={t.id}
                className="flex items-center justify-between bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3"
              >
                <Link href={`/tasks/${t.id}`} className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: (t as Task & { category?: { color: string } }).category?.color ?? '#6B7280' }}
                  />
                  <span className="text-sm font-medium text-gray-800 truncate">{t.name}</span>
                </Link>
                <button
                  onClick={() => handleRemoveTask(t.id)}
                  disabled={removingTaskId === t.id}
                  className="text-xs text-gray-400 hover:text-red-500 transition-colors flex-shrink-0 ml-3 disabled:opacity-50"
                >
                  {removingTaskId === t.id ? '…' : 'Remove'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Conflict rules */}
      {tasks.length >= 2 && (
        <section>
          <button
            onClick={() => setShowLinkRules(v => !v)}
            className="flex items-center justify-between w-full text-left mb-2"
          >
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Conflict Rules
            </span>
            <span className="text-xs text-gray-400">{showLinkRules ? 'hide' : 'show'}</span>
          </button>
          {showLinkRules && <LinkRulesPanel pairs={pairs} />}
        </section>
      )}

      {activeConflict && (
        <ConflictModal
          conflict={activeConflict}
          onResolved={handleConflictResolved}
          onClose={() => setActiveConflict(null)}
        />
      )}
    </div>
  );
}
