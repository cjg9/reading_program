-- Teachers moderate membership only within classes they own.
create function public.remove_class_student(p_class_id bigint, p_student_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_removed integer;
begin
  -- Match invitation preparation's lock so a concurrent send cannot leave a
  -- usable invitation behind while this student is being removed.
  perform 1 from public.profiles where id = auth.uid() and account_type = 'teacher' for update;
  if not found then raise exception 'Class unavailable.'; end if;
  if not exists (select 1 from public.classes where id = p_class_id and teacher_id = auth.uid()) then
    raise exception 'Class unavailable.';
  end if;

  -- Lock/revoke invitations before deleting membership, matching acceptance's
  -- invitation-first lock order. Preserve acceptance history for the teacher.
  update public.class_invitations set revoked_at = coalesce(revoked_at, now())
    where class_id = p_class_id and (accepted_by = p_student_id
      or email = (select lower(email) from auth.users where id = p_student_id));
  delete from public.class_memberships
    where class_id = p_class_id and student_id = p_student_id;
  get diagnostics v_removed = row_count;
  return v_removed > 0;
end;
$$;
revoke all on function public.remove_class_student(bigint,uuid) from public,anon;
grant execute on function public.remove_class_student(bigint,uuid) to authenticated;

comment on function public.remove_class_student(bigint,uuid) is
  'Owner-only class moderation: remove membership and revoke old invitations; retain the student account and other memberships.';
