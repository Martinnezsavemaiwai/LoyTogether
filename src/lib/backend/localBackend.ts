import type { FloatKrathongInput, Identity, Krathong, Room } from '@/types/domain';
import { RIVERS } from '@/features/rivers/rivers';
import { generateDisplayName } from '@/lib/validation';
import { errorFromCode, type Backend } from './types';

/**
 * Offline stand-in used when the Supabase env vars are missing. Data stays in this
 * browser; tabs on the same device see each other through BroadcastChannel.
 */

const IDENTITY_KEY = 'loynamkan:local:identity';
const KRATHONGS_KEY = 'loynamkan:local:krathongs';
const WISHES_KEY = 'loynamkan:local:private-wishes';
const ROOMS_KEY = 'loynamkan:local:rooms';

type LocalRoom = Room & { token: string; members: string[] };

function toRoom(r: LocalRoom): Room {
  return { id: r.id, roomType: r.roomType, riverId: r.riverId, title: r.title, expiresAt: r.expiresAt };
}
const HEARTBEAT_MS = 4000;
const STALE_MS = 10000;

type LocalMessage =
  | { type: 'krathong'; krathong: Krathong }
  | { type: 'here'; roomId: string; tabId: string; at: number }
  | { type: 'bye'; roomId: string; tabId: string };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function createLocalBackend(): Backend {
  const bus =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('loynamkan-local') : null;
  const tabId = crypto.randomUUID();

  function identity(): Identity {
    const stored = read<Identity | null>(IDENTITY_KEY, null);
    if (stored) return stored;
    const created = { userId: crypto.randomUUID(), displayName: generateDisplayName() };
    write(IDENTITY_KEY, created);
    return created;
  }

  function allKrathongs(): Krathong[] {
    return read<Krathong[]>(KRATHONGS_KEY, []);
  }

  return {
    mode: 'local',

    async ensureIdentity() {
      return identity();
    },

    async updateDisplayName(name) {
      write(IDENTITY_KEY, { ...identity(), displayName: name });
    },

    async fetchKrathongs(roomId, limit = 100) {
      return allKrathongs()
        .filter((k) => k.roomId === roomId)
        .sort((a, b) => b.floatedAt.localeCompare(a.floatedAt))
        .slice(0, limit);
    },

    async floatKrathong(input: FloatKrathongInput) {
      const me = identity();
      const existing = allKrathongs().find((k) => k.id === input.id);
      if (existing) return existing;
      const recent = allKrathongs().filter(
        (k) => k.ownerId === me.userId && Date.now() - Date.parse(k.floatedAt) < 30_000,
      );
      if (recent.length >= 2) throw errorFromCode('rate_limited');

      const wish = input.wish.trim();
      const krathong: Krathong = {
        id: input.id,
        roomId: input.roomId,
        ownerId: me.userId,
        displayName: input.displayName,
        design: input.design,
        wishVisibility: input.visibility,
        publicWish: input.visibility === 'public' && wish ? wish : null,
        hasWish: wish.length > 0,
        floatedAt: new Date().toISOString(),
      };
      write(KRATHONGS_KEY, [krathong, ...allKrathongs()].slice(0, 300));
      if (wish && input.visibility === 'private') {
        write(WISHES_KEY, { ...read<Record<string, string>>(WISHES_KEY, {}), [input.id]: wish });
      }
      bus?.postMessage({ type: 'krathong', krathong } satisfies LocalMessage);
      return krathong;
    },

    async fetchMyPrivateWish(krathongId) {
      return read<Record<string, string>>(WISHES_KEY, {})[krathongId] ?? null;
    },

    async reportKrathong() {
      // Nothing to moderate locally.
    },

    async fetchRiverStats() {
      const out: Record<string, number> = {};
      for (const k of allKrathongs()) out[k.roomId] = (out[k.roomId] ?? 0) + 1;
      return out;
    },

    async createPrivateRoom(riverId, type, title) {
      const me = identity();
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().slice(0, 8);
      const room: LocalRoom = {
        id: crypto.randomUUID(),
        roomType: type,
        riverId,
        title,
        expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        token,
        members: [me.userId],
      };
      write(ROOMS_KEY, [...read<LocalRoom[]>(ROOMS_KEY, []), room]);
      return { room: toRoom(room), inviteToken: token };
    },

    async acceptInvite(token) {
      const me = identity();
      const rooms = read<LocalRoom[]>(ROOMS_KEY, []);
      const room = rooms.find((r) => r.token === token);
      if (!room || (room.expiresAt && Date.parse(room.expiresAt) <= Date.now())) {
        throw errorFromCode('invalid_invite');
      }
      if (!room.members.includes(me.userId)) {
        if (room.roomType === 'couple' && room.members.length >= 2) throw errorFromCode('room_full');
        room.members.push(me.userId);
        write(ROOMS_KEY, rooms);
      }
      return toRoom(room);
    },

    async getRoom(roomId) {
      const publicRiver = RIVERS.find((r) => r.publicRoomId === roomId);
      if (publicRiver) {
        return { id: roomId, roomType: 'public', riverId: publicRiver.id, title: publicRiver.name, expiresAt: null };
      }
      const me = identity();
      const room = read<LocalRoom[]>(ROOMS_KEY, []).find((r) => r.id === roomId);
      if (!room || !room.members.includes(me.userId)) return null;
      return toRoom(room);
    },

    async listMyRooms() {
      const me = identity();
      const now = Date.now();
      return read<LocalRoom[]>(ROOMS_KEY, [])
        .filter((r) => r.members.includes(me.userId) && (!r.expiresAt || Date.parse(r.expiresAt) > now))
        .reverse()
        .map((r) => ({ ...toRoom(r), isOwner: r.members[0] === me.userId }));
    },

    async closeRoom(roomId) {
      const me = identity();
      const rooms = read<LocalRoom[]>(ROOMS_KEY, []);
      const room = rooms.find((r) => r.id === roomId && r.members[0] === me.userId);
      if (!room) throw errorFromCode('not_found');
      room.expiresAt = new Date().toISOString();
      write(ROOMS_KEY, rooms);
    },

    joinRoom(roomId, _me, handlers) {
      const seen = new Map<string, number>([[tabId, Date.now()]]);
      const emitCount = () => {
        const now = Date.now();
        for (const [id, at] of seen) if (id !== tabId && now - at > STALE_MS) seen.delete(id);
        handlers.onPresence(seen.size);
      };
      const onMessage = (event: MessageEvent<LocalMessage>) => {
        const msg = event.data;
        if (msg.type === 'krathong' && msg.krathong.roomId === roomId) {
          handlers.onKrathong(msg.krathong);
        } else if (msg.type === 'here' && msg.roomId === roomId) {
          seen.set(msg.tabId, msg.at);
          emitCount();
        } else if (msg.type === 'bye' && msg.roomId === roomId) {
          seen.delete(msg.tabId);
          emitCount();
        }
      };
      const beat = () =>
        bus?.postMessage({ type: 'here', roomId, tabId, at: Date.now() } satisfies LocalMessage);
      bus?.addEventListener('message', onMessage);
      beat();
      emitCount();
      handlers.onStatus('live');
      const timer = window.setInterval(() => {
        beat();
        emitCount();
      }, HEARTBEAT_MS);
      return () => {
        window.clearInterval(timer);
        bus?.removeEventListener('message', onMessage);
        bus?.postMessage({ type: 'bye', roomId, tabId } satisfies LocalMessage);
      };
    },

    watchPresence(_roomIds, onCounts) {
      onCounts({});
      return () => {};
    },
  };
}
