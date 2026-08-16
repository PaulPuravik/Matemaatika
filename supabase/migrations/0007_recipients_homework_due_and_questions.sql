-- Four additions:
--   1. materials go to chosen students rather than everyone by default
--   2. homework gets a due date
--   3. students can ask a question about a file, optionally about one region
--      of an image, and the tutor answers in a thread
--   4. questions and replies carry their own read rules

-- ---------------------------------------------------------------------------
-- 1. Who a material is for
--
-- audience = 'all'      -> every approved student
-- audience = 'selected' -> only the students listed in material_recipients
-- ---------------------------------------------------------------------------

create type public.material_audience as enum ('all', 'selected');

alter table public.materials
  add column audience public.material_audience not null default 'selected';

create table public.material_recipients (
  material_id uuid not null references public.materials (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  primary key (material_id, student_id)
);

create index material_recipients_student_idx on public.material_recipients (student_id);

-- Carry the old single-student column over, then leave it alone. It stays for
-- now so nothing breaks mid-deploy; the recipients table is the truth.
insert into public.material_recipients (material_id, student_id)
select id, student_id from public.materials where student_id is not null
on conflict do nothing;

update public.materials set audience = 'all' where student_id is null;

alter table public.material_recipients enable row level security;

create policy "recipients readable by the student, their parent and admin"
  on public.material_recipients for select
  using (public.can_view_student(student_id));

create policy "recipients managed by admin"
  on public.material_recipients for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy "materials readable by their audience" on public.materials;

create policy "materials readable by their audience"
  on public.materials for select
  to authenticated
  using (
    public.is_admin()
    or (
      public.is_approved()
      and (
        audience = 'all'
        or exists (
          select 1 from public.material_recipients r
          where r.material_id = materials.id
            and public.can_view_student(r.student_id)
        )
      )
    )
  );

-- Storage still keys off the folder the file was uploaded into, so a material
-- meant for several students lives under shared/ and is guarded by the row
-- policy above rather than by its path.
drop policy "materials readable by their audience" on storage.objects;

create policy "materials readable by their audience"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'materials'
    and (
      public.is_admin()
      or (
        public.is_approved()
        and exists (
          select 1 from public.materials m
          left join public.material_recipients r on r.material_id = m.id
          where m.file_path = storage.objects.name
            and (m.audience = 'all' or public.can_view_student(r.student_id))
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Homework due date
-- ---------------------------------------------------------------------------

alter table public.sessions add column homework_due date;

create or replace view public.sessions_public
with (security_barrier = true)
as
  select id, student_id, scheduled_at, status, created_at,
         summary, homework, homework_due
  from public.sessions
  where public.can_view_student(student_id);

revoke all on public.sessions_public from anon;
grant select on public.sessions_public to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Questions
--
-- A question hangs off a file the student can already see: either something
-- they uploaded, or a material shared with them. `region` is null for a
-- question about the whole file, or {x,y,w,h} as fractions of the image when
-- the student dragged a box.
-- ---------------------------------------------------------------------------

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  file_id uuid references public.session_files (id) on delete cascade,
  material_id uuid references public.materials (id) on delete cascade,
  body text not null,
  region jsonb,
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  -- A question points at one thing, or at nothing in particular.
  constraint questions_one_target check (
    file_id is null or material_id is null
  )
);

create index questions_student_idx on public.questions (student_id, created_at desc);
create index questions_unanswered_idx on public.questions (answered_at) where answered_at is null;

create table public.question_replies (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index question_replies_question_idx on public.question_replies (question_id, created_at);

alter table public.questions enable row level security;
alter table public.question_replies enable row level security;

create policy "questions readable by student, parent and admin"
  on public.questions for select
  using (public.can_view_student(student_id));

create policy "questions insertable by owning student"
  on public.questions for insert
  with check (student_id = auth.uid() and public.is_approved());

create policy "questions deletable by owning student"
  on public.questions for delete
  using (student_id = auth.uid());

create policy "questions managed by admin"
  on public.questions for all
  using (public.is_admin())
  with check (public.is_admin());

-- Replies are visible to whoever may see the question they belong to.
create policy "replies readable with their question"
  on public.question_replies for select
  using (
    exists (
      select 1 from public.questions q
      where q.id = question_id and public.can_view_student(q.student_id)
    )
  );

-- The student may answer back on their own thread; the parent may not write.
create policy "replies insertable by the asking student"
  on public.question_replies for insert
  with check (
    author_id = auth.uid()
    and public.is_approved()
    and exists (
      select 1 from public.questions q
      where q.id = question_id and q.student_id = auth.uid()
    )
  );

create policy "replies managed by admin"
  on public.question_replies for all
  using (public.is_admin())
  with check (public.is_admin());
