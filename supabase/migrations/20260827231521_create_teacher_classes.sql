create table public.classes (
  id bigint generated always as identity primary key,
  teacher_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  constraint classes_name_length check (
    name = btrim(name, E' \t\n\r\f')
    and char_length(name) between 1 and 80
  )
);

comment on table public.classes is
  'Classes created and owned by authenticated teacher accounts.';
comment on column public.classes.last_accessed_at is
  'Most recent time the teacher opened the class workspace.';

create index classes_teacher_last_accessed_idx
  on public.classes (teacher_id, last_accessed_at desc, id desc);

alter table public.classes enable row level security;

revoke all privileges on table public.classes
  from public, anon, authenticated;
revoke all privileges on sequence public.classes_id_seq
  from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.classes to authenticated;
grant insert (name) on table public.classes to authenticated;
grant update (last_accessed_at) on table public.classes to authenticated;
grant usage on sequence public.classes_id_seq to authenticated;

create policy classes_select_own
  on public.classes
  for select
  to authenticated
  using ((select auth.uid()) = teacher_id);

create policy classes_insert_own
  on public.classes
  for insert
  to authenticated
  with check ((select auth.uid()) = teacher_id);

create policy classes_update_own
  on public.classes
  for update
  to authenticated
  using ((select auth.uid()) = teacher_id)
  with check ((select auth.uid()) = teacher_id);
