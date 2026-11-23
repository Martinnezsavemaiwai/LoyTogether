import type { RiverId } from '@/types/domain';

export interface River {
  id: RiverId;
  /** Fixed id of the shared public room, seeded in supabase/migrations. */
  publicRoomId: string;
  name: string;
  place: string;
  region: string;
  description: string;
  /** What the real venue is holding this year, from news sources checked on 23 Nov 2026. */
  realEvent: string | null;
}

/**
 * Virtual rivers modelled on real places where people float krathongs.
 * We are not the organiser of any real event; the UI says so.
 */
export const RIVERS: readonly River[] = [
  {
    id: 'wat_arun',
    publicRoomId: '00000000-0000-4000-8000-000000000001',
    name: 'ริมเจ้าพระยา หน้าวัดอรุณ',
    place: 'วัดอรุณราชวราราม',
    region: 'กรุงเทพฯ',
    description: 'พระปรางค์ส่องไฟสีทองทอดเงาลงแม่น้ำ เรือแล่นผ่านเป็นระยะ',
    realEvent: 'งานจริงจัดที่วัดอรุณฯ คืน 23 ถึง 24 พ.ย. 2569 ตั้งแต่ 17.30 ถึง 22.00 น.',
  },
  {
    id: 'lumphini',
    publicRoomId: '00000000-0000-4000-8000-000000000002',
    name: 'บึงสวนลุมพินี',
    place: 'สวนลุมพินี',
    region: 'กรุงเทพฯ',
    description: 'บึงกลางเมืองที่มีตึกสูงเปิดไฟเรียงรายเป็นฉากหลัง',
    realEvent: 'สวนลุมพินีเป็นหนึ่งในจุดลอยกระทงของกรุงเทพฯ ปี 2569',
  },
  {
    id: 'sukhothai',
    publicRoomId: '00000000-0000-4000-8000-000000000003',
    name: 'สระตระพังทอง สุโขทัย',
    place: 'อุทยานประวัติศาสตร์สุโขทัย',
    region: 'สุโขทัย',
    description: 'เมืองเก่าต้นตำนานนางนพมาศ เจดีย์ทรงพุ่มข้าวบิณฑ์ใต้แสงพลุ',
    realEvent: 'งานประเพณีลอยกระทง เผาเทียน เล่นไฟ จัดที่อุทยานประวัติศาสตร์สุโขทัย',
  },
  {
    id: 'chiang_mai',
    publicRoomId: '00000000-0000-4000-8000-000000000004',
    name: 'ริมแม่น้ำปิง',
    place: 'เชียงใหม่',
    region: 'เชียงใหม่',
    description: 'ประเพณียี่เป็ง โคมล้านนาห้อยเรียงริมฝั่ง โคมลอยค่อยๆ ขึ้นฟ้า',
    realEvent: 'ยี่เป็งเชียงใหม่ 23 ถึง 25 พ.ย. 2569 พื้นที่หลักอยู่ที่สวนสาธารณะตลาดต้นลำไย',
  },
  {
    id: 'roi_et',
    publicRoomId: '00000000-0000-4000-8000-000000000005',
    name: 'บึงพลาญชัย ร้อยเอ็ด',
    place: 'สวนสมเด็จพระศรีนครินทร์ บึงพลาญชัย',
    region: 'ร้อยเอ็ด',
    description: 'ลอยกระทงแบบอีสาน มีหอโหวดสูงเด่นอยู่ริมบึง',
    realEvent: 'งานประเพณีสมมาน้ำ คืนเพ็ง เส็งประทีป จัดที่บึงพลาญชัย',
  },
  {
    id: 'sut',
    publicRoomId: '00000000-0000-4000-8000-000000000006',
    name: 'ลานน้ำพุ มทส.',
    place: 'ลานน้ำพุ เทคโนธานี มหาวิทยาลัยเทคโนโลยีสุรนารี',
    region: 'นครราชสีมา',
    description: 'สระยาวกลางลานน้ำพุ ขอบสระเปิดไฟสีทอง มีซุ้มร้านค้าเรียงสองฝั่ง',
    realEvent: 'ททท. ประกาศงาน Amazing Full Moon: SUT Loi Krathong Festival 2026 วันที่ 20 ถึง 29 พ.ย. 2569 ที่ มทส.',
  },
] as const;

export function getRiver(id: string | undefined): River | undefined {
  return RIVERS.find((river) => river.id === id);
}

export function riverByRoomId(roomId: string): River | undefined {
  return RIVERS.find((river) => river.publicRoomId === roomId);
}
