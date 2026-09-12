alter table public.class_invitations
  add column first_name text check (first_name is null or (first_name = btrim(first_name) and char_length(first_name) between 1 and 80)),
  add column last_name text check (last_name is null or (last_name = btrim(last_name) and char_length(last_name) between 1 and 80));
grant select(first_name,last_name) on public.class_invitations to authenticated;

-- Retain the original RPC for already deployed clients and migration history.
-- Calling it inside this transaction preserves its locks, ownership checks,
-- resend cooldown, and hourly quota for both single and bulk invitations.
create function public.prepare_named_class_invitation(p_teacher_id uuid, p_class_id bigint, p_email text, p_token_hash text, p_first_name text, p_last_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_inv jsonb;
begin
  if p_first_name is null or p_last_name is null
    or char_length(btrim(p_first_name)) not between 1 and 80
    or char_length(btrim(p_last_name)) not between 1 and 80
    or p_first_name ~ '[[:cntrl:]]' or p_last_name ~ '[[:cntrl:]]' then
    raise exception 'Enter a first and last name, each between 1 and 80 characters.';
  end if;
  v_inv := public.prepare_class_invitation(p_teacher_id,p_class_id,p_email,p_token_hash);
  update public.class_invitations set first_name=btrim(p_first_name),last_name=btrim(p_last_name)
    where id=(v_inv->>'id')::uuid;
  return v_inv || jsonb_build_object('first_name',btrim(p_first_name),'last_name',btrim(p_last_name));
end;
$$;
revoke all on function public.prepare_named_class_invitation(uuid,bigint,text,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_named_class_invitation(uuid,bigint,text,text,text,text) to service_role;

create function public.class_roster_named(p_class_id bigint)
returns table(student_id uuid,email text,joined_at timestamptz,first_name text,last_name text)
language plpgsql security definer set search_path = '' stable as $$
begin
  return query select r.student_id,r.email,r.joined_at,i.first_name,i.last_name
    from public.class_roster(p_class_id) r
    left join lateral (select inv.first_name,inv.last_name from public.class_invitations inv
      where inv.class_id=p_class_id and inv.accepted_by=r.student_id and inv.accepted_at is not null
      order by inv.accepted_at desc,inv.id limit 1) i on true
    order by lower(coalesce(i.last_name,r.email)),lower(i.first_name),r.student_id;
end;
$$;
revoke all on function public.class_roster_named(bigint) from public,anon;
grant execute on function public.class_roster_named(bigint) to authenticated;
