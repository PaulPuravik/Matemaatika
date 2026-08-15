# Matemaatika — private tutoring hub

A small, password-protected hub for one-on-one math tutoring. Students see their
next session, say what they want to work on, upload PDFs and track upcoming
tests. The tutor gets email notifications and an admin view over everything.

Next.js (App Router) + TypeScript + Tailwind, Supabase for auth/database/storage,
Resend for email, deployed on Vercel.

## How access works

Two layers:

1. **Shared site password** (`/gate`) — a light front door in front of everything.
   The cookie it sets holds an HMAC keyed by `SITE_GATE_PASSWORD`, so it cannot be
   forged by setting a cookie by hand, and the password never reaches the browser.
   This is a front door, not the real security.
2. **Individual Supabase accounts** behind the gate, with three roles:
   - `student` — reads and edits only their own data
   - `parent` — read-only view of the one linked child
   - `admin` — the tutor; full access

The real enforcement is Postgres Row Level Security, not the UI. Every table has
policies; see `supabase/migrations/0001_init.sql`.

A session carries three pieces of tutor-written text, and they are not equally
visible. `summary` (what the lesson covered) and `homework` are meant for the
student and their parent; `tutor_notes` are private to the tutor. RLS cannot
hide a single column, so the `sessions` table is admin-only for reads and
everyone else reads through the `sessions_public` view, which selects the first
two and not the third.

## Setup

### 1. Supabase

Create a project, then run the files in `supabase/migrations/` in order
(`0001_init.sql`, `0002_school_and_parent_invites.sql`,
`0003_grades_and_private_materials.sql`, `0004_lesson_summary_and_homework.sql`,
`0005_approvals_and_account_admin.sql`) in the SQL editor.
They create the tables, RLS policies, the two storage buckets (both private),
the trigger that turns a signup into a `profiles` row, and the parent-invite
functions.

### 2. Environment

Copy `.env.example` to `.env.local` and fill it in. In production set the same
variables in the Vercel project settings.

`SUPABASE_SERVICE_ROLE_KEY` and `RESEND_API_KEY` are server-only — they are read
exclusively from server actions and route handlers, never from client components.

### 3. Make yourself the admin

The tutor is identified by email. `0005` seeds it to `rtubarik@gmail.com`; to
use a different address, change the row:

```sql
update public.app_settings set value = 'sinu@email.ee' where key = 'tutor_email';
```

Sign up through the app with that address — the account is created as the
admin and is approved automatically. Set `TUTOR_NOTIFICATION_EMAIL` to the same
address so notifications reach you.

If you signed up before setting the row, fix it directly:

```sql
update public.profiles set role = 'admin', approved = true
where id = (select id from auth.users where email = 'sinu@email.ee');
```

### 4. Approving accounts

Every account — student and parent alike — is created unapproved and can reach
nothing until you approve it. Unapproved users see a waiting page, and RLS
refuses their reads and writes regardless of what the UI does, so the block is
real rather than cosmetic. New signups appear at the top of `/admin` under
**Ootab kinnitust**, with **Kinnita** and **Kustuta**; you also get an email.

`approved` is a privileged column like `role` and `parent_of`: the trigger
reverts any attempt to set it from a normal account, so nobody can approve
themselves.

From `/admin` you can also delete any student or parent account (which removes
their data by cascade) and unlink a parent from their child without deleting the
account.

### 5. Parent accounts

Parents are linked by the student, not by you and not by themselves. On their
dashboard a student opens **Vanema ligipääs** and generates an 8-character code
(optionally emailed straight to the parent). The parent signs up choosing
**Olen lapsevanem**, enters that code, and is linked. The student can revoke the
access again at any time.

There is no other path in or out: `accept_parent_invite()` is the only thing
that can set `role = 'parent'` / `parent_of` for a non-admin, the code is
single-use and expires in 14 days, and nobody can read the invites table except
the student who owns the invite. A trigger reverts any other attempt to change
`role` or `parent_of`, so a student cannot promote themselves and a parent
cannot re-point themselves at a different child.

You can still assign roles directly in SQL when you need to — a connection with
no end-user (the SQL editor, the service role) is trusted.

### 6. Run it

