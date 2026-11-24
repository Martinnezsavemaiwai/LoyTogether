import { Link } from 'react-router';

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-xl font-semibold text-ink no-underline ${className}`}>
      ลอยนำกัน<span className="text-gold">เด้อ</span>
    </Link>
  );
}
