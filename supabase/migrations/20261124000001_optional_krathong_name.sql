-- Krathongs no longer have their own name: the river shows the person's display name
-- on each krathong instead. The column stays so old rows keep their value, but new
-- rows store ''. float_krathong keeps its signature, so grants carry over.
-- Apply before deploying the client that sends p_krathong_name = ''.
-- Safe to run after 0001-0006.

alter table public.krathongs drop constraint if exists krathongs_krathong_name_check;
alter table public.krathongs alter column krathong_name set default '';
alter table public.krathongs
  add constraint krathongs_krathong_name_check check (char_length(btrim(krathong_name)) <= 40);

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
  -- Optional now: an older client may still send a name, a new one sends ''.
  if char_length(v_krathong_name) > 40 then
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
