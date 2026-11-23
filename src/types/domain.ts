export type RiverId = 'wat_arun' | 'lumphini' | 'sukhothai' | 'chiang_mai' | 'roi_et' | 'sut';

export type RoomType = 'public' | 'private' | 'couple';

export type KrathongShape = 'lotus' | 'circle' | 'heart';
export type KrathongBase = 'banana_leaf' | 'banana_rose' | 'flower' | 'bread' | 'banana_trunk';
export type KrathongFlower = 'marigold' | 'rose' | 'orchid' | 'lotus' | 'jasmine' | 'chrysanthemum';
export type KrathongCandle = 'golden' | 'white' | 'pink' | 'red';
export type KrathongDecoration = 'gold' | 'purple' | 'pink' | 'pearl' | 'jasmine_garland';

export interface KrathongDesign {
  shape: KrathongShape;
  base: KrathongBase;
  flower: KrathongFlower;
  candle: KrathongCandle;
  decoration: KrathongDecoration;
}

export type WishVisibility = 'public' | 'private';

/** A krathong as other people can see it. Never carries a private wish. */
export interface Krathong {
  id: string;
  roomId: string;
  ownerId: string;
  displayName: string;
  krathongName: string;
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
  krathongName: string;
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
}

export interface CreatedRoom {
  room: Room;
  /** Shown once to the creator; only its hash is stored. */
  inviteToken: string;
}
