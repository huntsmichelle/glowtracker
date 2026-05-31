# tend, too — Claude Code Project Instructions (Web)

This file is read automatically at the start of every Claude Code session.
Follow all instructions here without being asked.

---

## App identity

**App name:** tend, too
**Tagline:** Because you're also on the list.
**Former name:** GlowLoop (retired — do not use)
**Web project location:** `C:\GlowLoop` (folder name unchanged for now)
**Mobile project location:** `C:\GlowLoopMobile`

---

## Session startup — always do this first

1. Read this file completely before doing anything else
2. Run `git log --oneline -10` to see what was last worked on
3. Check which prompt file was most recently applied by scanning recent commit messages or asking: "What version are we on?"
4. Resume from where the last session ended — do not ask to re-explain the project
5. If context is unclear, check the project root for `AUDIT_LOG.md` or ask the user which version to reference
6. Confirm readiness with a one-line status: "Resuming from v[X.X] — last worked on [feature]. Ready."

---

## Project overview

**Stack:** Next.js (App Router) + Supabase + Tailwind CSS
**Deployed:** Vercel
**Purpose:** A self-maintenance ritual tracker — recurring beauty, grooming, and wellness tasks with scheduling, conflict detection, product tracking, and cost management.
**User-facing language:** Calm, editorial, "quiet luxury" — not a beauty influencer app.
**Voice:** "The sophisticated friend who reminds you, without judgment, that you matter."

---

## Architecture

```
/app
  /today              Dashboard / Today page (default route)
  /horizon            All upcoming instances — flat list, one per task
  /tasks              Rituals — category card landing, drills to list
  /tasks/new          Create new ritual (4-section form)
  /routines           Routine list + template atrium tiles
  /routines/[id]      Routine detail (conflict rules, timing rules)
  /routines/new       Create routine
  /shelf              Product inventory — category grouped
  /settings           User settings + re-trigger onboarding
  /onboarding         First-run flow (overlay)
  /auth/callback      OAuth callback handler
/components
  DepletionBar.tsx    Reusable battery-style depletion bar
  SpendBar.tsx        Actual vs projected spend bar
  ClockPicker.tsx     Analog clock time picker (12hr + AM/PM)
/lib
  instanceEngine.ts   Instance generation (canonical)
  conflictDetection.ts
  conflictResolution.ts
  costCalculations.ts
  categoryColors.ts   Imports from colors.ts
  colors.ts           Single source of truth for ALL colors
  productTracking.ts  Usage depletion, alerts, restock logic
  suggestions.ts
/supabase/migrations
/supabase/seeds
styles/tokens.css     CSS custom properties
AUDIT_LOG.md          Phase 3 audit log
```

**Dead code — safe to delete:**
- `lib/occurrenceEngine.ts` — deprecated stub
- `lib/taskEngine.ts` — deprecated stub
- `components/RoutineFromTemplateClient.tsx` — superseded, keep until replacement confirmed

---

## Database — key tables

| Table | Purpose |
|-------|---------|
| `tasks` | Recurring ritual series |
| `instances` | Individual scheduled occurrences |
| `routines` | Named groups of related tasks |
| `routine_task_pairs` | Per-pair conflict/timing rules |
| `routine_conflicts` | Detected overlaps |
| `categories` | Task categories |
| `profiles` | User profiles, app_role, onboarding state |
| `products` | Product inventory (shelf) |
| `task_products` | Products linked to tasks with usage tracking |
| `product_categories` | Three-level product category tree |
| `product_alerts` | Depletion and expiration alerts |
| `product_usage_log` | Immutable usage event log |
| `service_providers` | Stylist/provider records |
| `service_types` | Seed service type options |
| `linked_tasks` | Cross-task relationships |
| `link_resolution_rules` | Rules for linked task conflicts |
| `common_tasks` | Reference database |
| `common_task_relationships` | Known conflict/sync pairs |
| `user_suggestion_dismissals` | Dismissed suggestions |

### Key column notes
- `tasks.category_id` — UUID FK to `categories` (NOT text)
- `tasks.frequency_type` — `'interval'` | `'daily'` | `'twice_daily'`
- `tasks.mode` — `'recurring'` | `'countdown'`
- `tasks.autocomplete_enabled` — UI label: "Make this a habit"
- `instances.status` — `'upcoming'` | `'projected'` | `'completed'` | `'skipped'` | `'ready_for_refresh'`
- `instances.archived` — BOOLEAN default FALSE. ALL queries must filter `.eq('archived', false)`
- `instances.generated_by_link_id` — UUID, set when auto-generated via linked task
- `instances.auto_completed` — BOOLEAN, set when autocomplete fires
- `routines.conflict_intent` — `'unset'` | `'independent'` | `'managed'`
- `routines.is_system_template` — TRUE for built-in templates
- `profiles.app_role` — `'user'` | `'admin'`
- `profiles.display_name` — user's first name, set during onboarding
- `profiles.onboarding_completed` — BOOLEAN
- `profiles.onboarding_intent` — `'event'` | `'tracking'`
- `profiles.onboarding_event_date` — DATE, set if intent = 'event'
- `products.reorder_url` — optional URL for reordering
- `products.expires_at` — DATE, month/year precision
- `products.remaining_amount` — current remaining
- `task_products.use_amount_override` — per-task override of default_use_amount
- `linked_tasks.link_type` — `'conflict'` | `'always_together'` | `'every_n_occurrences'`
- System template / admin user ID: `db24c2d7-e677-45af-add3-a155a87c75e0`