```bash
npm install
npm run dev
```

## Files and grades

Files move in both directions, and both are per student:

- **Student → tutor.** Uploads can be made at any time, whether or not a lesson
  is scheduled — files without a lesson carry a null `session_id` and land under
  `general/`. They go to Supabase Storage
  under `student-files/<student_id>/…`, so the storage policy alone keeps one
  student out of another's folder. The admin view lists them grouped
  under the student who sent them.
- **Tutor → student.** A material with `student_id` set is visible only to that
  student (and their linked parent); with it null it is shared with everyone.
  The object key carries the same split — `materials/<student_id>/…` versus
  `materials/shared/…` — so the storage policy matches the row policy.

After a lesson the tutor fills in **what was covered** and the **homework** on
that session. Both show up on the student's dashboard — the newest homework as
a card of its own, and the full run under *Toimunud tunnid* — and identically on
the parent's page. The student is emailed when homework is set or changed.

Students enter their own **grades** (subject, mark, date, optional note). The
mark is free text so `5`, `4+`, `arvestatud` and `87%` all fit. The tutor and
the linked parent can read them; only the student can add or remove them.

## Email notifications

Sent from server-side code via Resend. The tutor is notified when a student
adds or edits their focus note, uploads a PDF, adds an upcoming test, or
records a grade. The student is emailed when the tutor schedules a session,
moves it to a new time, or shares a file with them personally.

Sending is best-effort by design — if Resend is unconfigured or failing, the
student's upload still succeeds and the failure is logged instead of surfacing
as an error.

## Testing the security rules

The RLS policies are the thing actually protecting student data, so they have
tests. They run against a throwaway local Postgres, stubbing the Supabase-managed
objects (`auth.uid()`, `auth.users`, `storage`) so the migration runs unmodified:

```bash
supabase/tests/run.sh -h /tmp -p 5433 -U postgres
```

110 checks in five suites:

- `rls_tests.sql` — student isolation, cross-student write attempts, privilege
  escalation, parent read-only access, admin access, storage path rules.
- `parent_invite_tests.sql` — codes are single-use and expiring, outsiders
  cannot read or reuse them, a student cannot accept their own, a parent cannot
  switch children or issue invites, and revoking really cuts access.
- `grades_and_materials_tests.sql` — a student cannot read or write another
  student's grades, a parent can read but not change them, and a material aimed
  at one student is invisible to every other student, both as a row and as a
  storage object.
- `lesson_notes_tests.sql` — the student and parent can read a lesson's summary
  and homework but not the tutor's private notes, and the student cannot rewrite
  what the tutor recorded.
- `approval_tests.sql` — an unapproved account can read its own profile and
  nothing else, cannot write anything, cannot approve itself, and a parent
  holding a valid invite code is linked but still sees nothing until approved.

```bash
npm run typecheck   # tsc
npm run build       # production build
```

## Layout

```
src/app/gate         shared password screen + its route handler
src/app/login        Supabase email/password sign-in
src/app/signup       sign-up as student (name, grade, textbook, school) or parent (invite code)
src/app/liitu        manual invite-code entry, for a parent whose code needs re-trying
src/app/dashboard    student: next session, homework, past lessons, focus note, PDF upload, tests, grades, materials
src/app/parent       parent: read-only view of their child, including homework and lesson summaries
src/app/admin        tutor: all students, sessions, files, grades, per-student and shared materials
src/app/actions      server actions (auth, student, admin)
src/lib              Supabase clients, gate, email, formatting, types
src/middleware.ts    enforces the gate, refreshes the Supabase session
supabase/migrations  schema, RLS policies, storage policies, parent invites, grades
supabase/tests       RLS test suite
```

## Notes on scope

This is a v1 for a handful of users. Uploads are PDF-only and capped client-side
(10 MB for students, 20 MB for materials). Sessions are created by the tutor;
students and parents only read them. There is no booking, no payments and no
scheduling logic.

The interface is in Estonian; all code and comments are in English.

Most students open this on a phone, so the layout is built mobile-first: inputs
render at 16px on small screens (below that, iOS zooms the page on focus), tap
targets clear 44px, and the dashboard and admin pages were checked at 390px wide
for horizontal overflow.
