-- After a lesson the tutor records what was covered and what the homework is.
-- Both are meant for the student and their parent to read, unlike tutor_notes,
-- which stay private — so these two columns go into sessions_public and that
-- one does not.

alter table public.sessions add column summary text;
alter table public.sessions add column homework text;

-- Appending columns to the end is what CREATE OR REPLACE VIEW allows; the
-- existing column list and order are untouched.
create or replace view public.sessions_public
with (security_barrier = true)
as
  select id, student_id, scheduled_at, status, created_at, summary, homework
  from public.sessions
  where public.can_view_student(student_id);

revoke all on public.sessions_public from anon;
grant select on public.sessions_public to authenticated;
