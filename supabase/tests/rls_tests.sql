-- RLS behaviour tests. Each block acts as the `authenticated` role with a
-- specific auth.uid(), the same way PostgREST runs a signed-in user's request.

\set ON_ERROR_STOP on

\set admin  '''11111111-1111-1111-1111-111111111111'''
\set alice  '''22222222-2222-2222-2222-222222222222'''
\set bob    '''33333333-3333-3333-3333-333333333333'''
\set parent '''44444444-4444-4444-4444-444444444444'''

create table if not exists results (
  label text,
  passed boolean
);
truncate results;
grant insert on results to authenticated;

-- Seed users. The handle_new_user trigger creates the profiles rows.
insert into auth.users (id, email, raw_user_meta_data) values
  (:admin::uuid,  'tutor@example.com',  '{"full_name":"Tutor"}'),
  (:alice::uuid,  'alice@example.com',  '{"full_name":"Alice","grade":"11","textbook":"Avita 11"}'),
  (:bob::uuid,    'bob@example.com',    '{"full_name":"Bob","grade":"12"}'),
  (:parent::uuid, 'parent@example.com', '{"full_name":"Alice Parent"}');

-- Bootstrap roles the way the tutor would from the Supabase SQL editor.
update public.profiles set role = 'admin' where id = :admin::uuid;
update public.profiles set role = 'parent', parent_of = :alice::uuid where id = :parent::uuid;

insert into results values
  ('setup: admin role sticks',
   (select role = 'admin' from public.profiles where id = :admin::uuid)),
  ('setup: parent link sticks',
   (select role = 'parent' and parent_of = :alice::uuid
      from public.profiles where id = :parent::uuid));

-- Seed content owned by each student.
insert into public.sessions (id, student_id, scheduled_at, tutor_notes) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :alice::uuid, now() + interval '2 days', 'Alice is shaky on logs'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :bob::uuid,   now() + interval '3 days', 'Bob private note');

insert into public.session_focus (session_id, student_id, focus_text) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :alice::uuid, 'logarithms'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :bob::uuid,   'vectors');

insert into public.session_files (session_id, student_id, file_path, original_name) values
  ('aaaaaaaa-0000-0000-0000-000000000001', :alice::uuid,
   :alice || '/aaaaaaaa-0000-0000-0000-000000000001/f1.pdf', 'alice.pdf'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :bob::uuid,
   :bob || '/bbbbbbbb-0000-0000-0000-000000000002/f2.pdf', 'bob.pdf');

insert into public.tests (student_id, subject, test_date) values
  (:alice::uuid, 'Trigonomeetria', current_date + 7),
  (:bob::uuid,   'Vektorid',       current_date + 8);

insert into storage.objects (bucket_id, name) values
  ('student-files', :alice || '/aaaaaaaa-0000-0000-0000-000000000001/f1.pdf'),
  ('student-files', :bob   || '/bbbbbbbb-0000-0000-0000-000000000002/f2.pdf');

-- ===========================================================================
-- Student isolation
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);

  insert into results values
    ('student reads own profile',
     (select count(*) = 1 from public.profiles where id = :alice::uuid)),
    ('student CANNOT read another student profile',
     (select count(*) = 0 from public.profiles where id = :bob::uuid)),
    ('student sees only own row in unfiltered profile scan',
     (select count(*) = 1 from public.profiles)),
    ('student reads own session via view',
     (select count(*) = 1 from public.sessions_public where student_id = :alice::uuid)),
    ('student CANNOT read another student session',
     (select count(*) = 0 from public.sessions_public where student_id = :bob::uuid)),
    ('student CANNOT read sessions base table (tutor_notes stays private)',
     (select count(*) = 0 from public.sessions)),
    ('student CANNOT read another student focus',
     (select count(*) = 0 from public.session_focus where student_id = :bob::uuid)),
    ('student CANNOT read another student files',
     (select count(*) = 0 from public.session_files where student_id = :bob::uuid)),
    ('student CANNOT read another student tests',
     (select count(*) = 0 from public.tests where student_id = :bob::uuid)),
    ('student reads own tests',
     (select count(*) = 1 from public.tests where student_id = :alice::uuid));
commit;

-- tutor_notes must not even exist as a column on the view students read.
insert into results values
  ('sessions_public does not expose tutor_notes',
   (select count(*) = 0 from information_schema.columns
     where table_schema = 'public' and table_name = 'sessions_public'
       and column_name = 'tutor_notes'));

