import { useCallback, useEffect, useRef, useState } from 'react';
import { backend, errorMessage, type ConnectionStatus } from '@/lib/backend';
import type { Identity, Krathong } from '@/types/domain';

const LIMIT = 100;
const FALLBACK_POLL_MS = 20_000;
const SAFETY_REFRESH_MS = 90_000;

export function mergeKrathongs(current: Krathong[], incoming: Krathong[]): Krathong[] {
  const byId = new Map(current.map((k) => [k.id, k]));
  for (const k of incoming) byId.set(k.id, k);
  return [...byId.values()]
    .sort((a, b) => b.floatedAt.localeCompare(a.floatedAt))
    .slice(0, LIMIT);
}

export function useRoom(roomId: string | undefined, me: Identity | null) {
  const [krathongs, setKrathongs] = useState<Krathong[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [presence, setPresence] = useState(1);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const statusRef = useRef<ConnectionStatus>('connecting');

  const refresh = useCallback(async () => {
    if (!roomId) return;
    try {
      const rows = await backend.fetchKrathongs(roomId, LIMIT);
      // The server list is authoritative, so hidden or removed krathongs drop out.
      setKrathongs((current) => {
        const pending = current.filter(
          (k) => !rows.some((r) => r.id === k.id) && Date.now() - Date.parse(k.floatedAt) < 15_000,
        );
        return mergeKrathongs(rows, pending);
      });
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId || !me) return;
    // The festival view is keyed by room, so loading starts true for every room.
    // refresh only sets state after its fetch resolves, not during this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();

    const leave = backend.joinRoom(roomId, me, {
      onKrathong: (k) => setKrathongs((current) => mergeKrathongs(current, [k])),
      onPresence: (count) => setPresence(Math.max(1, count)),
      onStatus: (next) => {
        // Catch up on anything missed while disconnected.
        if (next === 'live' && statusRef.current === 'offline') void refresh();
        statusRef.current = next;
        setStatus(next);
      },
    });

    const poll = window.setInterval(() => {
      if (statusRef.current !== 'live') void refresh();
    }, FALLBACK_POLL_MS);
    const safety = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, SAFETY_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      leave();
      window.clearInterval(poll);
      window.clearInterval(safety);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [roomId, me, refresh]);

  const addLocal = useCallback((k: Krathong) => {
    setKrathongs((current) => mergeKrathongs(current, [k]));
  }, []);

  const removeLocal = useCallback((id: string) => {
    setKrathongs((current) => current.filter((k) => k.id !== id));
  }, []);

  return { krathongs, loading, error, presence, status, refresh, addLocal, removeLocal };
}
