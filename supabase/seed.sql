-- One shared public room per venue. IDs are fixed and mirrored in src/features/rivers/rivers.ts
insert into public.rooms (id, room_type, river_id, title) values
  ('00000000-0000-4000-8000-000000000001', 'public', 'wat_arun', 'ริมเจ้าพระยา หน้าวัดอรุณ'),
  ('00000000-0000-4000-8000-000000000002', 'public', 'lumphini', 'บึงสวนลุมพินี'),
  ('00000000-0000-4000-8000-000000000003', 'public', 'sukhothai', 'หน้าวัดมหาธาตุ สุโขทัย'),
  ('00000000-0000-4000-8000-000000000004', 'public', 'chiang_mai', 'ริมแม่น้ำปิง'),
  ('00000000-0000-4000-8000-000000000005', 'public', 'roi_et', 'บึงพลาญชัย ร้อยเอ็ด'),
  ('00000000-0000-4000-8000-000000000006', 'public', 'sut', 'ลานน้ำพุ มทส.')
on conflict (id) do nothing;
