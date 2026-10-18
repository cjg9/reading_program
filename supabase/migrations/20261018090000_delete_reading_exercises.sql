-- Assignments retain their content snapshot and student progress after library deletion.
alter table public.exercise_assignments alter column exercise_id drop not null;
alter table public.exercise_assignments drop constraint exercise_assignments_exercise_id_fkey;
alter table public.exercise_assignments add constraint exercise_assignments_exercise_id_fkey
  foreign key (exercise_id) references public.reading_exercises(id) on delete set null;

create function public.delete_reading_exercise(p_exercise_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.profiles where id=auth.uid() and account_type='teacher') then
    raise exception 'Teacher account required.';
  end if;
  delete from public.reading_exercises where id=p_exercise_id and teacher_id=auth.uid() and preset_key is null;
  if not found then raise exception 'Exercise unavailable.'; end if;
end;
$$;
revoke all on function public.delete_reading_exercise(uuid) from public,anon;
grant execute on function public.delete_reading_exercise(uuid) to authenticated;
