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
    id: 'sut',
    publicRoomId: '00000000-0000-4000-8000-000000000006',
    name: 'ลานน้ำพุ มทส.',
    place: 'ลานน้ำพุ เทคโนธานี มหาวิทยาลัยเทคโนโลยีสุรนารี',
    region: 'นครราชสีมา',
    description: 'สระน้ำพุทรงรี ขอบสระเปิดไฟสีทอง มีซุ้มร้านค้ารอบลาน และหอสุรนภาหรือหอแห้วเปิดไฟอยู่ด้านหลัง',
    realEvent: 'ททท. ประกาศงาน Amazing Full Moon: SUT Loi Krathong Festival 2026 วันที่ 20 ถึง 29 พ.ย. 2569 ที่ มทส.',
  },
  {
    id: 'wat_arun',
    publicRoomId: '00000000-0000-4000-8000-000000000001',
    name: 'ริมเจ้าพระยา หน้าวัดอรุณ',
    place: 'วัดอรุณราชวราราม',
    region: 'กรุงเทพฯ',
    description: 'พระปรางค์องค์ใหญ่กับปรางค์ทิศสี่องค์ส่องไฟสีทอง ทอดเงาลงเจ้าพระยา เรือแล่นผ่านเป็นระยะ',
    realEvent: 'งานจริงจัดที่วัดอรุณฯ คืน 23 ถึง 24 พ.ย. 2569 ตั้งแต่ 17.30 ถึง 22.00 น.',
  },
  {
    id: 'lumphini',
    publicRoomId: '00000000-0000-4000-8000-000000000002',
    name: 'บึงสวนลุมพินี',
    place: 'สวนลุมพินี',
    region: 'กรุงเทพฯ',
    description: 'บึงกลางเมืองมีเรือเป็ดจอดริมท่า ฉากหลังเป็นตึกย่านสีลมกับสาทร เห็นมหานครและสเตททาวเวอร์',
    realEvent: 'กทม. เปิดสวนลุมพินีให้ลอยกระทงคืน 24 พ.ย. 2569 ได้ถึงเที่ยงคืน ห้ามจุดโคมและพลุในสวน',
  },
  {
    id: 'sukhothai',
    publicRoomId: '00000000-0000-4000-8000-000000000003',
    name: 'หน้าวัดมหาธาตุ สุโขทัย',
    place: 'อุทยานประวัติศาสตร์สุโขทัย',
    region: 'สุโขทัย',
    description: 'เจดีย์ทรงดอกบัวตูมของวัดมหาธาตุ เสาศิลาแลงกับพระพุทธรูปนั่งกลางซากวิหาร ริมคูน้ำในเมืองเก่า',
    realEvent: 'งานลอยกระทง เผาเทียน เล่นไฟ 15 ถึง 24 พ.ย. 2569 ที่อุทยานประวัติศาสตร์สุโขทัย',
  },
  {
    id: 'chiang_mai',
    publicRoomId: '00000000-0000-4000-8000-000000000004',
    name: 'ริมแม่น้ำปิง',
    place: 'เชียงใหม่',
    region: 'เชียงใหม่',
    description: 'ประเพณียี่เป็ง โคมล้านนาห้อยเรียงบนสะพานข้ามน้ำปิง บ้านไม้ริมน้ำเปิดไฟ ดอยสุเทพอยู่ไกลๆ',
    realEvent: 'ยี่เป็งเชียงใหม่ 23 ถึง 25 พ.ย. 2569 พื้นที่หลักอยู่ที่สวนสาธารณะตลาดต้นลำไย',
  },
  {
    id: 'roi_et',
    publicRoomId: '00000000-0000-4000-8000-000000000005',
    name: 'บึงพลาญชัย ร้อยเอ็ด',
    place: 'สวนสมเด็จพระศรีนครินทร์ บึงพลาญชัย',
    region: 'ร้อยเอ็ด',
    description: 'ลอยกระทงแบบอีสาน หอโหวด 101 ยอดเป็นรูปโหวดสูงเด่นริมบึง มีศาลากลางเกาะและหลวงพ่อใหญ่วัดบูรพาอยู่ไกลๆ',
    realEvent: 'งานสมมาน้ำ คืนเพ็ง เส็งประทีป ครั้งที่ 28 วันที่ 23 ถึง 24 พ.ย. 2569 ที่บึงพลาญชัย ชมฟรี',
  },
] as const;

export function getRiver(id: string | undefined): River | undefined {
  return RIVERS.find((river) => river.id === id);
}

export function riverByRoomId(roomId: string): River | undefined {
  return RIVERS.find((river) => river.publicRoomId === roomId);
}
