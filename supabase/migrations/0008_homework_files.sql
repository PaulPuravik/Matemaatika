-- Files attached to homework by the tutor.
--
-- Until now every object in the student-files bucket travelled one way: the
-- student uploaded it for the tutor to read. Homework needs the other
-- direction — the tutor attaches worksheets to a lesson and the student (and
-- their parent) reads them.
--
-- They share the bucket and the table rather than getting their own, because
-- the read rule is identical: a file under <student_id>/ is visible to that
-- student, their parent and the tutor. What differs is who may write and
-- delete it, and that is what `from_tutor` records.

alter table public.session_files
  add column from_tutor boolean not null default false;

-- ---------------------------------------------------------------------------
-- The student must not be able to delete what the tutor sent them
-- ---------------------------------------------------------------------------

drop policy "files deletable by owning student" on public.session_files;
create policy "files deletable by owning student"
  on public.session_files for delete
  using (student_id = auth.uid() and not from_tutor);

-- Inserting stays as it was: `from_tutor` defaults to false and a student
-- setting it true would only be claiming their own file came from the tutor,
-- which gains them nothing but confusion — so pin it anyway.
drop policy "files insertable by owning student" on public.session_files;
create policy "files insertable by owning student"
  on public.session_files for insert
  with check (
    student_id = auth.uid()
    and public.is_approved()
    and not from_tutor
    and (session_id is null or public.owns_session(session_id))
  );

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

-- Resolving an object back to its row, rather than reading the path, is what
-- keeps the delete rule honest: the path says which student's folder the file
-- sits in, and that is exactly the folder a tutor upload sits in too.
-- SECURITY DEFINER because the caller's own RLS view of session_files is not
-- the question being asked.
create or replace function public.is_tutor_file(path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.session_files f
    where f.file_path = path and f.from_tutor
  );
$$;

-- The tutor may write into any student's folder; everyone else only into
-- their own, as before.
drop policy "student files uploadable by owning student" on storage.objects;
create policy "student files uploadable by owning student or admin"
  on storage.objects for insert
  with check (
    bucket_id = 'student-files'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

drop policy "student files deletable by owner or admin" on storage.objects;
create policy "student files deletable by owner or admin"
  on storage.objects for delete
  using (
    bucket_id = 'student-files'
    and (
      public.is_admin()
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not public.is_tutor_file(name)
      )
    )
  );

-- Reads were keyed off a bare cast of the first path segment. Every path this
-- app writes starts with a uuid, but a policy predicate is not guaranteed to
-- short-circuit, so parse it the same total way the materials policy does.
drop policy "student files readable by student, parent and admin" on storage.objects;
create policy "student files readable by student, parent and admin"
  on storage.objects for select
  using (
    bucket_id = 'student-files'
    and public.can_view_student(public.safe_uuid((storage.foldername(name))[1]))
  );
