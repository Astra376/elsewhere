import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link className="brand" href="/" aria-label="ChatUp home">
      <span className="brand-mark">
        <ArrowUpRight strokeWidth={3} />
      </span>
      {!compact && (
        <span>
          chatup<span className="brand-dot">.</span>
        </span>
      )}
    </Link>
  );
}
