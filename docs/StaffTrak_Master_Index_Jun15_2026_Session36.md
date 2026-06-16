# StaffTrak Master Index & Technical Specification

**Created:** February 1, 2026  
**Last Updated:** June 15, 2026 (Session 36 — Email/Password Login Fix + Test Account Access)  
**Company:** ScholarPath Systems  
**Status:** ✅ BOTH PRODUCTS DEPLOYED TO PRODUCTION  
**StaffTrak Live URL:** https://stafftrak.scholarpathsystems.org  
**LeaveTrak Live URL:** https://leavetrak.scholarpathsystems.org  
**Timeline:** MVP Testing April-May 2026, Full Launch Fall 2026  
**Pilot School:** Summit Learning Charter (virtual school)

---

## Session 36 Summary (June 15, 2026)

### Overview
Restored email/password login, which was silently broken across the whole StaffTrak app. Diagnosed via DevTools network capture and a read of the auth code, traced it to a missing `SIGNED_IN` handler in `AuthContext`, applied a one-block fix, and deployed to production. Also clarified how the demo/test logins work so the platform can be reviewed as both a teacher and an admin.

---

### 1. Bug: Email/Password Login Did Nothing ✅ FIXED

**Symptom:** Entering a valid email + password and clicking **Sign In** did nothing — no error message, no redirect. The user stayed on the login page.

**Diagnosis (DevTools Network tab):**
- `token?grant_type=password` → **200** (authentication succeeded — password was correct)
- `profiles?select=id,is_active&id=eq.<uid>` → **200** (profile found, `is_active = true`)

So auth and the profile check both succeeded, yet the app never navigated to the dashboard.

**Root cause:** `src/context/AuthContext.jsx` registered an `onAuthStateChange` listener that **only handled the `SIGNED_OUT` event** — it ignored `SIGNED_IN`. After an email/password login, `Login.jsx` calls `navigate('/dashboard')` (a client-side route change, no page reload). `ProtectedRoute` reads `user` from `AuthContext`, but because the context never processed `SIGNED_IN`, `user` was still `null`. `ProtectedRoute` therefore bounced the user straight back to `/login` — silently, with no error.

**Why Google SSO still worked:** SSO redirects through `/auth/callback` and triggers a **full page reload**. On reload, `AuthContext`'s `init()` runs `getSession()` and sets `user` + profile. Email/password never reloads the page, so the context was never updated. This is why only email/password logins were affected.

**The fix:** Extend the `onAuthStateChange` listener to also handle `SIGNED_IN` (and `TOKEN_REFRESHED`) — set the user and fetch the profile. The profile fetch is deferred with `setTimeout(..., 0)` to avoid the documented Supabase deadlock when calling Supabase from inside the auth callback.

```js
const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  if (_event === 'SIGNED_OUT') {
    setUser(null);
    setProfile(null);
    setLoading(false);
  } else if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED') {
    if (session?.user) {
      setUser(session.user);
      // Defer Supabase call out of the auth callback to avoid deadlocks
      setTimeout(() => { fetchProfile(session.user.id); }, 0);
    }
  }
});
```

**Files Changed:**
| Repo | File | Change |
|------|------|--------|
| StaffTrak | `src/context/AuthContext.jsx` | Added `SIGNED_IN` / `TOKEN_REFRESHED` handling to the auth state listener |

**Commit:** `69ba62a` — *"Fix: handle SIGNED_IN in AuthContext so email/password logins reach dashboard"* → pushed to `main` → Vercel auto-deployed. **Verified working in production.**

**Likely origin:** Introduced during the June 8, 2026 security-hardening pass (commit `8716a92`, "Fix multi-tenant data leakage, PII exposure, and auth gaps"), which rewrote `AuthContext`.

---

### 2. Demo / Test Login Accounts (Clarified) ✅

The platform can be reviewed under two demo logins. **Note the exact email — the words are `teacher-test`, not `test-teacher`.**

| Role | Email | Sign-in method | Notes |
|------|-------|----------------|-------|
| Teacher (staff view) | `teacher-test@summitlc.org` | Email + password | Fake address; not a real inbox. Password is set directly in Supabase, not via email reset. |
| Admin view | `mmarrone@summitlc.org` | Google SSO | Dr. Melanie Marrone's real Google account. |

**Teacher test account details (StaffTrak/LeaveTrak Supabase project `fgbigyffgzqzvksrkqxv`):**
- `auth.users` id: `72c2a5bd-798c-4ef2-aa2a-a4f3688253d3`
- `email_confirmed_at`: set (June 8, 2026) — account is confirmed
- `profiles` row: `full_name = "Teacher Test User"`, `role = licensed_staff`, `is_active = true`, `tenant_id = 09e6e120-bbac-4516-8483-72b8f331bcd7` (pilot tenant)

