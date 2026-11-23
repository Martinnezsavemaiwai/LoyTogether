import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { backend, errorMessage } from '@/lib/backend';
import { readInviteToken } from './invite';

export function JoinPage() {
  const navigate = useNavigate();
  const [token] = useState(() => readInviteToken(window.location.hash));
  const [error, setError] = useState<string | null>(
    token ? null : 'ลิงก์เชิญไม่ครบ ลองเปิดจากลิงก์ที่ได้รับอีกครั้ง',
  );
  const started = useRef(false);

  useEffect(() => {
    // Drop the token from the address bar and history right away.
    window.history.replaceState(null, '', '/join');
    if (started.current || !token) return;
    started.current = true;
    backend
      .acceptInvite(token)
      .then((room) => navigate(`/room/${room.id}`, { replace: true }))
      .catch((err: unknown) => setError(errorMessage(err)));
  }, [navigate, token]);

  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center gap-5 px-6 text-center">
      {error ? (
        <>
          <p className="max-w-sm text-ink">{error}</p>
          <Link to="/rivers" className="text-gold">
            ไปลอยที่สายน้ำสาธารณะแทน
          </Link>
        </>
      ) : (
        <p className="text-mist" role="status">
          กำลังพาเข้าห้อง
        </p>
      )}
    </main>
  );
}
