-- Tests for 0007: chosen material recipients, homework due dates, and the
-- question threads students start about a file.

\set ON_ERROR_STOP on

\set admin '''11111111-1111-1111-1111-111111111111'''
\set alice '''22222222-2222-2222-2222-222222222222'''
\set bob   '''33333333-3333-3333-3333-333333333333'''
\set carl  '''55555555-5555-5555-5555-555555555555'''
\set mum   '''44444444-4444-4444-4444-444444444444'''

create table if not exists results (label text, passed boolean);
truncate results;
grant insert on results to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  (:admin::uuid, 'tutor@example.com', '{"full_name":"Tutor"}'),
  (:alice::uuid, 'alice@example.com', '{"full_name":"Alice"}'),
  (:bob::uuid,   'bob@example.com',   '{"full_name":"Bob"}'),
  (:carl::uuid,  'carl@example.com',  '{"full_name":"Carl"}'),
  (:mum::uuid,   'mum@example.com',   '{"full_name":"Maarja"}');

update public.profiles set role = 'admin' where id = :admin::uuid;
update public.profiles set role = 'parent', parent_of = :alice::uuid where id = :mum::uuid;
update public.profiles set approved = true, approved_at = now();

-- One material for everyone, one for Alice and Bob together, one for Carl.
insert into public.materials (id, title, file_path, audience) values
  ('aaaa0000-0000-0000-0000-000000000001', 'Kõigile', 'shared/all.pdf', 'all'),
  ('aaaa0000-0000-0000-0000-000000000002', 'Alice + Bob', 'shared/ab.pdf', 'selected'),
  ('aaaa0000-0000-0000-0000-000000000003', 'Ainult Carl', 'shared/c.pdf', 'selected');

insert into public.material_recipients (material_id, student_id) values
  ('aaaa0000-0000-0000-0000-000000000002', :alice::uuid),
  ('aaaa0000-0000-0000-0000-000000000002', :bob::uuid),
  ('aaaa0000-0000-0000-0000-000000000003', :carl::uuid);

insert into storage.objects (bucket_id, name) values
  ('materials', 'shared/all.pdf'),
  ('materials', 'shared/ab.pdf'),
  ('materials', 'shared/c.pdf');

insert into public.sessions (id, student_id, scheduled_at, status, homework, homework_due)
values ('bbbb0000-0000-0000-0000-000000000001', :alice::uuid, now() - interval '1 day',
        'done', 'Lk 84 ül 1-6', current_date + 3);

insert into public.session_files (id, session_id, student_id, file_path, original_name)
values ('cccc0000-0000-0000-0000-000000000001', null, :alice::uuid,
        :alice || '/general/pilt.jpg', 'kodutoo.jpg');

