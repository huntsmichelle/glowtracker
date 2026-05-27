// Shared TypeScript types for GlowTracker
// Mirror the Supabase schema — keep in sync with migrations.
//
// Terminology:
//   Task     = the recurring series (e.g. "Hair Coloring every 6 weeks")
//   Instance = a single scheduled occurrence of a task
//   Routine  = a named collection of related Tasks (Phase 2)

export type InstanceStatus  = 'upcoming' | 'due' | 'completed' | 'skipped' | 'snoozed' | 'projected';
export type TaskMode        = 'standard' | 'countdown';
export type FrequencyType   = 'interval' | 'daily' | 'twice_daily';
export type IntervalType    = 'exact' | 'range';
export type IntervalUnit    = 'days' | 'weeks';
export type NoConflictOrder = 'a_first' | 'b_first';
export type LinkType        = 'conflict' | 'always_together' | 'every_n_occurrences';

// ─── Routine (Phase 2 — task group) ──────────────────────────────────────────

export type ConflictResolution  = 'ask' | 'no_conflict' | 'auto_adjust' | 'skip_one';
export type ProximityResolution = 'ask' | 'looks_good' | 'auto_adjust' | 'remind_closer';
export type DelayTarget         = 'a' | 'b';
export type AdjustDirection     = 'forward' | 'back';
export type SkipTarget          = 'a' | 'b';
export type ConflictStatus      = 'pending' | 'resolved';
export type ConflictType        = 'same_day' | 'proximity';

export type ConflictIntent = 'unset' | 'independent' | 'managed';

