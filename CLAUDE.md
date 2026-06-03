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
```

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
`tasks`, `instances`, `routines`, `routine_task_pairs`, `categories`,
`profiles`, `products`, `task_products`, `common_tasks`, `template_task_rules`,
`service_providers`

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
- Settings, Profile

Root route: logged-out → /home (marketing), logged-in → /today

---

## Page Structure

**/today** — 4-column layout:
- Col 1: Nav
- Col 2: In Sequence card (rolling 7-day stats: COMPLETED/READY/PAST WINDOW) + ritual list + "Next: xxx" when empty
- Col 3: Horizon summary card + Rhythm card (heat strip, not calendar) + Shelf alert (conditional)
- Col 4: Insights footer

**/horizon** — three sections: Ready now (sage) / This week / Later. Action bar collapsed by default.

**/library** — In Motion routines + Category cards (2-3 col grid) + Individual Rituals (SEE ALL link only)

**/add** — entry hub: Maintain Something / Prepare for Something / Add a Ritual / Add a Product (placeholder) / Build custom (small link)

**/add/ritual** — ritual library search from common_tasks

**/calendar** — full calendar view (not embedded in Today)

**/waitlist** — public waitlist form (no auth required)

**/home** — marketing homepage (Homepage__2_.html)

---

## Conflict System

Resolution types: `no_conflict` | `ask` | `auto_adjust` | `skip_one` | `replace` | `always_together`

**replace** (new): anchor task always wins, subordinate auto-skipped, both cadences continue independently.

`routine_task_pairs` uses `task_a_id` and `task_b_id` — NOT `task_id`.
Tasks link to routines via `tasks.routine_id` column directly.

---

## Templates

System templates: `routines.is_system_template = TRUE`, owned by admin user.
Current templates: Hair Color Maintenance, Bridal Beauty Prep (26 tasks).
`template_task_rules` table: filters tasks by timing for event-prep templates.

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

---

## Phase Roadmap

| Phase | Status |
|-------|--------|
| 1–3 | ✅ Core engine, routines, security |
| 4 | ✅ Product tracking (web, hidden mobile) |
| 5a | ✅ Onboarding flow |
| 6 / 6C | 🔄 Mobile app, Play Store, creation flow overhaul |
| 7 | Planned: Notifications |
| 8 | Planned: Insights + reporting |
| 9 | Planned: Google Calendar integration |

---

## Current Status (as of v6C.1)

- Web and mobile running in parallel
- Mobile: versionCode 13, OTA updates via expo-updates (branch: production)
- Play Store: Internal testing track live
- Waitlist: tendtooapp.com/waitlist → Google Sheets
- Marketing homepage: tendtooapp.com
- v6C.1 cleanup in progress: save ritual fix, data query fixes, Me screen, Today fixes
