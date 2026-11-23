import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="flex min-h-[100svh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-3xl font-semibold">กระทงลอยหลงทาง</p>
      <p className="text-mist">ไม่พบหน้าที่คุณหา</p>
      <Link to="/" className="text-gold">กลับหน้าแรก</Link>
    </main>
  );
}
