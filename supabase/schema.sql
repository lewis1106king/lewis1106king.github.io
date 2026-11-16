-- 수색 연결: Supabase SQL Editor에서 한 번 실행합니다.
-- 인증된 참여자만 자기 임무 데이터를 읽고, 변경은 아래 함수로만 합니다.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 80),
  join_code text not null unique check (join_code ~ '^[A-F0-9]{6}$'),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  mission_id uuid not null references public.missions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('operator', 'pilot')),
  callsign text not null check (char_length(callsign) between 1 and 24),
  drone_name text not null default '',
  drone_status text not null default 'ground' check (drone_status in ('ground', 'ready', 'flying', 'returning', 'landed', 'lost')),
  lat double precision,
  lng double precision,
  accuracy double precision,
  updated_at timestamptz not null default now(),
  primary key (mission_id, user_id)
);

create table if not exists public.zones (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  path jsonb not null,
  task_status text not null default 'unassigned' check (task_status in ('unassigned', 'assigned', 'in_progress', 'completed', 'interrupted')),
  observation_status text not null default 'unverified' check (observation_status in ('unverified', 'confirmed', 'recheck')),
  review_reason text not null default '',
  memo text not null default '',
  assignee_id uuid references public.profiles (id),
  updated_at timestamptz not null default now()
);

create table if not exists public.points (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  label text not null check (char_length(label) between 1 and 40),
  memo text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.handovers (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  zone_id uuid not null references public.zones (id) on delete cascade,
  from_user uuid not null references public.profiles (id),
  to_user uuid references public.profiles (id),
  previous_status text not null,
  interruption_reason text not null,
  approval_reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (id)
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  zone_id uuid not null references public.zones (id) on delete cascade,
  storage_path text not null,
  memo text not null default '',
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  kind text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mission_id uuid not null references public.missions (id) on delete cascade,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists zones_mission_idx on public.zones (mission_id);
create index if not exists points_mission_idx on public.points (mission_id);
create index if not exists handovers_mission_idx on public.handovers (mission_id);
create index if not exists photos_zone_idx on public.photos (zone_id);
create index if not exists events_mission_idx on public.events (mission_id, created_at desc);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.missions enable row level security;
alter table public.members enable row level security;
alter table public.zones enable row level security;
alter table public.points enable row level security;
alter table public.handovers enable row level security;
alter table public.photos enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_member(p_mission uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where mission_id = p_mission and user_id = auth.uid()
  );
$$;

create or replace function public.is_operator(p_mission uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where mission_id = p_mission and user_id = auth.uid() and role = 'operator'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), nullif(split_part(coalesce(new.email, ''), '@', 1), ''), '나'), 40)
  )
  on conflict (id) do update
    set display_name = excluded.display_name;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.valid_path(p_path jsonb)
returns boolean
language plpgsql
immutable
as $$
declare
  item jsonb;