-- ===========================================================================
-- Material recipients
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student sees the all-audience material',
     (select count(*) = 1 from public.materials where audience = 'all')),
    ('student sees a material addressed to them',
     (select count(*) = 1 from public.materials
       where id = 'aaaa0000-0000-0000-0000-000000000002')),
    ('student CANNOT see a material for another student',
     (select count(*) = 0 from public.materials
       where id = 'aaaa0000-0000-0000-0000-000000000003')),
    ('student sees exactly two materials',
     (select count(*) = 2 from public.materials));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :bob, true);
  insert into results values
    ('second recipient of a shared material sees it',
     (select count(*) = 1 from public.materials
       where id = 'aaaa0000-0000-0000-0000-000000000002')),
    ('that student still cannot see Carl''s material',
     (select count(*) = 0 from public.materials
       where id = 'aaaa0000-0000-0000-0000-000000000003'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :carl, true);
  insert into results values
    ('third student sees only theirs and the shared one',
     (select count(*) = 2 from public.materials)),
    ('third student CANNOT see the Alice+Bob material',
     (select count(*) = 0 from public.materials
       where id = 'aaaa0000-0000-0000-0000-000000000002'));
commit;

-- Storage must follow the row rules, not just the table.
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student can fetch a material object addressed to them',
     (select count(*) = 1 from storage.objects where name = 'shared/ab.pdf')),
    ('student CANNOT fetch another student material object',
     (select count(*) = 0 from storage.objects
       where bucket_id = 'materials' and name = 'shared/c.pdf')),
    ('student can fetch the all-audience object',
     (select count(*) = 1 from storage.objects where name = 'shared/all.pdf'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('parent sees the material addressed to their child',
     (select count(*) = 1 from public.materials
       where id = 'aaaa0000-0000-0000-0000-000000000002')),
    ('parent CANNOT see an unrelated student material',
     (select count(*) = 0 from public.materials
       where id = 'aaaa0000-0000-0000-0000-000000000003'));
commit;

-- A student must not be able to add themselves as a recipient.
do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
  set local role authenticated;
  begin
    insert into public.material_recipients (material_id, student_id)
    values ('aaaa0000-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT add themselves as a recipient', ok);
end $$;

-- ===========================================================================
-- Homework due date
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student reads the homework due date',
     (select homework_due = current_date + 3 from public.sessions_public
       where id = 'bbbb0000-0000-0000-0000-000000000001'));
commit;

insert into results values
  ('sessions_public still hides tutor_notes',
   (select count(*) = 0 from information_schema.columns
     where table_schema = 'public' and table_name = 'sessions_public'
       and column_name = 'tutor_notes'));

-- ===========================================================================
-- Questions
-- ===========================================================================
begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into public.questions (id, student_id, file_id, body, region)
  values ('dddd0000-0000-0000-0000-000000000001', :alice::uuid,
          'cccc0000-0000-0000-0000-000000000001',
          'Miks siin ruutjuur kaob?', '{"x":0.1,"y":0.2,"w":0.3,"h":0.15}');
commit;

insert into results values
  ('student can ask a question with a region',
   (select region ->> 'x' = '0.1' from public.questions
     where id = 'dddd0000-0000-0000-0000-000000000001'));

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  set local role authenticated;
  begin
    insert into public.questions (student_id, body)
    values ('22222222-2222-2222-2222-222222222222', 'võltsitud küsimus');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('student CANNOT ask on behalf of another', ok);
end $$;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :bob, true);
  insert into results values
    ('student CANNOT read another student question',
     (select count(*) = 0 from public.questions));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :admin, true);
  insert into public.question_replies (question_id, author_id, body)
  values ('dddd0000-0000-0000-0000-000000000001', :admin::uuid, 'Sest astendaja on paaris.');
  update public.questions set answered_at = now()
   where id = 'dddd0000-0000-0000-0000-000000000001';
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into results values
    ('student reads the tutor reply',
     (select count(*) = 1 from public.question_replies)),
    ('question is marked answered',
     (select answered_at is not null from public.questions
       where id = 'dddd0000-0000-0000-0000-000000000001'));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :bob, true);
  insert into results values
    ('another student CANNOT read the reply',
     (select count(*) = 0 from public.question_replies));
commit;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :mum, true);
  insert into results values
    ('parent can read their child question and reply',
     (select count(*) = 1 from public.questions)
     and (select count(*) = 1 from public.question_replies));
commit;

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
  set local role authenticated;
  begin
    insert into public.question_replies (question_id, author_id, body)
    values ('dddd0000-0000-0000-0000-000000000001',
            '44444444-4444-4444-4444-444444444444', 'vanema vastus');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('parent CANNOT reply', ok);
end $$;

do $$
declare ok boolean;
begin
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', false);
  set local role authenticated;
  begin
    insert into public.question_replies (question_id, author_id, body)
    values ('dddd0000-0000-0000-0000-000000000001',
            '33333333-3333-3333-3333-333333333333', 'võõra vastus');
    ok := false;
  exception when insufficient_privilege then ok := true;
  end;
  reset role;
  insert into results values ('outsider CANNOT reply to a thread', ok);
end $$;

begin;
  set local role authenticated;
  select set_config('request.jwt.claim.sub', :alice, true);
  insert into public.question_replies (question_id, author_id, body)
  values ('dddd0000-0000-0000-0000-000000000001', :alice::uuid, 'Aitäh, sain aru!');
commit;

insert into results values
  ('the asking student can reply on their own thread',
   (select count(*) = 2 from public.question_replies));

\echo ''
select case when passed then 'PASS' else '*** FAIL ***' end as result, label
from results order by passed, label;

\echo ''
select count(*) filter (where passed) as passed,
       count(*) filter (where passed is not true) as failed
from results;
