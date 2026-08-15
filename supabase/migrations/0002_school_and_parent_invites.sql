-- Adds the school field to profiles, and replaces SQL-only parent linking with
-- an invite the student issues themselves.
--
-- A parent account can only ever be linked by accepting a code that the student
-- generated for them. There is no other path: parents cannot pick a student,
-- and accepting is the only thing that can set role='parent'/parent_of for a
-- non-admin.

alter table public.profiles add column if not exists school text;

-- Signup metadata now carries the school too, so the trigger from 0001 has to
-- be replaced or the field silently never lands on the profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, grade, textbook, school)
  values (
    new.id,
    'student',                                    -- parent/admin are assigned later
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    nullif(new.raw_user_meta_data ->> 'grade', ''),
    nullif(new.raw_user_meta_data ->> 'textbook', ''),
    nullif(new.raw_user_meta_data ->> 'school', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create table public.parent_invites (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  code text not null unique,
  parent_email text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);

create index parent_invites_student_idx on public.parent_invites (student_id);

alter table public.parent_invites enable row level security;

-- The student sees and manages their own invites. Nobody selects by code —
-- accepting goes through the security-definer function below, so a stranger
-- cannot probe for valid codes.
create policy "invites readable by owning student"
  on public.parent_invites for select
  using (student_id = auth.uid());

create policy "invites deletable by owning student"
  on public.parent_invites for delete
  using (student_id = auth.uid());

create policy "invites managed by admin"
  on public.parent_invites for all
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Privilege trigger: allow the linking functions through
--
-- protect_profile_privileges() reverts any change to role/parent_of that does
-- not come from the admin or a connection with no end-user. Accepting an
-- invite has to change both, while running as the parent, so the functions
-- below raise a transaction-local flag the trigger honours. The flag is only
-- ever set inside these SECURITY DEFINER functions; set_config lives in
-- pg_catalog and is not reachable through PostgREST.
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
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Creating an invite (student)
-- ---------------------------------------------------------------------------

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

  -- One live invite per student: issuing a new code retires any unused one.
  delete from public.parent_invites
   where student_id = auth.uid() and accepted_at is null;

  -- Ambiguous characters (0/O, 1/I) left out so the code can be read aloud.
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                           floor(random() * 32 + 1)::int, 1), '')
    into v_code
    from generate_series(1, 8);

  insert into public.parent_invites (student_id, code, parent_email)
  values (auth.uid(), v_code, nullif(trim(p_parent_email), ''));

  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Accepting an invite (the parent's own account)
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

-- ---------------------------------------------------------------------------
-- Revoking access (student)
-- ---------------------------------------------------------------------------

create or replace function public.revoke_parent_access(p_parent uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles
     where id = p_parent and role = 'parent' and parent_of = auth.uid()
  ) then
    raise exception 'See vanem ei ole sinuga seotud.';
  end if;

  perform set_config('app.privileged_link', 'on', true);
  update public.profiles set parent_of = null where id = p_parent;
  perform set_config('app.privileged_link', 'off', true);

  delete from public.parent_invites
   where student_id = auth.uid() and accepted_by = p_parent;
end;
$$;

-- The parent needs to read the linked student's name; can_view_student already
-- covers that. Students must also be able to see who is linked to them.
create policy "profiles readable by linked student"
  on public.profiles for select
  using (parent_of = auth.uid());

revoke all on function public.create_parent_invite(text) from anon;
revoke all on function public.accept_parent_invite(text) from anon;
revoke all on function public.revoke_parent_access(uuid) from anon;
grant execute on function public.create_parent_invite(text) to authenticated;
grant execute on function public.accept_parent_invite(text) to authenticated;
grant execute on function public.revoke_parent_access(uuid) to authenticated;
