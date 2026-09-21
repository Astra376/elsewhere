import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal-page';
export const metadata: Metadata = {
  title: 'Community and safety',
  description:
    'Meet new people with clear boundaries, reporting, blocking, and privacy controls.',
};
export default function Safety() {
  return (
    <LegalPage
      title="Be a good part of someone’s day."
      intro="A few boundaries make more room for good conversations."
    >
      <section>
        <h2>Adults only. Respect always.</h2>
        <p>
          ChatUp is for people 18 and older. Sexual content and nudity are
          not allowed. Do not harass, threaten, insult, exploit, or target
          someone because of who they are. If someone says no or leaves, respect
          that choice.
        </p>
      </section>
      <section>
        <h2>Keep a little mystery</h2>
        <p>
          Use a nickname. Avoid sharing your address, workplace, school, phone
          number, financial information, identity documents, or passwords. Watch
          for scams, suspicious links, and requests for money. A friendly
          profile does not verify a person’s identity.
        </p>
      </section>
      <section>
        <h2>Your camera, your choice</h2>
        <p>
          Camera and microphone access starts only after you choose to join a
          call. You can mute, turn off your camera, or leave. Incoming images
          and videos are blurred by default until you reveal them. Others can
          still record their own screen; only share what you are comfortable
          making visible.
        </p>
      </section>
      <section>
        <h2>Leave, block, report</h2>
        <p>
          Use Leave when a conversation does not feel right. Report and block is
          available from the chat header. Choose a reason and include useful
          context. Blocking stops future one-to-one matches and messages with
          that account and hides their room messages. Reports are private from
          the reported person.
        </p>
        <p>
          Report suspected underage participation immediately. Do not download
          or redistribute suspected illegal content. If someone is in immediate
          danger, contact local emergency services directly.
        </p>
      </section>
      <section>
        <h2>Who you meet</h2>
        <p>
          Matching depends on who is around. Treat every stranger as a stranger:
          do not share addresses, payment details, or other identifying
          information. Report anyone trying to mislead you.
        </p>
      </section>
      <section>
        <h2>Account standing and help</h2>
        <p>
          All good, Warning, Limited, At risk, and Suspended are the available
          account states. Restrictions and notices appear in Settings. You can
          submit an <a href="/support?category=appeal">appeal</a> or ask for{' '}
          <a href="/support">support</a>.
        </p>
      </section>
    </LegalPage>
  );
}
