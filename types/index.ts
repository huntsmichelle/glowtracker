// Shared TypeScript types for GlowTracker
// Mirror the Supabase schema — keep in sync with 001_initial_schema.sql

export type OccurrenceStatus = 'upcoming' | 'due' | 'completed' | 'skipped' | 'snoozed';
export type LinkResolution = 'do_both' | 'reset' | 'delay';

export interface Profile {
  id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string | null;   // null = system default
  name: string;
  color: string;
  is_default: boolean;
  created_at: string;
}

export interface Series {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  interval_min_days: number;
  interval_max_days: number;
  default_reminder_days: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category;
  occurrences?: Occurrence[];
}

export interface Occurrence {
  id: string;
  series_id: string;
  user_id: string;
  due_date_start: string;       // ISO date string YYYY-MM-DD
  due_date_end: string;
  interval_anchor_date: string | null;
  snooze_until: string | null;
  status: OccurrenceStatus;
  actual_completion_date: string | null;
  notes: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  google_calendar_event_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  series?: Series;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  uses_per_supply_unit: number | null;
  supply_warning_threshold: number | null;
  created_at: string;
  updated_at: string;
}

export interface SeriesProduct {
  id: string;
  series_id: string;
  product_id: string;
  user_id: string;
  created_at: string;
  product?: Product;
}

export interface PrepStep {
  id: string;
  series_id: string;
  user_id: string;
  description: string;
  reminder_days_before: number;
  sort_order: number;
  created_at: string;
}

// Form value types (used in create/edit forms)
export interface SeriesFormValues {
  name: string;
  category_id: string;
  description: string;
  interval_min_weeks: number;   // UI uses weeks; engine converts to days
  interval_max_weeks: number;
  default_reminder_days: number;
}

export interface SnoozeValues {
  days: number;
}

// Computed display helpers
export interface OccurrenceWithSeries extends Occurrence {
  series: Series & { category?: Category };
}
