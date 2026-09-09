import { Brand } from '@/components/brand';
export default function NotFound() {
  return (
    <main className="standalone-form">
      <Brand />
      <h1>This hello took a wrong turn.</h1>
      <p>That page doesn’t exist. Your next connection is still out there.</p>
      <a className="button button-primary" href="/">
        Back home
      </a>
    </main>
  );
}
