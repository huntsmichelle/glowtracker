'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

interface Props {
  taskId: string;
  userId: string;
  stubPeriodDays: number;
  anchorDate: string;      // YYYY-MM-DD
  maxDate: string;         // YYYY-MM-DD (first instance start - 1)
}

export default function StubPeriodPrompt({ taskId, userId, stubPeriodDays, anchorDate, maxDate }: Props) {
  const router = useRouter();
  const [open, setOpen]         = useState(false);
  const [date, setDate]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [done, setDone]         = useState(false);

  if (done) return null;

  async function handleAdd() {
    if (!date) return;
    setLoading(true);
    const supabase = createClient();

    await supabase.from('instances').insert({
      task_id:          taskId,
      user_id:          userId,
      due_date_start:   date,
      due_date_end:     date,
      status:           'upcoming',
      is_stub_instance: true,
      stub_date:        date,
      is_projected:     false,
    });

    setLoading(false);
    setOpen(false);
    setDone(true);
    router.refresh();
  }

  const weekLabel = stubPeriodDays === 1 ? '1-day' : stubPeriodDays < 7 ? `${stubPeriodDays}-day` : `${Math.round(stubPeriodDays / 7)}-week`;

  return (
    <>
      <div
        className="rounded-lg px-4 py-3 flex items-start justify-between gap-3"
        style={{ backgroundColor: '#f6f1e6', border: '1px solid #cdc6b6' }}
      >
        <p className="text-xs text-warm-mid leading-relaxed">
          There&rsquo;s a {weekLabel} gap before your first scheduled instance.{' '}
          Add an earlier appointment?
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex-shrink-0 text-xs font-medium text-charcoal border border-glow-border rounded-pill px-3 py-1.5 hover:bg-taupe transition-colors whitespace-nowrap"
        >
          Add stub instance
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 flex items-end sm:items-center justify-center z-50 p-4"
          style={{ background: 'rgba(44,42,38,0.4)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-lg w-full max-w-sm p-6 border border-glow-border space-y-4"
            style={{ boxShadow: 'var(--shadow-modal)' }}
            onClick={e => e.stopPropagation()}
          >
            <div>
              <p className="label-overline mb-1">Add an earlier instance</p>
              <p className="text-xs text-warm-light">
                Choose a date for this one-time appointment.{' '}
                It won&rsquo;t affect your other scheduled dates.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-warm-mid mb-1.5 uppercase tracking-wide">Date</label>
              <input
                type="date"
                value={date}
                min={anchorDate}
                max={maxDate}
                onChange={e => setDate(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 border border-glow-border text-warm-mid text-sm rounded-pill py-2.5 hover:bg-taupe transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!date || loading}
                className="flex-1 bg-charcoal text-cream text-sm font-medium rounded-pill py-2.5 disabled:opacity-50 hover:bg-charcoal/90"
              >
                {loading ? 'Adding…' : 'Add instance'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
