-- Only trusted mail delivery code can create invitations. Recipients enroll
-- through an atomic, email-bound RPC; browser table writes stay prohibited.
create table public.class_invitations (
  id uuid primary key default gen_random_uuid(),
  class_id bigint not null,
  teacher_id uuid not null,
  email text not null check (email = lower(btrim(email)) and length(email) <= 254),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  last_attempt_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  delivery_status text not null default 'sending' check (delivery_status in ('sending','sent','failed')),
  unique (class_id, email),
  foreign key (class_id, teacher_id) references public.classes(id, teacher_id) on delete cascade
);
alter table public.class_invitations enable row level security;
revoke all on public.class_invitations from public, anon, authenticated;
grant select (id,class_id,teacher_id,email,created_at,sent_at,last_attempt_at,expires_at,revoked_at,accepted_at,delivery_status)
  on public.class_invitations to authenticated;
grant all on public.class_invitations to service_role;
create policy invitations_select_owner on public.class_invitations for select to authenticated
  using (teacher_id = (select auth.uid()));

create table app_private.invitation_send_attempts (
  teacher_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index invitation_send_attempts_teacher_time on app_private.invitation_send_attempts(teacher_id, attempted_at);
revoke all on app_private.invitation_send_attempts from public, anon, authenticated, service_role;

create function public.prepare_class_invitation(p_teacher_id uuid, p_class_id bigint, p_email text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_class_name text;
  v_inv public.class_invitations;
  v_email text := lower(btrim(p_email));
begin
  -- Serializes all sends by one teacher, including concurrent requests.
  perform 1 from public.profiles where id = p_teacher_id and account_type = 'teacher' for update;
  if not found then raise exception 'Teacher account required.'; end if;
  select name into v_class_name from public.classes where id = p_class_id and teacher_id = p_teacher_id;
  if not found then raise exception 'Class unavailable.'; end if;
  if v_email is null or length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid email address.';
  end if;
  if exists (select 1 from public.class_memberships m join auth.users u on u.id = m.student_id
    where m.class_id = p_class_id and lower(u.email) = v_email) then
    raise exception 'This student has already joined the class.';
  end if;
  if (select count(*) from app_private.invitation_send_attempts where teacher_id = p_teacher_id
    and attempted_at > now() - interval '1 hour') >= 30 then
    raise exception 'Invitation limit reached. Try again in an hour.';
  end if;
  select * into v_inv from public.class_invitations where class_id = p_class_id and email = v_email for update;
  if found and v_inv.last_attempt_at > now() - interval '1 minute' then
    raise exception 'Wait one minute before sending another invitation to this student.';
  end if;
  insert into app_private.invitation_send_attempts(teacher_id) values (p_teacher_id);
  insert into public.class_invitations(class_id,teacher_id,email,token_hash)
    values (p_class_id,p_teacher_id,v_email,p_token_hash)
  on conflict (class_id,email) do update set token_hash = excluded.token_hash,
    last_attempt_at = now(), expires_at = now() + interval '7 days', revoked_at = null,
    accepted_at = null, accepted_by = null, sent_at = null, delivery_status = 'sending'
  returning * into v_inv;
  return jsonb_build_object('id',v_inv.id,'email',v_email,'class_name',v_class_name);
end;
$$;
revoke all on function public.prepare_class_invitation(uuid,bigint,text,text) from public, anon, authenticated;
grant execute on function public.prepare_class_invitation(uuid,bigint,text,text) to service_role;

create function public.preview_class_invitation(p_token_hash text)
returns jsonb language sql security definer set search_path = '' stable as $$
  select jsonb_build_object('class_name',c.name,'email',i.email,'expires_at',i.expires_at)
  from public.class_invitations i join public.classes c on c.id = i.class_id
  where i.token_hash = p_token_hash and i.revoked_at is null
    and (i.expires_at > now() or i.accepted_at is not null);
$$;
revoke all on function public.preview_class_invitation(text) from public;
grant execute on function public.preview_class_invitation(text) to anon, authenticated;

create function public.accept_class_invitation(p_token_hash text)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_inv public.class_invitations; v_email text; v_confirmed timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in to join this class.'; end if;
  select lower(email), email_confirmed_at into v_email,v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then raise exception 'Confirm your email before joining.'; end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and account_type = 'student') then
    raise exception 'Use a student account to accept this invitation.';
  end if;
  select * into v_inv from public.class_invitations where token_hash = p_token_hash for update;
  if not found or v_inv.revoked_at is not null then raise exception 'This invitation is no longer available.'; end if;
  if v_email is distinct from v_inv.email then raise exception 'Sign in with the email address this invitation was sent to.'; end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = auth.uid() then return v_inv.class_id; end if;
    raise exception 'This invitation has already been accepted.';
  end if;
  if v_inv.expires_at <= now() then raise exception 'This invitation expired. Ask your teacher to resend it.'; end if;
  insert into public.class_memberships(class_id,teacher_id,student_id)
    values (v_inv.class_id,v_inv.teacher_id,auth.uid()) on conflict (class_id,student_id) do nothing;
  update public.class_invitations set accepted_at = now(), accepted_by = auth.uid() where id = v_inv.id;
  return v_inv.class_id;
end;
$$;
revoke all on function public.accept_class_invitation(text) from public, anon;
grant execute on function public.accept_class_invitation(text) to authenticated;

create function public.revoke_class_invitation(p_invitation_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.class_invitations set revoked_at = now()
    where id = p_invitation_id and teacher_id = auth.uid() and accepted_at is null;
  if not found then raise exception 'Unused invitation unavailable.'; end if;
end;
$$;
revoke all on function public.revoke_class_invitation(uuid) from public, anon;
grant execute on function public.revoke_class_invitation(uuid) to authenticated;

create function public.class_roster(p_class_id bigint)
returns table(student_id uuid, email text, joined_at timestamptz)
language plpgsql security definer set search_path = '' stable as $$
begin
  if not exists (select 1 from public.classes c join public.profiles p on p.id = c.teacher_id
    where c.id = p_class_id and c.teacher_id = auth.uid() and p.account_type = 'teacher') then
    raise exception 'Class unavailable.';
  end if;
  return query select m.student_id,u.email::text,m.joined_at
    from public.class_memberships m join auth.users u on u.id = m.student_id
    where m.class_id = p_class_id order by lower(u.email);
end;
$$;
revoke all on function public.class_roster(bigint) from public, anon;
grant execute on function public.class_roster(bigint) to authenticated;
