export type RiverId = 'wat_arun' | 'lumphini' | 'sukhothai' | 'chiang_mai' | 'roi_et' | 'sut';

export type RoomType = 'public' | 'private' | 'couple';

export type KrathongShape = 'lotus' | 'circle' | 'heart';
export type KrathongBase = 'banana_leaf' | 'banana_rose' | 'flower' | 'bread' | 'banana_trunk' | 'ice';
export type KrathongFlower = 'marigold' | 'rose' | 'orchid' | 'lotus' | 'jasmine' | 'chrysanthemum';
export type KrathongCandle = 'golden' | 'white' | 'pink' | 'red';
export type KrathongBeads = 'gold' | 'purple' | 'pink' | 'pearl';

/**
 * shape and base are required. Everything that goes on the plate is optional:
 * up to three flower kinds, a candle or none, incense, a bead colour or none,
 * a jasmine garland, and coins (the visitor chose to put money in).
 */
export interface KrathongDesign {
  shape: KrathongShape;
  base: KrathongBase;
  flowers: KrathongFlower[];
  candle: KrathongCandle | null;
  incense: boolean;
  beads: KrathongBeads | null;
  garland: boolean;
  coins: boolean;
}

export type WishVisibility = 'public' | 'private';

/** A krathong as other people can see it. Never carries a private wish. */
export interface Krathong {
  id: string;
  roomId: string;
  ownerId: string;
  displayName: string;
  design: KrathongDesign;
  wishVisibility: WishVisibility;
  publicWish: string | null;
  hasWish: boolean;
  floatedAt: string;
}

export interface FloatKrathongInput {
  id: string;
  roomId: string;
  displayName: string;
  design: KrathongDesign;
  wish: string;
  visibility: WishVisibility;
}

export interface Identity {
  userId: string;
  displayName: string;
}

export interface Room {
  id: string;
  roomType: RoomType;
  riverId: RiverId;
  title: string;
  expiresAt: string | null;
  /** Set by listMyRooms: this guest opened the room, so they may close it. */
  isOwner?: boolean;
}

export interface CreatedRoom {
  room: Room;
  /** Shown once to the creator; only its hash is stored. */
  inviteToken: string;
}
