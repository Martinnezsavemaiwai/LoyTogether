import { useEffect, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { useIdentityStore } from '@/stores/identityStore';

/** Signs the visitor in as a guest before showing festival screens. */
export function RequireIdentity({ children }: { children: ReactNode }) {
  const { identity, status, error, ensure } = useIdentityStore();

  useEffect(() => {
    void ensure();
  }, [ensure]);

  if (identity) return <>{children}</>;

  if (status === 'error') {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center gap-5 px-6 text-center">
        <p className="max-w-sm text-ink">{error}</p>
        <Button onClick={() => void ensure()}>ลองอีกครั้ง</Button>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[100svh] flex-col items-center justify-center gap-4 text-mist"
      role="status"
    >
      <span className="size-3 animate-pulse rounded-full bg-gold shadow-[0_0_24px_6px_rgb(245_199_106/0.5)]" />
      กำลังจุดเทียนรอ
    </div>
  );
}
