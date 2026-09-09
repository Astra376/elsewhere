export interface Env extends Pick<
  WorkerBindings,
  | 'DB'
  | 'FILES'
  | 'CHAT_ROOMS'
  | 'MATCHMAKER'
  | 'BILLING'
  | 'APP_ORIGIN'
  | 'API_ORIGIN'
> {
  AUTH_SECRET: string;
  API_PROXY_KEY?: string;
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODEL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_BASIC_MONTHLY?: string;
  STRIPE_BASIC_YEARLY?: string;
  STRIPE_PLUS_MONTHLY?: string;
  STRIPE_PLUS_YEARLY?: string;
  TURN_KEY_ID?: string;
  TURN_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  REALTIME_APP_ID?: string;
  REALTIME_API_TOKEN?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  ADMIN_USER_IDS?: string;
}
