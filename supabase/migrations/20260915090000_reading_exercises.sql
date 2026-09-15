-- Teachers own reusable exercises. Assignments keep an immutable passage/game
-- snapshot so editing an exercise never changes work already given to a class.
create function app_private.valid_exercise_content(c jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare item jsonb;
begin
  if jsonb_typeof(c) is distinct from 'object'
    or jsonb_typeof(c->'title') is distinct from 'string' or char_length(btrim(c->>'title')) not between 1 and 120
    or jsonb_typeof(c->'passage') is distinct from 'string' or char_length(btrim(c->>'passage')) not between 40 and 20000
    or (c->>'strategy') is null or (c->>'strategy') not in ('missing','endings','upside','scramble','digraphs','backwards','nonsense','synonym','definition','mixed')
    or (c->>'mode') is distinct from 'type'
    or jsonb_typeof(c->'targetWords') is distinct from 'array'
    or jsonb_typeof(c->'vocabulary') is distinct from 'object'
    or jsonb_typeof(c->'challenges') is distinct from 'array' then return false; end if;
  if jsonb_array_length(c->'targetWords') > 50 or jsonb_array_length(c->'challenges') not between 1 and 40
    or octet_length(c::text) > 100000 then return false; end if;
  for item in select value from jsonb_array_elements(c->'targetWords') loop
    if jsonb_typeof(item) is distinct from 'string' or char_length(item#>>'{}') not between 1 and 80 then return false; end if;
  end loop;
  for item in select value from jsonb_each(c->'vocabulary') loop
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'synonym') is distinct from 'string'
      or jsonb_typeof(item->'definition') is distinct from 'string' or char_length(item->>'synonym') not between 1 and 200
      or char_length(item->>'definition') not between 1 and 500 then return false; end if;
  end loop;
  for item in select value from jsonb_array_elements(c->'challenges') loop
    if jsonb_typeof(item) is distinct from 'object' or coalesce(item->>'index','') !~ '^[0-9]{1,6}$'
      or jsonb_typeof(item->'word') is distinct from 'string' or char_length(item->>'word') not between 1 and 80
      or jsonb_typeof(item->'shown') is distinct from 'string' or char_length(item->>'shown') not between 1 and 500
      or (item->>'effect') is null or (item->>'effect') not in ('missing','endings','upside','scramble','digraphs','backwards','nonsense','synonym','definition') then return false; end if;
  end loop;
  return (select count(*)=count(distinct value->>'index') from jsonb_array_elements(c->'challenges'));
end;
$$;

create table public.reading_exercises (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references auth.users(id) on delete cascade,
  preset_key text unique,
  content jsonb not null check (app_private.valid_exercise_content(content)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((teacher_id is null) = (preset_key is not null))
);
create table public.exercise_assignments (
  id uuid primary key default gen_random_uuid(),
  class_id bigint not null,
  teacher_id uuid not null,
  exercise_id uuid not null references public.reading_exercises(id),
  content jsonb not null check (app_private.valid_exercise_content(content)),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  foreign key (class_id,teacher_id) references public.classes(id,teacher_id) on delete cascade
);
create unique index exercise_assignments_active_unique on public.exercise_assignments(class_id,exercise_id) where archived_at is null;
create index exercise_assignments_class on public.exercise_assignments(class_id,created_at desc);
create table public.exercise_progress (
  assignment_id uuid references public.exercise_assignments(id) on delete cascade,
  student_id uuid references auth.users(id) on delete cascade,
  progress jsonb not null default '{"answers":{},"hints":[]}',
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (assignment_id,student_id)
);
alter table public.reading_exercises enable row level security;
alter table public.exercise_assignments enable row level security;
alter table public.exercise_progress enable row level security;
revoke all on public.reading_exercises,public.exercise_assignments,public.exercise_progress from public,anon,authenticated;
grant select on public.reading_exercises,public.exercise_assignments,public.exercise_progress to authenticated;
create policy exercise_library_teacher on public.reading_exercises for select to authenticated using (
  (teacher_id=auth.uid() or teacher_id is null) and exists(select 1 from public.profiles where id=auth.uid() and account_type='teacher')
);
create policy exercise_assignment_access on public.exercise_assignments for select to authenticated using (
  teacher_id=auth.uid() or (archived_at is null and exists(select 1 from public.class_memberships m where m.class_id=exercise_assignments.class_id and m.student_id=auth.uid()))
);
create policy exercise_progress_access on public.exercise_progress for select to authenticated using (
  exists(select 1 from public.exercise_assignments a where a.id=assignment_id and (a.teacher_id=auth.uid() or student_id=auth.uid()))
);

create function public.save_reading_exercise(p_content jsonb,p_exercise_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and account_type='teacher') then raise exception 'Teacher account required.'; end if;
  if app_private.valid_exercise_content(p_content) is not true then raise exception 'Check the exercise title, passage, and game settings.'; end if;
  if p_exercise_id is null then
    insert into public.reading_exercises(teacher_id,content) values(auth.uid(),p_content) returning id into result;
  else
    update public.reading_exercises set content=p_content,updated_at=now() where id=p_exercise_id and teacher_id=auth.uid() returning id into result;
    if not found then raise exception 'Exercise unavailable.'; end if;
  end if;
  return result;
end;
$$;
create function public.assign_reading_exercise(p_class_id bigint,p_exercise_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_content jsonb; result uuid;
begin
  if not exists(select 1 from public.classes c join public.profiles p on p.id=c.teacher_id where c.id=p_class_id and c.teacher_id=auth.uid() and p.account_type='teacher') then raise exception 'Class unavailable.'; end if;
  select content into v_content from public.reading_exercises where id=p_exercise_id and (teacher_id=auth.uid() or teacher_id is null);
  if not found then raise exception 'Exercise unavailable.'; end if;
  insert into public.exercise_assignments(class_id,teacher_id,exercise_id,content) values(p_class_id,auth.uid(),p_exercise_id,v_content)
    on conflict (class_id,exercise_id) where archived_at is null do update set exercise_id=excluded.exercise_id returning id into result;
  return result;
end;
$$;
create function public.unassign_reading_exercise(p_assignment_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.exercise_assignments set archived_at=coalesce(archived_at,now()) where id=p_assignment_id and teacher_id=auth.uid();
  if not found then raise exception 'Assignment unavailable.'; end if;
end;
$$;
create function public.save_exercise_progress(p_assignment_id uuid,p_progress jsonb,p_complete boolean default false)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare assignment public.exercise_assignments; item record; hint jsonb; completed timestamptz; all_correct boolean;
begin
  select * into assignment from public.exercise_assignments where id=p_assignment_id and archived_at is null for share;
  if not found then raise exception 'Assignment unavailable.'; end if;
  perform 1 from public.class_memberships where class_id=assignment.class_id and student_id=auth.uid() for share;
  if not found then raise exception 'This class is no longer available to your account.'; end if;
  if jsonb_typeof(p_progress) is distinct from 'object' or jsonb_typeof(p_progress->'answers') is distinct from 'object'
    or jsonb_typeof(p_progress->'hints') is distinct from 'array' or octet_length(p_progress::text)>20000 then raise exception 'Invalid progress.'; end if;
  for item in select key,value from jsonb_each(p_progress->'answers') loop
    if jsonb_typeof(item.value) is distinct from 'string' or char_length(item.value#>>'{}')>100
      or not exists(select 1 from jsonb_array_elements(assignment.content->'challenges') c where c->>'index'=item.key) then raise exception 'Invalid answer.'; end if;
  end loop;
  if jsonb_array_length(p_progress->'hints')>40 then raise exception 'Invalid hints.'; end if;
  for hint in select value from jsonb_array_elements(p_progress->'hints') loop
    if not exists(select 1 from jsonb_array_elements(assignment.content->'challenges') c where c->'index'=hint) then raise exception 'Invalid hint.'; end if;
  end loop;
  select bool_and(coalesce(p_progress->'answers'->>(c->>'index'),'')=c->>'word') into all_correct from jsonb_array_elements(assignment.content->'challenges') c;
  if p_complete and not all_correct then raise exception 'Solve every word before finishing.'; end if;
  -- Serialize saves for one student, including multiple browser tabs.
  perform 1 from public.profiles where id=auth.uid() for update;
  select completed_at into completed from public.exercise_progress where assignment_id=p_assignment_id and student_id=auth.uid();
  if completed is not null then return completed; end if;
  completed := case when p_complete and all_correct then now() else null end;
  insert into public.exercise_progress(assignment_id,student_id,progress,completed_at)
    values(p_assignment_id,auth.uid(),jsonb_build_object('answers',p_progress->'answers','hints',p_progress->'hints'),completed)
    on conflict(assignment_id,student_id) do update set progress=excluded.progress,updated_at=now(),completed_at=excluded.completed_at;
  return completed;
end;
$$;
revoke all on function public.save_reading_exercise(jsonb,uuid),public.assign_reading_exercise(bigint,uuid),public.unassign_reading_exercise(uuid),public.save_exercise_progress(uuid,jsonb,boolean) from public,anon;
grant execute on function public.save_reading_exercise(jsonb,uuid),public.assign_reading_exercise(bigint,uuid),public.unassign_reading_exercise(uuid),public.save_exercise_progress(uuid,jsonb,boolean) to authenticated;
