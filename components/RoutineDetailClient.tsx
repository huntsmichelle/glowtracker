'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { detectRoutineConflicts } from '@/lib/conflictDetection';
import ConflictModal, { type ConflictWithJoins } from '@/components/ConflictModal';
import LinkRulesPanel from '@/components/LinkRulesPanel';
import RoutineTimeline from '@/components/RoutineTimeline';
import InlineTaskForm from '@/components/InlineTaskForm';
import type { Routine, Task, Category, ConflictIntent, ConflictResolution, DelayTarget, AdjustDirection, SkipTarget, NoConflictOrder } from '@/types';
import { getCategoryColor } from '@/lib/categoryColors';

export type PairWithTasks = {
  id: string;
  routine_id: string;
  user_id: string;
  task_a_id: string;
  task_b_id: string;
  default_resolution: ConflictResolution;
  default_delay_days: number | null;
  delay_target: DelayTarget | null;
  adjust_direction: AdjustDirection | null;
  adjust_snap_back: boolean | null;
  skip_target: SkipTarget | null;
  no_conflict_order: NoConflictOrder | null;
  no_conflict_time_a: string | null;
  no_conflict_time_b: string | null;
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

type SoftHint = {
  text: string;
  pairKey?: string; // taskAId__taskBId for "Set a preference" link
};

type AddTaskTab = 'existing' | 'new';

interface Props {
  routine: Routine;
  tasks: Task[];
  pairs: PairWithTasks[];
  conflicts: ConflictWithJoins[];
  availableTasks: Task[];
  timelineTasks: TimelineTask[];
  categories: Category[];
  userId: string;
  tasksWithNoInstances?: string[];
  setupBanner?: string | null;
}

export default function RoutineDetailClient({
  routine,
  tasks,
  pairs,
  conflicts,
  availableTasks,
  timelineTasks,
  categories,
  userId,
  tasksWithNoInstances = [],
  setupBanner = null,
}: Props) {
  const router = useRouter();

  const [conflictIntent, setConflictIntent] = useState<ConflictIntent>(routine.conflict_intent ?? 'unset');
  const [settingIntent, setSettingIntent] = useState(false);
  const [activeConflict, setActiveConflict] = useState<ConflictWithJoins | null>(null);
  const [localConflicts, setLocalConflicts] = useState<ConflictWithJoins[]>(conflicts);
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskTab, setAddTaskTab] = useState<AddTaskTab>('existing');
  const [showLinkRules, setShowLinkRules] = useState(false);
  const [showConfiguredPairs, setShowConfiguredPairs] = useState(false);
  const [removingTaskId, setRemovingTaskId] = useState<string | null>(null);
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);
  const [suggestionBanner, setSuggestionBanner] = useState<string | null>(null);
  const [softHints, setSoftHints] = useState<SoftHint[]>([]);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [showDeleteRoutine, setShowDeleteRoutine] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'detach' | 'delete_all'>('detach');
  const [deleting, setDeleting] = useState(false);
  const [slideOverTask, setSlideOverTask] = useState<Task | null>(null);

  const noInstanceSet = new Set(tasksWithNoInstances);

  useEffect(() => { setLocalConflicts(conflicts); }, [conflicts]);

  async function handleDeleteRoutine() {
    setDeleting(true);
    const supabase = createClient();
    if (deleteMode === 'delete_all') {
      await supabase.from('tasks').delete().eq('routine_id', routine.id);
    } else {
      await supabase.from('tasks').update({ routine_id: null }).eq('routine_id', routine.id);
    }
    await supabase.from('routines').delete().eq('id', routine.id);
    router.push('/routines');
    router.refresh();
  }

  async function fetchSoftHints(taskNames: string[], currentPairs: PairWithTasks[]) {
    const supabase = createClient();
    const { data: rels } = await supabase
      .from('common_task_relationships')
      .select('*')
      .eq('relationship_type', 'conflict');
    if (!rels?.length) return;

    const lower = (s: string) => s.toLowerCase();
    const hints: SoftHint[] = [];

    for (const rel of rels) {
      if (hints.length >= 3) break;
      const matchedA = taskNames.find(n => lower(n).includes(lower(rel.task_a_name)) || lower(rel.task_a_name).includes(lower(n)));
      const matchedB = taskNames.find(n => lower(n).includes(lower(rel.task_b_name)) || lower(rel.task_b_name).includes(lower(n)));
      if (!matchedA || !matchedB) continue;

      // Find the pair key for "Set a preference" link
      const matchedTaskA = tasks.find(t => lower(t.name).includes(lower(rel.task_a_name)) || lower(rel.task_a_name).includes(lower(t.name)));
      const matchedTaskB = tasks.find(t => lower(t.name).includes(lower(rel.task_b_name)) || lower(rel.task_b_name).includes(lower(t.name)));
      const pair = matchedTaskA && matchedTaskB
        ? currentPairs.find(p =>
            (p.task_a_id === matchedTaskA.id && p.task_b_id === matchedTaskB.id) ||
            (p.task_a_id === matchedTaskB.id && p.task_b_id === matchedTaskA.id)
          )
        : undefined;

      hints.push({
        text: rel.suggestion_text ?? `${matchedA} and ${matchedB} sometimes overlap — you may want to set a preference.`,
        pairKey: pair?.id,
      });
    }

    setSoftHints(hints);
  }

  async function checkAndSetBanner(taskNames: string[]) {
    if (taskNames.length < 2) return;
    const supabase = createClient();
    const { data: rels } = await supabase.from('common_task_relationships').select('*');
    if (!rels?.length) return;
    for (const rel of rels) {
      const lower = (s: string) => s.toLowerCase();
      const matchA = taskNames.some(n => lower(n).includes(lower(rel.task_a_name)) || lower(rel.task_a_name).includes(lower(n)));
      const matchB = taskNames.some(n => lower(n).includes(lower(rel.task_b_name)) || lower(rel.task_b_name).includes(lower(n)));
      if (matchA && matchB) {
        setSuggestionBanner(rel.suggestion_text ?? 'These rituals may overlap — consider setting a conflict rule.');
        return;
      }
    }
  }

  async function handleSetIntent(intent: 'independent' | 'managed') {
    setSettingIntent(true);
    const supabase = createClient();
    await supabase.from('routines').update({ conflict_intent: intent }).eq('id', routine.id);
    setConflictIntent(intent);

    if (intent === 'independent') {
      // Resolve all pending conflicts silently
      await supabase
        .from('routine_conflicts')
        .update({ status: 'resolved', resolution: 'no_conflict', resolved_at: new Date().toISOString() })
        .eq('routine_id', routine.id)
        .eq('status', 'pending');
      setLocalConflicts([]);
      // Fetch soft hints for tasks that may still have natural overlaps
      await fetchSoftHints(tasks.map(t => t.name), pairs);
    } else {
      setSoftHints([]);
    }

    setSettingIntent(false);
    router.refresh();
  }

  async function refreshConflicts() {
    const supabase = createClient();
    const { data } = await supabase
      .from('routine_conflicts')
      .select(`
        *,
        pair:routine_task_pairs(
          id,
          default_resolution,
          task_a:tasks(id, name),
          task_b:tasks(id, name)
        ),
        instance_a:instances(id, due_date_start, due_date_end),
        instance_b:instances(id, due_date_start, due_date_end)
      `)
      .eq('routine_id', routine.id)
      .eq('status', 'pending')
      .order('conflict_date');
    if (data) setLocalConflicts(data as ConflictWithJoins[]);
  }

  const conflictInstanceIds = new Set(
    localConflicts.flatMap(c => [c.instance_a_id, c.instance_b_id])
  );

  async function handleAddExistingTask(taskId: string) {
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

    const newTask = availableTasks.find(t => t.id === taskId);
    if (newTask) {
      await checkAndSetBanner([...tasks.map(t => t.name), newTask.name]);
    }

    setAddingTaskId(null);
    setShowAddTask(false);
    router.refresh();
  }

  async function handleNewTaskCreated() {
    const supabase = createClient();
    const { data: currentTasks } = await supabase
      .from('tasks').select('name').eq('routine_id', routine.id);
    if (currentTasks && currentTasks.length >= 2) {
      await checkAndSetBanner(currentTasks.map(t => t.name));
    }
    setShowAddTask(false);
    setAddTaskTab('existing');
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

  const resolutionLabel: Record<ConflictResolution, string> = {
    no_conflict: 'No Overlap',
    ask: 'Ask',
    auto_adjust: 'Auto-Adjust',
    skip_one: 'Skip One',
  };

  const hasMultipleTasks = tasks.length >= 2;
  const showPendingConflicts = conflictIntent !== 'independent' && localConflicts.length > 0;

  const isRollingSetup = setupBanner === 'rolling' && !bannerDismissed && noInstanceSet.size > 0;
  const isCountdownSetup = setupBanner && setupBanner !== 'rolling' && !bannerDismissed;

  return (
    <div className="space-y-6">
      {/* Template setup banner */}
      {isCountdownSetup && (
        <div style={{ backgroundColor: '#f0f5f1', border: '1px solid #8ea394', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: '#6b665e', lineHeight: 1.5 }}>{setupBanner}</p>
          <button type="button" onClick={() => setBannerDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a297', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '2px' }}>✕</button>
        </div>
      )}
      {isRollingSetup && (
        <div style={{ backgroundColor: '#f6f1e6', border: '1px solid #cdc6b6', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <p style={{ fontSize: '13px', color: '#6b665e', lineHeight: 1.5 }}>Set a start date for each ritual to begin scheduling.</p>
          <button type="button" onClick={() => setBannerDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a297', fontSize: '16px', lineHeight: 1, flexShrink: 0, padding: '2px' }}>✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: routine.color }} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl text-charcoal truncate">{routine.name}</h1>
            {routine.description && (
              <p className="text-sm text-warm-mid mt-0.5">{routine.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 ml-3 flex-shrink-0">
          <Link href={`/routines/${routine.id}/edit`} className="text-sm text-warm-mid hover:text-charcoal">Edit</Link>
          <button
            type="button"
            onClick={() => setShowDeleteRoutine(true)}
            className="text-sm text-warm-light hover:text-charcoal"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Pending overlaps — hidden when intent = independent */}
      {showPendingConflicts && (
        <section>
          <p className="label-overline mb-2">Overlaps ({localConflicts.length})</p>
          <div className="space-y-2">
            {localConflicts.map(c => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-dust-lt border border-dust rounded-lg px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-charcoal truncate">
                    {c.pair.task_a.name} <span className="text-warm-light">×</span> {c.pair.task_b.name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-warm-mid">Overlap on {c.conflict_date}</p>
                    <span className="text-xs bg-stone text-warm-mid rounded-pill px-1.5 py-0.5">
                      {resolutionLabel[c.pair.default_resolution] ?? 'Ask'}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveConflict(c)}
                  className="text-xs font-medium bg-charcoal text-cream rounded-pill px-3 py-1.5 flex-shrink-0 ml-3 hover:bg-charcoal/90"
                >
                  Resolve
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Configured rules summary — only in managed mode */}
      {conflictIntent === 'managed' && (() => {
        const pendingPairIds = new Set(localConflicts.map(c => c.pair_id));
        const configuredPairs = pairs.filter(
          p => p.default_resolution !== 'ask' && !pendingPairIds.has(p.id)
        );
        if (configuredPairs.length === 0) return null;
        return (
          <section>
            <button
              onClick={() => setShowConfiguredPairs(v => !v)}
              className="flex items-center justify-between w-full text-left"
            >
              <span className="label-overline">Configured rules ({configuredPairs.length})</span>
              <span className="text-xs text-warm-light">{showConfiguredPairs ? 'hide' : 'show'}</span>
            </button>
            {showConfiguredPairs && (
              <div className="space-y-2 mt-2">
                {configuredPairs.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-stone border border-glow-border rounded-lg px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm text-charcoal truncate">
                        {p.task_a.name} <span className="text-warm-light">vs</span> {p.task_b.name}
                      </p>
                      <span className="text-xs bg-sage-lt text-charcoal rounded-pill px-1.5 py-0.5 mt-0.5 inline-block">
                        {resolutionLabel[p.default_resolution]}
                      </span>
                    </div>
                    <button
                      onClick={() => setShowLinkRules(true)}
                      className="text-xs text-warm-light hover:text-charcoal flex-shrink-0 ml-3"
                    >
                      Edit rule
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })()}

      {/* Relationship suggestion banner — only when intent is managed or unset */}
      {suggestionBanner && conflictIntent !== 'independent' && (
        <div className="flex items-start justify-between bg-dust-lt border border-dust rounded-lg px-4 py-3 gap-3">
          <p className="text-sm text-charcoal flex-1">{suggestionBanner}</p>
          <div className="flex gap-2 flex-shrink-0">
            <button
              onClick={() => { setShowLinkRules(true); setSuggestionBanner(null); }}
              className="text-xs font-medium bg-charcoal text-cream rounded-pill px-3 py-1.5 hover:bg-charcoal/90"
            >
              Set overlap rule
            </button>
            <button
              onClick={() => setSuggestionBanner(null)}
              className="text-xs text-warm-mid hover:text-charcoal"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Timeline */}
      {timelineTasks.length > 0 && (
        <section>
          <p className="label-overline mb-3">Next 90 days</p>
          <RoutineTimeline
            tasks={timelineTasks}
            conflictInstanceIds={conflictInstanceIds}
            color={routine.color}
          />
        </section>
      )}

      {/* Rituals */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="label-overline">Rituals ({tasks.length})</p>
          <button
            onClick={() => { setShowAddTask(v => !v); setAddTaskTab('existing'); }}
            className="text-xs font-medium text-charcoal hover:text-warm-mid"
          >
            {showAddTask ? 'Cancel' : '+ Add Ritual'}
          </button>
        </div>

        {showAddTask && (
          <div className="mb-4 space-y-3">
            <div className="flex rounded-lg border border-glow-border overflow-hidden">
              {(['existing', 'new'] as AddTaskTab[]).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setAddTaskTab(tab)}
                  className={`flex-1 text-xs font-medium py-2 transition-colors ${
                    addTaskTab === tab
                      ? 'bg-charcoal text-cream'
                      : 'bg-stone text-warm-mid hover:bg-taupe'
                  }`}
                >
                  {tab === 'existing' ? 'Add existing ritual' : '+ Create new ritual'}
                </button>
              ))}
            </div>

            {addTaskTab === 'existing' ? (
              <div className="bg-taupe rounded-lg p-3 space-y-1">
                {availableTasks.length === 0 ? (
                  <p className="text-xs text-warm-light text-center py-2">
                    No unassigned rituals — switch to &ldquo;Create new ritual&rdquo; above.
                  </p>
                ) : (
                  availableTasks.map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleAddExistingTask(t.id)}
                      disabled={addingTaskId === t.id}
                      className="w-full text-left text-sm text-charcoal px-3 py-2 rounded-md hover:bg-stone border border-transparent hover:border-glow-border transition-colors disabled:opacity-50"
                    >
                      {addingTaskId === t.id ? 'Adding…' : t.name}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <InlineTaskForm
                routineId={routine.id}
                existingTaskIds={tasks.map(t => t.id)}
                categories={categories}
                userId={userId}
                onCreated={handleNewTaskCreated}
                onCancel={() => setAddTaskTab('existing')}
              />
            )}
          </div>
        )}

        {tasks.length === 0 ? (
          <p className="text-sm text-warm-light text-center py-4">No rituals in this routine yet.</p>
        ) : (
          <div style={{ borderTop: '1px solid #cdc6b6' }}>
            {tasks.map(t => {
              const needsSetup = noInstanceSet.has(t.id);
              const catName = (t as Task & { category?: { name: string } }).category?.name ?? '';
              const intervalLabel = t.interval_min_days === t.interval_max_days
                ? `every ${t.interval_min_days} days`
                : `every ${t.interval_min_days}–${t.interval_max_days} days`;
              return (
                <div
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #cdc6b6', gap: '12px' }}
                >
                  <button
                    type="button"
                    onClick={() => setSlideOverTask(t)}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, backgroundColor: getCategoryColor(catName).dot }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: '14px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</p>
                      <p style={{ fontSize: '11px', color: '#a8a297', marginTop: '1px' }}>
                        {catName ? `${catName} · ` : ''}{intervalLabel}
                      </p>
                    </div>
                  </button>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {needsSetup && (
                      <Link
                        href={`/tasks/${t.id}/edit`}
                        style={{
                          fontSize: '11px',
                          fontWeight: 500,
                          color: '#2b2823',
                          border: '1px solid #cdc6b6',
                          backgroundColor: 'transparent',
                          borderRadius: '100px',
                          padding: '3px 10px',
                          textDecoration: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Set start date
                      </Link>
                    )}
                    <button
                      onClick={() => handleRemoveTask(t.id)}
                      disabled={removingTaskId === t.id}
                      style={{ fontSize: '11px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: removingTaskId === t.id ? 0.4 : 1 }}
                    >
                      {removingTaskId === t.id ? '…' : 'Remove'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Overlap preferences — intent selector or rules panel */}
      {hasMultipleTasks && (
        <section>
          <p className="label-overline mb-3">Overlap Preferences</p>

          {/* Intent selector — only when unset */}
          {conflictIntent === 'unset' && (
            <div className="space-y-2">
              <p className="text-xs text-warm-mid mb-3">
                These rituals may land on the same date. How would you like to handle that?
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  disabled={settingIntent}
                  onClick={() => handleSetIntent('independent')}
                  className="text-left bg-stone border border-glow-border rounded-lg px-4 py-3 hover:border-warm-light transition-colors disabled:opacity-50"
                >
                  <p className="text-sm font-medium text-charcoal mb-0.5">Work independently</p>
                  <p className="text-xs text-warm-mid leading-relaxed">
                    These rituals follow their own schedules. No overlap management needed.
                  </p>
                </button>
                <button
                  type="button"
                  disabled={settingIntent}
                  onClick={() => handleSetIntent('managed')}
                  className="text-left bg-stone border border-glow-border rounded-lg px-4 py-3 hover:border-warm-light transition-colors disabled:opacity-50"
                >
                  <p className="text-sm font-medium text-charcoal mb-0.5">Set overlap preferences</p>
                  <p className="text-xs text-warm-mid leading-relaxed">
                    Configure what happens when these rituals land on the same date.
                  </p>
                </button>
              </div>
              {settingIntent && (
                <p className="text-xs text-warm-light text-center pt-1">Saving…</p>
              )}
            </div>
          )}

          {/* Soft hints — only when intent = independent */}
          {conflictIntent === 'independent' && softHints.length > 0 && (
            <div className="space-y-2 mb-4">
              {softHints.map((hint, i) => (
                <div key={i} className="flex items-start justify-between gap-3 px-4 py-3 bg-taupe rounded-lg border border-glow-border">
                  <p className="text-xs text-warm-mid flex-1 leading-relaxed">{hint.text}</p>
                  {hint.pairKey && (
                    <button
                      onClick={() => { setConflictIntent('managed'); setShowLinkRules(true); }}
                      className="text-xs text-warm-light hover:text-charcoal flex-shrink-0 underline underline-offset-2"
                    >
                      Set a preference
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Rules panel — only when managed */}
          {conflictIntent === 'managed' && (
            <div className="space-y-3">
              <button
                onClick={() => setShowLinkRules(v => !v)}
                className="flex items-center justify-between w-full text-left"
              >
                <span className="text-sm text-warm-mid">Overlap Rules</span>
                <span className="text-xs text-warm-light">{showLinkRules ? 'hide' : 'show'}</span>
              </button>
              {showLinkRules && (
                <LinkRulesPanel
                  key={tasks.map(t => t.id).sort().join(',')}
                  routineId={routine.id}
                  userId={userId}
                  onRulesSaved={() => { refreshConflicts(); router.refresh(); }}
                />
              )}
            </div>
          )}

          {/* Change-of-intent ghost links */}
          {conflictIntent !== 'unset' && (
            <div className="pt-4 border-t border-glow-border mt-4">
              {conflictIntent === 'independent' ? (
                <button
                  type="button"
                  disabled={settingIntent}
                  onClick={() => handleSetIntent('managed')}
                  className="text-xs text-warm-light hover:text-charcoal underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Manage overlap preferences
                </button>
              ) : (
                <button
                  type="button"
                  disabled={settingIntent}
                  onClick={() => handleSetIntent('independent')}
                  className="text-xs text-warm-light hover:text-charcoal underline-offset-2 hover:underline disabled:opacity-50"
                >
                  Mark as independent — no overlaps expected
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {activeConflict && (
        <ConflictModal
          conflict={activeConflict}
          onResolved={handleConflictResolved}
          onClose={() => setActiveConflict(null)}
        />
      )}

      {/* Task slide-over panel */}
      {slideOverTask && (() => {
        const t = slideOverTask;
        const catName = (t as Task & { category?: { name: string } }).category?.name ?? '';
        const catColor = getCategoryColor(catName).dot;
        const intervalLabel = t.interval_min_days === t.interval_max_days
          ? `Every ${t.interval_min_days} days`
          : `Every ${t.interval_min_days}–${t.interval_max_days} days`;
        return (
          <>
            {/* Backdrop */}
            <div
              style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(43,40,35,0.20)', zIndex: 40 }}
              onClick={() => setSlideOverTask(null)}
            />
            {/* Panel */}
            <div style={{
              position: 'fixed', top: 0, right: 0, bottom: 0, width: '320px',
              backgroundColor: '#f6f1e6', borderLeft: '1px solid #cdc6b6',
              boxShadow: '-4px 0 24px rgba(43,40,35,0.10)', zIndex: 41,
              display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}>
              {/* Panel header */}
              <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #cdc6b6', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: catColor, flexShrink: 0 }} />
                  <p style={{ fontSize: '16px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSlideOverTask(null)}
                  style={{ background: 'none', border: 'none', fontSize: '20px', color: '#a8a297', cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}
                >
                  ×
                </button>
              </div>

              {/* Panel body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
                {catName && (
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '3px' }}>Category</p>
                    <p style={{ fontSize: '13px', color: '#2b2823' }}>{catName}</p>
                  </div>
                )}
                <div>
                  <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '3px' }}>Frequency</p>
                  <p style={{ fontSize: '13px', color: '#2b2823' }}>{intervalLabel}</p>
                </div>
                {t.description && (
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '3px' }}>Notes</p>
                    <p style={{ fontSize: '13px', color: '#6b665e', lineHeight: 1.5 }}>{t.description}</p>
                  </div>
                )}
                {t.default_cost != null && (
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a8a297', marginBottom: '3px' }}>Default cost</p>
                    <p style={{ fontSize: '13px', color: '#2b2823' }}>${t.default_cost.toFixed(2)}</p>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid #cdc6b6' }}>
                  <Link
                    href={`/tasks/${t.id}/edit`}
                    style={{ display: 'block', textAlign: 'center', backgroundColor: '#2b2823', color: '#efe9dd', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '9px 20px', textDecoration: 'none' }}
                  >
                    Edit ritual
                  </Link>
                  <Link
                    href={`/tasks/${t.id}`}
                    style={{ display: 'block', textAlign: 'center', border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', borderRadius: '100px', padding: '9px 20px', textDecoration: 'none' }}
                  >
                    View detail
                  </Link>
                  <button
                    type="button"
                    onClick={() => { handleRemoveTask(t.id); setSlideOverTask(null); }}
                    disabled={removingTaskId === t.id}
                    style={{ background: 'none', border: 'none', fontSize: '12px', color: '#a8a297', cursor: 'pointer', padding: '6px 0' }}
                  >
                    Remove from routine
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* Delete routine modal */}
      {showDeleteRoutine && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(43,40,35,0.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={e => { if (e.target === e.currentTarget) setShowDeleteRoutine(false); }}
        >
          <div style={{ backgroundColor: '#f6f1e6', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 32px rgba(43,40,35,0.14)' }}>
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '20px', color: '#2b2823', marginBottom: '6px' }}>
              Delete &ldquo;{routine.name}&rdquo;?
            </p>
            <p style={{ fontSize: '13px', color: '#6b665e', marginBottom: '20px' }}>
              Choose what happens to its rituals.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input type="radio" name="rdm" checked={deleteMode === 'detach'} onChange={() => setDeleteMode('detach')} style={{ marginTop: '3px', accentColor: '#2b2823' }} />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: '#2b2823' }}>Remove from routine only</p>
                  <p style={{ fontSize: '12px', color: '#6b665e' }}>Keep all rituals as standalone.</p>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input type="radio" name="rdm" checked={deleteMode === 'delete_all'} onChange={() => setDeleteMode('delete_all')} style={{ marginTop: '3px', accentColor: '#2b2823' }} />
                <div>
                  <p style={{ fontSize: '13px', fontWeight: 500, color: '#2b2823' }}>Delete routine and all rituals</p>
                  <p style={{ fontSize: '12px', color: '#c08a6e' }}>All {tasks.length} ritual{tasks.length !== 1 ? 's' : ''} will be permanently deleted.</p>
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="button" onClick={() => setShowDeleteRoutine(false)} style={{ flex: 1, border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '8px 16px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={handleDeleteRoutine} disabled={deleting} style={{ flex: 1, backgroundColor: '#c08a6e', color: '#fff', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '8px 16px', cursor: 'pointer', border: 'none', opacity: deleting ? 0.6 : 1 }}>
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
