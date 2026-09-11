import { ArrowUpRight } from 'lucide-react';
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <a className="brand" href="/" aria-label="ChatUp home">
      <span className="brand-mark">
        <ArrowUpRight strokeWidth={3} />
      </span>
      {!compact && (
        <span>
          chatup<span className="brand-dot">.</span>
        </span>
      )}
    </a>
  );
}
