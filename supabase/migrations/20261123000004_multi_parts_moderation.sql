-- 1. Krathong designs where each category can take several items or none.
-- 2. Profanity filter on separate Thai and Latin streams, with a larger curated list.
-- 3. Report abuse limits.
-- Safe to run after 0001-0003.

-- ---------------------------------------------------------------------------
-- 1. Design validation. Accepts the current shape and the older single-choice one,
--    so rows written before this migration stay valid.
-- ---------------------------------------------------------------------------

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
      -- current: { shape, base, flowers[], candle|null, incense, beads|null, garland, coins }
      (
        (select count(*) from jsonb_object_keys(d)) = 8
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

-- ---------------------------------------------------------------------------
-- 2. Profanity. Mirrors src/lib/moderation.ts; tests/moderation.test.ts checks the lists match.
-- ---------------------------------------------------------------------------

create or replace function public.moderation_thai(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(translate(lower(normalize(coalesce(t, ''), NFKC)), '0134578@$!|ฅฃศษ', 'oieastbasiiคขสส'), '[^ก-๛]', '', 'g'),
    '(.)\1+', '\1', 'g'
  );
$$;

create or replace function public.moderation_latin(t text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(translate(lower(normalize(coalesce(t, ''), NFKC)), '0134578@$!|ฅฃศษ', 'oieastbasiiคขสส'), '[^a-z]', '', 'g'),
    '(.)\1+', '\1', 'g'
  );
$$;

create or replace function public.contains_blocked_words(t text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select exists (
    select 1 from unnest(array[
        'ค[รุ]?วย',
        'ฆวย',
        'ควๅย',
        'จิ๋ม',
        'จู๋',
        '(?<!เ)หี(?!บ)',
        'หมอย',
        'แตด',
        'เย[็้]?ด',
        'โม[๊้]ก',
        'เงี่ยน',
        'ร่าน',
        'ชักว่าว',
        'น้ำว่าว',
        'น้ำกาม',
        'ร่วมเพส',
        'ขายตัว',
        'ข่มขืน',
        'ก[ะา]หรี่(?!ปั)',
        'กระหรี่(?!ปั)',
        'กระรี่',
        'ดอกทอง(?!อุไร|กวาว)',
        'ดอกกระหรี่',
        'เห[่้๊๋]?ี[่้๊๋]?ย(?![วนงม])',
        'เชี[่้๊๋]?ย(?![วรนง])',
        'เชรี[่้]?ย',
        'เอี้ย(?![วด])',
        'สัส(?!ดี)',
        'สัด(?!ส่วน|ว)',
        '(ไอ้|ไอ|อี)(สาด|สัตว์|ห่า(?![ยรงนก])|ควาย|โง่|เวร|เปรต|ตุ๊ด|แรด|ดอก|บ้า|ชาติ|เลว|หน้าหี)',
        'แม่ง(?!า)',
        'แมร่ง',
        'พ่อง(?!า)',
        '(พ่อ|แม่)(มึง|เมิง|มรึง)',
        'มึงตาย',
        'มึง',
        'เมิง',
        'มรึง',
        '[ชฉ]ิ?บหาย',
        'จ(ัญ|ัง|ัน|ร)ไร',
        'ระยำ',
        'ส้นต[ร]?ีน',
        '(หิว|ฝ่า|ปลาย|หัว)ต[ร]?ีน',
        'ตีนผี',
        'ตอแหล',
        'บัดซบ',
        'สันดาน',
        'ชาติ(หมา|ชั่ว)',
        'ลูก(หมา|กะหรี่|กระหรี่)',
        'ชิงหมาเกิด',
        'ถุย',
        'เฮงซวย',
        'อัปรีย์',
        'เดรัจฉาน',
        'สถุ[นล]',
        'ปัญญาอ่อน',
        'หน้าด้าน',
        'หน้า(หี|ตัวเมีย|หมา|ส้นตีน|ปลวก)',
        'ตูด',
        'ทุเรส',
        'นิกเกอร์'
    ]) as p
    where public.moderation_thai(t) ~ p
  ) or exists (
    select 1 from unnest(array[
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
        'wanker',
        'twat',
        'jerkof',
        'killyourself',
        'dumbas',
        'wtf',
        'stfu'
    ]) as p
    where public.moderation_latin(t) ~ p
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Reports: at most 30 per user per day, and only on krathongs that show a public wish.
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
  v_owner uuid;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select room_id, owner_id into v_room, v_owner
    from public.krathongs
   where id = p_id and not hidden and public_wish is not null;
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
