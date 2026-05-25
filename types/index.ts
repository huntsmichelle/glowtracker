// Shared TypeScript types for GlowTracker
// Mirror the Supabase schema — keep in sync with migrations.

export type TaskStatus = 'upcoming' | 'due' | 'completed' | 'skipped' | 'snoozed';
export type LinkResolution = 'do_both' | 'reset' | 'delay';
export type RoutineMode = 'standard' | 'countdown';
export type IntervalType = 'exact' | 'range';
export type IntervalUnit = 'days' | 'weeks';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;   // null = system default visible to all
  name: string;
  color: string;
  is_default: boolean;
  created_at: string;
}

export interface Routine {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  interval_min_days: number;
  interval_max_days: number;
  default_reminder_days: number;
  is_active: boolean;
  // Countdown mode fields
  mode: RoutineMode;
  target_date: string | null;
  target_label: string | null;
  days_before_target: number | null;
  continue_after_target: boolean;
  initial_anchor_date: string | null;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category;
  tasks?: Task[];
}

export interface Task {
  id: string;
  routine_id: string;
  user_id: string;
  due_date_start: string;         // ISO date YYYY-MM-DD
  due_date_end: string;
  interval_anchor_date: string | null;
  snooze_until: string | null;
  status: TaskStatus;
  actual_completion_date: string | null;
  notes: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  google_calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  routine?: Routine;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  product_url: string | null;
  uses_per_supply_unit: number | null;
  supply_warning_threshold: number | null;
  created_at: string;
  updated_at: string;
}

export interface RoutineProduct {
  id: string;
  routine_id: string;
  product_id: string;
  user_id: string;
  created_at: string;
  product?: Product;
}

export interface PrepStep {
  id: string;
  routine_id: string;
  user_id: string;
  description: string;
  reminder_days_before: number;
  sort_order: number;
  created_at: string;
}

// ─── Form value types ─────────────────────────────────────────────────────────

export interface RoutineFormValues {
  name: string;
  category_id: string;
  description: string;
  mode: RoutineMode;
  // Interval: stored as days in DB; UI lets user pick days or weeks and exact vs range
  intervalType: IntervalType;
  intervalMin: number;        // in the selected unit
  intervalMax: number;        // same as min when intervalType === 'exact'
  intervalUnit: IntervalUnit;
  default_reminder_days: number;
  // Standard mode — set when user enters a past "last done" date at creation time
  initial_anchor_date: string;  // empty string = today
  // Countdown mode
  target_date: string;
  target_label: string;
  days_before_target: number;
  continue_after_target: boolean;
}

export interface SnoozeValues {
  days: number;
}

// ─── Computed display helpers ─────────────────────────────────────────────────

export interface TaskWithRoutine extends Task {
  routine: Routine & { category?: Category };
}
