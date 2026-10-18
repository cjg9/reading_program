-- Private, content-addressed recordings. Only the authenticated Edge Function
-- can retrieve objects or reserve generation; no client can enumerate recordings.
insert into storage.buckets(id,name,public) values ('reading-narration','reading-narration',false)
on conflict (id) do nothing;

create table public.narration_limits (
  id boolean primary key default true check(id),
  monthly_characters integer not null default 10000 check(monthly_characters>=0),
  daily_user_characters integer not null default 5000 check(daily_user_characters>=0)
);
insert into public.narration_limits(id) values(true);
create table public.narration_cache (
  cache_key text primary key check(cache_key ~ '^[a-f0-9]{64}$'),
  status text not null check(status in ('pending','ready','failed')),
  lease_id uuid not null,
  lease_until timestamptz not null,
  object_path text,
  updated_at timestamptz not null default now()
);
create table public.narration_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  characters integer not null check(characters between 1 and 5000),
  created_at timestamptz not null default now()
);
create index narration_usage_date on public.narration_usage(created_at);
create index narration_usage_user_date on public.narration_usage(user_id,created_at);
alter table public.narration_limits enable row level security;
alter table public.narration_cache enable row level security;
alter table public.narration_usage enable row level security;
revoke all on public.narration_limits,public.narration_cache,public.narration_usage from public,anon,authenticated;
grant all on public.narration_limits,public.narration_cache,public.narration_usage to service_role;

create function public.reserve_narration(p_key text,p_user uuid,p_characters integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare limits public.narration_limits; cached public.narration_cache; lease uuid;
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_characters is null or p_characters not between 1 and 5000 or p_user is null then
    raise exception 'Invalid narration request';
  end if;
  -- One lock serializes reservations across workers, making both limits hard caps.
  select * into strict limits from public.narration_limits where id=true for update;
  select * into cached from public.narration_cache where cache_key=p_key;
  if found then
    if cached.status='ready' then return jsonb_build_object('status','ready','path',cached.object_path); end if;
    if cached.status='pending' and cached.lease_until>clock_timestamp() then return jsonb_build_object('status','pending'); end if;
  end if;
  if (select coalesce(sum(characters),0) from public.narration_usage where created_at>=date_trunc('month',now() at time zone 'UTC') at time zone 'UTC')+p_characters>limits.monthly_characters
    or (select coalesce(sum(characters),0) from public.narration_usage where user_id=p_user and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')+p_characters>limits.daily_user_characters then
    return jsonb_build_object('status','limited');
  end if;
  lease:=gen_random_uuid();
  insert into public.narration_cache(cache_key,status,lease_id,lease_until)
    values(p_key,'pending',lease,clock_timestamp()+interval '2 minutes')
    on conflict(cache_key) do update set status='pending',lease_id=excluded.lease_id,lease_until=excluded.lease_until,object_path=null,updated_at=now();
  -- Count attempts conservatively: a timeout may still be billable at the provider.
  insert into public.narration_usage(user_id,characters) values(p_user,p_characters);
  return jsonb_build_object('status','generate','lease',lease);
end $$;
revoke all on function public.reserve_narration(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_narration(text,uuid,integer) to service_role;
