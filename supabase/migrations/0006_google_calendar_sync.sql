-- Lessons can be imported from the tutor's Google Calendar.
--
-- The tutor writes an event like "Eratund — Raul" and the sync matches it to a
-- student by name. Matching is by the student's calendar_alias when set, and by
-- their full name otherwise, so the tutor can keep writing short names.

alter table public.profiles add column calendar_alias text;

-- One session per calendar event. Re-syncing an event updates the session it
-- already created rather than making a second one; moving the event in Google
-- moves the lesson here.
alter table public.sessions add column google_event_id text;

create unique index sessions_google_event_id_key
  on public.sessions (google_event_id)
  where google_event_id is not null;

insert into public.app_settings (key, value)
values ('calendar_keyword', 'Eratund')
on conflict (key) do nothing;
