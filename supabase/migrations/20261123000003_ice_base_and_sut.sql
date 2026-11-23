-- Adds the ice krathong base and renames the SUT room to its real spot, the fountain plaza.
-- Safe to run on a database that already has 0001 and 0002 applied.

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
    and d ->> 'base' in ('banana_leaf', 'banana_rose', 'flower', 'bread', 'banana_trunk', 'ice')
    and d ->> 'flower' in ('marigold', 'rose', 'orchid', 'lotus', 'jasmine', 'chrysanthemum')
    and d ->> 'candle' in ('golden', 'white', 'pink', 'red')
    and d ->> 'decoration' in ('gold', 'purple', 'pink', 'pearl', 'jasmine_garland'),
    false
  );
$$;

update public.rooms
   set title = 'ลานน้ำพุ มทส.'
 where id = '00000000-0000-4000-8000-000000000006';
