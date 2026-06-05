# tend, too — Web App (Claude Code Instructions)

Read this file completely before doing anything else in a new session.

---

## App Identity

**App name:** tend, too  
**Tagline:** Because you're also on the list.  
**Former name:** GlowLoop — retired, never use in any user-facing string  
**Web project:** `C:\GlowLoop` (Next.js + Supabase + Tailwind)  
**Mobile project:** `C:\GlowLoopMobile` (React Native + Expo)  
**Supabase:** shared backend, admin user ID: `db24c2d7-e677-45af-add3-a155a87c75e0`  
**Domains:** tendtooapp.com, tendtoo.app → same Vercel project  
**Waitlist:** tendtooapp.com/waitlist → Google Sheets via service account  

---

## Session Startup

1. Read this file completely
2. Run `git log --oneline -5` to see what was last worked on
3. Confirm readiness: "Resuming from [last commit]. Ready."

---

## Tech Stack

- Next.js App Router (`/app` directory)
- Supabase (auth, database, RLS)
- Tailwind CSS
- TypeScript
- Vercel deployment

---

## Design Tokens

```css
--cream:      #f3ecd9;   /* warm ivory canvas */
--paper-soft: #faf4e6;   /* warm ivory surface */
--ink:        #352720;   /* deep espresso */
--ink-soft:   #6b5c52;
--ink-faint:  #a8998e;
--divider:    #ddd4c4;
--sage:       #6e8c82;   /* soft mineral green */
--bluegrey:   #93a3b1;
--refresh:    #c08a6e;   /* terracotta — alerts only, never red */
--dusty-rose: #c4918a;
--blush:      #d4a8a0;
--apricot:    #d4a478;
--marigold:   #d4b870;
--plum:       #9D91B5;
--mist:       #c8ddd6;   /* soft cool mint — Nails category */

/* Color "defaults" — three distinct jobs (do NOT collapse into one name): */
/* 1. Category-dot fallback (uncategorized) = --ink-faint #a8998e — use inkFaint, no separate token */
--category-db-default: #6B7280;  /* 2. categories.color DB default value (NOT the dot fallback) */
--routine-db-default:  #a6adc5;  /* 3. routines.color DB default value (retired #EC4899) */

/* Soft-sage hero card family — NOT the saturated --sage */
--card-sage-bg:     #e2dace;
--card-sage-border: #c7d4c5;
--card-sage-accent: #6e8478;
--card-sage-status: #5e7466;
--card-sage-sub:    #88958a;
```

Tokens live in `lib/colors.ts` (TS) and `styles`/`app/globals.css` (CSS) — keep both in sync.

No red anywhere — use `--refresh` for alerts.
No pure black — use `--ink`.
No white — use `--paper-soft` or `--cream`.

## Category Colors

| Category | Color token |
|----------|-------------|
| Hair | apricot `#d4a478` |
| Skin | bluegrey `#93a3b1` |
| Nails | mist `#c8ddd6` |
| Makeup | plum `#9D91B5` |
| Hair Removal | marigold `#d4b870` |
| Wellness | dusty rose `#c4918a` |
| Brows & Lashes | blush `#d4a8a0` |

## Category Icons (Lucide)

Hair=Scissors, Skin=Droplets, Nails=Hand, Makeup=Palette,
Hair Removal=Zap, Brows & Lashes=Eye, Wellness=Heart

---

## Typography

- Headings: EB Garamond
- Body/UI: Inter
- Overlines: Inter 600, 10px, 1.8em letter-spacing, uppercase, `--ink-faint`

---

## Database — Critical Rules

**Column names (instances table):**
- Date column: `due_date_start` (NOT scheduled_date)
- Completion date: `actual_completion_date` (NOT completed_date)
- `archived` column does NOT exist — never filter on it
- Always filter: `.eq('is_projected', false)` to exclude projected instances
- Status values: `'upcoming'` | `'completed'` | `'skipped'` | `'projected'`
- mode column: `'standard'` | `'countdown'` ONLY

