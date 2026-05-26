'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { detectRoutineConflicts } from '@/lib/conflictDetection';
import InlineTaskForm from '@/components/InlineTaskForm';
import type { Category, Task, ConflictResolution } from '@/types';

const PRESET_COLORS = [
  '#8A9E8C', '#A89880', '#6B6660', '#2C2A26',
  '#C4D4C5', '#D4C8B8', '#9E9890', '#E5DFD4',
];

type Phase = 'form' | 'tasks';
type TaskTab = 'existing' | 'new';

interface Props {
  categories: Category[];
  userId: string;
}

export default function NewRoutineClient({ categories, userId }: Props) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>('form');
  const [taskTab, setTaskTab] = useState<TaskTab>('existing');

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [routineId, setRoutineId] = useState<string | null>(null);
  const [routineTaskIds, setRoutineTaskIds] = useState<string[]>([]);
  const [addedTasks, setAddedTasks] = useState<Task[]>([]);
  const [availableTasks, setAvailableTasks] = useState<Task[]>([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);

  async function loadAvailableTasks() {
    setLoadingAvailable(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('tasks')
      .select('id, name, category_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .is('routine_id', null)
      .order('name');
    setAvailableTasks((data ?? []) as Task[]);
    setLoadingAvailable(false);
  }

  async function handleCreateRoutine(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setFormError('Name is required'); return; }

    setSaving(true);
    setFormError('');
    const supabase = createClient();

    const { data, error: err } = await supabase
      .from('routines')
      .insert({
        user_id: userId,
        name: name.trim(),
        description: description.trim() || null,
        color,
        is_template: false,
        is_public: false,
      })
      .select('id')
      .single();

    if (err) { setFormError(err.message); setSaving(false); return; }

    setRoutineId(data.id);
    setPhase('tasks');
    setSaving(false);
    await loadAvailableTasks();
  }

  async function handleAddExistingTask(taskId: string) {
    if (!routineId) return;
    setAddingTaskId(taskId);
    const supabase = createClient();

    await supabase.from('tasks').update({ routine_id: routineId }).eq('id', taskId);

    if (routineTaskIds.length > 0) {
      const pairInserts = routineTaskIds.map(existingId => {
        const [a, b] = [taskId, existingId].sort();
        return {
          routine_id: routineId,
          user_id: userId,
          task_a_id: a,
          task_b_id: b,
          default_resolution: 'ask' as ConflictResolution,
        };
      });
      await supabase.from('routine_task_pairs').insert(pairInserts);
    }

    await detectRoutineConflicts(routineId);

    const added = availableTasks.find(t => t.id === taskId);
    if (added) {
      setAddedTasks(prev => [...prev, added]);
      setRoutineTaskIds(prev => [...prev, taskId]);
      setAvailableTasks(prev => prev.filter(t => t.id !== taskId));
    }
    setAddingTaskId(null);
  }

  function handleTaskCreated(task: Task) {
    setAddedTasks(prev => [...prev, task]);
    setRoutineTaskIds(prev => [...prev, task.id]);
    setTaskTab('existing');
  }

  if (phase === 'tasks') {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <h1 className="font-display text-2xl text-charcoal">{name}</h1>
        </div>

        <p className="text-sm text-warm-mid">
          Routine created. Add rituals now, or skip to the detail page and add them there.
        </p>

        {addedTasks.length > 0 && (
          <div className="space-y-2">
            <p className="label-overline">Added ({addedTasks.length})</p>
            {addedTasks.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-stone border border-glow-border rounded-lg px-3 py-2.5 text-sm text-charcoal">
                <span className="w-2 h-2 rounded-full bg-sage flex-shrink-0" />
                {t.name}
              </div>
            ))}
          </div>
        )}

        <div className="flex rounded-lg border border-glow-border overflow-hidden">
          {(['existing', 'new'] as TaskTab[]).map(tab => (
            <button
              key={tab}
              type="button"
              onClick={() => setTaskTab(tab)}
              className={`flex-1 text-xs font-medium py-2.5 transition-colors ${
                taskTab === tab ? 'bg-charcoal text-cream' : 'bg-stone text-warm-mid hover:bg-taupe'
              }`}
            >
              {tab === 'existing' ? 'Add existing ritual' : '+ Create new ritual'}
            </button>
          ))}
        </div>

        {taskTab === 'existing' ? (
          <div className="space-y-1.5">
            {loadingAvailable ? (
              <p className="text-sm text-warm-light text-center py-4">Loading…</p>
            ) : availableTasks.length === 0 ? (
              <p className="text-sm text-warm-light text-center py-4">
                No unassigned rituals — switch to &ldquo;Create new ritual&rdquo; to add one.
              </p>
            ) : (
              availableTasks.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleAddExistingTask(t.id)}
                  disabled={addingTaskId === t.id}
                  className="w-full text-left text-sm text-charcoal px-3 py-2.5 rounded-lg bg-stone border border-glow-border hover:bg-taupe transition-colors disabled:opacity-50"
                >
                  {addingTaskId === t.id ? 'Adding…' : t.name}
                </button>
              ))
            )}
          </div>
        ) : (
          <InlineTaskForm
            routineId={routineId!}
            existingTaskIds={routineTaskIds}
            categories={categories}
            userId={userId}
            onCreated={handleTaskCreated}
            onCancel={() => setTaskTab('existing')}
          />
        )}

        <button
          onClick={() => router.push(`/routines/${routineId}`)}
          className="w-full bg-charcoal text-cream text-sm font-medium rounded-pill py-3 hover:bg-charcoal/90"
        >
          Done — go to routine
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/routines" className="text-warm-light hover:text-charcoal text-sm">Routines</Link>
        <span className="text-warm-light">/</span>
        <span className="text-sm text-warm-mid">New Routine</span>
      </div>

      <h1 className="font-display text-3xl text-charcoal">New Routine</h1>

      <form onSubmit={handleCreateRoutine} className="space-y-5">
        <div>
          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Skincare Morning Routine"
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">
            Description <span className="normal-case font-normal tracking-normal">(optional)</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={2}
            placeholder="What is this routine for?"
            className="w-full resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-warm-mid mb-2 uppercase tracking-wide">Color</label>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className="w-8 h-8 rounded-full transition-transform border border-glow-border"
                style={{
                  backgroundColor: c,
                  outline: color === c ? `3px solid ${c}` : 'none',
                  outlineOffset: '2px',
                  transform: color === c ? 'scale(1.15)' : 'scale(1)',
                }}
              />
            ))}
          </div>
        </div>

        {formError && (
          <p className="text-sm text-charcoal bg-dust-lt border border-dust rounded-md px-3 py-2">{formError}</p>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-charcoal text-cream text-sm font-medium rounded-pill px-5 py-2.5 disabled:opacity-50 hover:bg-charcoal/90"
          >
            {saving ? 'Creating…' : 'Create Routine'}
          </button>
          <Link href="/routines" className="text-sm text-warm-mid hover:text-charcoal px-4 py-2.5">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
