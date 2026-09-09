'use client';
import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { Choice } from './app-primitives';
import { api, bootstrap, errorText } from '@/lib/client';
import './chat.css';
type Ticket = {
  id: string;
  category: string;
  message: string;
  status: string;
  response: string | null;
  createdAt: number;
};
export function SupportForm() {
  const [category, setCategory] = useState('help'),
    [message, setMessage] = useState(''),
    [error, setError] = useState(''),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [tickets, setTickets] = useState<Ticket[]>([]);
  useEffect(() => {
    const category = new URLSearchParams(location.search).get('category');
    if (['help', 'privacy', 'billing', 'appeal'].includes(category ?? ''))
      setCategory(category!);
    void bootstrap()
      .then(() => {
        setReady(true);
        return api<Ticket[]>('/support');
      })
      .then(setTickets)
      .catch((error) => setError(errorText(error)));
  }, []);
  return (
    <main className="standalone-form support-form">
      <Brand />
      <a href="/chat">← Back to Elsewhere</a>
      <div className="settings-card">
        <h1>A little help.</h1>
        <p>
          Send a request and return here to read the reply. Keep your guest
          session or use an account to stay connected.
        </p>
        <form
          className="auth-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              await api('/support', {
                method: 'POST',
                body: JSON.stringify({ category, message }),
              });
              setNote('Your request is saved. Replies will appear below.');
              setMessage('');
              setTickets(await api<Ticket[]>('/support'));
            } catch (error) {
              setError(errorText(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Choice
            label="What can we help with?"
            value={category}
            onChange={setCategory}
            options={[
              { value: 'help', label: 'General help' },
              { value: 'privacy', label: 'Privacy request' },
              { value: 'billing', label: 'Billing question' },
              { value: 'appeal', label: 'Account standing appeal' },
            ]}
          />
          <label className="form-field">
            Tell us a little more
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              minLength={10}
              maxLength={4000}
              rows={5}
              required
              placeholder="Please don’t include passwords or payment details."
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {note && (
            <p className="form-success" role="status">
              {note}
            </p>
          )}
          <button className="button button-primary" disabled={busy || !ready}>
            {busy ? 'Sending…' : 'Send request'}
          </button>
        </form>
      </div>
      {tickets.length > 0 && (
        <section className="support-requests">
          <h2>Your requests</h2>
          {tickets.map((t) => (
            <article className="settings-card" key={t.id}>
              <div className="support-request-heading">
                <strong>{t.category}</strong>
                <span>
                  {t.status === 'open' ? 'Awaiting reply' : 'Replied'}
                </span>
              </div>
              <p>{t.message}</p>
              {t.response && (
                <blockquote>
                  <strong>Elsewhere support</strong>
                  <p>{t.response}</p>
                </blockquote>
              )}
              <small>{new Date(t.createdAt).toLocaleString()}</small>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