**Every instances query must:**
1. Use `due_date_start` for date filtering
2. Use `actual_completion_date` for completion dates
3. Include `.eq('is_projected', false)`
4. NOT include `.eq('archived', false)` — column doesn't exist
5. Include `.eq('user_id', userId)` explicitly

**Key tables:**
`tasks`, `instances`, `routines`, `routine_task_pairs`, `routine_conflicts`,
`categories`, `profiles`, `products`, `task_products`, `common_tasks`,
`template_task_rules`, `service_providers`

> DROPPED this session: `linked_tasks`, `link_resolution_rules`,
> `instances.generated_by_link_id` (+ its index/FK). `lib/linkedTaskEngine.ts`
> was dead code and was deleted. Never reference any of these — they no longer
> exist. See Conflict System.

**Routines:**
- `routines.category` (TEXT) was DROPPED → `routines.category_id` (uuid FK →
  `categories`). Read/write via `category_id` (join `categories` for name/color).
  6 event-prep routines have `category_id = NULL` by design (old text "Event"
  was never a category) — render null as "unset", never an error.
- `routines.color` DB default is now `#a6adc5` (#EC4899 fully retired — zero
  references should remain in web code).

**Reminder storage (shared schema; web mirrors mobile):**
- `scheduled_time` (TIME) = AM / single slot
- `scheduled_time_pm` (TIME, nullable) = PM slot (null unless twice-daily)
- `reminder_hours` (int, nullable) = hours-before offset (0 = at the slot) —
  daily / twice-daily reminders
- `default_reminder_days` (int, CHECK 0–14) = day-based offset — KEEP
- `reminder_value` / `reminder_unit` (NOT NULL) = the source for INTERVAL-cadence
  reminders (days/weeks), distinct from `reminder_hours` — KEEP (web reads+writes
  them; not vestigial)
- Twice-daily times are CANONICAL on `scheduled_time` (AM) / `scheduled_time_pm`
  (PM); the generator reads those directly and hardcodes "Morning"/"Evening"
  labels. The old `slot_a_time`/`slot_b_time`/`slot_a_label`/`slot_b_label`
  columns were dropped (migration `20260604`). Do not reintroduce them.

**Architecture — instance generation is CLIENT-SIDE:**
- No server-side generator (public schema has only `handle_new_user` +
  `update_updated_at`). Generation / conflict-resolution / reflow live in app
  code — keep consistent across BOTH repos.
- Override/scheduling columns — KEEP all six:
  - `override_next_date` — next-instance anchor override (read by the engine)
  - `calendar_event_date` — completion date stamped for calendar/heat display
  - `snooze_until` — date a deferred instance resurfaces
  - `is_stub_instance` — flag: added one-off stub, not part of the cadence
  - `original_scheduled_date` — intentional WRITE-ONLY audit copy of the pre-skip
    start date (not debt)
  - `stub_date` — intentional WRITE-ONLY record of a stub's chosen date (not debt)

**`routine_task_pairs` extra columns:**
- `link_type` — load-bearing (`conflictDetection` skips `always_together` pairs).
  KEEP.
- `occurrence_interval` / `primary_task_id` — every-N storage; MIGRATED to
  `cadence_couplings` and dropped (migration `20260605_b5`). `LinkRulesPanel` no
  longer offers the every-N option.
- `occurrence_count` — dropped (migration `20260604`; was type-only, unused).

