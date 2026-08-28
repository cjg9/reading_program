create schema if not exists app_private;

revoke all on schema app_private
  from public, anon, authenticated, service_role;
grant usage on schema app_private to supabase_auth_admin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_type text not null,
  created_at timestamptz not null default now(),
  constraint profiles_account_type_check
    check (account_type in ('teacher', 'student')),
  constraint profiles_id_account_type_key unique (id, account_type)
);

comment on table public.profiles is
  'Application-owned account type for each Supabase Auth user.';
comment on column public.profiles.account_type is
  'Immutable browser-facing account type used by application authorization.';

create function app_private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, account_type, created_at)
  values (
    new.id,
    case
      when new.raw_user_meta_data ->> 'signup_portal' = 'student'
        then 'student'
      else 'teacher'
    end,
    new.created_at
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function app_private.create_profile_for_new_user()
  from public, anon, authenticated, service_role;
grant execute on function app_private.create_profile_for_new_user()
  to supabase_auth_admin;

create trigger leafmark_create_profile_after_signup
  after insert on auth.users
  for each row execute function app_private.create_profile_for_new_user();

-- Installing the trigger before backfilling closes the gap between existing
-- accounts and accounts created while this migration is running. Missing portal
-- metadata defaults to teacher for compatibility with the teacher-only release.
insert into public.profiles (id, account_type, created_at)
select id, 'teacher', created_at
from auth.users
on conflict (id) do nothing;

alter table public.profiles enable row level security;

revoke all privileges on table public.profiles
  from public, anon, authenticated;
grant select on table public.profiles to authenticated;

create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

alter table public.classes
  add constraint classes_id_teacher_id_key unique (id, teacher_id);

create table public.class_memberships (
  class_id bigint not null,
  teacher_id uuid not null default auth.uid(),
  student_id uuid not null,
  student_account_type text not null default 'student',
  joined_at timestamptz not null default now(),
  last_accessed_at timestamptz not null default now(),
  primary key (class_id, student_id),
  constraint class_memberships_student_account_type_check
    check (student_account_type = 'student'),
  constraint class_memberships_class_owner_fkey
    foreign key (class_id, teacher_id)
    references public.classes (id, teacher_id)
    on delete cascade,
  constraint class_memberships_student_fkey
    foreign key (student_id, student_account_type)
    references public.profiles (id, account_type)
    on delete cascade
);

comment on table public.class_memberships is
  'Many-to-many enrollment records connecting student accounts to classes.';
comment on column public.class_memberships.last_accessed_at is
  'Most recent time this student opened this class workspace.';

create index class_memberships_student_accessed_idx
  on public.class_memberships (student_id, last_accessed_at desc, class_id);
create index class_memberships_teacher_class_idx
  on public.class_memberships (teacher_id, class_id);

alter table public.class_memberships enable row level security;

revoke all privileges on table public.class_memberships
  from public, anon, authenticated;
grant select on table public.class_memberships to authenticated;
grant update (last_accessed_at)
  on table public.class_memberships to authenticated;

create policy class_memberships_select_own
  on public.class_memberships
  for select
  to authenticated
  using (
    (select auth.uid()) = student_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = 'student'
    )
  );

create policy class_memberships_update_own_access
  on public.class_memberships
  for update
  to authenticated
  using (
    (select auth.uid()) = student_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = 'student'
    )
  )
  with check (
    (select auth.uid()) = student_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = 'student'
    )
  );

drop policy if exists classes_select_own on public.classes;
drop policy if exists classes_insert_own on public.classes;
drop policy if exists classes_update_own on public.classes;

revoke all privileges on table public.classes
  from public, anon, authenticated;
grant select on table public.classes to authenticated;
grant insert (name) on table public.classes to authenticated;
grant update (last_accessed_at) on table public.classes to authenticated;

create policy classes_select_teacher_owned
  on public.classes
  for select
  to authenticated
  using (
    (select auth.uid()) = teacher_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = 'teacher'
    )
  );

create policy classes_select_student_enrolled
  on public.classes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.class_memberships
      where class_memberships.class_id = classes.id
        and class_memberships.student_id = (select auth.uid())
    )
  );

create policy classes_insert_teacher_owned
  on public.classes
  for insert
  to authenticated
  with check (
    (select auth.uid()) = teacher_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = 'teacher'
    )
  );

create policy classes_update_teacher_owned
  on public.classes
  for update
  to authenticated
  using (
    (select auth.uid()) = teacher_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = 'teacher'
    )
  )
  with check (
    (select auth.uid()) = teacher_id
    and exists (
      select 1
      from public.profiles
      where profiles.id = (select auth.uid())
        and profiles.account_type = 'teacher'
    )
  );
