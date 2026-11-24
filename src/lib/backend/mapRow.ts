import { normalizeDesign } from '@/features/krathong/options';
import type { Krathong } from '@/types/domain';

export interface KrathongRow {
  id: string;
  room_id: string;
  owner_id: string;
  display_name: string;
  design: unknown;
  wish_visibility: string;
  public_wish: string | null;
  has_wish: boolean;
  floated_at: string;
  hidden?: boolean;
}

export const KRATHONG_COLUMNS =
  'id, room_id, owner_id, display_name, design, wish_visibility, public_wish, has_wish, floated_at';

export function mapKrathongRow(row: KrathongRow): Krathong {
  const isPublic = row.wish_visibility === 'public';
  return {
    id: row.id,
    roomId: row.room_id,
    ownerId: row.owner_id,
    displayName: row.display_name,
    design: normalizeDesign(row.design),
    wishVisibility: isPublic ? 'public' : 'private',
    // Defensive: never surface wish text on a private krathong, whatever the row says.
    publicWish: isPublic ? row.public_wish : null,
    hasWish: row.has_wish,
    floatedAt: row.floated_at,
  };
}
