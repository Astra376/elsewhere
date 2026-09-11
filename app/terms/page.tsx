import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
export const metadata: Metadata = {
  title: 'Terms of service',
  description:
    'The rules for using ChatUp, including guest accounts and memberships.',
};
export default function Terms() {
  return (
    <LegalPage
      title="Good connections. Clear terms."
      intro="Using ChatUp means agreeing to these terms and our community rules."
    >
      <section>
        <h2>Who can use ChatUp</h2>
        <p>
          You must be at least 18 years old and legally permitted to use the
          service where you live. Do not misrepresent your age or use the
          service after suspension. For questions about ChatUp or these terms,
          use <a href="/support">Support</a> or email{' '}
          <a href="mailto:support@chatup.chat">support@chatup.chat</a>.
        </p>
      </section>
      <section>
        <h2>Accounts and guest sessions</h2>
        <p>
          You may start with a guest profile or create an account using an
          available sign-in method. Keep your account secure. Guest sessions can
          be lost when cookies are cleared, the session expires, or you log out.
          Paid memberships require a verified account. You are responsible for
          content sent through your account.
        </p>
      </section>
      <section>
        <h2>Respect the person on the other side</h2>
        <p>
          No sexual content, nudity, harassment, hate, threats, exploitation,
          scams, spam, impersonation, or sharing someone else’s private
          information. Do not solicit money, credentials, or personal contact
          details through deception. Do not upload material you lack permission
          to share or use automated systems to abuse matching, messaging, or
          billing.
        </p>
        <p>
          You can leave a conversation at any time. Report concerning behavior
          through the chat controls. Do not continue contacting someone who has
          blocked you. Read the <a href="/safety">community rules</a> for
          practical guidance.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          You keep ownership of what you share. You grant ChatUp permission
          to host, transmit, display to intended participants, and review
          reported content as needed to operate the service. Do not share
          content that infringes another person’s rights. Other participants can
          capture or save content; anonymity is not a guarantee that a
          conversation will remain secret.
        </p>
      </section>
      <section>
        <h2>AI, matching, and availability</h2>
        <p>
          AI companions are labeled and appear only in text mode when you choose
          a matching option that includes AI. AI replies can be inaccurate and
          are not professional advice. Matching depends on who is available and
          both participants’ preferences. Priority matching does not guarantee a
          partner or a specific wait time.
        </p>
        <p>
          Networks, browsers, devices, and providers can interrupt service. The
          app includes recovery and retry features, but uninterrupted access or
          delivery at a particular time is not guaranteed.
        </p>
      </section>
      <section>
        <h2>Memberships and billing</h2>
        <p>
          Free, Basic, and Plus features are shown on the membership screen.
          Where checkout is enabled, the checkout page states the currency,
          total charge, taxes if applicable, and renewal interval before
          purchase. Yearly pricing is 20% below twelve monthly payments at the
          displayed standard rate. Optional promotional pricing may differ.
        </p>
        <p>
          Subscriptions renew monthly or yearly until canceled. Manage renewal,
          payment methods, and cancellation through the Stripe billing portal.
          Cancellation generally takes effect at the end of the paid billing
          period. Any refund rights required by applicable law remain available.
          Contact <a href="/support?category=billing">billing support</a> for a
          payment issue.
        </p>
      </section>
      <section>
        <h2>Moderation and account standing</h2>
        <p>
          We may warn, limit, or suspend accounts for rule violations or abuse.
          Account standing is visible in Settings. Reports are reviewed through
          moderation tools, and outcomes are recorded. Use{' '}
          <a href="/support?category=appeal">an appeal</a> if you believe an
          action was mistaken. This service is not an emergency response
          service.
        </p>
      </section>
      <section>
        <h2>Changes and legal rights</h2>
        <p>
          Features and these terms may change as the service develops. Material
          changes will be reflected in a new policy version and communicated
          when required. Nothing in these terms removes rights that cannot
          lawfully be excluded, including applicable consumer rights.
        </p>
      </section>
    </LegalPage>
  );
}
