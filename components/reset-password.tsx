'use client';
import { useEffect, useState } from 'react';
import { Brand } from './brand';
import { api, errorText } from '@/lib/client';
import './chat.css';
export function ResetPassword() {
  const [token, setToken] = useState(''),
    [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState(''),
    [error, setError] = useState(''),
    [done, setDone] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setToken(params.get('token') ?? '');
    if (params.has('error') || !params.get('token'))
      setError(
        'This reset link is invalid or expired. Request a new link from Log in.',
      );
  }, []);
  return (
    <main className="standalone-form">
      <Brand />
      <div className="settings-card">
        <h1>{done ? 'You’re ready to return.' : 'A fresh start.'}</h1>
        {done ? (
          <>
            <p>Your password has been changed.</p>
            <a className="button button-primary" href="/chat?auth=signin">
              Log in to Elsewhere
            </a>
          </>
        ) : (
          <form
            className="auth-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (password !== confirm) {
                setError('The passwords do not match.');
                return;
              }
              setBusy(true);
              setError('');
              try {
                await api('/auth/reset-password', {
                  method: 'POST',
                  body: JSON.stringify({ token, newPassword: password }),
                });
                setDone(true);
                history.replaceState(null, '', '/reset-password');
              } catch (error) {
                setError(errorText(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>Choose a password with at least 12 characters.</p>
            <label className="form-field">
              New password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="form-field">
              Confirm password
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <button className="button button-primary" disabled={busy || !token}>
              {busy ? 'Saving…' : 'Reset password'}
            </button>
            <a href="/chat?auth=signin">Back to sign in</a>
          </form>
        )}
      </div>
    </main>
  );
}
