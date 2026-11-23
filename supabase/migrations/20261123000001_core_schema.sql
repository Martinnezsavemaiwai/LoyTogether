-- ลอยนำกันเด้อ core schema: profiles, rooms, members, krathongs, private wishes, reports.
-- Private wishes live in their own owner-only table so they can never leak through
-- public krathong reads or Realtime events (RLS filters rows, not columns).

-- ---------------------------------------------------------------------------
-- Validation helpers
-- ---------------------------------------------------------------------------

create or replace function public.validate_krathong_design(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(d) = 'object'
    and (select count(*) from jsonb_object_keys(d)) = 5
    and d ->> 'shape' in ('lotus', 'circle', 'heart')
    and d ->> 'base' in ('banana_leaf', 'banana_rose', 'flower', 'bread', 'banana_trunk')
    and d ->> 'flower' in ('marigold', 'rose', 'orchid', 'lotus', 'jasmine', 'chrysanthemum')
    and d ->> 'candle' in ('golden', 'white', 'pink', 'red')
    and d ->> 'decoration' in ('gold', 'purple', 'pink', 'pearl', 'jasmine_garland'),
    false
  );
$$;

-- Mirrors normalizeForModeration in src/lib/moderation.ts: look-alike letters are
-- mapped, everything but Latin letters and Thai is dropped, repeats collapse.
create or replace function public.normalize_for_moderation(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(
      translate(lower(normalize(coalesce(t, ''), NFKC)), '013457@$ฅฃศษ', 'oieastasคขสส'),
      '[^a-zก-๛]', '', 'g'
    ),
    '(.)\1+', '\1', 'g'
  );
$$;

-- Patterns are generated from BLOCKED_PATTERNS in src/lib/moderation.ts.
-- tests/moderation-sync.test.ts fails if the two lists drift apart.
create or replace function public.contains_blocked_words(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(array[
        'เห[่้๊๋]?ี[่้๊๋]?ย(?![วน])',
        'ควย',
        'เย[็]?ด',
        '(?<!เ)หี(?![บ])',
        'แตด',
        'จิ๋ม',
        'สัส',
        'สัด(?!ส่วน|ว)',
        'ส้นตีน',
        'ตีนผี',
        'อีดอก',
        'ดอกทอง(?!อุไร|กวาว)',
        'กะหรี่',
        'กระหรี่',
        'ร่าน',
        'แรดดอก',
        'เงี่ยน',
        'ชักว่าว',
        'ระยำ',
        'จัญไร',
        '[ชฉ]ิบหาย',
        'ห่าราก',
        '(ไอ้|อี)ห่า(?![นง])',
        '(ไอ้|อี)สัตว์',
        '(ไอ้|อี)ควาย',
        '(ไอ้|อี)เวร',
        '(ไอ้|อี)ชาติหมา',
        'ชาติหมา',
        'สันดาน',
        'แม่ง(?!า)',
        'พ่อง(?!า)',
        '(พ่อ|แม่)มึง',
        'มึงตาย',
        'ตอแหล',
        'หน้าโง่',
        'ไอ้โง่',
        'อีโง่',
        'fuck',
        'fck',
        'phuck',
        'shit',
        'bitch',
        'biatch',
        'cunt',
        'pusy',
        'ashole',
        'bastard',
        'slut',
        'whore',
        'niger(?!ia)',
        'niga',
        'fagot',
        'retard',
        'wtf',
        'stfu'
    ]) as p
    where public.normalize_for_moderation(t) ~ p
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_type text not null check (room_type in ('public', 'private', 'couple')),
  river_id text not null check (river_id in ('wat_arun', 'lumphini', 'sukhothai', 'chiang_mai', 'roi_et', 'sut')),
  owner_id uuid references auth.users (id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  invite_token_hash text unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint rooms_private_needs_token check (room_type = 'public' or invite_token_hash is not null),
  constraint rooms_private_expires check (room_type = 'public' or expires_at is not null),
  constraint rooms_public_has_no_owner check (room_type <> 'public' or owner_id is null)
);

create unique index rooms_one_public_per_river on public.rooms (river_id) where room_type = 'public';
create index rooms_owner_recent_idx on public.rooms (owner_id, created_at desc);

create table public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index room_members_user_idx on public.room_members (user_id);

create table public.krathongs (
  id uuid primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 24),
  krathong_name text not null check (char_length(btrim(krathong_name)) between 1 and 40),
  design jsonb not null check (public.validate_krathong_design(design)),
  wish_visibility text not null default 'private' check (wish_visibility in ('public', 'private')),
  -- Only public wishes are stored here. Private wishes go to public.private_wishes.
  public_wish text check (public_wish is null or char_length(public_wish) between 1 and 280),
  has_wish boolean not null default false,
  report_count integer not null default 0,
  hidden boolean not null default false,
  floated_at timestamptz not null default now(),
  constraint krathongs_private_has_no_public_wish check (wish_visibility = 'public' or public_wish is null)
);

