alter table public.lessons
  drop constraint if exists lessons_level_check;

update public.lessons
set level = 'B1'
where level in ('A1', 'A2');

alter table public.lessons
  alter column level set default 'B1',
  add constraint lessons_level_check check (level in ('B1', 'B2', 'C1'));
