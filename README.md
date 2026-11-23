# ลอยนำกันเด้อ

ลอยกระทงออนไลน์ไปพร้อมกันในคืนวันเพ็ญ 24 พฤศจิกายน 2569 ประกอบกระทงเอง เขียนคำอธิษฐาน แล้วปล่อยลงที่ลอยเดียวกับคนอื่น
มีที่ลอย 6 แห่งที่จำลองจากสถานที่จัดงานจริง และเปิดห้องส่วนตัวหรือห้องคู่เพื่อชวนคนกันเองมาลอยได้

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Zustand, Supabase (Postgres, Anonymous Auth, Realtime, RLS, RPC) และ Cloudflare Pages

## รันบนเครื่อง

```bash
npm install
npm run dev        # ต่อ Supabase ตามค่าใน .env.local
npm run dev:demo   # โหมดทดลอง ไม่ต่อเซิร์ฟเวอร์ ข้อมูลอยู่ในเบราว์เซอร์นี้ (อ่านค่าจาก .env.demo)
npm test           # unit test
npm run lint
npm run build
```

ถ้าไม่มี `.env.local` แอปจะเข้าโหมดทดลองเอง
`npm run dev:demo` บังคับเข้าโหมดทดลองแม้มี `.env.local` อยู่ และใช้พร้อมเพย์ปลอมจาก `.env.demo` เพื่อให้เห็นหน้าจอใส่เงิน

### ตัวแปร environment

| ตัวแปร | ต้องมีไหม | ใช้ทำอะไร |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ต้องมี (ไม่มีจะเข้าโหมดทดลอง) | URL ของโปรเจกต์ Supabase |
| `VITE_SUPABASE_ANON_KEY` | ต้องมี | Publishable key หรือ anon key |
| `VITE_TURNSTILE_SITE_KEY` | ต้องมีถ้าเปิด CAPTCHA ใน Supabase | Site key ของ Cloudflare Turnstile |
| `VITE_PROMPTPAY_ID` | ไม่บังคับ | เบอร์มือถือหรือเลขพร้อมเพย์ที่รับเงิน ถ้าไม่ใส่ ตัวเลือกใส่เงินจะไม่ขึ้น |
| `VITE_PROMPTPAY_NAME` | ไม่บังคับ | ชื่อบัญชีที่แสดงใต้ QR |

ตัวแปรที่ขึ้นต้นด้วย `VITE_` ทุกตัวจะถูกฝังลงใน JavaScript ที่ใครก็เปิดดูได้
พร้อมเพย์จึงควรใช้เบอร์มือถือ ไม่ควรใช้เลขบัตรประชาชน
เงินที่ใส่ในกระทงโอนเข้าพร้อมเพย์ของเจ้าของเว็บโดยตรง ไม่ผ่านตัวกลาง เว็บจึงตรวจไม่ได้ว่าโอนจริงไหม และไม่ใช่การบริจาค

## ตั้งค่า Supabase

1. **เปิด Anonymous sign-ins**: Authentication > Sign In / Providers > Allow anonymous sign-ins
2. **รัน migration**: SQL Editor > New query แล้ววางไฟล์ทีละไฟล์ตามลำดับ กด Run
   1. `supabase/migrations/20261123000001_core_schema.sql`
   2. `supabase/migrations/20261123000002_public_rooms.sql` (สร้างห้องสาธารณะ 6 ห้อง ไฟล์เดียวกับ `supabase/seed.sql`)
   3. `supabase/migrations/20261123000003_ice_base_and_sut.sql` (เพิ่มฐานกระทงน้ำแข็ง และเปลี่ยนห้อง มทส. เป็นลานน้ำพุ)
   4. `supabase/migrations/20261123000004_multi_parts_moderation.sql` (เลือกส่วนประกอบได้หลายชิ้นต่อหมวด ตัวกรองคำแยกไทยกับอังกฤษ และจำกัดการรายงาน)
   5. `supabase/migrations/20261123000005_sukhothai_title.sql` (เปลี่ยนชื่อห้องสุโขทัยเป็นหน้าวัดมหาธาตุ ให้ตรงกับฉาก)
   6. `supabase/migrations/20261123000006_close_room.sql` (ให้คนเปิดห้องปิดห้องก่อนครบ 3 วันได้ ต้องรันก่อน deploy ไม่อย่างนั้นปุ่มปิดห้องจะใช้ไม่ได้)

   รายการคำใน `contains_blocked_words` ของไฟล์ 004 ต้องตรงกับ `src/lib/moderation.ts` เสมอ มี test คอยเช็ก ถ้าแก้ฝั่งหนึ่งต้องแก้อีกฝั่งด้วย

   ถ้าใช้ Supabase CLI: `supabase link --project-ref <ref>` แล้ว `supabase db push`