create index krathongs_room_recent_idx on public.krathongs (room_id, floated_at desc) where not hidden;
create index krathongs_owner_recent_idx on public.krathongs (owner_id, floated_at desc);

create table public.private_wishes (
  krathong_id uuid primary key references public.krathongs (id) on delete cascade,
  owner_id uuid not null references auth.users (id) on delete cascade,
  wish text not null check (char_length(wish) between 1 and 280),
  created_at timestamptz not null default now()
);

create index private_wishes_owner_idx on public.private_wishes (owner_id);

create table public.krathong_reports (
  krathong_id uuid not null references public.krathongs (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (krathong_id, reporter_id)
);

create index krathong_reports_reporter_idx on public.krathong_reports (reporter_id);

-- ---------------------------------------------------------------------------
-- Access helpers (security definer so policies can call them without recursion)
-- ---------------------------------------------------------------------------

create or replace function public.is_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_members m
    where m.room_id = p_room_id and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_access_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rooms r
    where r.id = p_room_id
      and (r.expires_at is null or r.expires_at > now())
      and (r.room_type = 'public' or public.is_room_member(r.id))
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.krathongs enable row level security;
alter table public.private_wishes enable row level security;
alter table public.krathong_reports enable row level security;

-- profiles: a user reads and writes only their own row
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- rooms: public rooms are readable; private rooms only by members.
-- Rooms are created and joined only through the RPCs below.
create policy "rooms_select_accessible" on public.rooms
  for select to anon, authenticated
  using (room_type = 'public' or public.is_room_member(id));

-- room_members: a user sees only their own memberships
create policy "room_members_select_own" on public.room_members
  for select to authenticated using (user_id = auth.uid());

-- krathongs: visible when not hidden and the room is accessible. Writes go through RPCs.
create policy "krathongs_select_accessible" on public.krathongs
  for select to anon, authenticated
  using (not hidden and public.can_access_room(room_id));

-- private wishes: only the owner can read them
create policy "private_wishes_select_own" on public.private_wishes
  for select to authenticated using (owner_id = auth.uid());

-- krathong_reports: no direct access (RPC only)

revoke insert, update, delete on public.rooms, public.room_members, public.krathongs,
  public.private_wishes, public.krathong_reports from anon, authenticated;
revoke all on public.private_wishes, public.krathong_reports, public.profiles from anon;
-- The token hash is never readable by clients, even by members: grant every column but it.
revoke select on public.rooms from anon, authenticated;
grant select (id, room_type, river_id, owner_id, title, created_at, expires_at)
  on public.rooms to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: float a krathong
-- ---------------------------------------------------------------------------

create or replace function public.float_krathong(
  p_id uuid,
  p_room_id uuid,
  p_display_name text,
  p_krathong_name text,
  p_design jsonb,
  p_wish text,
  p_visibility text
)
returns public.krathongs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.krathongs;
  v_row public.krathongs;
  v_display_name text := btrim(coalesce(p_display_name, ''));
  v_krathong_name text := btrim(coalesce(p_krathong_name, ''));
  v_wish text := nullif(btrim(coalesce(p_wish, '')), '');
  v_recent integer;
  v_daily integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Idempotent retry: the client generates the id, so a double submit returns the same row.
  select * into v_existing from public.krathongs where id = p_id;
  if found then
    if v_existing.owner_id = v_uid then
      return v_existing;
    end if;
    raise exception 'conflict' using errcode = '23505';
  end if;

  if not public.can_access_room(p_room_id) then
    raise exception 'room_not_accessible' using errcode = '42501';
  end if;

  if char_length(v_display_name) not between 1 and 24 then
    raise exception 'invalid_display_name' using errcode = '22023';
  end if;
  if char_length(v_krathong_name) not between 1 and 40 then
    raise exception 'invalid_krathong_name' using errcode = '22023';
  end if;
  if not public.validate_krathong_design(p_design) then
    raise exception 'invalid_design' using errcode = '22023';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid_visibility' using errcode = '22023';
  end if;
  if v_wish is not null and char_length(v_wish) > 280 then
    raise exception 'wish_too_long' using errcode = '22023';
  end if;
  if public.contains_blocked_words(v_display_name)
    or public.contains_blocked_words(v_krathong_name)
    or (v_wish is not null and public.contains_blocked_words(v_wish)) then
    raise exception 'blocked_content' using errcode = '22023';
  end if;

  select count(*) filter (where floated_at > now() - interval '30 seconds'),
         count(*)
    into v_recent, v_daily
    from public.krathongs
   where owner_id = v_uid and floated_at > now() - interval '24 hours';
  if v_recent >= 2 or v_daily >= 20 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  insert into public.krathongs (
    id, room_id, owner_id, display_name, krathong_name, design,
    wish_visibility, public_wish, has_wish
  ) values (
    p_id, p_room_id, v_uid, v_display_name, v_krathong_name, p_design,
    p_visibility,
    case when p_visibility = 'public' then v_wish end,
    v_wish is not null
  )
  returning * into v_row;

  if v_wish is not null and p_visibility = 'private' then
    insert into public.private_wishes (krathong_id, owner_id, wish)
    values (p_id, v_uid, v_wish);
  end if;

  return v_row;
end;
$$;

-- Display names are checked by the server too, not only the client.
create or replace function public.profiles_check_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.display_name := btrim(new.display_name);
  if public.contains_blocked_words(new.display_name) then
    raise exception 'blocked_content' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_check_name
  before insert or update of display_name on public.profiles
  for each row execute function public.profiles_check_name();

-- ---------------------------------------------------------------------------
-- RPC: report a public krathong. Three distinct reports hide it.
-- ---------------------------------------------------------------------------

create or replace function public.report_krathong(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select room_id into v_room from public.krathongs where id = p_id and not hidden;
  if v_room is null or not public.can_access_room(v_room) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.krathong_reports (krathong_id, reporter_id)
  values (p_id, v_uid)
  on conflict do nothing;

  select count(*) into v_count from public.krathong_reports where krathong_id = p_id;

  update public.krathongs
     set report_count = v_count,
         hidden = v_count >= 3
   where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: krathong count per public river (for the river selection screen)
-- ---------------------------------------------------------------------------

create or replace function public.river_stats()
returns table (room_id uuid, river_id text, krathong_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.river_id, count(k.id)
    from public.rooms r
    left join public.krathongs k on k.room_id = r.id and not k.hidden
   where r.room_type = 'public'
   group by r.id, r.river_id;
$$;

-- ---------------------------------------------------------------------------
-- RPC: private and couple rooms
-- The invite token is random (192 bits), returned once, and only its SHA-256
-- hash is stored. Joining requires the token; reading needs membership.
-- ---------------------------------------------------------------------------

create or replace function public.create_private_room(p_river_id text, p_room_type text, p_title text)
returns table (room_id uuid, invite_token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_title text := btrim(coalesce(p_title, ''));
  v_token text;
  v_room uuid;
  v_expires timestamptz := now() + interval '3 days';
  v_recent integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_room_type not in ('private', 'couple') then
    raise exception 'invalid_room_type' using errcode = '22023';
  end if;
  if p_river_id not in ('wat_arun', 'lumphini', 'sukhothai', 'chiang_mai', 'roi_et', 'sut') then
    raise exception 'invalid_river' using errcode = '22023';
  end if;
  if char_length(v_title) not between 1 and 60 then
    raise exception 'invalid_title' using errcode = '22023';
  end if;
  if public.contains_blocked_words(v_title) then
    raise exception 'blocked_content' using errcode = '22023';
  end if;

  select count(*) into v_recent
    from public.rooms r
   where r.owner_id = v_uid and r.created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'rate_limited' using errcode = '53400';
  end if;

  v_token := rtrim(translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_'), '=');

  insert into public.rooms (room_type, river_id, owner_id, title, invite_token_hash, expires_at)
  values (p_room_type, p_river_id, v_uid, v_title,
          encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires)
  returning id into v_room;

  insert into public.room_members (room_id, user_id) values (v_room, v_uid);

  return query select v_room, v_token, v_expires;
end;
$$;

create or replace function public.accept_room_invite(p_token text)
returns table (room_id uuid, river_id text, room_type text, title text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_room public.rooms;
  v_members integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if p_token is null or char_length(p_token) not between 20 and 64 then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;

  -- Lock the room so two people cannot take the last couple seat at once.
  select * into v_room
    from public.rooms r
   where r.invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
     and r.room_type <> 'public'
   for update;

  if not found or v_room.expires_at <= now() then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.room_members m where m.room_id = v_room.id and m.user_id = v_uid
  ) then
    select count(*) into v_members from public.room_members m where m.room_id = v_room.id;
    if (v_room.room_type = 'couple' and v_members >= 2) or v_members >= 30 then
      raise exception 'room_full' using errcode = '53400';
    end if;
    insert into public.room_members (room_id, user_id) values (v_room.id, v_uid);
  end if;

  return query select v_room.id, v_room.river_id, v_room.room_type, v_room.title, v_room.expires_at;
end;
$$;

revoke execute on function public.float_krathong(uuid, uuid, text, text, jsonb, text, text) from public, anon;
revoke execute on function public.report_krathong(uuid) from public, anon;
revoke execute on function public.create_private_room(text, text, text) from public, anon;
revoke execute on function public.accept_room_invite(text) from public, anon;
grant execute on function public.float_krathong(uuid, uuid, text, text, jsonb, text, text) to authenticated;
grant execute on function public.report_krathong(uuid) to authenticated;
grant execute on function public.create_private_room(text, text, text) to authenticated;
grant execute on function public.accept_room_invite(text) to authenticated;
grant execute on function public.river_stats() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast new krathong rows (RLS is applied per subscriber)
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.krathongs;
