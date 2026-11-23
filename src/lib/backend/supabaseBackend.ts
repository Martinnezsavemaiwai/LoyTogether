import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { FloatKrathongInput, Identity, Krathong, Room } from '@/types/domain';
import { generateDisplayName } from '@/lib/validation';
import { getCaptchaToken, TURNSTILE_SITE_KEY } from '@/lib/turnstile';
import { KRATHONG_COLUMNS, mapKrathongRow, type KrathongRow } from './mapRow';
import { errorFromCode, type Backend, type RoomHandlers } from './types';

const KNOWN_CODES = [
  'not_authenticated',
  'room_not_accessible',
  'invalid_display_name',
  'invalid_krathong_name',
  'invalid_design',
  'invalid_visibility',
  'wish_too_long',
  'blocked_content',
  'rate_limited',
  'conflict',
  'not_found',
  'invalid_room_type',
  'invalid_river',
  'invalid_title',
  'invalid_invite',
  'room_full',
];

interface RoomRow {
  id?: string;
  room_id?: string;
  room_type: string;
  river_id: string;
  title: string;
  expires_at: string | null;
}

function mapRoom(row: RoomRow): Room {
  return {
    id: (row.id ?? row.room_id) as string,
    roomType: row.room_type as Room['roomType'],
    riverId: row.river_id as Room['riverId'],
    title: row.title,
    expiresAt: row.expires_at,
  };
}

function toError(error: { message?: string } | null | undefined) {
  const message = error?.message ?? '';
  if (/captcha/i.test(message)) return errorFromCode('captcha_failed');
  const code = KNOWN_CODES.find((c) => message.includes(c)) ?? 'network';
  return errorFromCode(code);
}

