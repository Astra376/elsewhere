'use client';
import type { Profile } from './domain';
export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.body instanceof Blob ? 35000 : 12000,
  );
  try {
    const headers = new Headers(options.headers);
    if (options.body && typeof options.body === 'string')
      headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      signal: options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal,
    });
    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json'))
      throw new ClientError(
        'The service is reconnecting. Try again shortly.',
        response.status || 503,
      );
    const data = (await response.json()) as {
      error?: string;
      message?: string;
      code?: string;
    };
    if (!response.ok)
      throw new ClientError(
        data.error ?? data.message ?? 'Could not complete that action.',
        response.status,
        data.code,
      );
    return data as T;
  } catch (error) {
    if (error instanceof ClientError) throw error;
    if (error instanceof Error && error.name === 'AbortError')
      throw new ClientError(
        'The connection timed out. Your message can be retried safely.',
        408,
      );
    throw new ClientError(
      'You appear to be offline. Reconnect and try again.',
      503,
    );
  } finally {
    clearTimeout(timeout);
  }
}
let bootPromise: Promise<Profile> | null = null;
export function bootstrap() {
  if (!bootPromise)
    bootPromise = api<Profile>('/me')
      .catch(async (error) => {
        if (error.status !== 401) throw error;
        try {
          await api('/auth/sign-in/anonymous', { method: 'POST', body: '{}' });
        } catch (e) {
          if (!(e instanceof ClientError) || e.status !== 400) throw e;
        }
        return api<Profile>('/me');
      })
      .catch((error) => {
        bootPromise = null;
        throw error;
      });
  return bootPromise;
}
export function clearBootstrap() {
  bootPromise = null;
}
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong. Please try again.';
}
export type AppConfig = {
  ai: boolean;
  google: boolean;
  email: boolean;
  billing: boolean;
  turn: boolean;
  groupCalls: boolean;
  push: boolean;
  vapidPublicKey: string | null;
  apiOrigin: string;
};
