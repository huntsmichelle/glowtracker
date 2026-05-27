'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Routine } from '@/types';

type RoutineWithMeta = Routine & { task_count: number; pending_conflicts: number };

interface Props {
  routines: RoutineWithMeta[];
}

// ── ··· Menu ──────────────────────────────────────────────────

function RoutineMenu({
  routine,
  onDelete,
}: {
  routine: RoutineWithMeta;
  onDelete: (r: RoutineWithMeta) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a8a297', fontSize: '18px', lineHeight: 1, padding: '2px 6px', borderRadius: '4px' }}
        title="More options"
      >
        ···
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: '4px',
          backgroundColor: '#f6f1e6', border: '1px solid #cdc6b6', borderRadius: '10px',
          boxShadow: '0 4px 16px rgba(43,40,35,0.12)', zIndex: 20, minWidth: '140px', overflow: 'hidden',
        }}>
          <Link
            href={`/routines/${routine.id}/edit`}
            onClick={() => setOpen(false)}
            style={{ display: 'block', padding: '11px 16px', fontSize: '13px', color: '#2b2823', textDecoration: 'none' }}
            className="hover:bg-taupe"
          >
            Edit routine
          </Link>
          <button
            type="button"
            onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(false); onDelete(routine); }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 16px', fontSize: '13px', color: '#c08a6e', background: 'none', border: 'none', cursor: 'pointer', borderTop: '1px solid #cdc6b6' }}
            className="hover:bg-taupe"
          >
            Delete routine
          </button>
        </div>
      )}
    </div>
  );
}

// ── Delete Modal ───────────────────────────────────────────────

function DeleteRoutineModal({
  routine,
  onClose,
  onDeleted,
}: {
  routine: RoutineWithMeta;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const [mode, setMode] = useState<'detach' | 'delete_all'>('detach');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    const supabase = createClient();

    if (mode === 'delete_all') {
      // Delete all tasks (and cascade instances) then delete the routine
      await supabase.from('tasks').delete().eq('routine_id', routine.id);
    } else {
      // Detach tasks from routine (keep tasks standalone)
      await supabase.from('tasks').update({ routine_id: null }).eq('routine_id', routine.id);
    }

    const { error: delErr } = await supabase.from('routines').delete().eq('id', routine.id);
    if (delErr) { setError(delErr.message); setSaving(false); return; }
    onDeleted(routine.id);
    onClose();
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(43,40,35,0.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ backgroundColor: '#f6f1e6', borderRadius: '16px', padding: '28px', width: '100%', maxWidth: '380px', boxShadow: '0 8px 32px rgba(43,40,35,0.14)' }}>
        <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '20px', color: '#2b2823', marginBottom: '6px' }}>
          Delete &ldquo;{routine.name}&rdquo;?
        </p>
        <p style={{ fontSize: '13px', color: '#6b665e', marginBottom: '20px' }}>
          This will remove the routine. Choose what happens to its rituals.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="delete-mode"
              checked={mode === 'detach'}
              onChange={() => setMode('detach')}
              style={{ marginTop: '3px', accentColor: '#2b2823' }}
            />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#2b2823' }}>Remove from routine only</p>
              <p style={{ fontSize: '12px', color: '#6b665e' }}>Keep all rituals as standalone — no scheduled occurrences are deleted.</p>
            </div>
          </label>

          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="radio"
              name="delete-mode"
              checked={mode === 'delete_all'}
              onChange={() => setMode('delete_all')}
              style={{ marginTop: '3px', accentColor: '#2b2823' }}
            />
            <div>
              <p style={{ fontSize: '13px', fontWeight: 500, color: '#2b2823' }}>Delete routine and all rituals</p>
              <p style={{ fontSize: '12px', color: '#c08a6e' }}>All {routine.task_count} ritual{routine.task_count !== 1 ? 's' : ''} and their history will be permanently deleted.</p>
            </div>
          </label>
        </div>

        {error && <p style={{ fontSize: '12px', color: '#c08a6e', marginBottom: '12px' }}>{error}</p>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '8px 16px', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={saving}
            style={{ flex: 1, backgroundColor: '#c08a6e', color: '#fff', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '8px 16px', cursor: 'pointer', border: 'none', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Deleting…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────

export default function RoutinesListClient({ routines: initial }: Props) {
  const router = useRouter();
  const [routines, setRoutines] = useState(initial);
  const [deleteTarget, setDeleteTarget] = useState<RoutineWithMeta | null>(null);

  function handleDeleted(id: string) {
    setRoutines(prev => prev.filter(r => r.id !== id));
    router.refresh();
  }

  if (routines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823' }}>
          No routines yet.
        </p>
        <div style={{ width: '40px', height: '1px', backgroundColor: '#cdc6b6' }} />
        <Link href="/routines/templates" style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297', cursor: 'pointer' }}>
          Browse the template library
        </Link>
      </div>
    );
  }

  return (
    <>
      <div style={{ borderTop: '1px solid #cdc6b6' }}>
        {routines.map(r => (
          <div
            key={r.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #cdc6b6' }}
          >
            <Link
              href={`/routines/${r.id}`}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1, textDecoration: 'none' }}
            >
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: r.color }} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: '14px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</p>
                {r.description && (
                  <p style={{ fontSize: '12px', color: '#6b665e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>{r.description}</p>
                )}
              </div>
            </Link>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
              {r.pending_conflicts > 0 && r.conflict_intent !== 'independent' && (
                <span style={{ fontSize: '11px', fontWeight: 500, borderRadius: '100px', padding: '2px 8px', backgroundColor: 'rgba(192,138,110,0.12)', border: '1px solid #c08a6e', color: '#2b2823' }}>
                  {r.pending_conflicts} overlap{r.pending_conflicts !== 1 ? 's' : ''}
                </span>
              )}
              <span style={{ fontSize: '12px', color: '#a8a297' }}>
                {r.task_count} ritual{r.task_count !== 1 ? 's' : ''}
              </span>
              <RoutineMenu routine={r} onDelete={setDeleteTarget} />
            </div>
          </div>
        ))}
      </div>

      {deleteTarget && (
        <DeleteRoutineModal
          routine={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
