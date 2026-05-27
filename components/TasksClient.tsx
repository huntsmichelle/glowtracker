'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format, parseISO, differenceInCalendarDays } from 'date-fns';
import { getCategoryColor } from '@/lib/categoryColors';
import type { TaskRow } from '@/app/(app)/tasks/page';
import type { Category } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function humanizeInterval(min: number, max: number): string {
  if (min === max) {
    if (min === 1) return 'Daily';
    if (min === 7) return 'Weekly';
    if (min === 14) return 'Every 2 weeks';
    if (min === 30 || min === 31) return 'Monthly';
    if (min % 7 === 0) return `Every ${min / 7} weeks`;
    return `Every ${min} days`;
  }
  if (min % 7 === 0 && max % 7 === 0) return `Every ${min / 7}–${max / 7} weeks`;
  return `Every ${min}–${max} days`;
}

function formatWhen(dateStr: string): string {
  const d = parseISO(dateStr);
  const t = today();
  const diff = differenceInCalendarDays(d, t);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 6) return format(d, 'EEEE');
  return format(d, 'MMM d');
}

// ─── Category icons (inline SVG, stroke-based) ────────────────────────────────

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Skin: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
    </svg>
  ),
  Hair: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10"/><path d="M12 2c0 5.52 4.48 10 10 10"/>
    </svg>
  ),
  Nails: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>
    </svg>
  ),
  'Hair Removal': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3h12M6 8h12M6 13l6 8 6-8"/>
    </svg>
  ),
  'Brows & Lashes': (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-4 5-6 10-6s8 2 10 6"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  Makeup: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
    </svg>
  ),
};

function CategoryIcon({ name }: { name: string }) {
  return (
    <span style={{ color: '#6b665e' }}>
      {CATEGORY_ICONS[name] ?? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
        </svg>
      )}
    </span>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  tasks: TaskRow[];
  nextDateByTask: Record<string, string>;
  nextStatusByTask: Record<string, string>;
  selectedCategoryId: string | null;
}

// ─── Category card tile ────────────────────────────────────────────────────────

interface CategoryMeta {
  category: Category;
  tasks: TaskRow[];
  nextTaskName: string | null;
  nextDate: string | null;
  urgency: 'today' | 'due' | null;
}

function buildCategoryMeta(
  tasks: TaskRow[],
  nextDateByTask: Record<string, string>,
  nextStatusByTask: Record<string, string>,
): CategoryMeta[] {
  const byCategory = new Map<string, { cat: Category; tasks: TaskRow[] }>();

  for (const t of tasks) {
    if (!t.category) continue;
    const id = t.category.id;
    if (!byCategory.has(id)) byCategory.set(id, { cat: t.category, tasks: [] });
    byCategory.get(id)!.tasks.push(t);
  }

  const t0 = today();

  return Array.from(byCategory.values()).map(({ cat, tasks: catTasks }) => {
    // Find soonest upcoming ritual
    let nextDate: string | null = null;
    let nextTaskName: string | null = null;
    let urgency: 'today' | 'due' | null = null;

    for (const task of catTasks) {
      const d = nextDateByTask[task.id];
      const s = nextStatusByTask[task.id];
      if (!d) continue;

      if (!nextDate || d < nextDate) {
        nextDate = d;
        nextTaskName = task.name;
      }

      // Urgency: status 'due' means overdue, 'upcoming'/'snoozed' on today = today
      if (s === 'due') urgency = 'due';
      else if (urgency !== 'due') {
        const diff = differenceInCalendarDays(parseISO(d), t0);
        if (diff === 0) urgency = 'today';
      }
    }

    return { category: cat, tasks: catTasks, nextTaskName, nextDate, urgency };
  }).sort((a, b) => a.category.name.localeCompare(b.category.name));
}

// ─── Drill-down list ───────────────────────────────────────────────────────────

