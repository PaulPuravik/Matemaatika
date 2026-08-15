-- Tests for 0005: nothing works until the tutor approves the account, and the
-- tutor's own account is recognised by the email in app_settings.

\set ON_ERROR_STOP on

\set alice   '''22222222-2222-2222-2222-222222222222'''
\set bob     '''33333333-3333-3333-3333-333333333333'''
\set mum     '''44444444-4444-4444-4444-444444444444'''
\set pending '''77777777-7777-7777-7777-777777777777'''

create table if not exists results (label text, passed boolean);
truncate results;
grant insert on results to authenticated;

update public.app_settings set value = 'tutor@example.com' where key = 'tutor_email';

-- The tutor's own signup is recognised and needs no approval.
insert into auth.users (id, email, raw_user_meta_data)
values ('11111111-1111-1111-1111-111111111111', 'TUTOR@example.com', '{"full_name":"Tutor"}');

insert into results values
  ('tutor account is admin from the matching email',
   (select role = 'admin' and approved
      from public.profiles where id = '11111111-1111-1111-1111-111111111111')),
  ('tutor email match ignores case',
   (select count(*) = 1 from public.profiles
     where id = '11111111-1111-1111-1111-111111111111' and role = 'admin'));

insert into auth.users (id, email, raw_user_meta_data) values
  (:alice::uuid,   'alice@example.com',   '{"full_name":"Alice"}'),
  (:bob::uuid,     'bob@example.com',     '{"full_name":"Bob"}'),
  (:mum::uuid,     'mum@example.com',     '{"full_name":"Maarja"}'),
  (:pending::uuid, 'pending@example.com', '{"full_name":"Ootel"}');

insert into results values
  ('a new student starts unapproved',
   (select approved = false from public.profiles where id = :alice::uuid));

-- ===========================================================================
-- An unapproved account is inert
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('unapproved student can still read their own profile',
     (select count(*) = 1 from public.profiles where id = :alice::uuid));
commit;

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  begin
    insert into public.tests (student_id, subject, test_date)
    values ('22222222-2222-2222-2222-222222222222', 'Enne kinnitust', current_date + 1);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('unapproved student CANNOT add a test', ok);
end $$;

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  begin
    insert into public.grades (student_id, subject, mark)
    values ('22222222-2222-2222-2222-222222222222', 'Enne kinnitust', '5');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('unapproved student CANNOT add a grade', ok);
end $$;

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  begin
    perform public.create_parent_invite(null);
    ok := false;
  exception when others then ok := true;
  end;
  reset role;
  insert into results values ('unapproved student CANNOT invite a parent', ok);
end $$;

-- Self-approval must be impossible.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  update public.profiles set approved = true, approved_at = now() where id = :alice::uuid;
commit;

insert into results values
  ('student CANNOT approve themselves',
   (select approved = false from public.profiles where id = :alice::uuid));

-- ===========================================================================
-- The tutor approves
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update public.profiles set approved = true, approved_at = now()
   where id in (:alice::uuid, :bob::uuid, :mum::uuid);
commit;

insert into results values
  ('admin can approve an account',
   (select approved from public.profiles where id = :alice::uuid));

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into public.tests (student_id, subject, test_date)
  values (:alice::uuid, 'Pärast kinnitust', current_date + 1);
commit;

insert into results values
  ('approved student can add a test',
   (select count(*) = 1 from public.tests where student_id = :alice::uuid));

-- ===========================================================================
-- Files without a lesson
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into public.session_files (session_id, student_id, file_path, original_name)
  values (null, :alice::uuid, :alice || '/general/x.pdf', 'enne-tundi.pdf');
commit;

insert into results values
  ('student can upload with no lesson scheduled',
   (select count(*) = 1 from public.session_files
     where student_id = :alice::uuid and session_id is null));

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
  set local role authenticated;
  begin
    insert into public.session_files (session_id, student_id, file_path, original_name)
    values (null, '77777777-7777-7777-7777-777777777777', 'x/y.pdf', 'ei.pdf');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('unapproved student CANNOT upload', ok);
end $$;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :bob, true);
  insert into results values
    ('another student CANNOT see those files',
     (select count(*) = 0 from public.session_files where student_id = :alice::uuid));
commit;

-- ===========================================================================
-- A parent still needs approval, even holding a valid code
-- ===========================================================================
create table if not exists scratch (code text);
truncate scratch;

do $$
declare v_code text;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  v_code := public.create_parent_invite(null);
  reset role;
  insert into scratch values (v_code);
end $$;

do $$
declare v_code text;
begin
  select code into v_code from scratch;
  perform set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', false);
  set local role authenticated;
  perform public.accept_parent_invite(v_code);
  reset role;
end $$;

insert into results values
  ('invite links the parent but leaves them unapproved',
   (select role = 'parent' and parent_of = :alice::uuid and approved = false
      from public.profiles where id = :pending::uuid));

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :pending, true);
  insert into results values
    ('unapproved parent sees nothing of the child',
     (select count(*) = 0 from public.tests where student_id = :alice::uuid)),
    ('unapproved parent sees no lessons',
     (select count(*) = 0 from public.sessions_public where student_id = :alice::uuid));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update public.profiles set approved = true where id = :pending::uuid;
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :pending, true);
  insert into results values
    ('approved parent sees the child tests',
     (select count(*) = 1 from public.tests where student_id = :alice::uuid));
commit;

-- ===========================================================================
-- The tutor can unlink a parent
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  update public.profiles set parent_of = null where id = :pending::uuid;
commit;

insert into results values
  ('admin can unlink a parent',
   (select parent_of is null from public.profiles where id = :pending::uuid));

-- ===========================================================================
-- Only the admin reads the settings row
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student CANNOT read app_settings',
     (select count(*) = 0 from public.app_settings));
commit;

\echo ''
select case when passed then 'PASS' else '*** FAIL ***' end as result, label
from results order by passed, label;

\echo ''
select count(*) filter (where passed) as passed,
       count(*) filter (where passed is not true) as failed
from results;
