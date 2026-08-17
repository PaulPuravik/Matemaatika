-- Tests for 0008: the tutor can attach files to a lesson's homework, and those
-- files travel the other way down the same bucket as student uploads. The
-- interesting cases are the asymmetries — who may write into whose folder, and
-- who may delete what once it is there.

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
update public.profiles set approved = true, approved_at = now();

insert into public.sessions (id, student_id, scheduled_at, status, homework)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', :alice::uuid, now() - interval '1 day',
   'done', 'Lahenda lk 84'),
  ('aaaaaaaa-0000-0000-0000-000000000002', :alice::uuid, now() + interval '3 days',
   'upcoming', null),
  ('bbbbbbbb-0000-0000-0000-000000000002', :bob::uuid, now() + interval '2 days',
   'upcoming', null);

-- ===========================================================================
-- The tutor attaches a worksheet to Alice's homework
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :admin, true);

  insert into storage.objects (bucket_id, name, owner)
  values ('student-files',
          '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/tutor.pdf',
          :admin::uuid);

  insert into public.session_files
    (session_id, student_id, file_path, original_name, from_tutor)
  values ('aaaaaaaa-0000-0000-0000-000000000001', :alice::uuid,
          '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000001/tutor.pdf',
          'kodutoo.pdf', true);
commit;

insert into results values
  ('admin can upload into a student folder',
   (select count(*) = 1 from storage.objects
     where name like '22222222%tutor.pdf')),
  ('the row is marked as coming from the tutor',
   (select from_tutor from public.session_files where original_name = 'kodutoo.pdf'));

-- Alice's own upload, for contrast.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);

  insert into storage.objects (bucket_id, name, owner)
  values ('student-files',
          '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002/mine.pdf',
          :alice::uuid);

  insert into public.session_files (session_id, student_id, file_path, original_name)
  values ('aaaaaaaa-0000-0000-0000-000000000002', :alice::uuid,
          '22222222-2222-2222-2222-222222222222/aaaaaaaa-0000-0000-0000-000000000002/mine.pdf',
          'minu.pdf');
commit;

-- ===========================================================================
-- Reading
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student sees the file the tutor attached',
     (select count(*) = 1 from public.session_files
       where student_id = :alice::uuid and from_tutor)),
    ('student can fetch the tutor object',
     (select count(*) = 1 from storage.objects where name like '22222222%tutor.pdf')),
    ('student sees both directions on their own lesson',
     (select count(*) = 2 from public.session_files where student_id = :alice::uuid));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('parent sees the homework file too',
     (select count(*) = 1 from public.session_files
       where student_id = :alice::uuid and from_tutor)),
    ('parent can fetch the tutor object',
     (select count(*) = 1 from storage.objects where name like '22222222%tutor.pdf'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :bob, true);
  insert into results values
    ('another student CANNOT see it as a row',
     (select count(*) = 0 from public.session_files where from_tutor)),
    ('another student CANNOT fetch the object',
     (select count(*) = 0 from storage.objects where name like '22222222%'));
commit;

-- ===========================================================================
-- Deleting
-- ===========================================================================

-- The student may clear out what they sent, but not what they were given.
do $$
declare gone integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;

  delete from public.session_files where from_tutor;
  get diagnostics gone = row_count;
  reset role;
  insert into results values ('student CANNOT delete the tutor row', gone = 0);
end $$;

do $$
declare gone integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;

  delete from storage.objects where name like '22222222%tutor.pdf';
  get diagnostics gone = row_count;
  reset role;
  insert into results values ('student CANNOT delete the tutor object', gone = 0);
end $$;

do $$
declare gone integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;

  delete from public.session_files where original_name = 'minu.pdf';
  get diagnostics gone = row_count;
  reset role;
  insert into results values ('student can still delete their own row', gone = 1);
end $$;

-- ===========================================================================
-- Forging
-- ===========================================================================

-- A student cannot dress their own upload up as tutor-sent, which would make
-- it undeletable by them and misleading to their parent.
do $$
declare made integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;

  begin
    insert into public.session_files
      (session_id, student_id, file_path, original_name, from_tutor)
    values ('aaaaaaaa-0000-0000-0000-000000000002',
            '22222222-2222-2222-2222-222222222222',
            '22222222-2222-2222-2222-222222222222/forged.pdf', 'forged.pdf', true);
    made := 1;
  exception when insufficient_privilege then
    made := 0;
  end;
  reset role;
  insert into results values ('student CANNOT claim a file came from the tutor', made = 0);
end $$;

-- And still cannot write into someone else's folder.
do $$
declare made integer;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;

  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('student-files', '33333333-3333-3333-3333-333333333333/sneak.pdf',
            '22222222-2222-2222-2222-222222222222');
    made := 1;
  exception when insufficient_privilege then
    made := 0;
  end;
  reset role;
  insert into results values ('student CANNOT upload into another folder', made = 0);
end $$;

-- ===========================================================================
-- The tutor cleans up
-- ===========================================================================
do $$
declare gone integer;
begin
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  set local role authenticated;

  delete from storage.objects where name like '22222222%tutor.pdf';
  get diagnostics gone = row_count;
  reset role;
  insert into results values ('admin can delete a file they attached', gone = 1);
end $$;

\echo ''
select case when passed then 'PASS' else '*** FAIL ***' end as result, label
from results order by passed, label;

\echo ''
select count(*) filter (where passed) as passed,
       count(*) filter (where passed is not true) as failed
from results;