3. **เอาคีย์มาใส่ `.env.local`**: กดปุ่ม Connect ด้านบนของโปรเจกต์ หรือไปที่ Project Settings > API Keys

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<Publishable key ขึ้นต้นด้วย sb_publishable_ หรือ anon public key>
   ```

   ห้ามใช้ Secret key หรือ `service_role` เด็ดขาด คีย์พวกนี้ข้าม RLS ได้ทั้งหมด
4. **ตรวจหลังรัน migration**: Table Editor ต้องเห็นตาราง `profiles`, `rooms` (6 แถว), `room_members`, `krathongs`, `private_wishes`, `krathong_reports` และทุกตารางต้องขึ้นว่า RLS enabled
5. **เปิด CAPTCHA กันบอท** (Cloudflare Turnstile ใช้ฟรี)
   1. Cloudflare dashboard > Turnstile > Add widget ใส่โดเมน `<ชื่อโปรเจกต์>.pages.dev` และ `localhost` เลือก Widget mode เป็น Managed
   2. เอา **Site key** ไปใส่ `VITE_TURNSTILE_SITE_KEY` ทั้งใน `.env.local` และใน Cloudflare Pages
   3. เอา **Secret key** ไปใส่ใน Supabase ที่ Authentication > Attack Protection > Enable CAPTCHA protection เลือก Turnstile
   4. deploy โค้ดที่มี site key ให้เสร็จก่อนค่อยกดเปิดใน Supabase ไม่อย่างนั้นคนที่เข้ามาช่วงนั้นจะเข้าเป็นแขกไม่ได้

   แอปโหลด Turnstile เฉพาะตอนสร้างแขกใหม่ คนส่วนใหญ่จะไม่เห็นอะไรเลย กล่องยืนยันจะโผล่ที่ขอบล่างของจอเฉพาะตอนที่ Cloudflare ขอให้กด

## Deploy ขึ้น Cloudflare Pages

ต้อง push โค้ดขึ้น GitHub ก่อน (`https://github.com/Martinnezsavemaiwai/LoyTogether`)