export interface Routine {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  category: string | null;         // freeform label for grouping
  color: string;
  is_template: boolean;
  is_public: boolean;
  is_system_template: boolean;
  template_source_id: string | null;
  template_category: string | null;
  template_description: string | null;
  template_task_count: number | null;
  conflict_intent: ConflictIntent;
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
  adjust_direction: AdjustDirection | null;
  adjust_snap_back: boolean | null;
  skip_target: SkipTarget | null;
  // No-conflict order (item 5)
  no_conflict_order: NoConflictOrder | null;
  no_conflict_time_a: string | null;  // HH:MM
  no_conflict_time_b: string | null;  // HH:MM
  // Proximity / timing rules
  proximity_enabled: boolean;
  proximity_days: number | null;
  proximity_first_task: 'a' | 'b' | null;
  proximity_resolution: ProximityResolution;
  // Linked task relationship type (extends beyond conflict detection)
  link_type: LinkType;
  occurrence_interval: number | null;
  primary_task_id: string | null;
  occurrence_count: number;
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
  adjust_direction: AdjustDirection | null;
  adjust_snap_back: boolean | null;
  skip_target: SkipTarget | null;
  // No-conflict order audit (item 5)
  applied_order: NoConflictOrder | null;
  applied_time_a: string | null;
  applied_time_b: string | null;
  // Proximity conflict fields
  conflict_type: ConflictType;
  days_apart: number | null;
  remind_at: string | null;       // ISO date — re-surface proximity conflict on this date
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
  service_type_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ServiceType {
  id: string;
  name: string;
  product_category_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProductCategory {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string;
  sort_order: number;
  created_at: string;
  // joined
  children?: ProductCategory[];
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
  // Scheduling frequency (item 4)
  frequency_type: FrequencyType;
  slot_a_label: string | null;   // twice_daily: label for slot A (default "Morning")
  slot_a_time: string | null;    // HH:MM
  slot_b_label: string | null;
  slot_b_time: string | null;
  // Time of day (item 3)
  scheduled_time: string | null;       // HH:MM
  time_of_day_label: string | null;    // e.g. "After shower"
  // Routine membership (Phase 2)
  routine_id: string | null;
  // Service provider
  service_provider_id: string | null;
  // Per-ritual provider cost & formatted phone (stored as digits)
  provider_cost: number | null;
  provider_phone: string | null;
  // Autocomplete — mark kept automatically at the scheduled time
  autocomplete_enabled: boolean;
  // Prep notes shown before this ritual (replaces reminder_notes conceptually)
  prep_notes: string | null;
  // Structured reminder
  reminder_enabled: boolean;
  reminder_value: number;
  reminder_unit: 'minutes' | 'hours' | 'days' | 'weeks';
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
  // Auto-Adjust snap-back: original window start before the instance was moved
  original_scheduled_date: string | null;
  // Time of day (item 3) — inherited from task, overridable per instance
  scheduled_time: string | null;
  time_of_day_label: string | null;
  // Twice-daily slot identifier (item 4): 'a' | 'b' | null
  slot: 'a' | 'b' | null;
  // Stub instance added during gap period before first countdown instance
  is_stub_instance: boolean;
  stub_date: string | null;
  // Set to true when marked kept automatically via autocomplete
  auto_completed: boolean;
  // Tracks which linked_tasks row generated this instance (always_together)
  generated_by_link_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  task?: Task;
}

export interface LinkedTask {
  id: string;
  user_id: string;
  task_a_id: string;
  task_b_id: string;
  link_type: LinkType;
  occurrence_interval: number;
  primary_task_id: string | null;
  occurrence_count: number;
  created_at: string;
}

export interface Product {
  id: string;
  user_id: string;
  name: string;
  brand: string | null;
  notes: string | null;
  product_url: string | null;
  reorder_url: string | null;
  product_category_id: string | null;
  // Container / depletion tracking
  container_size: number | null;        // e.g. 150
  container_unit: string | null;        // e.g. 'ml', 'kit', 'strips'
  remaining_amount: number | null;      // decremented on each kept instance
  is_depleted: boolean;
  alert_threshold_uses: number | null;  // warn when uses remaining ≤ this
  last_restocked_at: string | null;
  expires_at: string | null;   // ISO date, first of month
  // Legacy (kept for compat)
  uses_per_supply_unit: number | null;
  supply_warning_threshold: number | null;
  created_at: string;
  updated_at: string;
  // joined
  category?: ProductCategory;
}

export interface TaskProduct {
  id: string;
  task_id: string;
  product_id: string;
  user_id: string;
  track_usage: boolean;
  purchase_price: number | null;
  uses_per_container: number | null;
  cost_per_use: number | null;        // generated by DB: purchase_price / uses_per_container
  use_amount_override: number | null; // amount consumed per use (overrides container_size / uses_per_container)
  created_at: string;
  product?: Product;
}

export interface ProductAlert {
  id: string;
  user_id: string;
  product_id: string;
  task_id: string | null;
  instance_id: string | null;
  alert_type: 'last_use' | 'depleted';
  status: 'pending' | 'dismissed' | 'actioned';
  created_at: string;
  updated_at: string;
  // joined
  product?: Product;
  task?: Task;
}

export interface ProductUsageLog {
  id: string;
  user_id: string;
  product_id: string;
  task_id: string | null;
  instance_id: string | null;
  amount_used: number | null;
  unit: string | null;
  remaining_after: number | null;
  logged_at: string;
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
  brand: string;
  description: string;
  product_url: string;
  product_category_id: string;
  track_usage: boolean;
  container_size: number | '';
  container_unit: string;
  use_amount_override: number | '';
  purchase_price: string;           // cost of one container
  uses_per_container: number | '';  // expected uses from that container
  expires_at: string;               // 'YYYY-MM-DD' or ''
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
  // Frequency (item 4)
  frequencyType: FrequencyType;
  // Interval — used when frequencyType === 'interval'; stored as days in DB
  intervalType: IntervalType;
  intervalMin: number;
  intervalMax: number;
  intervalUnit: IntervalUnit;
  // Twice-daily slots (item 4)
  slotALabel: string;
  slotATime: string;   // HH:MM or ''
  slotBLabel: string;
  slotBTime: string;   // HH:MM or ''
  // Time of day (item 3) — for interval/daily frequency
  scheduledTime: string;        // HH:MM or ''
  timeOfDayLabel: string;       // max 20 chars, '' = no label
  default_reminder_days: number;
  // Standard mode anchor
  initial_anchor_date: string;    // empty string = today
  // Countdown mode
  target_date: string;
  target_label: string;
  days_before_target: number;
  continue_after_target: boolean;
  // Section 3: provider cost & phone
  provider_cost: string;
  provider_phone: string;
  // Section 4: prep notes + structured reminder
  prep_notes: string;
  autocomplete_enabled: boolean;
  reminder_enabled: boolean;
  reminder_value: number;
  reminder_unit: 'minutes' | 'hours' | 'days' | 'weeks';
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
