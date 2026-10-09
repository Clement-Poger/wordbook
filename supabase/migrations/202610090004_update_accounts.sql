alter table public.profiles
  drop constraint if exists profiles_username_check;

update public.profiles
set username = 'eva'
where username = 'eva_villega';

alter table public.profiles
  add constraint profiles_username_check check (username in ('elios', 'eva'));
