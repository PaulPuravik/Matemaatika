-- Private tutoring hub - initial schema, RLS and storage policies.
-- Run this in the Supabase SQL editor (or via `supabase db push`).

create type public.user_role as enum ('student', 'parent', 'admin');
create type public.session_status as enum ('upcoming', 'done');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  full_name text not null,
  grade text,
  textbook text,
  parent_of uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  scheduled_at timestamptz not null,
  status public.session_status not null default 'upcoming',
  tutor_notes text,
  created_at timestamptz not null default now()
);

create table public.session_focus (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  focus_text text not null,
  created_at timestamptz not null default now()
);

create table public.session_files (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  file_path text not null unique,
  original_name text not null,
  uploaded_at timestamptz not null default now()
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null,
  test_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  file_path text not null,
  grade text,
  topic text,
  created_at timestamptz not null default now()
);

create index sessions_student_scheduled_idx on public.sessions (student_id, scheduled_at);
create index session_focus_session_idx on public.session_focus (session_id);
create index session_files_session_idx on public.session_files (session_id);
create index tests_student_date_idx on public.tests (student_id, test_date);
create index profiles_parent_of_idx on public.profiles (parent_of);

-- ---------------------------------------------------------------------------
-- Helper functions
--
-- SECURITY DEFINER so they can read profiles without tripping the RLS policies
-- that are themselves defined in terms of these functions.
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

-- The student a parent account is linked to (null for everyone else).
create or replace function public.my_child()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.parent_of from public.profiles p
  where p.id = auth.uid() and p.role = 'parent';
$$;

-- True when the caller may read the given student's rows.
create or replace function public.can_view_student(student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select student = auth.uid()
      or student = public.my_child()
      or public.is_admin();
$$;

-- True when the caller is the student the session belongs to. Used by the
-- insert policies below: the sessions table itself is admin-only for SELECT
-- (to keep tutor_notes private), so those checks cannot subquery it directly.
create or replace function public.owns_session(session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = session and s.student_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- New auth users get a profile from their signup metadata.
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, grade, textbook)
  values (
    new.id,
    'student',                                    -- parent/admin are assigned by the tutor
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    nullif(new.raw_user_meta_data ->> 'grade', ''),
    nullif(new.raw_user_meta_data ->> 'textbook', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_focus enable row level security;
alter table public.session_files enable row level security;
alter table public.tests enable row level security;
alter table public.materials enable row level security;

-- profiles ------------------------------------------------------------------
create policy "profiles readable by self, parent and admin"
  on public.profiles for select
  using (id = auth.uid() or id = public.my_child() or public.is_admin());

-- Students may edit their own name/grade/textbook. The role and parent_of
-- columns are locked down by the trigger below so nobody can promote themselves.
create policy "profiles updatable by self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles fully manageable by admin"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- Students may edit their own profile, but role and parent_of are privileged:
-- silently keep the old values unless the change comes from the admin, or from
-- a connection with no end-user at all (the SQL editor or the service role,
-- which is how the tutor bootstraps their own admin account).
create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.role := old.role;
  new.parent_of := old.parent_of;
  return new;
end;
$$;

create trigger profiles_protect_privileges
  before update on public.profiles
  for each row execute function public.protect_profile_privileges();

-- sessions ------------------------------------------------------------------
-- The tutor owns the schedule; students and parents only read it.
--
-- tutor_notes are the tutor's private notes, and RLS cannot hide a single
-- column, so the base table is admin-only and everyone else reads through the
-- public.sessions_public view below, which simply does not select that column.
create policy "sessions managed by admin"
  on public.sessions for all
  using (public.is_admin())
  with check (public.is_admin());

-- session_focus -------------------------------------------------------------
create policy "focus readable by student, parent and admin"
  on public.session_focus for select
  using (public.can_view_student(student_id));

create policy "focus insertable by owning student"
  on public.session_focus for insert
  with check (student_id = auth.uid() and public.owns_session(session_id));

create policy "focus updatable by owning student"
  on public.session_focus for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "focus deletable by owning student"
  on public.session_focus for delete
  using (student_id = auth.uid());

create policy "focus managed by admin"
  on public.session_focus for all
  using (public.is_admin())
  with check (public.is_admin());

-- session_files -------------------------------------------------------------
create policy "files readable by student, parent and admin"
  on public.session_files for select
  using (public.can_view_student(student_id));

create policy "files insertable by owning student"
  on public.session_files for insert
  with check (student_id = auth.uid() and public.owns_session(session_id));

create policy "files deletable by owning student"
  on public.session_files for delete
  using (student_id = auth.uid());

create policy "files managed by admin"
  on public.session_files for all
  using (public.is_admin())
  with check (public.is_admin());

-- tests ---------------------------------------------------------------------
create policy "tests readable by student, parent and admin"
  on public.tests for select
  using (public.can_view_student(student_id));

create policy "tests insertable by owning student"
  on public.tests for insert
  with check (student_id = auth.uid());

create policy "tests updatable by owning student"
  on public.tests for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy "tests deletable by owning student"
  on public.tests for delete
  using (student_id = auth.uid());

create policy "tests managed by admin"
  on public.tests for all
  using (public.is_admin())
  with check (public.is_admin());

-- materials -----------------------------------------------------------------
create policy "materials readable by any signed-in user"
  on public.materials for select
  to authenticated
  using (true);

create policy "materials managed by admin"
  on public.materials for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Session view for students and parents
--
-- Owned by the migration role, so it is not subject to the sessions RLS
-- policies and carries its own visibility check instead. tutor_notes is
-- deliberately absent from the column list.
-- ---------------------------------------------------------------------------

create view public.sessions_public
with (security_barrier = true)
as
  select id, student_id, scheduled_at, status, created_at
  from public.sessions
  where public.can_view_student(student_id);

revoke all on public.sessions_public from anon;
grant select on public.sessions_public to authenticated;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('student-files', 'student-files', false), ('materials', 'materials', false)
on conflict (id) do nothing;

-- Uploads live at <student_id>/<session_id>/<uuid>.pdf, so the first path
-- segment is the owning student and the policies can key off it.
create policy "student files readable by student, parent and admin"
  on storage.objects for select
  using (
    bucket_id = 'student-files'
    and public.can_view_student(((storage.foldername(name))[1])::uuid)
  );

create policy "student files uploadable by owning student"
  on storage.objects for insert
  with check (
    bucket_id = 'student-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "student files deletable by owner or admin"
  on storage.objects for delete
  using (
    bucket_id = 'student-files'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "materials readable by signed-in users"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'materials');

create policy "materials writable by admin"
  on storage.objects for all
  using (bucket_id = 'materials' and public.is_admin())
  with check (bucket_id = 'materials' and public.is_admin());
