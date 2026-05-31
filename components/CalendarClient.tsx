'use client';

import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import { getCategoryColor } from '@/lib/categoryColors';
import type { CalendarInstance, CalendarCompletedInstance } from '@/app/(app)/calendar/page';

interface Props {
  userId: string;
  initialYear: number;
  initialMonth: number;
  initialScheduled: CalendarInstance[];
  initialCompleted: CalendarCompletedInstance[];
}

type DayOverlay = {
  dateStr: string;
  isFuture: boolean;
  items: { name: string; categoryName: string; kept?: boolean }[];
};

export default function CalendarClient({
  userId,
  initialYear,
  initialMonth,
  initialScheduled,
  initialCompleted,
}: Props) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const nowYear = now.getFullYear();
  const nowMonth = now.getMonth() + 1;
  const todayStr = format(now, 'yyyy-MM-dd');

  const [calYear, setCalYear]     = useState(initialYear);
  const [calMonth, setCalMonth]   = useState(initialMonth);
  const [loading, setLoading]     = useState(false);
  const [dayOverlay, setDayOverlay] = useState<DayOverlay | null>(null);

  // Build per-date maps
  const [scheduled, setScheduled] = useState<CalendarInstance[]>(initialScheduled);
  const [completed, setCompleted] = useState<CalendarCompletedInstance[]>(initialCompleted);

  const completedByDate: Record<string, CalendarCompletedInstance[]> = {};
  for (const c of completed) {
    if (!c.actual_completion_date) continue;
    if (!completedByDate[c.actual_completion_date]) completedByDate[c.actual_completion_date] = [];
    completedByDate[c.actual_completion_date].push(c);
  }
  const scheduledByDate: Record<string, CalendarInstance[]> = {};
  for (const s of scheduled) {
    if (!scheduledByDate[s.due_date_start]) scheduledByDate[s.due_date_start] = [];
    scheduledByDate[s.due_date_start].push(s);
  }

  const fetchMonth = useCallback(async (year: number, month: number) => {
    setLoading(true);
    const supabase = createClient();
    const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, month, 0).getDate();
    const lastDay = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;

    const [{ data: sch }, { data: comp }] = await Promise.all([
      supabase
        .from('instances')
        .select('id, due_date_start, due_date_end, task:tasks(name, category:categories(name))')
        .eq('user_id', userId)
        .in('status', ['upcoming', 'due', 'snoozed'])
        .eq('archived', false)
        .gte('due_date_start', firstDay)
        .lte('due_date_start', lastDay)
        .order('due_date_start', { ascending: true }),
      supabase
        .from('instances')
        .select('id, actual_completion_date, task:tasks(name, category:categories(name))')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .gte('actual_completion_date', firstDay)
        .lte('actual_completion_date', lastDay)
        .order('actual_completion_date', { ascending: true }),
    ]);

    setScheduled((sch ?? []) as CalendarInstance[]);
    setCompleted((comp ?? []) as CalendarCompletedInstance[]);
    setLoading(false);
  }, [userId]);

  function canPrev() {
    return !(calMonth === nowMonth && calYear === nowYear);
  }

  function canNext() {
    const maxDate = new Date(nowYear, nowMonth - 1 + 6, 1);
    return new Date(calYear, calMonth - 1, 1) < maxDate;
  }

  function changeMonth(delta: number) {
    let m = calMonth + delta;
    let y = calYear;
    if (m > 12) { m = 1; y++; }
    if (m < 1)  { m = 12; y--; }
    if (y < nowYear || (y === nowYear && m < nowMonth)) return;
    const maxDate = new Date(nowYear, nowMonth - 1 + 6, 1);
    if (new Date(y, m - 1, 1) > maxDate) return;
    setCalYear(y);
    setCalMonth(m);
    fetchMonth(y, m);
  }

  function openDayOverlay(dateStr: string) {
    const isFuture = dateStr > todayStr;
    if (isFuture) {
      const items = (scheduledByDate[dateStr] ?? []).map(s => ({
        name: (Array.isArray(s.task) ? s.task[0]?.name : s.task?.name) ?? '—',
        categoryName: (Array.isArray(s.task) ? s.task[0]?.category?.name : s.task?.category?.name) ?? '',
        kept: false,
      }));
      setDayOverlay({ dateStr, isFuture: true, items });
    } else {
      const keptItems = (completedByDate[dateStr] ?? []).map(c => ({
        name: (Array.isArray(c.task) ? c.task[0]?.name : c.task?.name) ?? '—',
        categoryName: (Array.isArray(c.task) ? c.task[0]?.category?.name : c.task?.category?.name) ?? '',
        kept: true,
      }));
      const plannedItems = (scheduledByDate[dateStr] ?? []).map(s => ({
        name: (Array.isArray(s.task) ? s.task[0]?.name : s.task?.name) ?? '—',
        categoryName: (Array.isArray(s.task) ? s.task[0]?.category?.name : s.task?.category?.name) ?? '',
        kept: false,
      }));
      const allItems = [...keptItems, ...plannedItems];
      setDayOverlay({ dateStr, isFuture: false, items: allItems });
    }
  }

  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const firstWeekday = new Date(calYear, calMonth - 1, 1).getDay();
  const monthLabel = new Date(calYear, calMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  const isCurrentMonth = calYear === nowYear && calMonth === nowMonth;
  const isPastMonth = calYear < nowYear || (calYear === nowYear && calMonth < nowMonth);

  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="label-overline mb-1">Calendar</p>
          <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#352720' }}>
            Your rhythm
          </h1>
        </div>
        <Link
          href="/"
          style={{ fontSize: '13px', color: '#a8998e', textDecoration: 'none' }}
        >
          ← Today
        </Link>
      </div>

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          onClick={() => canPrev() && changeMonth(-1)}
          disabled={!canPrev()}
          style={{ background: 'none', border: 'none', padding: '4px 8px', fontSize: '16px', cursor: canPrev() ? 'pointer' : 'default', color: canPrev() ? '#6b5c52' : '#ddd4c4' }}
        >←</button>
        <span style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '16px', color: '#352720' }}>{monthLabel}</span>
        <button
          onClick={() => canNext() && changeMonth(1)}
          disabled={!canNext()}
          style={{ background: 'none', border: 'none', padding: '4px 8px', fontSize: '16px', cursor: canNext() ? 'pointer' : 'default', color: canNext() ? '#6b5c52' : '#ddd4c4' }}
        >→</button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: '10px', color: '#a8998e', paddingBottom: '4px' }}>{d}</div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#a8998e', fontSize: '13px' }}>Loading…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} />;
            const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isToday = dateStr === todayStr;
            const isFuture = dateStr > todayStr;
            const hasKept = (completedByDate[dateStr] ?? []).length > 0;
            const hasPlanned = (scheduledByDate[dateStr] ?? []).length > 0;

            let bg = '#faf4e6';
            let color = '#a8998e';
            let border = '1px solid #ddd4c4';

            if (isToday) {
              bg = '#6e8c82'; color = '#faf4e6'; border = '1px solid #6e8c82';
            } else if (!isFuture && hasKept) {
              bg = '#352720'; color = '#faf4e6'; border = '1px solid #352720';
            } else if (isFuture && hasPlanned) {
              bg = 'rgba(110,140,130,0.10)'; color = '#352720'; border = '1px solid #6e8c82';
            }

            return (
              <div
                key={i}
                onClick={() => openDayOverlay(dateStr)}
                style={{
                  minHeight: '40px', borderRadius: '8px', padding: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', backgroundColor: bg, border,
                  opacity: isFuture && !hasPlanned ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: '12px', color, fontWeight: isToday ? 600 : 400 }}>{day}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Day overlay */}
      {dayOverlay && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(53,39,32,0.35)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}
          onClick={() => setDayOverlay(null)}
        >
          <div
            style={{ backgroundColor: '#faf4e6', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '340px', boxShadow: '0 8px 32px rgba(53,39,32,0.14)' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a8998e' }}>
                {dayOverlay.isFuture ? 'Planned' : 'Kept'}
              </p>
              <button type="button" onClick={() => setDayOverlay(null)}
                style={{ background: 'none', border: 'none', fontSize: '18px', color: '#a8998e', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: '13px', fontWeight: 500, color: '#352720', marginBottom: '16px' }}>
              {format(parseISO(dayOverlay.dateStr), 'EEEE, MMMM d')}
            </p>
            {dayOverlay.items.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {dayOverlay.items.map((item, idx) => {
                  const catColor = getCategoryColor(item.categoryName).dot;
                  return (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {item.kept
                        ? <span style={{ color: '#6e8c82', fontSize: '14px' }}>✓</span>
                        : <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#6e8c82', display: 'inline-block' }} />
                      }
                      <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: catColor, flexShrink: 0 }} />
                      <span style={{ fontSize: '13px', color: '#352720' }}>{item.name}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: '13px', color: '#a8998e', fontStyle: 'italic' }}>
                {dayOverlay.isFuture ? 'Nothing planned.' : 'Nothing logged.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
