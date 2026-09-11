import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Brand } from './brand';
export function LegalPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <div className="legal-layout">
      <header className="site-header">
        <Brand />
        <a className="button button-outline button-small" href="/chat">
          Back to ChatUp <ArrowUpRight size={16} />
        </a>
      </header>
      <main className="legal-content">
        <a className="legal-back" href="/">
          <ArrowLeft size={16} /> Back home
        </a>
        <p className="eyebrow">A LITTLE CLARITY</p>
        <h1>{title}</h1>
        <p className="legal-intro">{intro}</p>
        <p className="legal-updated">
          Effective 11 September 2026
        </p>
        {children}
      </main>
      <footer className="legal-footer">
        <Brand />
        <nav aria-label="Legal">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/safety">Safety</a>
          <a href="/support">Support</a>
        </nav>
      </footer>
    </div>
  );
}