-- ===========================================================================
-- Writes across the student boundary must fail
-- ===========================================================================
do $$
declare
  ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  -- Focus note attached to another student's session.
  begin
    insert into public.session_focus (session_id, student_id, focus_text)
    values ('bbbbbbbb-0000-0000-0000-000000000002',
            '22222222-2222-2222-2222-222222222222', 'sneaky');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT add focus to another student session', ok);
end $$;

do $$
declare
  ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  -- Test row written on another student's behalf.
  begin
    insert into public.tests (student_id, subject, test_date)
    values ('33333333-3333-3333-3333-333333333333', 'fake', current_date + 1);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT create a test for another student', ok);
end $$;

-- Privilege escalation: a student promoting themselves to admin.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  update public.profiles set role = 'admin' where id = :alice::uuid;
  update public.profiles set parent_of = :bob::uuid where id = :alice::uuid;
commit;

insert into results values
  ('student CANNOT promote self to admin',
   (select role = 'student' from public.profiles where id = :alice::uuid)),
  ('student CANNOT link self to another student',
   (select parent_of is null from public.profiles where id = :alice::uuid));

-- ===========================================================================
-- Parent: read-only access to their own child
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :parent, true);

  insert into results values
    ('parent reads child session',
     (select count(*) = 1 from public.sessions_public where student_id = :alice::uuid)),
    ('parent reads child focus',
     (select count(*) = 1 from public.session_focus where student_id = :alice::uuid)),
    ('parent reads child tests',
     (select count(*) = 1 from public.tests where student_id = :alice::uuid)),
    ('parent CANNOT read unrelated student session',
     (select count(*) = 0 from public.sessions_public where student_id = :bob::uuid)),
    ('parent CANNOT read unrelated student tests',
     (select count(*) = 0 from public.tests where student_id = :bob::uuid)),
    ('parent CANNOT read tutor notes',
     (select count(*) = 0 from public.sessions));
commit;

do $$
declare
  ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);

  begin
    insert into public.tests (student_id, subject, test_date)
    values ('22222222-2222-2222-2222-222222222222', 'parent added', current_date + 2);
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('parent CANNOT write child tests', ok);
end $$;

do $$
declare
  changed integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  update public.session_focus set focus_text = 'parent edit'
   where student_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics changed = row_count;
  reset role;
  insert into results values ('parent CANNOT edit child focus', changed = 0);
end $$;

-- ===========================================================================
-- Admin
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :admin, true);

  insert into results values
    ('admin reads all students', (select count(*) = 4 from public.profiles)),
    ('admin reads all sessions with tutor notes',
     (select count(*) = 2 from public.sessions where tutor_notes is not null)),
    ('admin reads all files', (select count(*) = 2 from public.session_files)),
    ('admin reads all tests', (select count(*) = 2 from public.tests));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :admin, true);
  insert into public.sessions (student_id, scheduled_at)
  values (:bob::uuid, now() + interval '9 days');
commit;

insert into results values
  ('admin can schedule a session',
   (select count(*) = 2 from public.sessions where student_id = :bob::uuid));

-- ===========================================================================
-- Storage
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);

  insert into results values
    ('student reads own storage object',
     (select count(*) = 1 from storage.objects
       where name like :alice || '%')),
    ('student CANNOT read another student storage object',
     (select count(*) = 0 from storage.objects
       where name like :bob || '%'));
commit;

do $$
declare
  ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  -- Upload into another student's folder.
  begin
    insert into storage.objects (bucket_id, name)
    values ('student-files',
            '33333333-3333-3333-3333-333333333333/bbbbbbbb-0000-0000-0000-000000000002/evil.pdf');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT upload into another student folder', ok);
end $$;

do $$
declare
  ok boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);

  begin
    insert into storage.objects (bucket_id, name)
    values ('student-files',
            '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/new.pdf');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  reset role;
  insert into results values ('student CAN upload into own folder', ok);
end $$;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :parent, true);
  insert into results values
    ('parent reads child storage object',
     (select count(*) >= 1 from storage.objects where name like :alice || '%'));
commit;

-- ===========================================================================
-- Report
-- ===========================================================================
\echo ''
select
  case when passed then 'PASS' else '*** FAIL ***' end as result,
  label
from results
order by passed, label;

\echo ''
select
  count(*) filter (where passed) as passed,
  count(*) filter (where not passed) as failed
from results;
