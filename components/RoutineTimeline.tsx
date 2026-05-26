'use client';

import { useMemo } from 'react';
import { addDays, differenceInDays, format, parseISO } from 'date-fns';

type TimelineInstance = {
  id: string;
  due_date_start: string;
  due_date_end: string;
  status: string;
  is_projected: boolean;
};

type TimelineTask = {
  id: string;
  name: string;
  instances: TimelineInstance[];
};

interface Props {
  tasks: TimelineTask[];
  conflictInstanceIds: Set<string>;
  color: string;
}

const DAYS = 90;

export default function RoutineTimeline({ tasks, conflictInstanceIds, color }: Props) {
  const startDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const months = useMemo(() => {
    const result: { label: string; dayOffset: number }[] = [];
    for (let d = 0; d <= DAYS; d++) {
      const date = addDays(startDate, d);
      if (d === 0 || date.getDate() === 1) {
        result.push({ label: format(date, 'MMM'), dayOffset: d });
      }
    }
    return result;
  }, [startDate]);

  const visibleTasks = tasks.filter(task => {
    return task.instances.some(inst => {
      const endOff = differenceInDays(parseISO(inst.due_date_end), startDate);
      const startOff = differenceInDays(parseISO(inst.due_date_start), startDate);
      return endOff >= 0 && startOff <= DAYS;
    });
  });

  if (visibleTasks.length === 0) {
    return (
      <p className="text-sm text-warm-light text-center py-4">
        No instances in the next 90 days.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto -mx-4 px-4">
      <div style={{ minWidth: '440px' }}>
        {/* Month header */}
        <div className="relative h-5 mb-1" style={{ paddingLeft: '112px' }}>
          <div className="relative h-5">
            {months.map(m => (
              <span
                key={m.dayOffset}
                className="absolute text-xs text-warm-light font-medium"
                style={{ left: `${(m.dayOffset / DAYS) * 100}%` }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>

        {/* Task rows */}
        <div className="space-y-2">
          {visibleTasks.map(task => {
            const inRange = task.instances.filter(inst => {
              const startOff = differenceInDays(parseISO(inst.due_date_start), startDate);
              const endOff = differenceInDays(parseISO(inst.due_date_end), startDate);
              return endOff >= 0 && startOff <= DAYS;
            });

            return (
              <div key={task.id} className="flex items-center gap-2">
                <div className="flex-shrink-0 w-28">
                  <p className="text-xs text-warm-mid truncate font-medium">{task.name}</p>
                </div>
                <div className="relative flex-1 h-7 bg-taupe rounded-lg overflow-hidden">
                  {/* Today marker */}
                  <div className="absolute top-0 bottom-0 w-px bg-glow-border z-10" style={{ left: '0%' }} />

                  {inRange.map(inst => {
                    const s = differenceInDays(parseISO(inst.due_date_start), startDate);
                    const e = differenceInDays(parseISO(inst.due_date_end), startDate);
                    const leftPct = (Math.max(0, s) / DAYS) * 100;
                    const widthPct = ((Math.min(DAYS, e) - Math.max(-1, s) + 1) / DAYS) * 100;
                    const hasConflict = conflictInstanceIds.has(inst.id);
                    const isProjected = inst.is_projected;

                    return (
                      <div
                        key={inst.id}
                        className="absolute top-1.5 bottom-1.5 rounded-sm"
                        style={{
                          left: `${Math.max(0, leftPct)}%`,
                          width: `${Math.max(0.8, widthPct)}%`,
                          backgroundColor: isProjected ? color + '55' : color,
                          border: hasConflict
                            ? '2px solid #A89880'
                            : isProjected
                            ? `1px dashed ${color}`
                            : 'none',
                          opacity: inst.status === 'completed' || inst.status === 'skipped' ? 0.4 : 1,
                        }}
                        title={`${inst.due_date_start} – ${inst.due_date_end}${hasConflict ? ' ⚠ overlap' : ''}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-warm-light" style={{ paddingLeft: '120px' }}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
            Upcoming
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-6 h-2.5 rounded-sm" style={{ backgroundColor: color + '55', border: `1px dashed ${color}` }} />
            Projected
          </span>
          {conflictInstanceIds.size > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 h-2.5 rounded-sm border-2 border-dust" style={{ backgroundColor: color }} />
              Overlap
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
