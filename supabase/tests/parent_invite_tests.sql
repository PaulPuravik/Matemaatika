-- Tests for the parent-invite flow added in 0002.
--
-- The property under test: a parent account can only become linked by
-- accepting a code the student generated, and nothing else can set
-- role='parent' or parent_of.

\set ON_ERROR_STOP on

\set admin   '''11111111-1111-1111-1111-111111111111'''
\set alice   '''22222222-2222-2222-2222-222222222222'''
\set bob     '''33333333-3333-3333-3333-333333333333'''
\set mum     '''44444444-4444-4444-4444-444444444444'''
\set snooper '''66666666-6666-6666-6666-666666666666'''

create table if not exists results (label text, passed boolean);
truncate results;
grant insert on results to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  (:admin::uuid,   'tutor@example.com',   '{"full_name":"Tutor"}'),
  (:alice::uuid,   'alice@example.com',   '{"full_name":"Alice","grade":"11","textbook":"Avita","school":"Tallinna Reaalkool"}'),
  (:bob::uuid,     'bob@example.com',     '{"full_name":"Bob"}'),
  (:mum::uuid,     'mum@example.com',     '{"full_name":"Maarja"}'),
  (:snooper::uuid, 'snoop@example.com',   '{"full_name":"Snooper"}');

update public.profiles set role = 'admin' where id = :admin::uuid;

-- These suites test behaviour after the tutor has approved everyone;
-- approval itself is covered by approval_tests.sql.
update public.profiles set approved = true, approved_at = now();

insert into public.sessions (id, student_id, scheduled_at, tutor_notes)
values ('aaaaaaaa-0000-0000-0000-000000000001', :alice::uuid, now() + interval '2 days', 'private note');
insert into public.tests (student_id, subject, test_date)
values (:alice::uuid, 'Logaritmid', current_date + 7);

insert into results values
  ('signup stores the school field',
   (select school = 'Tallinna Reaalkool' from public.profiles where id = :alice::uuid));

-- ===========================================================================
-- Student creates an invite
-- ===========================================================================
create table if not exists scratch (code text);
truncate scratch;

do $$
declare v_code text;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  v_code := public.create_parent_invite('mum@example.com');
  reset role;
  insert into scratch values (v_code);
  insert into results values ('student can create an invite', length(v_code) = 8);
end $$;

-- A parent-to-be must not be able to find codes by reading the table.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :snooper, true);
  insert into results values
    ('outsider CANNOT read invites', (select count(*) = 0 from public.parent_invites));
commit;

-- ===========================================================================
-- Wrong code, self-link, then the real acceptance
-- ===========================================================================
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  set local role authenticated;
  begin
    perform public.accept_parent_invite('BADCODE1');
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  insert into results values ('wrong code rejected', ok);
end $$;

do $$
declare ok boolean; v_code text;
begin
  select code into v_code from scratch;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  begin
    perform public.accept_parent_invite(v_code);
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT accept their own invite', ok);
end $$;

do $$
declare v_code text; v_student uuid;
begin
  select code into v_code from scratch;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  set local role authenticated;
  v_student := public.accept_parent_invite(v_code);
  reset role;
  insert into results values ('parent accepts invite and is linked',
    v_student = '22222222-2222-2222-2222-222222222222'::uuid);
end $$;

insert into results values
  ('accepted invite sets role=parent',
   (select role = 'parent' and parent_of = :alice::uuid from public.profiles where id = :mum::uuid));

-- The code is single use.
do $$
declare ok boolean; v_code text;
begin
  select code into v_code from scratch;
  perform set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
  set local role authenticated;
  begin
    perform public.accept_parent_invite(v_code);
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  insert into results values ('code CANNOT be reused', ok);
end $$;

insert into results values
  ('outsider stays a student after failed accept',
   (select role = 'student' and parent_of is null from public.profiles where id = :snooper::uuid));

-- ===========================================================================
-- The linked parent sees the right things, and only those
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('linked parent reads child session',
     (select count(*) = 1 from public.sessions_public where student_id = :alice::uuid)),
    ('linked parent reads child tests',
     (select count(*) = 1 from public.tests where student_id = :alice::uuid)),
    ('linked parent CANNOT read tutor notes',
     (select count(*) = 0 from public.sessions)),
    ('linked parent CANNOT read another student',
     (select count(*) = 0 from public.profiles where id = :bob::uuid));
commit;

-- The student can see who is linked to them.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student sees their linked parent',
     (select count(*) = 1 from public.profiles where parent_of = :alice::uuid));
commit;

-- ===========================================================================
-- A parent cannot re-point themselves at a different student
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  update public.profiles set parent_of = :bob::uuid where id = :mum::uuid;
commit;

insert into results values
  ('parent CANNOT switch to another student',
   (select parent_of = :alice::uuid from public.profiles where id = :mum::uuid));

-- A parent cannot issue invites.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  set local role authenticated;
  begin
    perform public.create_parent_invite(null);
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  insert into results values ('parent CANNOT create invites', ok);
end $$;

-- Nobody can promote themselves to admin through the new flag either.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  update public.profiles set role = 'admin' where id = :mum::uuid;
commit;

insert into results values
  ('parent CANNOT promote self to admin',
   (select role = 'parent' from public.profiles where id = :mum::uuid));

-- ===========================================================================
-- The student can cut the link
-- ===========================================================================
do $$
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  perform public.revoke_parent_access('44444444-4444-4444-4444-444444444444');
  reset role;
end $$;

insert into results values
  ('student can revoke parent access',
   (select parent_of is null from public.profiles where id = :mum::uuid));

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('revoked parent loses access to child data',
     (select count(*) = 0 from public.sessions_public where student_id = :alice::uuid));
commit;

-- An unrelated student cannot revoke someone else's parent.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  set local role authenticated;
  begin
    perform public.revoke_parent_access('44444444-4444-4444-4444-444444444444');
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  insert into results values ('outsider CANNOT revoke another student''s parent', ok);
end $$;

\echo ''
select case when passed then 'PASS' else '*** FAIL ***' end as result, label
from results order by passed, label;

\echo ''
select count(*) filter (where passed) as passed,
       count(*) filter (where passed is not true) as failed
from results;
