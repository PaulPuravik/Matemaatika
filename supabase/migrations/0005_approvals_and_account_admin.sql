-- The tutor now approves every account before it can reach anything, the tutor's
-- own account is recognised by email, and students can attach files without
-- waiting for a lesson to be scheduled.

-- ---------------------------------------------------------------------------
-- Who the tutor is
--
-- Kept in a table rather than an env var so the handle_new_user trigger can see
-- it. Change the row and the next signup with that address becomes the admin.
-- ---------------------------------------------------------------------------

create table public.app_settings (
  key text primary key,
  value text
);

alter table public.app_settings enable row level security;

create policy "settings readable by admin"
  on public.app_settings for select
  using (public.is_admin());

create policy "settings writable by admin"
  on public.app_settings for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.app_settings (key, value)
values ('tutor_email', 'rtubarik@gmail.com')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Approval
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column approved boolean not null default false,
  add column approved_at timestamptz;

-- Anyone who already had an account keeps working.
update public.profiles set approved = true, approved_at = now();

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select p.approved or p.role = 'admin' from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- Every read of a student's rows now also requires the caller to be approved.
-- Storage policies call this too, so unapproved accounts cannot fetch files
-- either.
create or replace function public.can_view_student(student uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or (
        public.is_approved()
        and (student = auth.uid() or student = public.my_child())
      );
$$;

-- Writing requires approval as well. Rather than rewriting every policy, the
-- ownership helper the insert policies already use gains the check, and the
-- remaining insert policies get it explicitly below.
create or replace function public.owns_session(session uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_approved() and exists (
    select 1 from public.sessions s
    where s.id = session and s.student_id = auth.uid()
  );
$$;

drop policy "tests insertable by owning student" on public.tests;
create policy "tests insertable by owning student"
  on public.tests for insert
  with check (student_id = auth.uid() and public.is_approved());

drop policy "grades insertable by owning student" on public.grades;
create policy "grades insertable by owning student"
  on public.grades for insert
  with check (student_id = auth.uid() and public.is_approved());

-- ---------------------------------------------------------------------------
-- approved is privileged, exactly like role and parent_of
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or public.is_admin()
     or coalesce(current_setting('app.privileged_link', true), '') = 'on' then
    return new;
  end if;
  new.role := old.role;
  new.parent_of := old.parent_of;
  new.approved := old.approved;
  new.approved_at := old.approved_at;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- New accounts start unapproved, except the tutor's own
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tutor_email text;
  v_is_tutor boolean;
begin
  select value into v_tutor_email from public.app_settings where key = 'tutor_email';
  v_is_tutor := v_tutor_email is not null
                and lower(new.email) = lower(v_tutor_email);

  insert into public.profiles (
    id, role, full_name, grade, textbook, school, approved, approved_at
  )
  values (
    new.id,
    case when v_is_tutor then 'admin' else 'student' end::public.user_role,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    nullif(new.raw_user_meta_data ->> 'grade', ''),
    nullif(new.raw_user_meta_data ->> 'textbook', ''),
    nullif(new.raw_user_meta_data ->> 'school', ''),
    v_is_tutor,
    case when v_is_tutor then now() else null end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Files can arrive before a lesson exists
-- ---------------------------------------------------------------------------

alter table public.session_files alter column session_id drop not null;

drop policy "files insertable by owning student" on public.session_files;
create policy "files insertable by owning student"
  on public.session_files for insert
  with check (
    student_id = auth.uid()
    and public.is_approved()
    and (session_id is null or public.owns_session(session_id))
  );

-- ---------------------------------------------------------------------------
-- Accepting a parent invite must not smuggle in approval
-- ---------------------------------------------------------------------------

create or replace function public.accept_parent_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.parent_invites;
  v_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Logi esmalt sisse.';
  end if;

  select role into v_role from public.profiles where id = auth.uid();
  if v_role = 'admin' then
    raise exception 'Õpetaja kontot ei saa vanemaks siduda.';
  end if;

  select * into v_invite
    from public.parent_invites
   where code = upper(trim(p_code))
     and accepted_at is null
     and expires_at > now()
   for update;

  if not found then
    raise exception 'Kutse on vale või aegunud.';
  end if;

  if v_invite.student_id = auth.uid() then
    raise exception 'Iseennast ei saa vanemaks siduda.';
  end if;

  perform set_config('app.privileged_link', 'on', true);

  -- Only role and the link change here. approved stays whatever the tutor set,
  -- so a parent still waits for approval like everyone else.
  update public.profiles
     set role = 'parent', parent_of = v_invite.student_id
   where id = auth.uid();

  update public.parent_invites
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_invite.id;

  perform set_config('app.privileged_link', 'off', true);

  return v_invite.student_id;
end;
$$;

-- Issuing an invite is also gated on approval.
create or replace function public.create_parent_invite(p_parent_email text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'student' then
    raise exception 'Ainult õpilane saab vanemale kutse luua.';
  end if;
  if not public.is_approved() then
    raise exception 'Sinu konto ootab veel õpetaja kinnitust.';
  end if;

  delete from public.parent_invites
   where student_id = auth.uid() and accepted_at is null;

  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           floor(random() * 32 + 1)::int, 1), '')
    into v_code
    from generate_series(1, 8);

  insert into public.parent_invites (student_id, code, parent_email)
  values (auth.uid(), v_code, nullif(trim(p_parent_email), ''));

  return v_code;
end;
$$;