**Setting/resetting the teacher password** — because the address is not a real inbox, the "Forgot password" email flow won't work. Set it directly in the Supabase SQL Editor (the same project that backs the app):

```sql
UPDATE auth.users
SET encrypted_password = crypt('YourPassword!', gen_salt('bf')),
    updated_at = now()
WHERE email = 'teacher-test@summitlc.org'
RETURNING email;
```

If `RETURNING` prints the email, it matched a row. If it prints nothing, the email is stored differently than typed.

---

### Key Technical Facts (Session 36)

1. **`AuthContext` must handle `SIGNED_IN`.** Any future refactor of the auth listener must keep `SIGNED_IN` (and ideally `TOKEN_REFRESHED`) handled, or email/password login silently breaks again while Google SSO keeps working. The two paths differ: SSO reloads the page (re-runs `init()`/`getSession()`); email/password does an in-app `navigate()` that relies on the listener.
2. **Never call Supabase directly inside the `onAuthStateChange` callback.** Defer with `setTimeout(..., 0)` to avoid deadlocks (this is why `fetchProfile` is wrapped).
3. **The login gate is the profile lookup.** `Login.jsx` authenticates, then queries `profiles` for the user's own row. No active profile row = no dashboard. An auth user with no matching `profiles` row (or `is_active = false`) cannot log in even with a correct password.
4. **Demo teacher email is `teacher-test@summitlc.org`** (NOT `test-teacher@…`). Use the email/password form, not the Google button (Google SSO can't be used with a fake address).
5. **"Success. No rows returned" on an `UPDATE` is normal** in the Supabase SQL Editor — it does NOT mean the update matched a row. Add `RETURNING <col>` to confirm a row was actually hit.
6. **Run account SQL in the correct Supabase project.** StaffTrak and LeaveTrak share project `fgbigyffgzqzvksrkqxv`. Other ScholarPath apps (e.g. Intervention Management) are separate projects with their own `auth.users` — setting a password in the wrong project does nothing for the app you're testing.
7. **Stale `git index.lock` gotcha.** If `git add` fails with "Unable to create '.git/index.lock': File exists," close VS Code's Source Control panel and run `rm -f .git/index.lock`, then retry.

---

### ⚠️ Still To Do (Carried Forward — from Session 35)

| Item | Notes |
|------|-------|
| Amanda Taylor `is_active` DB fix | Run SQL in Supabase to set `is_active = false` — removes her from LeaveReports and all staff lists |
| `LeaveReports.jsx` — remove proration | Still uses old `480 * (contractDays/260)` formula. Update to flat 480 / 560 for birthing parent |
| `LeaveReports.jsx` — birthing parent entitlement | Individual XLSX Leave Summary tab should show 560 hrs for PLO if `is_birthing_parent` entry exists |
| Jake PLO balance | `used = 34.4, allocated = 12.0` — likely weeks/hours mismatch. Investigate and correct |
| LeaveTrak `LeaveTracker.jsx` — Repeat + Pick Days | Added to `LeaveEntries.jsx` (Session 34) but NOT yet to `LeaveTracker.jsx` (HR dashboard view) |
| Supabase custom domain | Set up `auth.scholarpathsystems.org` before Fall 2026 launch to fix Google consent screen branding |
| `timetrak` DNS/Vercel cleanup | At Fall 2026 launch, remove old `timetrak` CNAME and Vercel domain after confirming no active users on old URL |

---

### Note: Un-indexed Work Between Session 35 and 36

The master index previously ended at Session 35 (Mar 14, 2026). Several StaffTrak commits landed afterward and were **not captured in a session index**. Listed here for traceability (review against the repo if details are needed):

| Commit | Description |
|--------|-------------|
| `f66ce7a` (Jun 8) | Rename display text to "ScholarPath Staff Evaluation"; navbar shows SE / ScholarPath Eval |
| `7df4e57` (Apr 8) | Rename to ScholarPath naming convention |
| `68f4eb2` | Make product switcher configurable via `VITE_STAFFTRAK_URL` env var |
| `79e8a8b` / `25d0980` | Narrow `select('*')` to explicit columns on profiles and remaining tables |
| `9948dd3` | Move CSV staff import to a server-side Edge Function |
| `a38c848` | Add 60-minute idle timeout for FERPA compliance |
| `8716a92` | Fix multi-tenant data leakage, PII exposure, and auth gaps *(introduced the login bug fixed in Session 36)* |

---

## Supabase Configuration

**Project:** `fgbigyffgzqzvksrkqxv` (shared by StaffTrak + LeaveTrak; tenant_id isolates school data)

**Auth → URL Configuration:**
- Site URL: `https://leavetrak.scholarpathsystems.org`
- Redirect URLs:
  - `https://stafftrak.scholarpathsystems.org/**`
  - `https://leavetrak.scholarpathsystems.org/**`
  - `https://timetrak.scholarpathsystems.org/**` *(keep until Fall 2026 cleanup)*
  - `https://leavetrak.scholarpathsystems.org/reset-password`
  - `http://localhost:5173/**`

---

## Squarespace DNS Records (scholarpathsystems.org)

| Type | Name | Value | Purpose |
|------|------|-------|---------|
| CNAME | stafftrak | 2269af97323f26c6.vercel-dns-016.com | StaffTrak production |
| CNAME | leavetrak | 22e7l83f027b5fac.vercel-dns-016.com | LeaveTrak production |
| CNAME | timetrak | 22e7183f027b5fac.vercel-dns-016.com | LeaveTrak (legacy, keep until Fall 2026) |
| CNAME | tiertrak | aefbe4b3f2d62cf2.vercel-dns-016.com | TierTrak (future) |
| A | @ | 76.76.21.21 | Root domain |

---

## StaffTrak Routes Reference

| Route | Page | Access |
|-------|------|--------|
| `/dashboard` | Dashboard | All authenticated |
| `/staff` | Staff Directory | Admin, HR |
| `/leave-tracker` | Leave Tracker | HR |
| `/ode-staff-position` | ODE Position File | HR |
| `/goals` | My Goals | All authenticated |
| `/goal-approvals` | Approve Goals | Admins/Evaluators |
| `/observations` | Manage Observations | Admins/Evaluators |
| `/my-observations` | My Observations | Staff |
| `/self-reflection` | Self-Reflection Rubric | All authenticated |
| `/meetings` | Manage Meetings | Admins/Evaluators |
| `/my-meetings` | My Meetings | Staff |
| `/summatives` | Manage Summatives | Admins/Evaluators |
| `/my-summative` | My Evaluation | Staff |
| `/reports` | Reports & Analytics | Admins/Evaluators |

**Auth architecture note:** StaffTrak pages DO render their own `<Navbar />` (App.jsx has no Layout wrapper) — the OPPOSITE of LeaveTrak. Login flow: `Login.jsx` → `signInWithPassword` → profile check → `navigate('/dashboard')`; `ProtectedRoute` gates on `AuthContext` `user` + `profile`.

---

## Repositories

| Product | GitHub |
|---------|--------|
| StaffTrak | https://github.com/mmarronetravels-sudo/StaffTrak |
| LeaveTrak | https://github.com/mmarronetravels-sudo/TimeTrak *(repo name unchanged)* |
| Website | https://github.com/mmarronetravels-sudo/scholarpath-website |

---

## Development Setup

**StaffTrak:**
1. Open VS Code → stafftrak folder
2. `npm run dev` → `localhost:5173`

**Git Workflow (all products):**
```bash
git add .
git commit -m "Description of changes"
git push
# Vercel auto-deploys!
```

---

## Session History

| Session | Date | Key Accomplishments |
|---------|------|---------------------|
| 1–7 | Feb 1, 2026 | Project setup → Goals, Observations, Meetings, RLS, Google SSO, **PRODUCTION DEPLOYMENT** |
| 8 | Feb 16, 2026 | QA testing, double navbar fix, test account setup, HR module planning |
| 9 | Feb 16, 2026 | **LEAVE TRACKER BUILT & DEPLOYED** |
| 10–17 | Feb 17–20, 2026 | ODE module, hire date/eligibility, role refactor, bulk staff import, 15 rubrics, protected leave hours |
| 18–20 | Feb 23, 2026 | **LEAVETRAK PRODUCT BUILT & DEPLOYED TO PRODUCTION** |
| 21–23 | Mar 3, 2026 | Security fixes & QA, Weekly Leave View, qualifying reasons, protected period management |
| 24–30 | Mar 4, 2026 | Shared DB architecture, login fix, product switcher, edit/delete entries, staff mgmt, navbar redesigns, old LeaveTrak Supabase decommissioned |
| 31–33 | Mar 5–6, 2026 | Leave Reports simplification, balance bug fixes, birthing-parent flag, Repeat + Pick Days calendar |
| 34 | Mar 6, 2026 | LeaveTrak port — Repeat + Pick Days, navbar fix, hours fix, archived staff |
| 35 | Mar 14, 2026 | TimeTrak → LeaveTrak rename + website launch (DNS, Vercel, Supabase, leavetrak.html, 7 homepage patches) |
| *(gap)* | Apr 8 – Jun 8, 2026 | Un-indexed: ScholarPath rename, env-var product switcher, column-narrowing, server-side CSV import, FERPA idle timeout, security hardening (see table above) |
| 36 | Jun 15, 2026 | **🔐 EMAIL/PASSWORD LOGIN FIX** — `AuthContext` now handles `SIGNED_IN`; test login access clarified |

---

## Contact

**Email:** sps@scholarpathsystems.org  
**Website:** www.scholarpathsystems.org

---

*© 2026 StaffTrak & LeaveTrak / ScholarPath Systems. All rights reserved.*
