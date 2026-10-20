-- A publication pins one complete recording to an immutable exercise snapshot.
create table public.narration_publications (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid references public.reading_exercises(id) on delete set null,
  content_hash text not null,
  content jsonb not null,
  cache_key text not null references public.narration_cache(cache_key),
  created_at timestamptz not null default now(),
  unique(exercise_id,content_hash)
);
alter table public.narration_publications enable row level security;
revoke all on public.narration_publications from public,anon,authenticated;
grant all on public.narration_publications to service_role;
alter table public.exercise_assignments add column narration_id uuid references public.narration_publications(id);

drop function public.assign_reading_exercise(bigint,uuid);
create function public.assign_reading_exercise(p_class_id bigint,p_exercise_id uuid,p_narration_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_content jsonb; result uuid;
begin
  if not exists(select 1 from public.classes c join public.profiles p on p.id=c.teacher_id where c.id=p_class_id and c.teacher_id=auth.uid() and p.account_type='teacher') then raise exception 'Class unavailable.'; end if;
  select content into v_content from public.reading_exercises where id=p_exercise_id and teacher_id=auth.uid() for share;
  if not found then raise exception 'Exercise unavailable.'; end if;
  if not exists(select 1 from public.narration_publications n join public.narration_cache c on c.cache_key=n.cache_key
    where n.id=p_narration_id and n.exercise_id=p_exercise_id and n.content=v_content and c.status='ready' and c.object_path is not null)
    then raise exception 'Prepare the complete narration before publishing this exercise.'; end if;
  select id into result from public.exercise_assignments where class_id=p_class_id and exercise_id=p_exercise_id and archived_at is null;
  if found then
    -- Backfill an unchanged older assignment without replacing any student work.
    update public.exercise_assignments set narration_id=p_narration_id where id=result and content=v_content and narration_id is null;
    return result;
  end if;
  insert into public.exercise_assignments(class_id,teacher_id,exercise_id,content,narration_id)
    values(p_class_id,auth.uid(),p_exercise_id,v_content,p_narration_id)
    on conflict(class_id,exercise_id) where archived_at is null do update set exercise_id=excluded.exercise_id returning id into result;
  return result;
end $$;
revoke all on function public.assign_reading_exercise(bigint,uuid,uuid) from public,anon;
grant execute on function public.assign_reading_exercise(bigint,uuid,uuid) to authenticated;
