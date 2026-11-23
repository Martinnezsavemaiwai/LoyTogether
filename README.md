# ลอยนำกันเด้อ

ลอยกระทงออนไลน์ไปพร้อมกันในคืนวันเพ็ญ 24 พฤศจิกายน 2569 ประกอบกระทงเอง เขียนคำอธิษฐาน แล้วปล่อยลงที่ลอยเดียวกับคนอื่น
มีที่ลอย 6 แห่งที่จำลองจากสถานที่จัดงานจริง และเปิดห้องส่วนตัวหรือห้องคู่เพื่อชวนคนกันเองมาลอยได้

Stack: React 19, TypeScript, Vite, Tailwind CSS 4, React Router, Zustand, Supabase (Postgres, Anonymous Auth, Realtime, RLS, RPC) และ Cloudflare Pages

## รันบนเครื่อง

```bash
npm install
npm run dev        # ต่อ Supabase ตามค่าใน .env.local
npm run dev:demo   # โหมดทดลอง ไม่ต่อเซิร์ฟเวอร์ ข้อมูลอยู่ในเบราว์เซอร์นี้
npm test           # unit test
npm run lint
npm run build
```

ถ้าไม่มี `.env.local` แอปจะเข้าโหมดทดลองเอง

## ตั้งค่า Supabase

1. **เปิด Anonymous sign-ins**: Authentication > Sign In / Providers > Allow anonymous sign-ins
2. **รัน migration**: SQL Editor > New query แล้ววางไฟล์ทีละไฟล์ตามลำดับ กด Run
   1. `supabase/migrations/20261123000001_core_schema.sql`
   2. `supabase/migrations/20261123000002_public_rooms.sql` (สร้างห้องสาธารณะ 6 ห้อง ไฟล์เดียวกับ `supabase/seed.sql`)

   ถ้าใช้ Supabase CLI: `supabase link --project-ref <ref>` แล้ว `supabase db push`
3. **เอาคีย์มาใส่ `.env.local`**: กดปุ่ม Connect ด้านบนของโปรเจกต์ หรือไปที่ Project Settings > API Keys

   ```bash
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<Publishable key ขึ้นต้นด้วย sb_publishable_ หรือ anon public key>
   ```

   ห้ามใช้ Secret key หรือ `service_role` เด็ดขาด คีย์พวกนี้ข้าม RLS ได้ทั้งหมด
4. **ตรวจหลังรัน migration**: Table Editor ต้องเห็นตาราง `profiles`, `rooms` (6 แถว), `room_members`, `krathongs`, `private_wishes`, `krathong_reports` และทุกตารางต้องขึ้นว่า RLS enabled
5. **แนะนำเพิ่ม**: เปิด CAPTCHA (Cloudflare Turnstile ใช้ฟรี) ใน Authentication > Attack Protection เพื่อกันบอทสมัคร anonymous ถ้าเปิดแล้วต้องแก้โค้ดส่ง `captchaToken` ตอน `signInAnonymously` ด้วย ตอนนี้ยังไม่ได้ทำ

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
```

## ความปลอดภัยและความเป็นส่วนตัว

- เปิด RLS ทุกตาราง ฝั่ง client เขียนตรงไม่ได้ ต้องผ่าน RPC ที่ตรวจข้อมูลใน database
- คำอธิษฐานส่วนตัวอยู่ในตาราง `private_wishes` ที่เจ้าของอ่านได้คนเดียว จึงไม่หลุดออกไปทาง Realtime
- ห้องส่วนตัวใช้ token สุ่ม 192 บิต เก็บไว้เฉพาะ hash SHA-256 และส่ง token ใน `#fragment` ของลิงก์ จึงไม่ไปโผล่ใน log ของเซิร์ฟเวอร์ ห้องคู่รับได้ 2 คน ห้องเพื่อนรับได้ 30 คน และห้องจะปิดเองใน 3 วัน
- ตัวกรองคำทำงานทั้งในเบราว์เซอร์และใน database (`contains_blocked_words`) จับได้ทั้งคำที่เว้นวรรค ใส่จุด พิมพ์ตัวซ้ำ หรือใช้ตัวอักษรหน้าตาคล้ายกัน ถ้าโดนรายงานครบ 3 คน กระทงจะถูกซ่อน
- จำกัดการลอยไม่เกิน 2 ใบใน 30 วินาที และ 20 ใบต่อวัน เปิดห้องได้ไม่เกิน 5 ห้องต่อวัน

## ข้อจำกัดที่รู้อยู่

- Supabase แพ็กเกจฟรีรับ Realtime พร้อมกันได้ราว 200 connection ถ้าเกิน แอปจะสลับไปโหลดข้อมูลใหม่ทุก 20 วินาทีแทน
- Presence ของห้องส่วนตัวใช้ channel แบบ public คนที่ไม่ใช่สมาชิกแต่รู้ room id จะเห็นจำนวนคนและชื่อที่แสดงได้ แต่เห็นกระทงไม่ได้ เพราะกระทงกรองด้วย RLS
- เพลงเล่นผ่านตัวเล่นที่ฝังจาก YouTube ตามที่ผู้อัปโหลดอนุญาตให้ฝัง ถ้าคลิปถูกลบหรือปิดการฝัง เพลงจะเล่นไม่ได้
- ข้อมูลงานจริงในแต่ละสถานที่รวบรวมจากข่าว ณ วันที่ 23 พ.ย. 2569 ส่วน มทส. หาข่าวงานปีนี้ไม่เจอ จึงไม่ได้ใส่รายละเอียดงาน
