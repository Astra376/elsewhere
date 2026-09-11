# Deployment and operations

## Current resources

| Resource                          | Identifier                                             |
| --------------------------------- | ------------------------------------------------------ |
| GitHub repository                 | `Astra376/elsewhere` (private)                         |
| Frontend Worker | `chatup-web` |
| Launch domain                     | `https://chatup.chat`                                |
| Frontend preview | `https://chatup-web.robloxproxy.workers.dev` |
| API Worker                        | `elsewhere-api`                                        |
| API origin                        | `https://elsewhere-api.robloxproxy.workers.dev`        |
| Cloudflare account                | `6418d8b7a0996630c6eb574d93c85b54`                     |
| D1                                | `elsewhere-db`, `8e150fc0-4b8b-43e6-94f4-808eed3b6ffe` |
| R2                                | `elsewhere-media`, private                             |
| RealtimeKit app                   | `7e36c220-4fd1-4d19-b1d6-6e832edba25e`                 |
| TURN key                          | `53d46601f7c427366647ce3f9fd795a2`                     |
| GitHub/Cloudflare repo connection | `b6504d57-1b0e-494a-abe3-28a6e959b715`                 |

Identifiers are not credentials. Local `.dev.vars`, deployment archives, test data, and generated bundles are ignored by git. The API's runtime secrets include the auth signing key, proxy key, TURN bearer token/key ID, and private Web Push key. The frontend's server runtime has `API_BASE_URL` and the same `API_PROXY_KEY`. Never prefix private values with `NEXT_PUBLIC_` or embed them in client code.

## First provider activation