---

## Design tokens — ALWAYS use these, never hardcode colors

```css
--cream:       #f3ecd9   /* warm ivory canvas */
--paper-soft:  #faf4e6   /* warm ivory surface — cards, panels */
--ink:         #352720   /* deep espresso — primary text, actions */
--ink-soft:    #6b5c52   /* warm mid-brown — secondary text */
--ink-faint:   #a8998e   /* warm light brown — tertiary, overlines */
--divider:     #ddd4c4   /* warm divider — borders */
--sage:        #6e8c82   /* soft mineral green — active/today accent */
--bluegrey:    #93a3b1   /* alternate accent */
--refresh:     #c08a6e   /* terracotta — depletion/alert, never red */
--dusty-rose:  #c4918a
--blush:       #d4a8a0
--apricot:     #d4a478   /* mid depletion bar */
--marigold:    #d4b870
```

**Rules:**
- No red anywhere — `--refresh` replaces red for all alerts
- No pure black — use `--ink` (deep espresso)
- No white — `--paper-soft` for cards, `--cream` for pages
- No bright Tailwind defaults
- All colors from `lib/colors.ts` — never hardcode hex in components
- Removed: `--taupe` (#b5a89a) — do not use

---

## Typography

```
Headings (h1, h2):  EB Garamond — display serif, brand voice
Body / UI:          Inter
Overline / kicker:  Inter, 10px, weight 600, letter-spacing 0.18em, uppercase, --ink-faint
```

---

## UI conventions

### Buttons — one solid per page maximum
| Type | Style |
|------|-------|
| Primary (one per page) | `bg-[--ink] text-[--cream]` rounded-pill |
| Ghost / secondary | `border 1px --ink, transparent, --ink text` rounded-pill |
| Text link | No border, no fill, `--ink-soft` |
| Destructive | Text only, `--ink-soft`, confirm in modal |
| Row actions | Small text, no background, `--ink-soft`, on hover only |

### Category colors
Always use `getCategoryColor()` from `lib/categoryColors.ts`.

### Depletion bar colors
- > 60%: `--ink` | 30–60%: `--apricot` | 10–30%: `--refresh` | < 10%: pulse

### Empty states
```
[Italic serif phrase ~22px]
[40px hairline rule, --divider]
[Small caps text link, --ink-faint]
```

---

## User-facing terminology (UI strings only)

| Code | UI |
|------|----|
| task | ritual |
| overdue | ready for refresh |
| reminder | prompt |
| mark complete | mark kept |
| snooze / nudge | defer |
| skip | pass |
| conflict | overlap |
| dashboard | today |
| autocomplete_enabled | make this a habit |
| refresh stat label | due |
| app name | tend, too |
| tagline | Because you're also on the list. |

---

## Standing rules — never deviate

1. App is named "tend, too" — never use "GlowLoop" in any user-facing string
2. Never change logic, routing, or schema unless explicitly asked
3. All colors from `lib/colors.ts` — no hardcoded hex in components
4. Never silently swallow Supabase errors
5. Upserts use explicit `onConflict` targets
6. Date comparisons use local dates — never UTC for display
7. RLS required on every new table, using `(SELECT auth.uid())` pattern
8. One batch upsert over multiple sequential upserts
9. System templates read-only — copies only
10. No red — use `--refresh` terracotta for alerts
11. All instance queries must include `.eq('archived', false)`
12. Product tracking failure never blocks marking a ritual kept
13. Always-together linked tasks skip conflict detection
14. `processInstanceKept()` runs after instance marked kept, not before

---

## Security — Phase 3 complete (May 2026)

- RLS enabled and optimized on all tables
- Admin role: `profiles.app_role`, `is_admin()` function
- New user trigger: `handle_new_user()` auto-creates profile
- Auth middleware protects all routes
- Google OAuth wired behind `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false`
- All foreign keys indexed

**Manual items pending:**
- Update Next.js when PostCSS ≥ 8.5.10 ships
- Set up connection pooling URL in Vercel
- Configure Supabase Auth rate limits
- Enable 2FA on Supabase project owner account

---

## Conflict system

- **No Conflict** — both happen, no cadence change
- **Ask Me Each Time** — prompt on each overlap
- **Auto-Adjust** — Advance (earlier) or Delay (later) by X days, optional snap-back
- **Skip One** — one task skips, both reanchor to conflict date
- **Always Together** — same date, no conflict detection
- **Every N Occurrences** — paired task fires every Nth occurrence
- `conflict_intent = 'independent'` → auto-resolve silently, no badge
- Save All Rules → resolves ALL pending conflicts unconditionally

---

## Phase roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Core task + instance engine |
| Phase 2 | ✅ Complete | Routines, conflict detection, templates |
| Phase 3 | ✅ Complete | Security, performance, scalability audit |
| Phase 4 | ✅ Complete | Product tracking, shelf, depletion alerts |
| Phase 5a | ✅ Complete | User onboarding flow |
| Phase 5b | 🔜 Next | App experience / mobile optimization (web) |
| Phase 6 | 🔄 In progress | React Native / Expo mobile app |
| Phase 7 | Planned | Reminders & notifications |
| Phase 8 | Planned | Insights & reporting |
| Phase 9 | Planned | Google Calendar integration |
| Phase 10 | Planned | Prep for social layer |
