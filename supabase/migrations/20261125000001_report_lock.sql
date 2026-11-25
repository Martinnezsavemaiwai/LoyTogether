-- report_krathong locks the krathong row before counting reports. Without the lock, two
-- reports sent at the same moment each count only their own insert plus what was already
-- committed, so the third report can land with report_count = 2 and the krathong stays
-- visible. With FOR UPDATE the second call waits for the first to commit, and its count
-- then sees both rows. Same signature and rules as 0004, so grants carry over.
-- Safe to run after 0001-0007.

create or replace function public.report_krathong(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room uuid;
  v_owner uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- The lock serialises concurrent reports on the same krathong. If an earlier report
  -- hid it while we waited, the row no longer matches and the caller gets not_found.
  select room_id, owner_id into v_room, v_owner
    from public.krathongs
   where id = p_id and not hidden and public_wish is not null
     for update;
  if v_room is null or not public.can_access_room(v_room) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_owner = v_uid then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if (select count(*) from public.krathong_reports r
       where r.reporter_id = v_uid and r.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'rate_limited' using errcode = '53400';
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

revoke execute on function public.report_krathong(uuid) from public, anon;
grant execute on function public.report_krathong(uuid) to authenticated;
