// Shared TypeScript types for GlowTracker
// Mirror the Supabase schema — keep in sync with migrations.
//
// Terminology:
//   Task     = the recurring series (e.g. "Hair Coloring every 6 weeks")
//   Instance = a single scheduled occurrence of a task
//   Routine  = a named collection of related Tasks (Phase 2)

export type InstanceStatus = 'upcoming' | 'due' | 'completed' | 'skipped' | 'snoozed' | 'projected';
export type LinkResolution = 'do_both' | 'reset' | 'delay';
export type TaskMode       = 'standard' | 'countdown';
export type IntervalType   = 'exact' | 'range';
export type IntervalUnit   = 'days' | 'weeks';

// ─── Routine (Phase 2 — task group) ──────────────────────────────────────────

export type ConflictResolution = 'ask' | 'do_both' | 'reset' | 'delay';
export type DelayTarget        = 'a' | 'b';
export type ConflictStatus     = 'pending' | 'resolved';

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;         // freeform label for grouping
  color: string;
  is_template: boolean;
  is_public: boolean;
  template_source_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  tasks?: Task[];
}

export interface RoutineTaskPair {
  id: string;
  routine_id: string;
  user_id: string;
  task_a_id: string;
  task_b_id: string;
  default_resolution: ConflictResolution;
  default_delay_days: number | null;
  delay_target: DelayTarget | null;
  created_at: string;
  // joined
  task_a?: Task;
  task_b?: Task;
}

export interface RoutineConflict {
  id: string;
  routine_id: string;
  user_id: string;
  pair_id: string;
  instance_a_id: string;
  instance_b_id: string;
  conflict_date: string;
  status: ConflictStatus;
  resolution: ConflictResolution | null;
  resolved_at: string | null;
  resolved_by_delay_days: number | null;
  resolved_delay_target: DelayTarget | null;
  created_at: string;
  // joined
  pair?: RoutineTaskPair;
  instance_a?: Instance;
  instance_b?: Instance;
}

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

export interface ServiceProvider {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  website_url: string | null;
  address: string | null;
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  user_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  interval_min_days: number;
  interval_max_days: number;
  default_reminder_days: number;
  default_cost: number | null;
  is_active: boolean;
  // Scheduling mode
  mode: TaskMode;
  target_date: string | null;
  target_label: string | null;
  days_before_target: number | null;
  continue_after_target: boolean;
  initial_anchor_date: string | null;
  // Reminder notes (shown on instance detail; will be sent with notifications)
  reminder_notes: string | null;
  // Routine membership (Phase 2)
  routine_id: string | null;
  // Service provider
  service_provider_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category;
  instances?: Instance[];
  service_provider?: ServiceProvider;
  routine?: Routine;
}

export interface Instance {
  id: string;
  task_id: string;
  user_id: string;
  due_date_start: string;         // ISO date YYYY-MM-DD
  due_date_end: string;
  interval_anchor_date: string | null;
  snooze_until: string | null;
  status: InstanceStatus;
  actual_completion_date: string | null;
  notes: string | null;
  before_photo_url: string | null;
  after_photo_url: string | null;
  google_calendar_event_id: string | null;
  // Projection flag — true for forecast instances not yet promoted to upcoming
  is_projected: boolean;
  // Calendar sync — populated on completion; used for Phase 6 Google Calendar export
  calendar_event_date: string | null;
  calendar_event_cost: number | null;
  // Cost tracking
  cost: number | null;
  // Event override
  is_event_override: boolean;
  event_name: string | null;
  event_date: string | null;
  days_before_event: number | null;
  override_next_date: string | null;
  created_at: string;
  updated_at: string;
  // joined
  task?: Task;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;               // "description" in UI
  product_url: string | null;
  uses_per_supply_unit: number | null; // "uses per unit" in UI
  supply_warning_threshold: number | null;
  created_at: string;
  updated_at: string;
}

export interface TaskProduct {
  id: string;
  task_id: string;
  product_id: string;
  user_id: string;
  track_usage: boolean;
  created_at: string;
  product?: Product;
}

export interface PrepStep {
  id: string;
  task_id: string;
  user_id: string;
  description: string;
  reminder_days_before: number;
  sort_order: number;
  created_at: string;
}

// ─── Form helper types ────────────────────────────────────────────────────────

export interface ProductFormEntry {
  id?: string;            // existing product id (edit mode)
  taskProductId?: string; // existing task_products row id (for removal)
  name: string;
  description: string;
  product_url: string;
  track_usage: boolean;
  uses_per_supply_unit: number | '';
}

export interface ServiceProviderFormEntry {
  id?: string;   // if selecting/editing an existing saved provider
  name: string;
  phone: string;
  website_url: string;
  address: string;
}

export interface TaskFormValues {
  name: string;
  category_id: string;
  description: string;
  mode: TaskMode;
  default_cost: string;           // currency string, empty = no default
  reminder_notes: string;
  // Interval — stored as days in DB; UI lets user choose unit and exact vs range
  intervalType: IntervalType;
  intervalMin: number;
  intervalMax: number;
  intervalUnit: IntervalUnit;
  default_reminder_days: number;
  // Standard mode anchor
  initial_anchor_date: string;    // empty string = today
  // Countdown mode
  target_date: string;
  target_label: string;
  days_before_target: number;
  continue_after_target: boolean;
}

export interface EventOverrideFormValues {
  event_name: string;
  event_date: string;
  days_before_event: number;
  resume_normal_cadence: boolean;
  override_next_date: string;     // only used when resume_normal_cadence = false
}

export interface SnoozeValues {
  days: number;
}

// ─── Computed display helpers ─────────────────────────────────────────────────

export interface InstanceWithTask extends Instance {
  task: Task & { category?: Category; routine?: Routine | null };
}
