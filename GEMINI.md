# GEMINI.md — StaffTrak Project Context

## What this is
StaffTrak: a staff evaluation & HR management web app for K-12 schools, by ScholarPath Systems.
Deployed to production at https://stafftrak.scholarpathsystems.org
Pilot school: Summit Learning Charter (virtual school). MVP testing Apr-May 2026, full launch Fall 2026.

## Tech stack
- Vite + React (JSX), React Router (react-router-dom)
- Tailwind CSS (core utility classes only)
- Supabase (Postgres + Auth + Row Level Security + Edge Functions)
- Deployed via Vercel (push to `main` on GitHub → auto-deploy)
- Brand color: #2c3e7e (dark blue)

## Project structure
- `src/pages/` — 21 page components (Dashboard, Staff, LeaveTracker, Meetings, Observations, SummativeEvaluation, Reports, etc.)
- `src/components/` — Navbar, ProtectedRoute, SummativePDF
- `src/context/AuthContext.jsx` — auth state
- `src/services/emailService.js`
- `src/supabaseClient.js` — Supabase connection
- `supabase/functions/` — Edge functions (import-staff, send-email)

## CRITICAL ARCHITECTURE RULES
1. **StaffTrak pages DO render their own `<Navbar />`.** StaffTrak's App.jsx does NOT use a Layout wrapper. (NOTE: this is the OPPOSITE of the sibling product LeaveTrak, where App.jsx has a Layout wrapper and pages must NEVER render Navbar. Do not confuse the two.)
2. **All Supabase profiles queries that feed a staff-list UI must include `.eq('is_active', true)`** before `.order('full_name')`. This filters out archived staff. Applies everywhere.
3. **Roles** are checked via `<ProtectedRoute allowedRoles={[...]}>`. Valid roles: `district_admin`, `school_admin`, `evaluator`, `hr`, plus an `is_evaluator` flag. Staff/HR routes are role-gated.
4. **Multi-tenant:** all data is isolated by `tenant_id`. The shared Supabase project also serves the sibling product LeaveTrak; tenant_id keeps school data separate. Current pilot tenant_id: `09e6e120-bbac-4516-8483-72b8f331bcd7`.
5. **Protected leave (FMLA/OFLA/PLO)** is tracked in HOURS, not weeks or days. Flat entitlement = 480 hrs (560 hrs for a birthing parent). Do not reintroduce proration formulas.
6. **RLS is ON** for all tables. Be careful with queries; respect existing row-level security policies.

## Routes (StaffTrak)
Public: `/`, `/login`, `/auth/callback`
All authenticated: `/dashboard`, `/goals`, `/self-reflection`, `/my-observations`, `/my-meetings`, `/my-summative`
Admin/Evaluator: `/staff`, `/staff/import`, `/rubrics`, `/goal-approvals`, `/observations`, `/meetings`, `/summatives`
Admin/Evaluator/HR: `/reports`
Admin/HR: `/leave-tracker`

## Dev workflow
- `npm run dev` → localhost:5173
- Git: `git add . && git commit -m "..." && git push` → Vercel auto-deploys
- Repo: github.com/mmarronetravels-sudo/StaffTrak

## Style conventions
- Match existing patterns in neighboring page files before inventing new ones.
- Tailwind core utilities only.
- When in doubt about leave/HR logic, follow the hours-based protected-leave model above.
