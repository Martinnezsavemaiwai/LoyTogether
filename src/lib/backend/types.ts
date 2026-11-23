import type { CreatedRoom, FloatKrathongInput, Identity, Krathong, RiverId, Room, RoomType } from '@/types/domain';

export type ConnectionStatus = 'connecting' | 'live' | 'offline';

export interface RoomHandlers {
  onKrathong: (krathong: Krathong) => void;
  onPresence: (count: number) => void;
  onStatus: (status: ConnectionStatus) => void;
}

export interface Backend {
  mode: 'supabase' | 'local';
  ensureIdentity(): Promise<Identity>;
  updateDisplayName(name: string): Promise<void>;
  fetchKrathongs(roomId: string, limit?: number): Promise<Krathong[]>;
  floatKrathong(input: FloatKrathongInput): Promise<Krathong>;
  /** The caller's own private wish for a krathong they floated, if any. */
  fetchMyPrivateWish(krathongId: string): Promise<string | null>;
  reportKrathong(krathongId: string): Promise<void>;
  /** Number of visible krathongs per public room id. */
  fetchRiverStats(): Promise<Record<string, number>>;
  joinRoom(roomId: string, me: Identity, handlers: RoomHandlers): () => void;
  createPrivateRoom(riverId: RiverId, type: Exclude<RoomType, 'public'>, title: string): Promise<CreatedRoom>;
  acceptInvite(token: string): Promise<Room>;
  /** A room the caller may enter, or null when it does not exist or they are not a member. */
  getRoom(roomId: string): Promise<Room | null>;
  /** Private and couple rooms this guest belongs to that have not expired, newest first. */
  listMyRooms(): Promise<Room[]>;
  /** Close a room this guest opened, before its 3 days are up. */
  closeRoom(roomId: string): Promise<void>;
  /** Listens to presence counts in several rooms without joining them. */
  watchPresence(roomIds: string[], onCounts: (counts: Record<string, number>) => void): () => void;
}

export class BackendError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
  }
}

const MESSAGES: Record<string, string> = {
  not_authenticated: 'เซสชันหมดอายุ ลองรีเฟรชหน้าอีกครั้ง',
  room_not_accessible: 'ห้องนี้ปิดไปแล้ว หรือคุณยังไม่ได้เข้าห้องนี้',
  invalid_display_name: 'ชื่อที่แสดงไม่ถูกต้อง',
  invalid_krathong_name: 'ชื่อกระทงไม่ถูกต้อง',
  invalid_design: 'แบบกระทงไม่ถูกต้อง',
  invalid_visibility: 'การตั้งค่าคำอธิษฐานไม่ถูกต้อง',
  wish_too_long: 'คำอธิษฐานยาวเกิน 280 ตัวอักษร',
  blocked_content: 'ข้อความมีคำที่ไม่เหมาะสม ลองเปลี่ยนคำดูนะ',
  rate_limited: 'ลอยถี่ไปนิด พักสักครู่แล้วลองใหม่นะ ลอยได้วันละไม่เกิน 20 ใบ',
  conflict: 'ส่งซ้ำไม่ได้ ลองสร้างกระทงใหม่',
  not_found: 'ไม่พบกระทงนี้แล้ว',
  invalid_room_type: 'ประเภทห้องไม่ถูกต้อง',
  invalid_river: 'ไม่พบที่ลอยนี้',
  invalid_title: 'ชื่อห้องต้องมี 1 ถึง 60 ตัวอักษร',
  invalid_invite: 'ลิงก์เชิญนี้ใช้ไม่ได้หรือหมดอายุแล้ว ขอลิงก์ใหม่จากเจ้าของห้องนะ',
  room_full: 'ห้องนี้เต็มแล้ว',
  captcha_failed: 'ยืนยันว่าไม่ใช่บอทไม่สำเร็จ ลองรีเฟรชหน้าอีกครั้งนะ',
  network: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่',
};

export function errorFromCode(code: string): BackendError {
  return new BackendError(code, MESSAGES[code] ?? 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง');
}

export function errorMessage(err: unknown): string {
  if (err instanceof BackendError) return err.message;
  return MESSAGES.network as string;
}
