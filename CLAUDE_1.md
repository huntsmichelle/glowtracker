# GlowLoop — Claude Code Project Instructions

This file is read automatically at the start of every Claude Code session.
Follow all instructions here without being asked.

---

## Session startup — always do this first

1. Read this file completely before doing anything else
2. Run `git log --oneline -10` to see what was last worked on
3. Check which prompt file was most recently applied by scanning recent commit messages or asking: "What version are we on?"
4. Resume from where the last session ended — do not ask the user to re-explain the project
5. If context is unclear, check the project root for `AUDIT_LOG.md` or ask the user which version to reference
6. Confirm readiness with a one-line status: "Resuming from v[X.X] — last worked on [feature]. Ready."

---

## Project overview

**App name:** GlowLoop (formerly GlowTracker)
**Stack:** Next.js (App Router) + Supabase + Tailwind CSS
**Deployed:** Vercel
**Purpose:** A self-maintenance ritual tracker — recurring beauty, grooming, and wellness tasks with scheduling, conflict detection, product tracking, and cost management.
**User-facing language:** Calm, editorial, "quiet luxury" — not a beauty influencer app.

---

## Architecture

```
/app                  Next.js App Router pages
  /today              Dashboard / Today page (default route)
  /horizon            All upcoming instances — flat list, one per task
  /tasks              Ritual (task) list
  /tasks/[id]         Ritual detail / instance detail
  /tasks/new          Create new ritual (4-section form)
  /routines           Routine list + template atrium tiles
  /routines/[id]      Routine detail (conflict rules, timing rules)
  /routines/new       Create routine
  /shelf              Product inventory
  /auth/callback      OAuth callback handler (Google, future)
/components           Shared UI components
/lib                  Business logic
  instanceEngine.ts   Instance generation (canonical — use this)
  conflictDetection.ts
  conflictResolution.ts
  costCalculations.ts
  categoryColors.ts
  suggestions.ts
/supabase/migrations  SQL migration files
/supabase/seeds       Seed data SQL files
styles/tokens.css     Design tokens — source of truth for all colors
AUDIT_LOG.md          Phase 3 audit log — check for context on security/perf work
```

**Dead code — do not reference:**
- `lib/occurrenceEngine.ts` — deprecated stub, safe to delete
- `lib/taskEngine.ts` — deprecated stub, safe to delete
- `components/RoutineFromTemplateClient.tsx` — superseded by three-step template flow, keep until replacement confirmed

---

## Database — key tables

| Table | Purpose |
|-------|---------|
| `tasks` | Recurring ritual series |
| `instances` | Individual scheduled occurrences |
| `routines` | Named groups of related tasks |
| `routine_task_pairs` | Per-pair conflict/timing rules |
| `routine_conflicts` | Detected overlaps between instances |
| `categories` | Task categories (Skin, Hair, Nails, etc.) |
| `profiles` | User profiles + app_role ('user' \| 'admin') |
| `products` | Product inventory (shelf) |
| `task_products` | Products linked to tasks with cost tracking |
| `service_providers` | Stylist/provider records |
| `common_tasks` | Reference database of known tasks |
| `common_task_relationships` | Known conflict/sync pairs |
| `user_suggestion_dismissals` | Dismissed suggestion prompts |
| `linked_tasks` | Cross-task relationships |
| `link_resolution_rules` | Rules for linked task conflicts |
| `prep_steps` | Prep step records |

### Key column notes
- `tasks.category_id` — UUID FK to `categories` (NOT a text column)
- `tasks.frequency_type` — `'interval'` \| `'daily'` \| `'twice_daily'`
- `tasks.mode` — `'recurring'` \| `'countdown'`
- `instances.status` — `'upcoming'` \| `'projected'` \| `'completed'` \| `'skipped'` \| `'ready_for_refresh'`
- `instances.archived` — BOOLEAN, default FALSE. All queries must filter `.eq('archived', false)`
- `routines.conflict_intent` — `'unset'` \| `'independent'` \| `'managed'`
- `routines.is_system_template` — TRUE for built-in templates
- `profiles.app_role` — `'user'` \| `'admin'`
- System template / admin user ID: `db24c2d7-e677-45af-add3-a155a87c75e0`

---

## Design tokens — ALWAYS use these, never hardcode colors

```css
--cream:       #efe9dd   /* page background */
--paper-soft:  #f6f1e6   /* cards, panels */
--ink:         #2b2823   /* primary text, dark actions */
--ink-soft:    #6b665e   /* secondary text */
--ink-faint:   #a8a297   /* tertiary, overlines, placeholders */
--divider:     #cdc6b6   /* borders, hairlines */
--sage:        #8ea394   /* today / active accent */
--bluegrey:    #93a3b1   /* alternate accent */
--taupe:       #b5a89a   /* alternate accent */
--refresh:     #c08a6e   /* ready for refresh — never red */
```

