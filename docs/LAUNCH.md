# Launch ChatUp

The website is branded **ChatUp**, with `https://chatup.chat` as its canonical address. The existing GitHub repository, API Worker, database, and storage retain their resource names. The website is hosted by Sites; `elsewhere-api` is its backend.

## 1. Connect the domain

Already prepared: the Sites custom hostname `chatup.chat`, two Cloudflare A records, and both domain-verification TXT records. Keep those A records **DNS only**. No manual Worker route is needed for the website.

In **Namecheap → Domain List → chatup.chat → Manage → Nameservers**, select **Custom DNS**, enter these two nameservers, and save:

```
thomas.ns.cloudflare.com
zoe.ns.cloudflare.com
```

Wait for Cloudflare's `chatup.chat` zone to show **Active**. DNS propagation can take up to 24 hours. The Site's custom-domain status and certificate must also become **Active** before launch; Codex can refresh their status and finish any additional certificate validation returned by Sites.

After the domain and certificate are active, in **Cloudflare → Workers & Pages → elsewhere-api → Settings → Variables and Secrets**, edit the Text variable `APP_ORIGIN` to `https://chatup.chat`, then **Deploy**. Its old value is intentionally retained until the domain works. Leave `API_ORIGIN` at `https://elsewhere-api.robloxproxy.workers.dev`.

[Namecheap nameserver instructions](https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-to-change-dns-for-a-domain/).

## 2. Receive support email

The `support@chatup.chat` forwarding rule and its verified Outlook destination are configured. Your personal address is not in the website source. Once Cloudflare shows the domain as **Active**, open **Email Routing** for `chatup.chat` and choose **Enable Email Routing / Add records and enable**. Cloudflare must add its MX/SPF records. Send a test email from a different address.

This is incoming forwarding, not a mailbox with an outgoing SMTP service. Replying directly from your personal Outlook account exposes that address. Answer in-app support tickets through `/moderation`; use a domain mailbox or an authenticated domain sender for email replies.

[Cloudflare email setup](https://developers.cloudflare.com/email-service/get-started/route-emails/).

## 3. Add provider settings

All settings below go in **Cloudflare → Workers & Pages → elsewhere-api → Settings → Variables and Secrets → Add**. Choose **Secret** for private keys/tokens; **Text** for price IDs, client IDs, sender addresses, and other public configuration. Select **Deploy** to apply changes. Nothing needs to go into GitHub or the website's browser code.

[Cloudflare secret instructions](https://developers.cloudflare.com/workers/configuration/secrets/).

## 4. Enable email accounts

In [Resend](https://resend.com/domains), add `chatup.chat`. Add the exact verification records Resend displays to **Cloudflare → chatup.chat → DNS → Records**, then verify the domain. Keep the Cloudflare incoming MX records at the root; Resend's sending/bounce records use its specified subdomain. Add:

| Setting | Value |
| --- | --- |
| `RESEND_API_KEY` | A Resend API key permitted to send from this domain |
| `EMAIL_FROM` | `ChatUp <support@chatup.chat>` |

Create a ChatUp account and open its verification email before enabling paid checkout. Guest chat already works without either email or Google.

[Resend domain verification](https://resend.com/docs/dashboard/domains/introduction).

## 5. Enable Stripe subscriptions

Complete Stripe's account activation for your actual business type. Stripe needs accurate private legal details even when the public website uses ChatUp. Set the public business name, statement descriptor, website, and support address to match ChatUp where Stripe permits.

In **Stripe → Product catalog**, create two products with these **recurring USD prices**, matching the app:

| Product / interval | Price | Cloudflare Text variable for its `price_…` ID |
| --- | --- | --- |
| Basic / monthly | $5 | `STRIPE_BASIC_MONTHLY` |
| Basic / yearly | $48 | `STRIPE_BASIC_YEARLY` |
| Plus / monthly | $10 | `STRIPE_PLUS_MONTHLY` |
| Plus / yearly | $96 | `STRIPE_PLUS_YEARLY` |

Use price IDs, not product IDs. Annual prices already include the 20% saving; no coupon is needed.

Add Stripe's secret API key as `STRIPE_SECRET_KEY`.

In [Stripe Webhooks](https://dashboard.stripe.com/webhooks), choose **Create an event destination → Your account**, select these **snapshot** events, then choose **Webhook endpoint**:

```
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
```

Endpoint URL:

```
https://elsewhere-api.robloxproxy.workers.dev/api/billing/webhook
```

Set `STRIPE_WEBHOOK_SECRET` to that destination's `whsec_…` signing secret. Configure and save the [customer portal](https://dashboard.stripe.com/settings/billing/portal), including cancellation and payment-method updates.

First use one Stripe sandbox's key, four prices, and webhook secret together. Complete a test subscription and cancellation from a verified ChatUp account and check that the app's plan updates and webhook deliveries succeed. Before advertising, replace all six Stripe settings with the corresponding **live-mode** values together. Test and live IDs cannot be mixed. No publishable Stripe key is needed by this app's hosted Checkout integration.

[Stripe webhook setup](https://docs.stripe.com/webhooks), [customer portal](https://docs.stripe.com/customer-management/activate-no-code-customer-portal).

## 6. Enable AI chat

Create a key in [OpenRouter → API keys](https://openrouter.ai/settings/keys), fund the account's credits, and set a spending limit. Store it as Secret `OPENROUTER_API_KEY`. The configured model is `openai/gpt-4.1-mini`; `OPENROUTER_MODEL` changes it. AI is optional, labeled, and text-only.

[OpenRouter setup](https://openrouter.ai/docs/quickstart).

## 7. Enable Google sign-in and group calls

**Google:** Create a Web application OAuth client in [Google Auth Platform](https://console.cloud.google.com/auth/overview). Brand it ChatUp, use an external audience, and configure:

```
Authorized domain: chatup.chat
JavaScript origin: https://chatup.chat
Redirect URI: https://chatup.chat/api/auth/callback/google
Homepage: https://chatup.chat
Privacy: https://chatup.chat/privacy
Terms: https://chatup.chat/terms
```

Store `GOOGLE_CLIENT_ID` and Secret `GOOGLE_CLIENT_SECRET`. Move the consent screen to production and complete Google's required domain/brand verification. Test with an account outside your development test-user list.

**Group voice/video:** In [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens), create a custom token scoped to this Cloudflare account with **Realtime Admin** permission. Store it as `REALTIME_API_TOKEN`. The RealtimeKit app and participant preset are already configured. One-to-one voice/video TURN credentials are already installed. Test a group call on separate devices after adding the token.

[Google production setup](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance), [Cloudflare Realtime token](https://developers.cloudflare.com/realtime/realtimekit/quickstart/).

## 8. Enable moderation and public access

Create and verify your own account. In **Cloudflare → D1 → elsewhere-db → Console**, find that account's internal ID, using your actual account email:

```sql
SELECT id FROM user WHERE email = 'YOUR_ACCOUNT_EMAIL' AND emailVerified = 1;
```

Set Secret `ADMIN_USER_IDS` to the returned `id`, then deploy. Open `/moderation` and confirm you can review reports and support requests.

The current Site audience is owner-only. After the domain, support email, accounts, and the providers you intend to advertise work, ask Codex to **make ChatUp public**. This removes the Sites viewer login; it is separate from a Cloudflare Worker deployment. Verify `chatup.chat` in an incognito window and test guest matching from two devices before advertising. Public copy uses ChatUp and `support@chatup.chat`, without a personal name or a claim of incorporation.
