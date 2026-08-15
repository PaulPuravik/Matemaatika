-- Two additions:
--   1. grades — marks the student enters themselves
--   2. materials can now be aimed at one student instead of everyone
--
-- Files the students share with the tutor were already per-student (every
-- session_files row carries student_id, and storage keys off the student's own
-- folder); this only adds the other direction.

-- ---------------------------------------------------------------------------
-- Grades
-- ---------------------------------------------------------------------------

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  -- Free text on purpose: "5", "4+", "arvestatud" and "87%" all have to fit.
  mark text not null,
  received_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index grades_student_date_idx on public.grades (student_id, received_on desc);

alter table public.grades enable row level security;

create policy "grades readable by student, parent and admin"
  on public.grades for select
  using (public.can_view_student(student_id));

create policy "grades insertable by owning student"
  on public.grades for insert
  with check (student_id = auth.uid());

create policy "grades updatable by owning student"
  on public.grades for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "grades deletable by owning student"
  on public.grades for delete
  using (student_id = auth.uid());

create policy "grades managed by admin"
  on public.grades for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Materials aimed at a single student
--
-- student_id null  -> shared with everyone (as before)
-- student_id set   -> only that student (and their parent, and the tutor)
-- ---------------------------------------------------------------------------

alter table public.materials
  add column student_id uuid references public.profiles (id) on delete cascade;

create index materials_student_idx on public.materials (student_id);

drop policy "materials readable by any signed-in user" on public.materials;

create policy "materials readable by their audience"
  on public.materials for select
  to authenticated
  using (student_id is null or public.can_view_student(student_id));

-- ---------------------------------------------------------------------------
-- Storage for the materials bucket
--
-- Object keys are 'shared/<uuid>.pdf' for everyone, or '<student_id>/<uuid>.pdf'
-- when the file is for one student. Keys with no folder at all are the shared
-- materials uploaded before this migration.
-- ---------------------------------------------------------------------------

-- Policy predicates are not guaranteed to short-circuit, so parsing has to be
-- total rather than relying on the 'shared' branch being tested first.
create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

drop policy "materials readable by signed-in users" on storage.objects;

create policy "materials readable by their audience"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'materials'
    and (
      (storage.foldername(name))[1] is null
      or (storage.foldername(name))[1] = 'shared'
      or public.can_view_student(public.safe_uuid((storage.foldername(name))[1]))
    )
  );