function TaskRowItem({ task, nextDate }: { task: TaskRow; nextDate?: string }) {
  const intervalLabel = humanizeInterval(task.interval_min_days, task.interval_max_days);
  const modeLabel = task.mode === 'countdown' ? ' · Countdown' : '';
  const nextLabel = nextDate ? format(parseISO(nextDate), 'MMM d') : null;

  return (
    <Link
      href={`/tasks/${task.id}`}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid #cdc6b6', cursor: 'pointer' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <span
          style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: getCategoryColor(task.category?.name ?? '').dot }}
        />
        <span style={{ fontSize: '14px', fontWeight: 500, color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.name}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: '12px' }}>
        {nextLabel && <span style={{ fontSize: '12px', color: '#8ea394', fontWeight: 500 }}>{nextLabel}</span>}
        <span style={{ fontSize: '11px', color: '#a8a297' }}>{intervalLabel}{modeLabel}</span>
      </div>
    </Link>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TasksClient({ tasks, nextDateByTask, nextStatusByTask, selectedCategoryId }: Props) {
  const router = useRouter();
  const categoryMeta = buildCategoryMeta(tasks, nextDateByTask, nextStatusByTask);

  // Uncategorized tasks
  const uncategorized = tasks.filter(t => !t.category);

  // ── Drill-down view ────────────────────────────────────────────────────────
  if (selectedCategoryId) {
    const isUncategorized = selectedCategoryId === 'uncategorized';
    const meta = isUncategorized ? null : categoryMeta.find(m => m.category.id === selectedCategoryId);
    const catTasks = isUncategorized ? uncategorized : (meta?.tasks ?? []);
    const sorted = [...catTasks].sort((a, b) => {
      const da = nextDateByTask[a.id];
      const db = nextDateByTask[b.id];
      if (da && db) return da.localeCompare(db);
      if (da) return -1;
      if (db) return 1;
      return a.name.localeCompare(b.name);
    });

    const newRitualHref = isUncategorized ? '/tasks/new' : `/tasks/new?category_id=${selectedCategoryId}`;

    return (
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        {/* Back + header */}
        <div>
          <button
            onClick={() => router.push('/tasks')}
            style={{ fontSize: '13px', color: '#a8a297', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            ← Rituals
          </button>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {meta && <CategoryIcon name={meta.category.name} />}
              <div>
                <h1 style={{ fontFamily: 'EB Garamond, Georgia, serif', fontSize: '28px', fontWeight: 400, color: '#2b2823', lineHeight: 1.1 }}>
                  {isUncategorized ? 'Other' : (meta?.category.name ?? 'Rituals')}
                </h1>
                <p style={{ fontSize: '13px', color: '#a8a297', marginTop: '2px' }}>
                  {sorted.length} ritual{sorted.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <Link
              href={newRitualHref}
              style={{ border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '7px 20px', textDecoration: 'none', flexShrink: 0 }}
            >
              + Add Ritual
            </Link>
          </div>
        </div>

        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823', marginBottom: '12px' }}>No rituals here yet.</p>
            <div style={{ width: '40px', height: '1px', background: '#cdc6b6', margin: '0 auto 12px' }} />
            <Link href={newRitualHref} style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297' }}>
              Add a ritual
            </Link>
          </div>
        ) : (
          <div style={{ borderTop: '1px solid #cdc6b6' }}>
            {sorted.map(t => <TaskRowItem key={t.id} task={t} nextDate={nextDateByTask[t.id]} />)}
          </div>
        )}
      </div>
    );
  }

  // ── Landing view: category card grid ──────────────────────────────────────
  const hasAnyTasks = tasks.length > 0;

  return (
    <div className="max-w-5xl mx-auto px-5 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="label-overline mb-1">Library</p>
          <h1 className="font-display text-3xl text-charcoal">Rituals</h1>
        </div>
        <Link
          href="/tasks/new"
          style={{ border: '1px solid #2b2823', backgroundColor: 'transparent', color: '#2b2823', fontSize: '13px', fontWeight: 500, borderRadius: '100px', padding: '7px 20px', textDecoration: 'none' }}
        >
          + Add Ritual
        </Link>
      </div>

      {!hasAnyTasks ? (
        <div style={{ textAlign: 'center', padding: '72px 0' }}>
          <p style={{ fontFamily: 'EB Garamond, Georgia, serif', fontStyle: 'italic', fontSize: '22px', color: '#2b2823', marginBottom: '12px' }}>No rituals yet.</p>
          <div style={{ width: '40px', height: '1px', background: '#cdc6b6', margin: '0 auto 12px' }} />
          <Link href="/tasks/new" style={{ fontSize: '10px', letterSpacing: '0.16em', textTransform: 'uppercase', color: '#a8a297' }}>
            Add your first ritual
          </Link>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '12px',
        }}>
          {categoryMeta.map(({ category, tasks: catTasks, nextTaskName, nextDate, urgency }) => (
            <button
              key={category.id}
              type="button"
              onClick={() => router.push(`/tasks?category=${category.id}`)}
              className="card-lift text-left"
              style={{
                background: '#f6f1e6',
                border: '1px solid #cdc6b6',
                borderRadius: '16px',
                padding: '16px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(43,40,35,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                position: 'relative',
              }}
            >
              {/* Status badge — top right */}
              {urgency && (
                <span style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  fontSize: '9px',
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: urgency === 'due' ? '#c08a6e' : '#8ea394',
                  background: urgency === 'due' ? 'rgba(192,138,110,0.12)' : 'rgba(142,163,148,0.12)',
                  borderRadius: '100px',
                  padding: '2px 7px',
                }}>
                  · {urgency === 'due' ? 'DUE' : 'TODAY'}
                </span>
              )}

              {/* Icon */}
              <CategoryIcon name={category.name} />

              {/* Category name */}
              <div>
                <p style={{ fontSize: '17px', fontWeight: 500, color: '#2b2823', lineHeight: 1.2 }}>{category.name}</p>
                <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a8a297', marginTop: '4px' }}>
                  {catTasks.length} {catTasks.length === 1 ? 'RITUAL' : 'RITUALS'}
                </p>
              </div>

              {/* Next ritual */}
              {nextTaskName && nextDate && (
                <div>
                  <p style={{ fontSize: '14px', color: '#2b2823', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Next: {nextTaskName}
                  </p>
                  <p style={{ fontSize: '13px', color: '#6b665e', marginTop: '2px' }}>
                    {formatWhen(nextDate)}
                  </p>
                </div>
              )}
            </button>
          ))}

          {/* Uncategorized tile */}
          {uncategorized.length > 0 && (
            <button
              type="button"
              onClick={() => router.push('/tasks?category=uncategorized')}
              className="card-lift text-left"
              style={{
                background: '#f6f1e6',
                border: '1px solid #cdc6b6',
                borderRadius: '16px',
                padding: '16px',
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(43,40,35,0.06)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              <span style={{ color: '#6b665e' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </span>
              <div>
                <p style={{ fontSize: '17px', fontWeight: 500, color: '#2b2823', lineHeight: 1.2 }}>Other</p>
                <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a8a297', marginTop: '4px' }}>
                  {uncategorized.length} {uncategorized.length === 1 ? 'RITUAL' : 'RITUALS'}
                </p>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
