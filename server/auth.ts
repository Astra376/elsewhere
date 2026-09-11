import { betterAuth } from 'better-auth';
import { anonymous } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import type { Env } from './env';

const adjectives = [
  'Cosmic',
  'Curious',
  'Sunny',
  'Velvet',
  'Lucky',
  'Mellow',
  'Wandering',
  'Electric',
];
const nouns = [
  'Panda',
  'Comet',
  'Otter',
  'Fox',
  'Peach',
  'Orbit',
  'Koala',
  'Owl',
];
export function guestName() {
  const bytes = crypto.getRandomValues(new Uint16Array(3));
  return `${adjectives[bytes[0] % adjectives.length]}${nouns[bytes[1] % nouns.length]}${bytes[2] % 1000}`;
}
async function sendEmail(env: Env, to: string, subject: string, url: string) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM)
    throw new Error('Email delivery is not configured.');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text: `${subject}\n\nContinue here: ${url}\n\nIf you did not request this, ignore this email.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error('Email delivery failed. Try again shortly.');
}
export function createAuth(env: Env) {
  return betterAuth({
    appName: 'ChatUp',
    baseURL: env.APP_ORIGIN,
    basePath: '/api/auth',
    secret: env.AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB, { schema }), {
      provider: 'sqlite',
      schema,
      transaction: false,
    }),
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) =>
        sendEmail(env, user.email, 'Reset your ChatUp password', url),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        sendEmail(env, user.email, 'Verify your ChatUp email', url),
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 40,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
        '/sign-in/anonymous': { window: 60, max: 5 },
      },
    },
    account: {
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    advanced: {
      cookiePrefix: 'elsewhere',
      useSecureCookies: env.APP_ORIGIN.startsWith('https:'),
      defaultCookieAttributes: { sameSite: 'lax', httpOnly: true },
    },
    plugins: [
      anonymous({
        generateName: guestName,
        disableDeleteAnonymousUser: true,
        onLinkAccount: async ({ anonymousUser, newUser }) => {
          const existing = await env.DB.prepare(
            'SELECT id FROM profiles WHERE authId=?',
          )
            .bind(newUser.user.id)
            .first<{ id: string }>();
          if (!existing) {
            await env.DB.prepare('UPDATE profiles SET authId=? WHERE authId=?')
              .bind(newUser.user.id, anonymousUser.user.id)
              .run();
            // The guest profile now belongs to the verified account; remove obsolete credentials.
            await env.DB.prepare(
              'DELETE FROM user WHERE id=? AND isAnonymous=1',
            )
              .bind(anonymousUser.user.id)
              .run();
          }
          // Existing accounts keep their own profile. The upgrade flow warns before switching accounts.
        },
      }),
    ],
  });
}
