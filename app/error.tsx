'use client';
export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="standalone-form">
      <h1>A little interruption.</h1>
      <p>
        Something went wrong loading this screen. Your saved conversations are
        still there.
      </p>
      <button className="button button-primary" onClick={reset}>
        Try again
      </button>
      <a href="/chat">Return to chat</a>
    </main>
  );
}
