'use client';
import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, LoaderCircle, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorText, type AppConfig } from '@/lib/client';
import { Brand } from './brand';
export function AuthDialog({
  open,
  onOpenChange,
  config,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: AppConfig;
  onSuccess: () => Promise<void>;
}) {
  const [mode, setMode] = useState('signup'),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [note, setNote] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open && new URLSearchParams(location.search).get('auth') === 'signin')
      setMode('signin');
  }, [open]);
  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setNote('');
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/auth/request-password-reset', {
          method: 'POST',
          body: JSON.stringify({
            email,
            redirectTo: `${location.origin}/reset-password`,
          }),
        });
        setNote('If an account exists, a password reset link is on its way.');
      } else if (mode === 'signup') {
        await api('/auth/sign-up/email', {
          method: 'POST',
          body: JSON.stringify({
            email,
            password,
            name,
            callbackURL: `${location.origin}/chat`,
          }),
        });
        setNote(
          'Check your email to verify your account. You can keep chatting as a guest meanwhile.',
        );
      } else {
        await api('/auth/sign-in/email', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        await onSuccess();
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-dialog auth-dialog">
        <Brand />
        <DialogTitle>
          {mode === 'forgot'
            ? 'Let’s get you back in.'
            : 'Good connections deserve to stay.'}
        </DialogTitle>
        <DialogDescription>
          Save your profile and find your friends on every device. Signing into
          an existing account opens that account’s profile.
        </DialogDescription>
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(String(v));
            setError('');
            setNote('');
          }}
        >
          <TabsList className="auth-tabs">
            <TabsTrigger value="signup">Create account</TabsTrigger>
            <TabsTrigger value="signin">Log in</TabsTrigger>
          </TabsList>
        </Tabs>
        <button
          className="button button-outline google-button"
          disabled={busy || !config.google}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await api<{ url: string }>(
                '/auth/sign-in/social',
                {
                  method: 'POST',
                  body: JSON.stringify({
                    provider: 'google',
                    callbackURL: `${location.origin}/chat`,
                  }),
                },
              );
              if (result.url) location.assign(result.url);
            } catch (e) {
              setError(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <span className="google-letter">G</span>Continue with Google
        </button>
        {!config.google && (
          <p className="field-note">Google sign-in is being connected.</p>
        )}
        <div className="divider">
          <span>or use your email</span>
        </div>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="form-field">
              Your name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="username"
                minLength={3}
                maxLength={24}
                required
                placeholder="What should we call you?"
              />
            </label>
          )}
          <label className="form-field">
            Email address
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              placeholder="you@example.com"
            />
          </label>
          {mode !== 'forgot' && (
            <label className="form-field">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                minLength={mode === 'signup' ? 12 : 1}
                maxLength={128}
                required
                placeholder={
                  mode === 'signup' ? 'At least 12 characters' : 'Your password'
                }
              />
            </label>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {note && (
            <p className="form-success" role="status">
              <CheckCircle2 size={18} />
              {note}
            </p>
          )}
          <button
            className="button button-primary"
            disabled={busy || !config.email}
          >
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : mode === 'forgot' ? (
              <Mail size={18} />
            ) : null}
            {mode === 'signup'
              ? 'Create your account'
              : mode === 'forgot'
                ? 'Send reset link'
                : 'Welcome back'}
            <ArrowRight size={18} />
          </button>
          {!config.email && (
            <p className="field-note">
              Email accounts will open when email delivery is connected. Guest
              chatting is ready now.
            </p>
          )}
          {mode === 'signin' && (
            <button
              type="button"
              className="text-button"
              onClick={() => setMode('forgot')}
            >
              Forgot your password?
            </button>
          )}
        </form>
        <button className="text-button" onClick={() => onOpenChange(false)}>
          Keep exploring as a guest
        </button>
        <p className="field-note centered">
          For adults 18+. By creating an account, you agree to our{' '}
          <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.
        </p>
      </DialogContent>
    </Dialog>
  );
}