**Cadence coupling (every-N-occurrences):** `cadence_couplings`
(`anchor_task_id`, `dependent_task_id`, `interval_n`, `count_mode 'all'|'kept'`,
`unique(dependent_task_id)`) + `instances.linked_anchor_instance_id` (nullable
FK → `instances`, `ON DELETE SET NULL`). Logic in `lib/cadenceCoupling.ts`; UI is
`components/CadenceCouplingPanel.tsx` on the ritual detail page. **GUARDRAIL:**
`linked_anchor_instance_id` is TETHER-ONLY (date-follow pointer) — NO instance
generation ever reads it to spawn/regenerate (that was the `generated_by_link_id`
trap). Counting walks forward from the current tether (re-tether re-bases).
Hooks: `followAnchorMove` (on anchor move), `promoteDependentsOnAnchorDelete`
(before anchor-ritual delete — mandatory order), `onAnchorOccurrenceKept`
('kept' mode reactive generation). every-N coupling and a spacing rule are
mutually exclusive for a pair (validated at create).

**Admin user ID:** `db24c2d7-e677-45af-add3-a155a87c75e0`

---

## UI Terminology

| Code/old | User-facing |
|----------|-------------|
| task | ritual |
| overdue | past window |
| mark complete | mark kept |
| skip | pass |
| conflict | overlap |
| autocomplete_enabled | make this a habit |
| Conflict Rules | Spacing Preferences |

---

## Navigation Structure

Sidebar nav:
- Today → /today
- Horizon → /horizon  
- Library → /library (replaces separate Rituals + Routines)
- Shelf → disabled placeholder (BetaA — products hidden)
- Sign out (button, not a route)
- Settings, Profile — (planned, not built; no `/settings` or `/profile` routes exist)

Root route: logged-out → /home (marketing), logged-in → /today

---

## Page Structure

**/today** — 4-column layout:
- Col 1: Nav
- Col 2: In Sequence hero card (soft-sage wash, `--card-sage-*`): "Today" kicker + "In sequence" title, rolling 7-day stats KEPT/ACTIVE/ATTENTION (Inter 300 numbers), italic status line, "Next" block (soonest upcoming), then the ritual list
- Col 3: Horizon summary card + Rhythm card (heat strip, not calendar) + Shelf alert (conditional)
- Col 4: Insights footer

**/horizon** — three sections: Ready now (sage) / This week / Later. Action bar collapsed by default.

**/library** — In Motion routines + Category cards (2-3 col grid) + Individual Rituals (SEE ALL link only)

**/add** — entry hub: Maintain Something / Prepare for Something / Add a Ritual / Add a Product (placeholder) / Build custom (small link)

**/add/ritual** — ritual library search from common_tasks

**/calendar** — full calendar view (not embedded in Today)

**/waitlist** — public waitlist form (no auth required)

**/home** — marketing homepage (served from `brand/homepage.html` via `app/home/route.ts`)

---

## Conflict System

**KEEP tables:** `routine_task_pairs` (rule definitions) + `routine_conflicts`
(detected runtime conflicts). `routine_task_pairs` uses `task_a_id`/`task_b_id`
(NOT `task_id`); tasks link to routines via `tasks.routine_id` directly.

- **`rule_type`** (KIND): `keep_apart` | `replace` | `always_together`
- **`default_resolution`** (ACTION): `no_conflict` | `ask` | `auto_adjust` | `skip_one`
- **`anchor_common_task_id`** required when `rule_type = 'replace'` — the anchor
  wins, the subordinate instance is auto-skipped, both cadences continue.

**Live within-routine logic:** `lib/conflictDetection.ts` +
`components/LinkRulesPanel.tsx` operate on `routine_task_pairs`. KEEP these. The
web detail page hosts `LinkRulesPanel` at `/routines/[id]/conflicts`.

**Cross-ritual on-add detection scan = SPEC ONLY, not built** (needs a catalog
keyed on `common_task_id`). See `docs/conflict-catalog-spec.md`.

**DROPPED this session:** `linked_tasks`, `link_resolution_rules`,
`instances.generated_by_link_id` (+ index/FK). `lib/linkedTaskEngine.ts` was
dead code and was DELETED. Never reference these — they no longer exist.

---

## Templates

System templates: `routines.is_system_template = TRUE`, owned by admin user.
Current templates: Hair Color Maintenance, Bridal Beauty Prep (26 tasks).
`template_task_rules` table: filters tasks by timing for event-prep templates.

