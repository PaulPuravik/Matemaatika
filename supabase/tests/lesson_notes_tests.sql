-- Tests for 0004: the lesson summary and homework are readable by the student
-- and their parent, while tutor_notes stay private to the tutor.

\set ON_ERROR_STOP on

\set admin '''11111111-1111-1111-1111-111111111111'''
\set alice '''22222222-2222-2222-2222-222222222222'''
\set bob   '''33333333-3333-3333-3333-333333333333'''
\set mum   '''44444444-4444-4444-4444-444444444444'''

create table if not exists results (label text, passed boolean);
truncate results;
grant insert on results to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  (:admin::uuid, 'tutor@example.com', '{"full_name":"Tutor"}'),
  (:alice::uuid, 'alice@example.com', '{"full_name":"Alice"}'),
  (:bob::uuid,   'bob@example.com',   '{"full_name":"Bob"}'),
  (:mum::uuid,   'mum@example.com',   '{"full_name":"Maarja"}');

update public.profiles set role = 'admin' where id = :admin::uuid;
update public.profiles set role = 'parent', parent_of = :alice::uuid where id = :mum::uuid;

-- These suites test behaviour after the tutor has approved everyone;
-- approval itself is covered by approval_tests.sql.
update public.profiles set approved = true, approved_at = now();

insert into public.sessions (id, student_id, scheduled_at, status, tutor_notes, summary, homework)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', :alice::uuid, now() - interval '2 days',
   'done', 'SALAJANE tutor note', 'Kordasime logaritme', 'Lahenda lk 84 ül 1-6'),
  ('bbbbbbbb-0000-0000-0000-000000000002', :bob::uuid, now() - interval '1 day',
   'done', 'Bobi salajane', 'Vektorid', 'Lk 91');

-- ===========================================================================
-- The student
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student reads the lesson summary',
     (select summary = 'Kordasime logaritme' from public.sessions_public
       where id = 'aaaaaaaa-0000-0000-0000-000000000001')),
    ('student reads the homework',
     (select homework = 'Lahenda lk 84 ül 1-6' from public.sessions_public
       where id = 'aaaaaaaa-0000-0000-0000-000000000001')),
    ('student still CANNOT reach tutor_notes',
     (select count(*) = 0 from public.sessions)),
    ('student CANNOT read another student summary',
     (select count(*) = 0 from public.sessions_public where student_id = :bob::uuid));
commit;

insert into results values
  ('sessions_public exposes summary and homework',
   (select count(*) = 2 from information_schema.columns
     where table_schema = 'public' and table_name = 'sessions_public'
       and column_name in ('summary', 'homework'))),
  ('sessions_public still hides tutor_notes',
   (select count(*) = 0 from information_schema.columns
     where table_schema = 'public' and table_name = 'sessions_public'
       and column_name = 'tutor_notes'));

-- The student must not be able to rewrite the tutor's record of the lesson.
do $$
declare changed integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  update public.sessions set homework = 'ei midagi'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
  get diagnostics changed = row_count;
  reset role;
  insert into results values ('student CANNOT change the homework', changed = 0);
end $$;

-- ===========================================================================
-- The parent
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('parent reads the lesson summary',
     (select summary = 'Kordasime logaritme' from public.sessions_public
       where id = 'aaaaaaaa-0000-0000-0000-000000000001')),
    ('parent reads the homework',
     (select homework = 'Lahenda lk 84 ül 1-6' from public.sessions_public
       where id = 'aaaaaaaa-0000-0000-0000-000000000001')),
    ('parent CANNOT reach tutor_notes',
     (select count(*) = 0 from public.sessions)),
    ('parent CANNOT read another student lesson',
     (select count(*) = 0 from public.sessions_public where student_id = :bob::uuid));
commit;

-- ===========================================================================
-- The tutor
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :admin, true);
  update public.sessions
     set summary = 'Kordasime logaritme ja tegime kontrolltöö vigu',
         homework = 'Lk 84 ül 1-10'
   where id = 'aaaaaaaa-0000-0000-0000-000000000001';
commit;

insert into results values
  ('admin can write the summary and homework',
   (select homework = 'Lk 84 ül 1-10' from public.sessions
     where id = 'aaaaaaaa-0000-0000-0000-000000000001')),
  ('admin still reads tutor_notes',
   (select tutor_notes = 'SALAJANE tutor note' from public.sessions
     where id = 'aaaaaaaa-0000-0000-0000-000000000001'));

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student sees the tutor edit straight away',
     (select homework = 'Lk 84 ül 1-10' from public.sessions_public
       where id = 'aaaaaaaa-0000-0000-0000-000000000001'));
commit;

\echo ''
select case when passed then 'PASS' else '*** FAIL ***' end as result, label
from results order by passed, label;

\echo ''
select count(*) filter (where passed) as passed,
       count(*) filter (where passed is not true) as failed
from results;
