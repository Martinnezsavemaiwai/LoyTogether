-- The Sukhothai room now shows Wat Mahathat, so its title follows.
-- Safe to run after 0001-0004.
update public.rooms
   set title = 'หน้าวัดมหาธาตุ สุโขทัย'
 where id = '00000000-0000-4000-8000-000000000003';