**Rules:**
- One accent at a time — never combine sage + bluegrey + taupe
- No red anywhere — `--refresh` replaces red for all alerts
- No pure black — use `--ink`
- No white — `--paper-soft` for cards, `--cream` for pages
- No bright Tailwind defaults (`bg-pink-*`, `bg-blue-*`, `bg-purple-*`)

---

## Typography

```
Headings (h1, h2):  EB Garamond — display serif, brand voice
Body / UI:          Inter
Overline / kicker:  Inter, 10px, weight 600, letter-spacing 0.18em, uppercase, --ink-faint
Margin notes only:  Caveat
```

Hero headings: 40–48px, line-height 1.05
Card section headings: overline kicker only — no large charcoal heading inside cards

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
Always use `getCategoryColor()` from `lib/categoryColors.ts`. Never Tailwind color classes on category elements.

### Cards
- Background: `--paper-soft`
- Border: `1px solid --divider`
- Border-radius: 16px
- Shadow: `0 1px 3px rgba(43,40,35,0.06)`

### Empty states
```
[Italic serif phrase ~22px]
[40px hairline rule, --divider]
[Small caps text link, --ink-faint]
```

### Row actions — progressive disclosure
Default: name + one primary action
Hover/expand: Pass, Defer, Adjust for event, Delete

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

---

## Standing rules — never deviate

1. Never change logic, routing, or schema unless explicitly asked
2. Always use design tokens — no hardcoded hex in components
3. Never silently swallow Supabase errors — catch, log, surface to user
4. Upserts use explicit `onConflict` targets
5. Date comparisons use local dates — never UTC for display/grouping
6. RLS required on every new table
7. One batch upsert over multiple sequential upserts
8. System templates are read-only — copies only, never modify originals
9. No red — use `--refresh` terracotta for alerts
10. All instance queries must include `.eq('archived', false)`
11. `auth.uid()` in RLS policies must be wrapped as `(SELECT auth.uid())` for performance
12. Never create duplicate RLS policies on the same table/role/action combination

---

## Security — Phase 3 complete (May 2026)

- RLS enabled and optimized on all tables
- `(SELECT auth.uid())` pattern applied to all policies
- Admin role infrastructure: `profiles.app_role`, `is_admin()` function
- New user trigger: `handle_new_user()` auto-creates profile on signup
- Auth middleware in `middleware.ts` protects all routes
- Google OAuth wired behind `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=false` flag
- OAuth callback handler at `app/auth/callback/route.ts`
- All foreign keys have covering indexes
- `instances.archived` column added for future archiving
- `handle_new_user` and `update_updated_at` have fixed `search_path`
- EXECUTE revoked from anon/authenticated on `handle_new_user`

**Manual items still pending:**
- Enable leaked password protection (Supabase Auth settings)
- Update Next.js when PostCSS ≥ 8.5.10 ships in a stable release
- Set up connection pooling URL in Vercel for serverless
- Configure Supabase Auth rate limits
- Enable 2FA on Supabase project owner account

---

## Conflict system

- **No Conflict** — both happen, no cadence change
- **Ask Me Each Time** — prompt on each overlap
- **Auto-Adjust** — Advance (earlier) or Delay (later) by X days, optional snap-back
- **Skip One** — one task skips, both reanchor to conflict date
- `conflict_intent = 'independent'` → auto-resolve silently, no badge
- `conflict_intent = 'managed'` → detect and show pending conflicts
- Save All Rules → resolves ALL pending conflicts unconditionally
- Proximity detection available per pair with asymmetric direction support

---

## Phase roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | ✅ Complete | Core task + instance engine |
| Phase 2 | ✅ Complete | Routines, conflict detection, templates |
| Phase 3 | ✅ Complete | Security, performance, scalability audit |
| Phase 4 | 🔜 Next | Product tracking |
| Phase 5 | Planned | Onboarding + app experience |
| Phase 6 | Planned | Reminders & notifications |
| Phase 7 | Planned | Insights & reporting |
| Phase 8 | Planned | Google Calendar integration |
| Phase 9 | Planned | Prep for social layer |

---

## Version history (prompt files in project root or /docs)

| Version | Key features |
|---------|-------------|
| Phase 2 | Routines, conflict detection, templates |
| v2.1–v2.4 | Conflict rules persistence, batch save, badge fixes |
| v2.5 | Time of day, twice-daily, order of operations |
| v2.6 | Seed data, suggestions engine |
| v2.7 | Conflict intent layer, badge fixes |
| v2.8 | Proximity timing rules, category colors |
| v2.9 | Today page, mobile atrium, template SQL |
| v2.10 | Horizon page, four-column Today layout |
| v2.11 | Task form restructure, cost model, autocomplete, stub period |
| v2.12 | UI refinement pass (partially reverted in v2.13) |
| v2.13 | Today rollback, Horizon dates, ✓/✕ actions, defer rename |
| v2.13 fixes | Analog clock, toggle fix, collapsible form, template tiles |
| Template flow | Three-step use-template → rename → countdown → create |
| Phase 3 | Full security + performance audit, admin role, indexes |