1. เข้า [dash.cloudflare.com](https://dash.cloudflare.com) > Workers & Pages > Create
2. เลือกแท็บ **Pages** > **Connect to Git** (ถ้าหน้าแรกพาไปสร้าง Worker ให้หาลิงก์ที่เขียนว่า Pages)
3. อนุญาตให้ Cloudflare เข้าถึง GitHub แล้วเลือก repo `LoyTogether`
4. ตั้งค่า build
   - Production branch: `main`
   - Framework preset: `React (Vite)` หรือ `None`
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Environment variables (Production และ Preview)
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `NODE_VERSION` = `22`
   - `VITE_TURNSTILE_SITE_KEY` (ถ้าเปิด CAPTCHA)
   - `VITE_PROMPTPAY_ID` และ `VITE_PROMPTPAY_NAME` (ถ้าอยากเปิดให้ใส่เงิน)

   ค่า `VITE_` ถูกฝังตอน build ถ้าแก้ทีหลังต้องกด Retry deployment ใหม่
6. กด Save and Deploy รอ build เสร็จจะได้ URL แบบ `https://<ชื่อโปรเจกต์>.pages.dev`
7. ทุกครั้งที่ push เข้า `main` Cloudflare จะ build และ deploy ใหม่ให้เอง

`public/_redirects` ส่งทุก path ไปที่ `index.html` อยู่แล้ว เปิด `/river/wat_arun` หรือ `/join#t=...` ตรงๆ จึงไม่ขึ้น 404
หลังได้ URL แล้ว ให้ไปใส่ใน Supabase ที่ Authentication > URL Configuration > Site URL ด้วย

## โครงสร้าง

```
src/
  app/            routes และหน้า 404
  components/     ปุ่ม, ตัวเปิดเสียง, โลโก้
  features/
    landing/      หน้าแรก
    identity/     guest session และชื่อที่แสดง
    rivers/       ที่ลอย 6 แห่ง (rivers.ts)
    krathong/     ตัวประกอบกระทง SVG และตัวเลือก
    festival/     ฉาก, กระทงที่ลอย, Realtime
    rooms/        ห้องส่วนตัว ห้องคู่ ลิงก์เชิญ
    music/        ตัวเล่นเพลงจาก YouTube
  hooks/useRoom   โหลดกระทง, Realtime, Presence, polling สำรอง
  lib/backend/    Supabase และ backend โหมดทดลอง
  lib/moderation  ตัวกรองคำไม่เหมาะสม (มีชุดเดียวกันใน SQL)
supabase/         migration และ seed
tests/            vitest
blender/          สคริปต์ Blender ที่สร้างฉากและชิ้นส่วนกระทง
public/scenes     ฉากหลัง 6 แห่ง (webp)
public/krathong   ชิ้นส่วนกระทง 173 ชิ้น (webp)
```

## ภาพฉากและกระทงจาก Blender

ภาพทุกภาพสร้างด้วยโค้ดใน Blender 5.3 (Cycles) ไม่ได้ใช้โมเดลหรือภาพจากที่อื่น สคริปต์เรียกใช้ skill ใน `.claude/skills/blender-rendering` จึงต้องรันจากโฟลเดอร์ของ repo

```bash
# ฉากหลัง 1920x1200 ใส่ --venue all เพื่อทำครบ 6 แห่ง
blender -b --factory-startup -P blender/venues.py -- --venue wat_arun --out blender/out/wat_arun.png --samples 96

# ชิ้นส่วนกระทงแบบพื้นหลังโปร่งใส 640x552
blender -b --factory-startup -P blender/krathong.py -- --out blender/out/krathong --samples 96
```

บน Windows ตัวโปรแกรมอยู่ที่ `C:\Program Files\Blender Foundation\Blender 5.3\blender.exe`

แปลง PNG เป็น WebP ด้วย `cwebp` (จากแพ็กเกจ libwebp) ฉากหลังมีสองขนาด ไฟล์ `-sm` สำหรับจอมือถือ

```bash
cwebp -q 80 blender/out/wat_arun.png -o public/scenes/wat_arun.webp
cwebp -q 80 -resize 960 600 blender/out/wat_arun.png -o public/scenes/wat_arun-sm.webp
cwebp -q 85 -alpha_q 90 -resize 440 380 blender/out/krathong/base-circle-ice.png -o public/krathong/base-circle-ice.webp
```

ตำแหน่งพระจันทร์ใน `moon(fx, fy)` ของแต่ละที่ต้องตรงกับ `THEMES` ใน `RiverScene.tsx` เพราะน้ำที่ขยับได้ (`WaterLayer.tsx`) วาดทางแสงจันทร์บนน้ำจากค่านั้น ถ้าที่ไหนมีน้ำแค่บางส่วนของครึ่งล่าง เช่น สระของ มทส. ให้รันพร้อม `--mask` จะได้ไฟล์ `{venue}-mask.png` (ขาวคือน้ำ) เอาไปไว้ที่ `public/scenes` แล้วเพิ่มใน `WATER_MASKS` ของ `RiverScene.tsx` น้ำจะขยับเฉพาะในสระ ขอบสระกับลานไม่ขยับตาม

`KrathongArt.tsx` ซ้อนชิ้นส่วนตามลำดับที่เขียนไว้หัวไฟล์ `blender/krathong.py` ถ้าภาพโหลดไม่ขึ้นจะใช้ `KrathongSvg.tsx` แทน

## ความปลอดภัยและความเป็นส่วนตัว

- เปิด RLS ทุกตาราง ฝั่ง client เขียนตรงไม่ได้ ต้องผ่าน RPC ที่ตรวจข้อมูลใน database
- คำอธิษฐานส่วนตัวอยู่ในตาราง `private_wishes` ที่เจ้าของอ่านได้คนเดียว จึงไม่หลุดออกไปทาง Realtime
- ห้องส่วนตัวใช้ token สุ่ม 192 บิต เก็บไว้เฉพาะ hash SHA-256 และส่ง token ใน `#fragment` ของลิงก์ จึงไม่ไปโผล่ใน log ของเซิร์ฟเวอร์ ห้องคู่รับได้ 2 คน ห้องเพื่อนรับได้ 30 คน และห้องจะปิดเองใน 3 วัน
- ตัวกรองคำทำงานทั้งในเบราว์เซอร์และใน database (`contains_blocked_words`) จับได้ทั้งคำที่เว้นวรรค ใส่จุด พิมพ์ตัวซ้ำ หรือใช้ตัวอักษรหน้าตาคล้ายกัน ถ้าโดนรายงานครบ 3 คน กระทงจะถูกซ่อน
- จำกัดการลอยไม่เกิน 2 ใบใน 30 วินาที และ 20 ใบต่อวัน เปิดห้องได้ไม่เกิน 5 ห้องต่อวัน

## ข้อจำกัดที่รู้อยู่

- Supabase แพ็กเกจฟรีรับ Realtime พร้อมกันได้ราว 200 connection ถ้าเกิน แอปจะสลับไปโหลดข้อมูลใหม่ทุก 20 วินาทีแทน
- เพลงเริ่มเล่นตอนเข้าเว็บผ่านตัวเล่นที่ซ่อนไว้ แต่ยังไม่ได้ลองบน iOS และ Android เครื่องจริง ซึ่งอาจต้องให้กดปุ่มเพลงก่อนเพราะเบราว์เซอร์มือถือบล็อกเสียงที่เล่นเอง
- ตัวเล่น YouTube ถูกซ่อนไว้ ทั้งที่เงื่อนไขของ YouTube ขอให้ตัวเล่นมองเห็นได้ เจ้าของเลือกแบบนี้เองโดยรู้ข้อนี้
- ของประกอบฉาก เช่น คน เรือหงส์ แพ ยังดูเล็กมาก เพราะกล้องอยู่ห่างฝั่งตรงข้ามราว 300 เมตร
- กระทงน้ำแข็งยังไม่มีภาพอ้างอิงจริง
- Presence ของห้องส่วนตัวใช้ channel แบบ public คนที่ไม่ใช่สมาชิกแต่รู้ room id จะเห็นจำนวนคนและชื่อที่แสดงได้ แต่เห็นกระทงไม่ได้ เพราะกระทงกรองด้วย RLS
- เพลงเล่นผ่านตัวเล่นที่ฝังจาก YouTube ตามที่ผู้อัปโหลดอนุญาตให้ฝัง ถ้าคลิปถูกลบหรือปิดการฝัง เพลงจะเล่นไม่ได้
- ข้อมูลงานจริงในแต่ละสถานที่รวบรวมจากข่าว ณ วันที่ 23 พ.ย. 2569 ส่วน มทส. หาข่าวงานปีนี้ไม่เจอ จึงไม่ได้ใส่รายละเอียดงาน

## เครดิต

- รายการคำไม่เหมาะสมคัดมาจาก [SIT-SandBox/thai-bad-words](https://github.com/SIT-SandBox/thai-bad-words) (MIT) และ [LDNOOBW V2](https://github.com/LDNOOBWV2/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words_V2) (CC0)
- skill สำหรับ Blender ใน `.claude/skills` มาจาก [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) (MIT)
- ฟอนต์ IBM Plex Sans Thai และ Playfair Display (SIL Open Font License) ผ่าน Fontsource
