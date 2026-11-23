import { Link } from 'react-router';

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`text-xl font-semibold text-ink no-underline ${className}`}>
      ลอยนำกัน<span className="text-gold">เด้อ</span>
    </Link>
  );
}
