import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
export const metadata: Metadata = {
  title: 'Privacy policy',
  description:
    'How Elsewhere handles profiles, conversations, subscriptions, and privacy choices.',
};
export default function Privacy() {
  return (
    <LegalPage
      title="Your privacy matters."
      intro="Here is what Elsewhere collects, why it is needed, and what you control."
    >
      <section>
        <h2>Who this policy covers</h2>
        <p>
          This policy applies to the Elsewhere preview website and installed web
          app. You can contact the operator through{' '}
          <a href="/support?category=privacy">Support → Privacy request</a>. The
          public launch policy will identify the operating entity and its
          contact details before the service opens to the public.
        </p>
      </section>
      <section>
        <h2>A profile without an email</h2>
        <p>
          Guest mode creates a random profile name and a browser session. It
          stores your profile, interests, preferences, age and terms
          confirmation, friendships, and chat memberships. A guest profile
          remains tied to its browser session. Clearing cookies or logging out
          may make it inaccessible. Creating an account lets you return across
          devices.
        </p>
        <p>
          Email accounts store your email address, verification status, and a
          password hash. Google sign-in supplies the account information needed
          to authenticate you. Your email address is not shown to chat partners.
        </p>
      </section>
      <section>
        <h2>Conversations and calls</h2>
        <p>
          Text messages and attachments are stored so delivery can recover after
          a connection interruption and you can revisit recent conversations.
          Participants can see and save what you share. Private chats are
          restricted to their members. Room content is visible to people who
          join the room; avoid posting private information there.
        </p>
        <p>
          Calls use encrypted WebRTC transport and Cloudflare’s relay or
          group-call infrastructure. Elsewhere does not enable call recording or
          transcription. Call services process the technical metadata needed to
          connect participants. Text chat is not end-to-end encrypted: the
          service processes and stores messages for delivery and moderation.
        </p>
      </section>
      <section>
        <h2>AI companions</h2>
        <p>
          AI participation is optional, clearly labeled, and limited to text
          conversations. In an AI chat, recent message text is sent through
          OpenRouter to the selected model provider to generate a reply.
          Human-only conversations are not sent to OpenRouter. Avoid sharing
          sensitive or identifying information with an AI companion. Provider
          processing terms also apply.
        </p>
      </section>
      <section>
        <h2>Service providers and payments</h2>
        <p>
          Cloudflare hosts the chat service, database, media storage, and
          realtime connections. OpenRouter processes optional AI conversations.
          Stripe handles paid memberships when checkout is enabled; Elsewhere
          stores membership and billing reference IDs, not full card details.
          Email delivery and Google authentication are used only when those
          options are connected. These providers may process information outside
          your country.
        </p>
      </section>
      <section>
        <h2>Cookies, notifications, and advertising</h2>
        <p>
          Essential session cookies keep you signed in. Browser storage
          remembers theme, install suggestions, the active chat, and unsent
          drafts for recovery. Push notifications are opt-in, and notification
          previews do not include message text or sender names. You can disable
          sounds and push in Preferences.
        </p>
        <p>
          No advertising or analytics trackers are enabled in this preview. If
          advertising is introduced, the policy and consent controls will be
          updated before those trackers load. Private conversations are not used
          as advertising placements.
        </p>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <p>
          Messages in stranger matches and AI chats are scheduled for deletion
          after 30 days. Direct messages and room messages remain stored until
          account deletion removes their author’s message contents or the
          operator removes them. Match history shows a plan-dependent number of
          recent connections. Session and operational records expire separately.
          Reports and moderation records may be retained to investigate abuse
          and meet applicable obligations.
        </p>
        <p>
          Account deletion removes the profile, friendships, and owned media,
          and removes the contents of that account’s stored messages. Cancel an
          active membership through billing before deleting an account. Payment
          providers retain their own legally required records, and participants
          may retain copies they saved.
        </p>
      </section>
      <section>
        <h2>Your choices and requests</h2>
        <p>
          Settings lets you change your profile, hide interests and membership
          badges, control friend requests, manage blocked accounts, and delete
          your account. Use{' '}
          <a href="/support?category=privacy">a privacy request</a> to ask for
          access, correction, or help with deletion. Include enough information
          to identify your account, but never send a password or card number. We
          may need to verify ownership before releasing or changing data.
        </p>
      </section>
    </LegalPage>
  );
}