begin
  if jsonb_typeof(p_path) <> 'array' or jsonb_array_length(p_path) < 3 or jsonb_array_length(p_path) > 24 then
    return false;
  end if;
  for item in select * from jsonb_array_elements(p_path)
  loop
    if (item->>'lat') is null or (item->>'lng') is null then
      return false;
    end if;
    if (item->>'lat')::double precision < -90 or (item->>'lat')::double precision > 90 then
      return false;
    end if;
    if (item->>'lng')::double precision < -180 or (item->>'lng')::double precision > 180 then
      return false;
    end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.create_mission(p_title text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
  code text;
  tries int := 0;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if char_length(trim(p_title)) < 2 then
    raise exception '임무 이름을 두 글자 이상 입력하세요.';
  end if;
  loop
    tries := tries + 1;
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    exit when not exists (select 1 from public.missions where join_code = code) or tries > 8;
  end loop;
  insert into public.missions (title, join_code, created_by)
  values (trim(p_title), code, auth.uid())
  returning id into mid;
  insert into public.members (mission_id, user_id, role, callsign, drone_name)
  values (mid, auth.uid(), 'operator', '나', '');
  insert into public.events (mission_id, actor_id, kind, message)
  values (mid, auth.uid(), 'mission', '임무를 만들었습니다.');
  return (select to_jsonb(m) from public.missions m where m.id = mid);
end;
$$;

create or replace function public.join_mission(
  p_code text,
  p_role text,
  p_callsign text,
  p_drone text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  mid uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_role not in ('operator', 'pilot') then
    raise exception '역할은 운영자 또는 조종입니다.';
  end if;
  if char_length(trim(p_callsign)) < 1 then
    raise exception '호출 부호를 입력하세요.';
  end if;
  select id into mid from public.missions where join_code = upper(trim(p_code));
  if mid is null then
    raise exception '참여 코드를 찾지 못했습니다.';
  end if;
  insert into public.members (mission_id, user_id, role, callsign, drone_name)
  values (mid, auth.uid(), p_role, left(trim(p_callsign), 24), left(coalesce(p_drone, ''), 40))
  on conflict (mission_id, user_id) do update
    set role = excluded.role,
        callsign = excluded.callsign,
        drone_name = excluded.drone_name,
        updated_at = now();
  insert into public.events (mission_id, actor_id, kind, message)
  values (mid, auth.uid(), 'join', left(trim(p_callsign), 24) || ' 님이 참여했습니다.');
  return (select to_jsonb(m) from public.missions m where m.id = mid);
end;
$$;

create or replace function public.upsert_presence(
  p_mission_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision,
  p_drone_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(p_mission_id) then
    raise exception '이 임무의 참여자가 아닙니다.';
  end if;
  if p_drone_status not in ('ground', 'ready', 'flying', 'returning', 'landed', 'lost') then
    raise exception '기체 상태가 올바르지 않습니다.';
  end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180) then
    raise exception '좌표가 올바르지 않습니다.';
  end if;
  update public.members
    set lat = p_lat,
        lng = p_lng,
        accuracy = p_accuracy,
        drone_status = p_drone_status,
        updated_at = now()
    where mission_id = p_mission_id and user_id = auth.uid();
end;
$$;

create or replace function public.create_zone(
  p_mission_id uuid,
  p_label text,
  p_path jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.zones;
begin
  if not public.is_member(p_mission_id) then
    raise exception '이 임무의 참여자가 아닙니다.';
  end if;
  if not public.valid_path(p_path) then
    raise exception '구역은 좌표 3개 이상으로 그리세요.';
  end if;
  insert into public.zones (mission_id, label, path)
  values (p_mission_id, left(trim(p_label), 40), p_path)
  returning * into row;
  insert into public.events (mission_id, actor_id, kind, message)
  values (p_mission_id, auth.uid(), 'zone', row.label || ' 구역을 지도에 그렸습니다.');
  return to_jsonb(row);
end;
$$;

create or replace function public.update_zone(
  p_zone_id uuid,
  p_task_status text,
  p_observation_status text,
  p_review_reason text,
  p_memo text,
  p_assignee uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  z public.zones;
begin
  select * into z from public.zones where id = p_zone_id;
  if z.id is null then
    raise exception '구역을 찾지 못했습니다.';
  end if;
  if not public.is_member(z.mission_id) then
    raise exception '이 임무의 참여자가 아닙니다.';
  end if;
  if p_task_status not in ('unassigned', 'assigned', 'in_progress', 'completed', 'interrupted')
     or p_observation_status not in ('unverified', 'confirmed', 'recheck') then
    raise exception '상태 값이 올바르지 않습니다.';
  end if;
  if p_task_status = 'interrupted' and z.task_status <> 'interrupted' then
    raise exception '중단은 인계 요청으로 기록하세요.';
  end if;
  if p_assignee is not null and not exists (
    select 1 from public.members where mission_id = z.mission_id and user_id = p_assignee
  ) then
    raise exception '담당자는 이 임무의 참여자여야 합니다.';
  end if;
  if not public.is_operator(z.mission_id) then
    if z.assignee_id is not null and z.assignee_id <> auth.uid() then
      raise exception '다른 사람의 구역은 운영자만 수정할 수 있습니다.';
    end if;
    if p_assignee is distinct from z.assignee_id then
      raise exception '담당 변경은 운영자만 할 수 있습니다.';
    end if;
  end if;
  update public.zones
    set task_status = p_task_status,
        observation_status = p_observation_status,
        review_reason = left(coalesce(p_review_reason, ''), 500),
        memo = left(coalesce(p_memo, ''), 2000),
        assignee_id = p_assignee,
        updated_at = now()
    where id = p_zone_id
    returning * into z;
  insert into public.events (mission_id, actor_id, kind, message)
  values (z.mission_id, auth.uid(), 'zone', z.label || ' 기록을 수정했습니다.');
  return to_jsonb(z);
end;
$$;

create or replace function public.create_point(
  p_mission_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_label text,
  p_memo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.points;
begin
  if not public.is_member(p_mission_id) then
    raise exception '이 임무의 참여자가 아닙니다.';
  end if;
  if p_lat < -90 or p_lat > 90 or p_lng < -180 or p_lng > 180 then
    raise exception '좌표가 올바르지 않습니다.';
  end if;
  if char_length(trim(p_label)) < 1 then
    raise exception '관심 지점 이름을 입력하세요.';
  end if;
  insert into public.points (mission_id, lat, lng, label, memo, created_by)
  values (p_mission_id, p_lat, p_lng, left(trim(p_label), 40), left(coalesce(p_memo, ''), 500), auth.uid())
  returning * into row;
  insert into public.events (mission_id, actor_id, kind, message)
  values (p_mission_id, auth.uid(), 'point', row.label || ' 관심 지점을 남겼습니다.');
  return to_jsonb(row);
end;
$$;

create or replace function public.request_handover(
  p_zone_id uuid,
  p_reason text,
  p_to_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  z public.zones;
  row public.handovers;
begin
  select * into z from public.zones where id = p_zone_id for update;
  if z.id is null then
    raise exception '구역을 찾지 못했습니다.';
  end if;
  if not public.is_member(z.mission_id) then
    raise exception '이 임무의 참여자가 아닙니다.';
  end if;
  if z.task_status not in ('assigned', 'in_progress') then
    raise exception '배정 또는 진행 중인 작업만 인계할 수 있습니다.';
  end if;
  if exists (select 1 from public.handovers where zone_id = z.id and status = 'pending') then
    raise exception '이미 승인 대기 중인 인계가 있습니다.';
  end if;
  if char_length(trim(p_reason)) < 2 then
    raise exception '중단 사유를 입력하세요.';
  end if;
  if p_to_user is not null and not exists (
    select 1 from public.members where mission_id = z.mission_id and user_id = p_to_user
  ) then
    raise exception '새 담당은 이 임무의 참여자여야 합니다.';
  end if;
  insert into public.handovers (
    mission_id, zone_id, from_user, to_user, previous_status, interruption_reason
  ) values (
    z.mission_id, z.id, auth.uid(), p_to_user, z.task_status, left(trim(p_reason), 500)
  ) returning * into row;
  update public.zones set task_status = 'interrupted', updated_at = now() where id = z.id;
  insert into public.notifications (user_id, mission_id, message)
  select user_id, z.mission_id, z.label || ' 인계 승인이 필요합니다.'
  from public.members
  where mission_id = z.mission_id and role = 'operator' and user_id <> auth.uid();
  insert into public.events (mission_id, actor_id, kind, message)
  values (z.mission_id, auth.uid(), 'handover', z.label || ' 작업을 중단하고 인계를 요청했습니다.');
  return to_jsonb(row);
end;
$$;

create or replace function public.decide_handover(
  p_handover_id uuid,
  p_approve boolean,
  p_reason text,
  p_to_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  h public.handovers;
  target uuid;
  zlabel text;
begin
  select * into h from public.handovers where id = p_handover_id for update;
  if h.id is null then
    raise exception '인계 요청을 찾지 못했습니다.';
  end if;
  if not public.is_operator(h.mission_id) then
    raise exception '인계 승인은 운영자만 할 수 있습니다.';
  end if;
  if h.status <> 'pending' then
    raise exception '이미 처리된 인계입니다.';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 2 then
    raise exception '승인 또는 반려 사유를 입력하세요.';
  end if;
  if p_approve then
    target := coalesce(p_to_user, h.to_user);
    if target is null then
      raise exception '새 담당을 선택하세요.';
    end if;
    if not exists (select 1 from public.members where mission_id = h.mission_id and user_id = target) then
      raise exception '새 담당은 이 임무의 참여자여야 합니다.';
    end if;
    update public.zones
      set assignee_id = target, task_status = 'assigned', updated_at = now()
      where id = h.zone_id;
  else
    update public.zones
      set task_status = h.previous_status, updated_at = now()
      where id = h.zone_id;
  end if;
  update public.handovers
    set status = case when p_approve then 'approved' else 'rejected' end,
        approval_reason = left(trim(p_reason), 500),
        to_user = coalesce(p_to_user, to_user),
        decided_at = now(),
        decided_by = auth.uid()
    where id = h.id
    returning * into h;
  select label into zlabel from public.zones where id = h.zone_id;
  insert into public.events (mission_id, actor_id, kind, message)
  values (
    h.mission_id,
    auth.uid(),
    'handover',
    zlabel || case when p_approve then ' 인계를 승인했습니다. 새 작업은 배정 상태이며 비행을 시작하지 않습니다.' else ' 인계를 반려했습니다.' end
  );
  insert into public.notifications (user_id, mission_id, message)
  values (h.from_user, h.mission_id, zlabel || case when p_approve then ' 인계가 승인되었습니다.' else ' 인계가 반려되었습니다.' end);
  return to_jsonb(h);
end;
$$;

create or replace function public.register_photo(
  p_zone_id uuid,
  p_path text,
  p_memo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  z public.zones;
  row public.photos;
begin
  select * into z from public.zones where id = p_zone_id;
  if z.id is null then
    raise exception '구역을 찾지 못했습니다.';
  end if;
  if not public.is_member(z.mission_id) then
    raise exception '이 임무의 참여자가 아닙니다.';
  end if;
  if p_path not like z.mission_id::text || '/' || z.id::text || '/%' then
    raise exception '사진 경로가 올바르지 않습니다.';
  end if;
  insert into public.photos (mission_id, zone_id, storage_path, memo, uploaded_by)
  values (z.mission_id, z.id, p_path, left(coalesce(p_memo, ''), 500), auth.uid())
  returning * into row;
  insert into public.events (mission_id, actor_id, kind, message)
  values (z.mission_id, auth.uid(), 'photo', z.label || '에 사진을 올렸습니다.');
  return to_jsonb(row);
end;
$$;

create or replace function public.mark_notifications_read(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
    set read_at = now()
    where user_id = auth.uid() and mission_id = p_mission_id and read_at is null;
end;
$$;

revoke all on function public.is_member(uuid) from public;
revoke all on function public.is_operator(uuid) from public;
revoke all on function public.create_mission(text) from public;
revoke all on function public.join_mission(text, text, text, text) from public;
revoke all on function public.upsert_presence(uuid, double precision, double precision, double precision, text) from public;
revoke all on function public.create_zone(uuid, text, jsonb) from public;
revoke all on function public.update_zone(uuid, text, text, text, text, uuid) from public;
revoke all on function public.create_point(uuid, double precision, double precision, text, text) from public;
revoke all on function public.request_handover(uuid, text, uuid) from public;
revoke all on function public.decide_handover(uuid, boolean, text, uuid) from public;
revoke all on function public.register_photo(uuid, text, text) from public;
create or replace function public.rename_me(p_mission_id uuid, p_callsign text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(trim(p_callsign)) < 1 then
    raise exception '이름을 입력하세요.';
  end if;
  if not public.is_member(p_mission_id) then
    raise exception '이 수색의 참여자가 아닙니다.';
  end if;
  update public.members
    set callsign = left(trim(p_callsign), 24), updated_at = now()
    where mission_id = p_mission_id and user_id = auth.uid();
  update public.profiles
    set display_name = left(trim(p_callsign), 40)
    where id = auth.uid();
end;
$$;

revoke all on function public.mark_notifications_read(uuid) from public;
revoke all on function public.rename_me(uuid, text) from public;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_operator(uuid) to authenticated;
grant execute on function public.create_mission(text) to authenticated;
grant execute on function public.join_mission(text, text, text, text) to authenticated;
grant execute on function public.upsert_presence(uuid, double precision, double precision, double precision, text) to authenticated;
grant execute on function public.create_zone(uuid, text, jsonb) to authenticated;
grant execute on function public.update_zone(uuid, text, text, text, text, uuid) to authenticated;
grant execute on function public.create_point(uuid, double precision, double precision, text, text) to authenticated;
grant execute on function public.request_handover(uuid, text, uuid) to authenticated;
grant execute on function public.decide_handover(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.register_photo(uuid, text, text) to authenticated;
grant execute on function public.mark_notifications_read(uuid) to authenticated;
grant execute on function public.rename_me(uuid, text) to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.members mine
      join public.members theirs on theirs.mission_id = mine.mission_id
      where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

drop policy if exists missions_select on public.missions;
create policy missions_select on public.missions
  for select to authenticated
  using (public.is_member(id) or created_by = auth.uid());

drop policy if exists members_select on public.members;
create policy members_select on public.members
  for select to authenticated
  using (public.is_member(mission_id) or user_id = auth.uid());

drop policy if exists zones_select on public.zones;
create policy zones_select on public.zones
  for select to authenticated using (public.is_member(mission_id));

drop policy if exists points_select on public.points;
create policy points_select on public.points
  for select to authenticated using (public.is_member(mission_id));

drop policy if exists handovers_select on public.handovers;
create policy handovers_select on public.handovers
  for select to authenticated using (public.is_member(mission_id));

drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos
  for select to authenticated using (public.is_member(mission_id));

drop policy if exists events_select on public.events;
create policy events_select on public.events
  for select to authenticated using (public.is_member(mission_id));

drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
  for select to authenticated using (user_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('mission-photos', 'mission-photos', false)
on conflict (id) do nothing;

drop policy if exists mission_photo_read on storage.objects;
create policy mission_photo_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'mission-photos'
    and public.is_member(split_part(name, '/', 1)::uuid)
  );

drop policy if exists mission_photo_insert on storage.objects;
create policy mission_photo_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'mission-photos'
    and public.is_member(split_part(name, '/', 1)::uuid)
  );

do $$
declare
  tbl text;
begin
  foreach tbl in array array['members', 'zones', 'points', 'handovers', 'photos', 'events', 'notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;
