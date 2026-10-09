create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username in ('elios', 'eva')),
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  word text not null check (char_length(word) between 1 and 80),
  part_of_speech text not null check (char_length(part_of_speech) between 1 and 40),
  definition text not null check (char_length(definition) between 1 and 500),
  example text not null check (char_length(example) between 1 and 500),
  level text not null default 'B1' check (level in ('B1', 'B2', 'C1')),
  topic text not null default 'Everyday' check (char_length(topic) between 1 and 60),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists lessons_word_unique
  on public.lessons (lower(word));

alter table public.lessons enable row level security;

revoke all on public.lessons from anon, authenticated;
grant select, insert, update, delete on public.lessons to authenticated;

create policy "Signed-in learners can read lessons"
  on public.lessons for select
  to authenticated
  using (true);

create policy "Admins can add lessons"
  on public.lessons for insert
  to authenticated
  with check ((select public.is_admin()));

create policy "Admins can edit lessons"
  on public.lessons for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy "Admins can remove lessons"
  on public.lessons for delete
  to authenticated
  using ((select public.is_admin()));

insert into public.lessons (word, part_of_speech, definition, example, level, topic)
values
  ('thoughtful', 'adjective', 'Showing care for the needs or feelings of others.', 'That was a thoughtful thing to say.', 'B1', 'Personality'),
  ('wander', 'verb', 'To walk or move around without a fixed plan.', 'We wandered through the old town.', 'B1', 'Travel'),
  ('cozy', 'adjective', 'Comfortable, warm, and pleasantly relaxing.', 'It is a cozy little place to read.', 'B1', 'Everyday'),
  ('notice', 'verb', 'To become aware of something by seeing or hearing it.', 'Did you notice the change in her voice?', 'B1', 'Everyday'),
  ('gather', 'verb', 'To bring things together or collect them in one place.', 'Let us gather a few ideas first.', 'B1', 'Everyday'),
  ('gentle', 'adjective', 'Kind and careful, or not strong or severe.', 'A gentle breeze came through the window.', 'B1', 'Nature'),
  ('curious', 'adjective', 'Eager to know, learn, or understand something.', 'I am curious about how it works.', 'B1', 'Personality'),
  ('brief', 'adjective', 'Lasting for only a short time; using few words.', 'We had a brief chat after class.', 'B1', 'Communication'),
  ('glance', 'verb', 'To look quickly at someone or something.', 'She glanced at her notes before speaking.', 'B1', 'Communication'),
  ('achieve', 'verb', 'To succeed in doing or completing something.', 'With practice, you can achieve your goal.', 'B1', 'Goals')
on conflict do nothing;

create or replace function public.reset_wordstep_lessons()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reset lesson data';
  end if;

  delete from public.lessons;

  insert into public.lessons (word, part_of_speech, definition, example, level, topic)
  values
    ('thoughtful', 'adjective', 'Showing care for the needs or feelings of others.', 'That was a thoughtful thing to say.', 'B1', 'Personality'),
    ('wander', 'verb', 'To walk or move around without a fixed plan.', 'We wandered through the old town.', 'B1', 'Travel'),
    ('cozy', 'adjective', 'Comfortable, warm, and pleasantly relaxing.', 'It is a cozy little place to read.', 'B1', 'Everyday'),
    ('notice', 'verb', 'To become aware of something by seeing or hearing it.', 'Did you notice the change in her voice?', 'B1', 'Everyday'),
    ('gather', 'verb', 'To bring things together or collect them in one place.', 'Let us gather a few ideas first.', 'B1', 'Everyday'),
    ('gentle', 'adjective', 'Kind and careful, or not strong or severe.', 'A gentle breeze came through the window.', 'B1', 'Nature'),
    ('curious', 'adjective', 'Eager to know, learn, or understand something.', 'I am curious about how it works.', 'B1', 'Personality'),
    ('brief', 'adjective', 'Lasting for only a short time; using few words.', 'We had a brief chat after class.', 'B1', 'Communication'),
    ('glance', 'verb', 'To look quickly at someone or something.', 'She glanced at her notes before speaking.', 'B1', 'Communication'),
    ('achieve', 'verb', 'To succeed in doing or completing something.', 'With practice, you can achieve your goal.', 'B1', 'Goals')
  on conflict do nothing;
end;
$$;

revoke all on function public.reset_wordstep_lessons() from public;
grant execute on function public.reset_wordstep_lessons() to authenticated;
