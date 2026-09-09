# Elsewhere

A responsive stranger-chat web app with a guest-first flow, persistent social profiles, reconnecting text chat, private media, games, and optional voice, video, and AI conversations.

## Run locally

Use Node 22.13 or newer and npm. Install with `npm ci`, copy `.dev.vars.example` to `.dev.vars`, and replace the development auth secret. Run `npm run db:local` once, then run `npm run dev:api` and `npm run dev` in separate terminals. Open `http://localhost:3000`.

The browser talks to a same-origin server proxy. The separate API Worker owns authentication, D1, R2, Durable Objects, Stripe, and provider secrets. Missing provider credentials produce explicit unavailable states; they do not simulate successful purchases, account creation, or calls.

## Included

- Responsive landing page and app shell; light/dark themes; installable PWA; offline page.
- Anonymous guest profiles, email verification/password recovery, Google OAuth integration, and guest-to-account linking.
- Human matching by mode and interests; 5/10/30-second or unlimited interest-only waits; paid priority and mutual gender preferences.
- Persisted messages, unique message IDs, retry controls, WebSocket reconnect, catch-up polling, typing indicators, and explicit conversation ending.
- Friends, requests, direct messages, notifications, plan-limited history, avatar/banner/profile settings, and privacy preferences.
- Basic: 13 total interests, 15 history entries, images, matching priority, gender filtering, optional badge. Plus: 20 total interests, 25 history entries, images/videos, higher priority, optional badge, priority support, and an ad-free entitlement.
- Stripe Checkout with durable retry recovery and duplicate-purchase protection, billing portal, and verified/replay-safe subscription webhooks. Display prices are USD 5/10 monthly or 48/96 annually; configure matching Stripe prices before enabling checkout.
- Relayed one-to-one WebRTC calls; Cloudflare RealtimeKit group-call integration; no recording or transcription enabled by the app.
- Tic-tac-toe and Connect Four with server-authoritative moves, turns, and revisions.
- Clearly labeled, opt-in OpenRouter AI text companions. Human-only is the default.
- Private R2 attachments with byte-signature validation, size/plan/access checks, default image blur, and video range delivery.
- Blocking, reporting with evidence snapshots, five account standing states, moderator review, support requests, role checks, audit records, and opt-in generic Web Push alerts.
- Canonical metadata, sitemap, robots rules, public policy pages, and no indexing of private conversations.

## Verification

`npm run check` runs type checking, lint, domain tests, isolated provider tests, and both release builds. `npm run test:integration` starts its own isolated local Worker/database and exercises multi-user authorization, delivery, recovery, media, social, and game flows. With both local servers running, `npm run test:browser` checks five screen widths and multi-browser conversations. Browser tests create local fixture accounts; they refuse a remote target for the conversation suite.

Provider tests use simulated email and Stripe responses inside the Cloudflare runtime. They validate application behavior without sending real email or taking payments. The browser suite uses Chromium/Edge; physical iOS/Android devices, Safari/WebKit, restrictive networks, payment SCA, and production-scale load still require release testing. No test suite can establish that a networked service will never disconnect or contain bugs.

## Deployment and operations

See [the deployment runbook](docs/OPERATIONS.md), [architecture and launch research](docs/ARCHITECTURE-RESEARCH.md), and [security policy](SECURITY.md). Production credentials belong in Cloudflare Worker secrets and Sites environment variables, never in browser bundles or git. The repository's production Wrangler configuration includes resource identifiers, not credentials.

The API has been provisioned on Cloudflare with D1, R2, Durable Objects, TURN, and an hourly maintenance schedule. The frontend is deployed through Sites on Cloudflare infrastructure. GitHub Actions validates changes and provides an explicit API deployment workflow; automatic deployment is enabled only after the repository's Cloudflare build credentials are connected.

This is an owner-only preview until provider activation, operator details, moderation operations, and launch checks are completed. Search rankings and advertising approval are not guaranteed.