1. Follow [the ChatUp launch steps](LAUNCH.md). The canonical domain is `https://chatup.chat`; its Cloudflare Worker custom domain is active and the API Worker's `APP_ORIGIN` is `https://chatup.chat`. Keep `API_ORIGIN` and the frontend's `API_BASE_URL` at the existing API URL. Provider redirects use `APP_ORIGIN`. Public branding is ChatUp; infrastructure names, session cookies, storage keys, and the proxy header retain their original identifiers to preserve compatibility.
2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Register `{APP_ORIGIN}/api/auth/callback/google` as the OAuth callback; test a new account and an existing account separately.
3. Set `RESEND_API_KEY` and a verified `EMAIL_FROM` domain. Test verification, guest linking, sign-in, password reset, expired links, and email delivery. Do not enable checkout before account verification works.
4. Create recurring USD prices: Basic 5/month and 48/year, Plus 10/month and 96/year. Store their IDs in the four `STRIPE_*_MONTHLY/YEARLY` bindings. Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`. Point a Stripe webhook at `{API_ORIGIN}/api/billing/webhook` for `customer.subscription.created`, `.updated`, and `.deleted`; enable the customer billing portal. Test subscription creation, changes, cancellation, failure, replay, and SCA using Stripe test mode before live mode.
5. Set `OPENROUTER_API_KEY`, choose `OPENROUTER_MODEL`, and configure provider spending limits. Verify the opt-in disclosure, human-only separation, rate limits, provider failures, and quality/safety evaluation. The key is not required for human chat.
6. Create a Cloudflare token with the Realtime permissions needed for meetings and participants in this account. Store it as `REALTIME_API_TOKEN`. The connector could create the app/preset but could not mint the private runtime token. Verify group join, leave, reconnect, token refresh, and the configured preset permissions with multiple devices before enabling group calls broadly.
7. Set `ADMIN_USER_IDS` to the authenticated `user.id` of the operator's verified account, not the public profile ID. Obtain it through an authenticated operator database query. Review an actual test report and answer a support ticket through `/moderation`.

## Ship a change

Run `npm ci`, `npm run check`, `npm run test:integration`, and the relevant browser tests. Commit the exact reviewed source. Apply new migrations with `npm run db:remote` before `npm run deploy:api`. Never rewrite an applied migration or point a test at the production database. The production configuration uses `--keep-vars` to preserve provider bindings managed outside source control.

Frontend releases use `npm run build` followed by `npm run deploy:web`. This deploys built server modules and static assets directly to the `chatup-web` Worker, including the custom domain. No Sites login, publication, or usage is required. A backend proxy key is required on both Workers; an incorrect key fails closed. Keep the shared key in Worker secrets.

The API's `v2` Durable Object migration adds `BillingCoordinator`, with one object per profile. Keep the earlier `v1` migration in the configuration. Regenerate binding declarations with `npm run types:api` after resource changes. The generated file contains binding types, never secret values.

Checkout stores the attempt and exact Stripe parameters before making the external request. Multiple tabs reuse an open checkout; changing plans expires the earlier checkout. A lost response is recovered by attempt metadata or the same Stripe idempotency key, including after a Durable Object restart. Account deletion expires unpaid checkout and closes the coordinator to prevent a concurrent new purchase. Subscription checks query Stripe before creating checkout, so delayed webhooks do not permit a second purchase. Live Stripe test-mode checkout, SCA, webhooks, taxes, refunds, and portal configuration still need validation before enabling payments.

Cloudflare has a repository connection for `Astra376/elsewhere`. A dedicated build token and trigger still need to be configured before native automatic builds run. Build command: `npm ci && npm run typecheck && npm test`; deploy command: `npm run db:remote && npm run deploy:api`; root directory: `/`; production branch: `main`. Do not reuse another project's named deployment token without verifying its scope and ownership. GitHub's manual API workflow can alternatively use a repository `CLOUDFLARE_API_TOKEN` secret.

## Observe and recover

`/health` is a public availability check. Authenticated `/api/config` reports enabled integrations without exposing credentials. Workers observability records request failures; avoid logging message bodies, cookies, payment details, push keys, and provider tokens. Monitor 5xx/429 rates, queue time, D1 latency, socket reconnect frequency, TURN call success, and provider usage.

For a faulty release, roll back the affected Worker to the last known good version through Cloudflare using Cloudflare version rollback. Keep schema changes backward compatible; a code rollback does not reverse a D1 migration. Use Cloudflare's D1 recovery/export capabilities according to the account's actual retention and test restoration before relying on it. Do not promise a backup interval without verifying the account configuration.

Rotate a leaked provider key at its provider, then replace its Worker secret. Rotate the proxy key on both frontend and API in a coordinated release. Rotating `AUTH_SECRET` invalidates sessions and should be announced operationally. Revoke or suspend abused accounts through the moderator interface; record reasons and handle appeals through support.

## Data lifecycle

An hourly schedule removes expired queue entries, one-use socket tickets, rate-limit buckets, read notifications older than 30 days, and messages in stranger/AI matches older than 30 days. DM and room message contents currently remain until account deletion or operator removal. Reports preserve investigation snapshots separately. Account deletion removes owned media and profile/social records and clears the author's message content. Paid accounts must resolve an active subscription first.

Storage growth, inactive guest cleanup, media orphan cleanup, and report retention require an explicit operator policy before a large public rollout. These are not silently treated as solved by the history entry limits; showing fifteen history entries is different from deleting everything else.

## Test boundaries

The provider test runner uses a compatibility date of `2026-08-22` because its bundled Workerd currently supports that date. The actual API integration runner and production Worker use `2026-09-01`. Provider responses are simulated; human text/game tests use real local Workers, D1, R2, Durable Objects, and browser connections. The UI suite covers Chromium/Edge at five sizes. Real Safari/iOS installation/push, Android background behavior, restrictive-network calls, group calls, accessibility audits, load/soak tests, and real Stripe/email/Google accounts remain explicit release checks.

Matching regression tests include 201 incompatible people ahead of a compatible candidate, mutual gender filters, blocks in both directions, standing restrictions, expired presence, paid priority, and interest deadlines for both human and AI matches. Eligibility is filtered in SQL before selecting a candidate. The single matching coordinator still needs a realistic load/soak benchmark before claiming any concurrency capacity.

The preview runs without advertising scripts. Before ad activation, obtain publisher approval, select compliant public placements, add the appropriate consent platform for the launch regions, enforce Plus's ad-free entitlement before script loading, and measure layout stability. Do not put ads in private chat transcripts or claim guaranteed search rankings.

## Lint scope

Application code is linted with type-aware correctness and hook dependency rules. Scaffolded `components/ui` primitives are kept as upstream library components and excluded from lint. React Compiler diagnostics are disabled because this build does not enable the compiler. Native links deliberately perform full navigations between app entry points, and authenticated private media deliberately bypasses Next image optimization. Semantic ARIA status/group roles are retained. Live media and user-uploaded clips do not currently have caption tracks; only the three media-bearing components exempt that caption rule. Text chat remains available, and live captions are an explicit accessibility improvement for a later release.

The initial release also passed a real Cloudflare TURN video test using synthetic browser media, verified selected relay candidates, and media cleanup after hangup. `tests/browser/call.spec.ts` skips unless `.wrangler/relay-fixture.json` contains newly generated temporary ICE credentials from an authenticated live API smoke test. That file is ignored and must be removed after testing; never store the long-lived TURN bearer key there.

Room call setup is serialized separately from text delivery in the conversation's Durable Object. Concurrent joins share a meeting, and existing participants use the provider's token refresh endpoint across restarts. Membership and standing are checked again before returning a token after provider work. The UI stops local tracks on exit and offers rejoining after a terminal disconnection. Isolated tests cover concurrent joins, token refresh, missing tokens, provider failures, restricted members, and leaving while a provider response is pending. Validate these against the actual RealtimeKit service, including participant removal and token revocation on account/session changes, before public activation. See [Cloudflare participant tokens](https://developers.cloudflare.com/realtime/realtimekit/concepts/participant/) and [token refresh](https://developers.cloudflare.com/api/resources/realtime_kit/subresources/meetings/methods/refresh_participant_token/) for the provider contract.

The three-browser RealtimeKit test passed using an isolated real provider meeting, synthetic camera/microphone input, and temporary participant tokens issued through the authorized connector. Each browser received two remote video and audio streams; leaving stopped its local tracks, updated the roster, and rejoining worked. `tests/browser/group-call.spec.ts` requires an ignored `.wrangler/group-call-fixture.json` with a `tokens` array for three test participants. After testing, disable that meeting, delete its participants, and remove the fixture. This test substitutes the local token endpoint, so it validates the real media client without claiming that the production Worker credential is configured. Public group-call activation still requires `REALTIME_API_TOKEN` and an end-to-end server credential check.
