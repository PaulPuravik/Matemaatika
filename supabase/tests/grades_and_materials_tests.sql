-- Tests for 0003: student-entered grades, and materials aimed at one student.

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

insert into public.grades (student_id, subject, mark, received_on) values
  (:alice::uuid, 'Logaritmid', '4', current_date - 3),
  (:bob::uuid,   'Vektorid',   '5', current_date - 1);

-- One shared material, one aimed at Alice, one aimed at Bob, one legacy row.
insert into public.materials (title, file_path, student_id) values
  ('Kõigile: valemileht', 'shared/aaa.pdf', null),
  ('Ainult Alice''ile',   :alice || '/bbb.pdf', :alice::uuid),
  ('Ainult Bobile',       :bob   || '/ccc.pdf', :bob::uuid),
  ('Vana jagatud fail',   'legacy.pdf',         null);

insert into storage.objects (bucket_id, name) values
  ('materials', 'shared/aaa.pdf'),
  ('materials', :alice || '/bbb.pdf'),
  ('materials', :bob   || '/ccc.pdf'),
  ('materials', 'legacy.pdf');

-- ===========================================================================
-- Grades
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student reads own grades',
     (select count(*) = 1 from public.grades where student_id = :alice::uuid)),
    ('student CANNOT read another student grades',
     (select count(*) = 0 from public.grades where student_id = :bob::uuid)),
    ('student grade scan returns only their own',
     (select count(*) = 1 from public.grades));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into public.grades (student_id, subject, mark)
  values (:alice::uuid, 'Trigonomeetria', '5');
commit;

insert into results values
  ('student can add their own grade',
   (select count(*) = 2 from public.grades where student_id = :alice::uuid));

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  begin
    insert into public.grades (student_id, subject, mark)
    values ('33333333-3333-3333-3333-333333333333', 'Võltsitud', '1');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT add a grade for someone else', ok);
end $$;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('parent reads child grades',
     (select count(*) = 2 from public.grades where student_id = :alice::uuid)),
    ('parent CANNOT read unrelated grades',
     (select count(*) = 0 from public.grades where student_id = :bob::uuid));
commit;

do $$
declare changed integer;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  set local role authenticated;
  update public.grades set mark = '1'
   where student_id = '22222222-2222-2222-2222-222222222222';
  get diagnostics changed = row_count;
  reset role;
  insert into results values ('parent CANNOT change child grades', changed = 0);
end $$;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :admin, true);
  insert into results values
    ('admin reads all grades', (select count(*) = 3 from public.grades));
commit;

-- ===========================================================================
-- Materials rows
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student sees shared + own private materials',
     (select count(*) = 3 from public.materials)),
    ('student sees the material aimed at them',
     (select count(*) = 1 from public.materials where student_id = :alice::uuid)),
    ('student CANNOT see a material aimed at another student',
     (select count(*) = 0 from public.materials where student_id = :bob::uuid));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('parent sees the material aimed at their child',
     (select count(*) = 1 from public.materials where student_id = :alice::uuid)),
    ('parent CANNOT see another student material',
     (select count(*) = 0 from public.materials where student_id = :bob::uuid));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :admin, true);
  insert into results values
    ('admin sees every material', (select count(*) = 4 from public.materials));
commit;

-- ===========================================================================
-- Materials storage objects
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student can read shared/ object',
     (select count(*) = 1 from storage.objects where name = 'shared/aaa.pdf')),
    ('student can read legacy root object',
     (select count(*) = 1 from storage.objects where name = 'legacy.pdf')),
    ('student can read object in their own folder',
     (select count(*) = 1 from storage.objects where name = :alice || '/bbb.pdf')),
    ('student CANNOT read object in another student folder',
     (select count(*) = 0 from storage.objects
       where bucket_id = 'materials' and name = :bob || '/ccc.pdf'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('parent can read their child material object',
     (select count(*) = 1 from storage.objects where name = :alice || '/bbb.pdf')),
    ('parent CANNOT read another student material object',
     (select count(*) = 0 from storage.objects
       where bucket_id = 'materials' and name = :bob || '/ccc.pdf'));
commit;

-- A student must not be able to upload into the materials bucket at all.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
  set local role authenticated;
  begin
    insert into storage.objects (bucket_id, name)
    values ('materials', 'shared/sneaky.pdf');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT upload materials', ok);
end $$;

\echo ''
select case when passed then 'PASS' else '*** FAIL ***' end as result, label
from results order by passed, label;

\echo ''
select count(*) filter (where passed) as passed,
       count(*) filter (where passed is not true) as failed
from results;
