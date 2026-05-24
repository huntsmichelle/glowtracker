/**
 * Occurrence Engine
 *
 * All scheduling logic lives here. This file is intentionally kept
 * self-contained so Phase 2–4 features (reminders, linking) can import
 * helpers without pulling in unrelated code.
 *
 * Key rule: a series should never have more than one future "upcoming"
 * or "snoozed" occurrence at a time. Always check before inserting.
 */

import { addDays, format, parseISO, isAfter, isBefore, isToday } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import type { Series, Occurrence, OccurrenceStatus } from '@/types';

const supabase = createClient();

// ─── Date helpers ────────────────────────────────────────────────────────────

export function today(): Date {
  return new Date(new Date().toDateString()); // strips time component
}

export function toISODate(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

// ─── Status derivation ───────────────────────────────────────────────────────

/**
 * Derives the display status for an occurrence based on current date.
 * The stored `status` column is the source of truth for completed/skipped/snoozed;
 * upcoming vs due is always recalculated from dates.
 */
export function deriveStatus(occ: Occurrence): OccurrenceStatus {
  if (occ.status === 'completed' || occ.status === 'skipped') return occ.status;
  if (occ.status === 'snoozed') {
    if (occ.snooze_until && !isAfter(parseISO(occ.snooze_until), today())) {
      // Snooze expired — treat as due
      return 'due';
    }
    return 'snoozed';
  }

  const end = parseISO(occ.due_date_end);
  const start = parseISO(occ.due_date_start);

  if (isAfter(start, today())) return 'upcoming';
  if (isBefore(end, today())) return 'due'; // past window end = overdue
  return 'due'; // within or past window
}

/**
 * Returns days until the start of the due window (negative = overdue).
 */
export function daysUntilDue(occ: Occurrence): number {
  const start = parseISO(occ.due_date_start);
  const t = today();
  return Math.round((start.getTime() - t.getTime()) / 86_400_000);
}

// ─── Occurrence generation ───────────────────────────────────────────────────

/**
 * Calculates the due date window for the NEXT occurrence given an anchor date
 * and a series' interval range.
 */
export function calculateNextWindow(
  anchorDate: Date,
  series: Pick<Series, 'interval_min_days' | 'interval_max_days'>
): { due_date_start: string; due_date_end: string } {
  return {
    due_date_start: toISODate(addDays(anchorDate, series.interval_min_days)),
    due_date_end: toISODate(addDays(anchorDate, series.interval_max_days)),
  };
}

/**
 * Creates the very first occurrence for a newly created series.
 * Anchored to today (user just created it, so "last done" = now is implied).
 */
export async function createFirstOccurrence(series: Series): Promise<Occurrence | null> {
  const anchor = today();
  const window = calculateNextWindow(anchor, series);

  const { data, error } = await supabase
    .from('occurrences')
    .insert({
      series_id: series.id,
      user_id: series.user_id,
      due_date_start: window.due_date_start,
      due_date_end: window.due_date_end,
      interval_anchor_date: toISODate(anchor),
      status: 'upcoming',
    })
    .select()
    .single();

  if (error) {
    console.error('createFirstOccurrence error:', error);
    return null;
  }
  return data;
}

/**
 * Marks an occurrence as completed and creates the next one.
 * `actualDate` defaults to today if not provided.
 */
export async function completeOccurrence(
  occurrenceId: string,
  series: Series,
  actualDate: Date = today()
): Promise<{ updated: Occurrence | null; next: Occurrence | null }> {
  // 1. Update the current occurrence
  const { data: updated, error: updateErr } = await supabase
    .from('occurrences')
    .update({
      status: 'completed',
      actual_completion_date: toISODate(actualDate),
    })
    .eq('id', occurrenceId)
    .select()
    .single();

  if (updateErr) {
    console.error('completeOccurrence update error:', updateErr);
    return { updated: null, next: null };
  }

  // 2. Generate next occurrence anchored to the actual completion date
  const next = await createNextOccurrence(series, actualDate);
  return { updated, next };
}

/**
 * Marks an occurrence as skipped and creates the next one anchored to today.
 */
export async function skipOccurrence(
  occurrenceId: string,
  series: Series
): Promise<{ updated: Occurrence | null; next: Occurrence | null }> {
  const { data: updated, error } = await supabase
    .from('occurrences')
    .update({ status: 'skipped' })
    .eq('id', occurrenceId)
    .select()
    .single();

  if (error) {
    console.error('skipOccurrence error:', error);
    return { updated: null, next: null };
  }

  const next = await createNextOccurrence(series, today());
  return { updated, next };
}

/**
 * Snoozes an occurrence by pushing its due window by N days.
 * Does NOT create a new occurrence — just shifts the existing one.
 */
export async function snoozeOccurrence(
  occurrenceId: string,
  days: number,
  currentDueDateEnd: string
): Promise<Occurrence | null> {
  const newSnoozeUntil = toISODate(addDays(parseISO(currentDueDateEnd), days));

  const { data, error } = await supabase
    .from('occurrences')
    .update({
      status: 'snoozed',
      snooze_until: newSnoozeUntil,
    })
    .eq('id', occurrenceId)
    .select()
    .single();

  if (error) {
    console.error('snoozeOccurrence error:', error);
    return null;
  }
  return data;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Inserts the next occurrence for a series, anchored to a given date.
 * Checks for existing future occurrences first to prevent duplicates.
 */
async function createNextOccurrence(
  series: Series,
  anchorDate: Date
): Promise<Occurrence | null> {
  // Guard: never create a second future occurrence
  const { data: existing } = await supabase
    .from('occurrences')
    .select('id')
    .eq('series_id', series.id)
    .in('status', ['upcoming', 'snoozed'])
    .limit(1);

  if (existing && existing.length > 0) {
    console.warn('createNextOccurrence: future occurrence already exists, skipping');
    return null;
  }

  const window = calculateNextWindow(anchorDate, series);

  const { data, error } = await supabase
    .from('occurrences')
    .insert({
      series_id: series.id,
      user_id: series.user_id,
      due_date_start: window.due_date_start,
      due_date_end: window.due_date_end,
      interval_anchor_date: toISODate(anchorDate),
      status: 'upcoming',
    })
    .select()
    .single();

  if (error) {
    console.error('createNextOccurrence error:', error);
    return null;
  }
  return data;
}
