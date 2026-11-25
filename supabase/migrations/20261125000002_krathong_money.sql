-- Krathong designs may carry money for show: a whole-baht amount from 1 to 99,999 that
-- the app draws as notes and coins. Nothing is paid. The key is optional: designs without
-- it keep the original 8 keys, so rows written before this migration and clients that
-- never send it stay valid. Run it before deploying the app version that offers money,
-- or floating with an amount is refused as invalid_design. Safe to run after 0001-0008.

create or replace function public.validate_krathong_design(d jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    jsonb_typeof(d) = 'object'
    and d ->> 'shape' in ('lotus', 'circle', 'heart')
    and d ->> 'base' in ('banana_leaf', 'banana_rose', 'flower', 'bread', 'banana_trunk', 'ice')
    and (
      -- current: { shape, base, flowers[], candle|null, incense, beads|null, garland, coins, money? }
      (
        (select count(*) from jsonb_object_keys(d)) = case when d ? 'money' then 9 else 8 end
        and (
          not d ? 'money'
          -- CASE guards the cast: SQL does not promise to check the type first otherwise.
          or case
            when jsonb_typeof(d -> 'money') = 'number' then
              (d ->> 'money')::numeric = trunc((d ->> 'money')::numeric)
              and (d ->> 'money')::numeric between 1 and 99999
            else false
          end
        )
        and jsonb_typeof(d -> 'flowers') = 'array'
        and jsonb_array_length(d -> 'flowers') <= 3
        and not exists (
          select 1 from jsonb_array_elements(d -> 'flowers') e
          where jsonb_typeof(e) <> 'string'
             or e #>> '{}' not in ('marigold', 'rose', 'orchid', 'lotus', 'jasmine', 'chrysanthemum')
        )
        and (select count(distinct e) = count(e) from jsonb_array_elements(d -> 'flowers') e)
        and (jsonb_typeof(d -> 'candle') = 'null' or d ->> 'candle' in ('golden', 'white', 'pink', 'red'))
        and jsonb_typeof(d -> 'incense') = 'boolean'
        and (jsonb_typeof(d -> 'beads') = 'null' or d ->> 'beads' in ('gold', 'purple', 'pink', 'pearl'))
        and jsonb_typeof(d -> 'garland') = 'boolean'
        and jsonb_typeof(d -> 'coins') = 'boolean'
      )
      or
      -- legacy: { shape, base, flower, candle, decoration }
      (
        (select count(*) from jsonb_object_keys(d)) = 5
        and d ->> 'flower' in ('marigold', 'rose', 'orchid', 'lotus', 'jasmine', 'chrysanthemum')
        and d ->> 'candle' in ('golden', 'white', 'pink', 'red')
        and d ->> 'decoration' in ('gold', 'purple', 'pink', 'pearl', 'jasmine_garland')
      )
    ),
    false
  );
$$;