function presenceCount(channel: RealtimeChannel): number {
  return Object.keys(channel.presenceState()).length;
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const client: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  let identityPromise: Promise<Identity> | null = null;

  async function loadIdentity(): Promise<Identity> {
    const { data: sessionData } = await client.auth.getSession();
    let user = sessionData.session?.user ?? null;
    if (!user) {
      // With CAPTCHA on in Supabase Auth > Attack Protection, sign-in without a token is refused.
      let captchaToken: string | undefined;
      if (TURNSTILE_SITE_KEY) {
        try {
          captchaToken = await getCaptchaToken(TURNSTILE_SITE_KEY);
        } catch {
          throw errorFromCode('captcha_failed');
        }
      }
      const { data, error } = await client.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined);
      if (error || !data.user) throw toError(error);
      user = data.user;
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    if (profileError) throw toError(profileError);
    if (profile) return { userId: user.id, displayName: profile.display_name as string };

    const displayName = generateDisplayName();
    const { error: insertError } = await client
      .from('profiles')
      .upsert({ id: user.id, display_name: displayName });
    if (insertError) throw toError(insertError);
    return { userId: user.id, displayName };
  }

  return {
    mode: 'supabase',

    ensureIdentity() {
      identityPromise ??= loadIdentity().catch((err: unknown) => {
        identityPromise = null;
        throw err;
      });
      return identityPromise;
    },

    async updateDisplayName(name) {
      const { data } = await client.auth.getSession();
      const userId = data.session?.user.id;
      if (!userId) throw errorFromCode('not_authenticated');
      const { error } = await client.from('profiles').update({ display_name: name }).eq('id', userId);
      if (error) throw toError(error);
      identityPromise = Promise.resolve({ userId, displayName: name });
    },

    async fetchKrathongs(roomId, limit = 100) {
      const { data, error } = await client
        .from('krathongs')
        .select(KRATHONG_COLUMNS)
        .eq('room_id', roomId)
        .order('floated_at', { ascending: false })
        .limit(limit);
      if (error) throw toError(error);
      return (data as unknown as KrathongRow[]).map(mapKrathongRow);
    },

    async floatKrathong(input: FloatKrathongInput): Promise<Krathong> {
      const { data, error } = await client.rpc('float_krathong', {
        p_id: input.id,
        p_room_id: input.roomId,
        p_display_name: input.displayName,
        p_krathong_name: input.krathongName,
        p_design: input.design,
        p_wish: input.wish,
        p_visibility: input.visibility,
      });
      if (error || !data) throw toError(error);
      return mapKrathongRow(data as KrathongRow);
    },

    async fetchMyPrivateWish(krathongId) {
      const { data, error } = await client
        .from('private_wishes')
        .select('wish')
        .eq('krathong_id', krathongId)
        .maybeSingle();
      if (error) throw toError(error);
      return (data?.wish as string | undefined) ?? null;
    },

    async reportKrathong(krathongId) {
      const { error } = await client.rpc('report_krathong', { p_id: krathongId });
      if (error) throw toError(error);
    },

    async fetchRiverStats() {
      const { data, error } = await client.rpc('river_stats');
      if (error) throw toError(error);
      const out: Record<string, number> = {};
      for (const row of (data ?? []) as { room_id: string; krathong_count: number }[]) {
        out[row.room_id] = Number(row.krathong_count);
      }
      return out;
    },

    async createPrivateRoom(riverId, type, title) {
      const { data, error } = await client.rpc('create_private_room', {
        p_river_id: riverId,
        p_room_type: type,
        p_title: title,
      });
      const row = (data as { room_id: string; invite_token: string; expires_at: string }[] | null)?.[0];
      if (error || !row) throw toError(error);
      return {
        room: { id: row.room_id, roomType: type, riverId, title, expiresAt: row.expires_at },
        inviteToken: row.invite_token,
      };
    },

    async acceptInvite(token) {
      const { data, error } = await client.rpc('accept_room_invite', { p_token: token });
      const row = (data as RoomRow[] | null)?.[0];
      if (error || !row) throw toError(error ?? { message: 'invalid_invite' });
      return mapRoom(row);
    },

    async getRoom(roomId) {
      const { data, error } = await client
        .from('rooms')
        .select('id, room_type, river_id, title, expires_at')
        .eq('id', roomId)
        .maybeSingle();
      if (error) throw toError(error);
      if (!data) return null;
      const room = mapRoom(data as RoomRow);
      if (room.expiresAt && Date.parse(room.expiresAt) <= Date.now()) return null;
      return room;
    },

    async listMyRooms() {
      // RLS returns only rooms this guest is a member of, besides the public ones filtered out here.
      const { data, error } = await client
        .from('rooms')
        .select('id, room_type, river_id, title, expires_at, owner_id')
        .neq('room_type', 'public')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw toError(error);
      const { data: session } = await client.auth.getSession();
      const me = session.session?.user.id;
      return (data as (RoomRow & { owner_id: string | null })[]).map((row) => ({
        ...mapRoom(row),
        isOwner: !!me && row.owner_id === me,
      }));
    },

    async closeRoom(roomId) {
      const { error } = await client.rpc('close_room', { p_room_id: roomId });
      if (error) throw toError(error);
    },

    joinRoom(roomId, me, handlers: RoomHandlers) {
      handlers.onStatus('connecting');
      const channel = client.channel(`room:${roomId}`, {
        config: { presence: { key: me.userId } },
      });

      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'krathongs', filter: `room_id=eq.${roomId}` },
          (payload) => {
            const row = payload.new as KrathongRow;
            if (row && !row.hidden) handlers.onKrathong(mapKrathongRow(row));
          },
        )
        .on('presence', { event: 'sync' }, () => handlers.onPresence(presenceCount(channel)))
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            handlers.onStatus('live');
            void channel.track({ name: me.displayName });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            handlers.onStatus('offline');
          }
        });

      return () => {
        void client.removeChannel(channel);
      };
    },

    watchPresence(roomIds, onCounts) {
      const counts: Record<string, number> = {};
      const channels = roomIds.map((roomId) => {
        const channel = client.channel(`room:${roomId}`);
        channel
          .on('presence', { event: 'sync' }, () => {
            counts[roomId] = presenceCount(channel);
            onCounts({ ...counts });
          })
          .subscribe();
        return channel;
      });
      return () => {
        for (const channel of channels) void client.removeChannel(channel);
      };
    },
  };
}