---

## Routine Detail / Edit Page (web)

`/routines/[id]` — detail page (links OUT to the ritual edit form; no inline
ritual editing):
- **Header:** name, ritual count, "Next: <ritual>, <date>", "Active since
  <month year>".
- **Timeline:** "Next 90 days" preview.
- **Rituals list** (the heart): each ritual → existing ritual edit form
  (`/tasks/[id]/edit`). Web routes ritual → detail → edit, kept intentionally
  for within-web consistency. "+ Add Ritual" button.
- **Settings:** Category EDITABLE via `category_id` picker (writes
  `routines.category_id`; null = "unset"); Routine Type read-only
  (`routines.routine_type`); Start point display-only (derived from
  `tasks.initial_anchor_date`: manual date vs first-ritual completion); Event
  target HELD (display-only for event-prep).
- **Conflicts:** summary card ("N rules configured" → Manage) →
  `/routines/[id]/conflicts` (hosts `LinkRulesPanel`).
- **NO automation section** — passive tracking is a ritual-level setting on the
  ritual form.

---

## Events (planned, not built)

Events (weddings/vacations) are being redesigned as FIRST-CLASS objects +
blackout logic (suspend/move instances in a window). Separate spec. Event-target
date editing + reflow are HELD. Reflow rule when built: **future instances only;
completed/skipped never change.** Event data is currently scattered
(`tasks.target_date`/`target_label`, `instances.event_date`/`event_name`,
`profiles.onboarding_event_date`).

---

## Standing Rules

1. App is "tend, too" — never GlowLoop in any user-facing string
2. No hardcoded hex — only CSS variables or lib/colors.ts tokens
3. Never `.eq('archived', false)` on instances
4. Always `.eq('is_projected', false)` on instances
5. mode column: 'standard' | 'countdown' only
6. Shelf hidden from nav (BetaA)
7. Product tracking deferred to BetaB
8. RLS on every new table using `(SELECT auth.uid())` pattern
9. No red — use `--refresh` terracotta for alerts
10. All changes run in parallel on web and mobile
11. Conflict system = `routine_task_pairs` / `routine_conflicts`. The
    `linked_tasks` family is DROPPED — never reference it.
12. Routine category is `category_id` (FK); the text column is gone. Null = unset.
13. Reminder hours = `reminder_hours` (daily/twice-daily); day-based =
    `default_reminder_days`; interval-cadence = `reminder_value`/`reminder_unit`.
    Twice-daily times are canonical on `scheduled_time`/`scheduled_time_pm` —
    `slot_a`/`slot_b` columns were dropped; never reintroduce them.
14. Instance generation is client-side; keep logic consistent across both repos.

---

## Phase Roadmap

| Phase | Status |
|-------|--------|
| 1–3 | ✅ Core engine, routines, security |
| 4 | ✅ Product tracking (web, hidden mobile) |
| 5a | ✅ Onboarding flow |
| 6 / 6C | ✅ Mobile app, Play Store, creation flow overhaul |
| 7 | ✅ Notifications (mobile) |
| 8 | Planned: Insights + reporting |
| 9 | Planned: Google Calendar integration |

---

## Current Status (v7.4 + schema cleanup complete)

- Web + mobile in parallel; web deploys on git push (Vercel)
- Mobile: versionCode 14, runtime 1.1.0, Play internal testing; Phase 7
  notifications shipped (mobile)
- Web parity: hero card (soft-sage), reminder form, `category_id` FK, color
  tokens done; routine detail page parity in progress (header / category-edit /
  conflicts-page focused push)
- Schema cleanup complete: `routines.category_id` FK (text dropped), color
  default `#a6adc5`, `linked_tasks` family dropped, conflict system consolidated
  on `routine_task_pairs` / `routine_conflicts`
- Waitlist + marketing homepage live
