'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { generateCountdownInstances, createFirstInstance } from '@/lib/instanceEngine';
import type { Task } from '@/types';

type TemplateTask = Pick<Task, 'id' | 'name' | 'category_id' | 'description' | 'interval_min_days' | 'interval_max_days' | 'frequency_type' | 'prep_notes' | 'reminder_notes'>;

interface Props {
  templateId: string;
  templateName: string;
  templateTaskCount: number;
  templateTasks: TemplateTask[];
  userId: string;
}

type Step = 1 | 2 | 3;
type ScheduleType = 'rolling' | 'countdown' | null;

export default function UseTemplateFlow({
  templateId,
  templateName,
  templateTaskCount,
  templateTasks,
  userId,
}: Props) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [routineName, setRoutineName] = useState(templateName);
  const [scheduleType, setScheduleType] = useState<ScheduleType>(null);
  const [targetDate, setTargetDate] = useState('');
  const [eventName, setEventName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  // Auto-select text in name input on mount
  useEffect(() => {
    nameRef.current?.select();
  }, []);

  const taskCount = templateTaskCount || templateTasks.length;
  const today = format(new Date(), 'yyyy-MM-dd');

  async function handleCreate() {
    if (!routineName.trim()) { setError('Please enter a routine name.'); return; }
    if (scheduleType === 'countdown' && !targetDate) { setError('Please select a target date.'); return; }

    setCreating(true);
    setError('');

    const supabase = createClient();

    // 1. Create the routine
    const { data: newRoutine, error: routineErr } = await supabase
      .from('routines')
      .insert({
        user_id: userId,
        name: routineName.trim(),
        is_template: false,
        is_system_template: false,
        template_source_id: templateId,
        conflict_intent: 'unset',
      })
      .select('id, name, color, user_id, description, category_id, is_template, is_public, is_system_template, template_source_id, template_category, template_description, template_task_count, conflict_intent, created_at, updated_at')
      .single();

    if (routineErr || !newRoutine) {
      setError(routineErr?.message ?? 'Failed to create routine.');
      setCreating(false);
      return;
    }

    // 2. Copy template tasks
    const isCountdown = scheduleType === 'countdown';
    const taskInserts = templateTasks.map(t => ({
      user_id: userId,
      routine_id: newRoutine.id,
      name: t.name,
      description: t.description ?? null,
      category_id: t.category_id ?? null,
      interval_min_days: t.interval_min_days,
      interval_max_days: t.interval_max_days,
      frequency_type: t.frequency_type ?? 'interval',
      prep_notes: t.prep_notes ?? null,
      reminder_notes: t.reminder_notes ?? null,
      mode: isCountdown ? 'countdown' : 'standard',
      target_date: isCountdown ? targetDate : null,
      target_label: isCountdown && eventName.trim() ? eventName.trim() : null,
      days_before_target: isCountdown ? 7 : null,
      continue_after_target: !isCountdown,
      initial_anchor_date: null,
      service_provider_id: null,
      default_cost: null,
      provider_cost: null,
      provider_phone: null,
      autocomplete_enabled: false,
      reminder_enabled: false,
      reminder_value: 2,
      reminder_unit: 'days',
      is_active: true,
    }));

    const { data: insertedTasks, error: tasksErr } = await supabase
      .from('tasks')
      .insert(taskInserts)
      .select();

    if (tasksErr || !insertedTasks) {
      setError(tasksErr?.message ?? 'Failed to copy tasks.');
      setCreating(false);
      return;
    }

    // 3. Copy routine_task_pairs (conflict rules) from template
    if (insertedTasks.length >= 2) {
      const { data: templatePairs } = await supabase
        .from('routine_task_pairs')
        .select('*')
        .eq('routine_id', templateId);

      if (templatePairs && templatePairs.length > 0) {
        // Build old-id → new-id map based on insertion order
        const taskIdMap: Record<string, string> = {};
        templateTasks.forEach((oldTask, i) => {
          if (insertedTasks[i]) taskIdMap[oldTask.id] = insertedTasks[i].id;
        });

        const newPairs = templatePairs
          .filter(p => taskIdMap[p.task_a_id] && taskIdMap[p.task_b_id])
          .map(p => ({
            routine_id: newRoutine.id,
            user_id: userId,
            task_a_id: taskIdMap[p.task_a_id],
            task_b_id: taskIdMap[p.task_b_id],
            default_resolution: p.default_resolution,
            default_delay_days: p.default_delay_days,
            delay_target: p.delay_target,
            adjust_direction: p.adjust_direction,
            adjust_snap_back: p.adjust_snap_back,
            skip_target: p.skip_target,
            proximity_enabled: p.proximity_enabled ?? false,
            proximity_days: p.proximity_days,
            proximity_first_task: p.proximity_first_task,
            proximity_resolution: p.proximity_resolution ?? 'ask',
          }));

        if (newPairs.length > 0) {
          await supabase.from('routine_task_pairs').insert(newPairs);
        }
      } else {
        // No template pairs — create default pairs for all task combinations
        const defaultPairs: Array<{ routine_id: string; user_id: string; task_a_id: string; task_b_id: string; default_resolution: string }> = [];
        for (let i = 0; i < insertedTasks.length; i++) {
          for (let j = i + 1; j < insertedTasks.length; j++) {
            const [a, b] = [insertedTasks[i].id, insertedTasks[j].id].sort();
            defaultPairs.push({ routine_id: newRoutine.id, user_id: userId, task_a_id: a, task_b_id: b, default_resolution: 'ask' });
          }
        }
        if (defaultPairs.length > 0) {
          await supabase.from('routine_task_pairs').insert(defaultPairs);
        }
      }
    }

    // 4. Generate instances
    if (isCountdown) {
      for (const task of insertedTasks) {
        await generateCountdownInstances(task as Task);
      }
    }
    // Rolling mode: no instances yet — user sets anchor dates on the detail page

    // 5. Navigate with creation flag
    const suffix = isCountdown
      ? `?fromTemplate=countdown${eventName.trim() ? `&event=${encodeURIComponent(eventName.trim())}` : ''}&date=${encodeURIComponent(targetDate)}`
      : '?fromTemplate=rolling';

    router.push(`/routines/${newRoutine.id}${suffix}`);
  }

  // ── Step 1: Name ─────────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <div className="space-y-6">
        <div>
          <p className="label-overline mb-1">New Routine</p>
          <h2 className="font-display text-2xl text-charcoal">Name this routine</h2>
        </div>

        <div style={{ borderTop: '1px solid #cdc6b6', paddingTop: '20px' }}>
          <input
            ref={nameRef}
            type="text"
            value={routineName}
            onChange={e => setRoutineName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && routineName.trim()) setStep(2); }}
            className="w-full font-display text-lg"
            placeholder="Routine name"
            autoFocus
          />
        </div>

        <div style={{ paddingTop: '4px' }}>
          <p style={{ fontSize: '12px', color: '#a8a297' }}>
            Based on: {templateName} · {taskCount} ritual{taskCount !== 1 ? 's' : ''} included
          </p>
        </div>

        {error && <p className="text-xs text-dust">{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '8px' }}>
          <button
            type="button"
            onClick={() => { if (!routineName.trim()) { setError('Please enter a name.'); return; } setError(''); setStep(2); }}
            style={{
              border: '1px solid #2b2823',
              backgroundColor: 'transparent',
              color: '#2b2823',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '100px',
              padding: '7px 20px',
              cursor: 'pointer',
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Schedule type ─────────────────────────────────────────────────────

  if (step === 2) {
    return (
      <div className="space-y-6">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="label-overline mb-1">New Routine</p>
            <h2 className="font-display text-2xl text-charcoal">Building toward something?</h2>
          </div>
          <span style={{ fontSize: '12px', color: '#a8a297' }}>2 of {scheduleType === 'countdown' ? '3' : '2'}</span>
        </div>

        <div className="space-y-3">
          {[
            {
              value: 'rolling' as ScheduleType,
              title: 'No — track on a rolling basis',
              desc: 'Each ritual runs on its own recurring schedule.',
            },
            {
              value: 'countdown' as ScheduleType,
              title: 'Yes — set a target date',
              desc: 'All rituals will count back from your event date.',
            },
          ].map(opt => (
            <button
              key={opt.value!}
              type="button"
              onClick={() => setScheduleType(opt.value)}
              className={`w-full text-left rounded-lg border-2 px-4 py-4 transition-colors ${
                scheduleType === opt.value ? 'border-charcoal bg-taupe' : 'border-glow-border hover:border-warm-light'
              }`}
            >
              <p className="text-sm font-medium text-charcoal mb-0.5">{opt.title}</p>
              <p className="text-xs text-warm-light">{opt.desc}</p>
            </button>
          ))}
        </div>

        {error && <p className="text-xs text-dust">{error}</p>}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{ fontSize: '13px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => {
              if (!scheduleType) { setError('Please select an option.'); return; }
              setError('');
              if (scheduleType === 'countdown') setStep(3);
              else handleCreate();
            }}
            disabled={!scheduleType || creating}
            style={{
              border: '1px solid #2b2823',
              backgroundColor: 'transparent',
              color: '#2b2823',
              fontSize: '13px',
              fontWeight: 500,
              borderRadius: '100px',
              padding: '7px 20px',
              cursor: !scheduleType || creating ? 'not-allowed' : 'pointer',
              opacity: !scheduleType ? 0.4 : 1,
            }}
          >
            {creating ? 'Creating…' : scheduleType === 'rolling' ? 'Create routine' : 'Continue →'}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 3: Target date ───────────────────────────────────────────────────────

  const targetDateLabel = targetDate ? format(parseISO(targetDate), 'MMMM d, yyyy') : null;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="label-overline mb-1">New Routine</p>
          <h2 className="font-display text-2xl text-charcoal">When is the event?</h2>
        </div>
        <span style={{ fontSize: '12px', color: '#a8a297' }}>3 of 3</span>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">
            Event name <span className="normal-case font-normal text-warm-light">(optional)</span>
          </label>
          <input
            type="text"
            value={eventName}
            onChange={e => setEventName(e.target.value)}
            placeholder="e.g. Wedding, Vacation, Photoshoot"
            className="w-full"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">
            Target date *
          </label>
          <input
            type="date"
            value={targetDate}
            min={today}
            onChange={e => setTargetDate(e.target.value)}
            className="w-full"
          />
        </div>
      </div>

      <div style={{ borderTop: '1px solid #cdc6b6', paddingTop: '16px' }}>
        <p style={{ fontSize: '13px', color: '#6b665e' }}>
          {targetDateLabel
            ? `All ${taskCount} ritual${taskCount !== 1 ? 's' : ''} will be scheduled counting back from ${targetDateLabel}.`
            : `All ${taskCount} ritual${taskCount !== 1 ? 's' : ''} will be scheduled counting back from this date.`}
        </p>
      </div>

      {error && <p className="text-xs text-dust">{error}</p>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => setStep(2)}
          style={{ fontSize: '13px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!targetDate || creating}
          style={{
            border: '1px solid #2b2823',
            backgroundColor: 'transparent',
            color: '#2b2823',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '100px',
            padding: '7px 20px',
            cursor: !targetDate || creating ? 'not-allowed' : 'pointer',
            opacity: !targetDate ? 0.4 : 1,
          }}
        >
          {creating ? 'Creating…' : 'Create routine'}
        </button>
      </div>
    </div>
  );
}
