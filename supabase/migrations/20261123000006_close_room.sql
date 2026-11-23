-- Lets the person who opened a private or couple room close it early (made by mistake,
-- wrong name, wrong place). The room is not deleted: its expiry is set to now, which
-- already blocks everything (can_access_room, accept_room_invite, the client's getRoom).
-- Keeping the row keeps the 5-rooms-per-24-hours limit honest.
-- Safe to run after 0001-0005.

create or replace function public.close_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  update public.rooms
     set expires_at = now()
   where id = p_room_id
     and owner_id = v_uid
     and room_type <> 'public'
     and expires_at > now();

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.close_room(uuid) from public, anon;
grant execute on function public.close_room(uuid) to authenticated;
