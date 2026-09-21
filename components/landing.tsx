'use client';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  Compass,
  Gamepad2,
  Globe2,
  Heart,
  MessageCircle,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { Brand } from './brand';
import { api } from '@/lib/client';
import { preferredDark, applyTheme } from '@/lib/theme';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
const interests = [
  '🎧 Music',
  '🎮 Gaming',
  '🎬 Movies',
  '✈️ Travel',
  '🎨 Art',
  '💭 Deep talks',
];
export function Landing() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refreshSession = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        const session = await api<{ user?: { isAnonymous?: boolean } } | null>(
          '/auth/get-session',
          { cache: 'no-store', signal: current.signal },
        );
        if (!current.signal.aborted)
          setSignedIn(Boolean(session?.user && !session.user.isAnonymous));
      } catch {
        // Keep the last known state during a temporary connection failure.
      }
    };
    void refreshSession();
    window.addEventListener('focus', refreshSession);
    window.addEventListener('pageshow', refreshSession);
    return () => {
      controller?.abort();
      window.removeEventListener('focus', refreshSession);
      window.removeEventListener('pageshow', refreshSession);
    };
  }, []);
  const [mode, setMode] = useState('text');
  const [selected, setSelected] = useState<string[]>([]);
  const [dark, setDark] = useState(false);
  const [yearly, setYearly] = useState(false);
  useEffect(() => {
    const sync = () => setDark(preferredDark());
    sync();
    window.addEventListener('chatup-theme', sync);
    return () => window.removeEventListener('chatup-theme', sync);
  }, []);
  const chatLink = `/chat?mode=${mode}${selected.length ? `&interests=${encodeURIComponent(selected.map((x) => x.split(' ').slice(1).join(' ')).join(','))}` : ''}`;
  return (
    <div className="landing">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="/chat?view=rooms">Explore rooms</a>
          <a href="#plans">Membership</a>
        </nav>
        <div className="header-actions">
          <button
            className="icon-button"
            onClick={() => {
              const next = !dark;
              setDark(next);
              applyTheme(next);
              localStorage.setItem('elsewhere-theme', next ? 'dark' : 'light');
            }}
            aria-label={dark ? 'Use light theme' : 'Use dark theme'}
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          <a
            className="sign-in-link"
            href={
              signedIn === false
                ? '/chat?auth=signin'
                : signedIn
                  ? '/chat?view=settings'
                  : '/chat'
            }
          >
            {signedIn === false
              ? 'Log in'
              : signedIn
                ? 'My account'
                : 'Open chat'}
          </a>
          <a className="button button-dark button-small" href={chatLink}>
            Let’s talk <ArrowUpRight size={16} />
          </a>
        </div>
      </header>
      <main id="main">
        <section className="hero wrap">
          <div className="hero-copy">
            <div className="eyebrow">
              <span className="live-dot" /> LESS SCROLLING. MORE CONNECTING.
            </div>
            <h1>
              A hello can go
              <br />
              <span className="serif-word">anywhere.</span>
              <span className="hero-asterisk" aria-hidden="true">
                ✳
              </span>
            </h1>
            <p className="hero-description">
              There’s a whole world outside your circle.
              <br className="desktop-break" /> Meet someone new. Find your kind
              of weird.
              <br className="desktop-break" /> See where the conversation takes
              you.
            </p>
            <div className="hero-controls">
              <Tabs value={mode} onValueChange={(v) => setMode(String(v))}>
                <TabsList className="mode-tabs">
                  <TabsTrigger value="text">
                    <MessageCircle /> Text
                  </TabsTrigger>
                  <TabsTrigger value="voice">
                    <AudioLines /> Voice
                  </TabsTrigger>
                  <TabsTrigger value="video">
                    <Video /> Video
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <a className="button button-primary start-button" href={chatLink}>
                Start chatting <ArrowUpRight />
              </a>
            </div>
            <div className="hero-footnote">
              <Zap size={14} /> Jump right in. No account needed.{' '}
              <span>18+</span>
            </div>
          </div>
          <div
            className="conversation-art"
            aria-label="Illustration of a conversation about music"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="floating-label label-world">
              <Globe2 size={16} /> A world of possibilities
            </div>
            <div className="chat-preview">
              <div className="preview-header">
                <div className="avatar avatar-orange">J</div>
                <div>
                  <strong>A new connection</strong>
                  <span>
                    <span className="live-dot" /> You both love music
                  </span>
                </div>
                <div className="preview-dots">•••</div>
              </div>
              <div className="preview-messages">
                <span className="sample-label">
                  A conversation could start like this
                </span>
                <div className="bubble bubble-in">
                  Okay, important question…
                </div>
                <div className="bubble bubble-in">
                  What song are you playing on repeat? 🎧
                </div>
                <div className="bubble bubble-out">
                  Depends. Are we talking 2am or road trip?
                </div>
                <div className="bubble bubble-in">
                  I already like this conversation 😂
                </div>
                <div className="typing-dots">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
              <div className="preview-composer">
                <span>Say something good…</span>
                <span>
                  <ArrowUpRight size={18} />
                </span>
              </div>
            </div>
            <div className="floating-label label-game">
              <span className="mini-icon">
                <Gamepad2 size={20} />
              </span>
              <div>
                <strong>Break the ice. Play a little.</strong>
                <span>Your next rival could be your next friend.</span>
              </div>
            </div>
            <div className="floating-spark" aria-hidden="true">
              ✳
            </div>
          </div>
        </section>
        <section
          className="interest-strip wrap"
          aria-labelledby="interests-title"
        >
          <div>
            <span className="eyebrow">FIND YOUR COMMON GROUND</span>
            <h2 id="interests-title">What are you into?</h2>
            <p>Pick a few things. Start one good conversation.</p>
          </div>
          <div className="interest-pills">
            {interests.map((interest) => (
              <button
                key={interest}
                className={`interest-pill ${selected.includes(interest) ? 'selected' : ''}`}
                aria-pressed={selected.includes(interest)}
                onClick={() =>
                  setSelected((prev) =>
                    prev.includes(interest)
                      ? prev.filter((x) => x !== interest)
                      : [...prev, interest],
                  )
                }
              >
                {interest}
                {selected.includes(interest) && <Check size={14} />}
              </button>
            ))}
            <a href="/chat" className="interest-more">
              Find your thing <ArrowRight size={16} />
            </a>
          </div>
        </section>
        <section className="possibilities wrap" id="how-it-works">
          <div className="section-heading">
            <div>
              <span className="eyebrow">GO BEYOND “HEY”</span>
              <h2>
                Different people.
                <br />
                <span className="serif-word">Endless possibilities.</span>
              </h2>
            </div>
            <p>
              A quick chat, a friendly game, or a conversation
              <br className="desktop-break" /> that makes you forget to check
              the time.
            </p>
          </div>
          <div className="feature-grid">
            <a className="feature-card feature-chat" href="/chat">
              <MessageCircle className="feature-icon" />
              <div>
                <span className="mini-tag">ONE TO ONE</span>
                <h3>
                  Your next favorite
                  <br />
                  conversation.
                </h3>
                <p>
                  Text, talk, or turn your camera on. Choose your pace and meet
                  someone new.
                </p>
              </div>
              <span className="card-arrow">
                <ArrowUpRight />
              </span>
            </a>
            <a className="feature-card feature-rooms" href="/chat?view=rooms">
              <Users className="feature-icon" />
              <div>
                <span className="mini-tag">FIND YOUR PEOPLE</span>
                <h3>
                  A room for
                  <br />
                  your kind of curious.
                </h3>
                <p>
                  Drop into a shared space for music, games, deep thoughts, and
                  everything between.
                </p>
              </div>
              <span className="card-arrow">
                <ArrowUpRight />
              </span>
            </a>
            <a className="feature-card feature-games" href="/chat?view=games">
              <Gamepad2 className="feature-icon" />
              <div>
                <span className="mini-tag">A LITTLE FRIENDLY COMPETITION</span>
                <h3>
                  Less small talk.
                  <br />
                  More “your turn.”
                </h3>
                <p>
                  Play tic-tac-toe or Connect Four together. Sometimes a game
                  says hello for you.
                </p>
              </div>
              <span className="card-arrow">
                <ArrowUpRight />
              </span>
            </a>
          </div>
        </section>
        <section className="trust-strip wrap">
          <div>
            <ShieldCheck />
            <span>
              <strong>Good connections start with respect.</strong>
              <small>
                Easy reporting. One-tap blocking. You’re always in control.
              </small>
            </span>
          </div>
          <a href="/safety">
            Our community promise <ArrowUpRight size={18} />
          </a>
        </section>
        <section id="plans" className="plans-section wrap">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR WORLD, A LITTLE BIGGER</span>
              <h2>
                Free to connect.
                <br />
                <span className="serif-word">More when you want it.</span>
              </h2>
            </div>
            <Tabs
              value={yearly ? 'yearly' : 'monthly'}
              onValueChange={(v) => setYearly(v === 'yearly')}
            >
              <TabsList className="billing-tabs">
                <TabsTrigger value="monthly">Monthly</TabsTrigger>
                <TabsTrigger value="yearly">
                  Yearly <span className="save-badge">−20%</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="pricing-grid">
            {[
              {
                name: 'Free',
                price: 0,
                subtitle: 'Follow your curiosity.',
                items: [
                  'Unlimited text conversations',
                  'Voice & video matching',
                  '5 interests to find common ground',
                  'Friends, rooms & games',
                  '5 recent matches',
                  'Include 3 countries · exclude 3',
                ],
              },
              {
                name: 'Basic',
                price: 5,
                subtitle: 'Find more of your people.',
                items: [
                  'Everything in Free',
                  'Priority matching & gender filter',
                  'Include 5 countries · exclude 5',
                  'Near me matching',
                  'Send images in your chats',
                  '8 extra interests · 15 recent matches',
                  'Optional Basic profile badge',
                ],
              },
              {
                name: 'Plus',
                price: 10,
                subtitle: 'A little extra, everywhere.',
                items: [
                  'Everything in Basic',
                  'Send videos & images',
                  'Include 10 countries · exclude 10',
                  '15 extra interests · 25 recent matches',
                  'Optional Plus badge',
                  'Ad-free experience & priority support',
                ],
              },
            ].map((plan) => (
              <article
                className={`pricing-card ${plan.name === 'Plus' ? 'pricing-plus' : ''}`}
                key={plan.name}
              >
                <div className="plan-name">
                  <h3>{plan.name}</h3>
                  {plan.name === 'Plus' && (
                    <span>
                      <Sparkles size={14} /> THE FULL EXPERIENCE
                    </span>
                  )}
                </div>
                <p>{plan.subtitle}</p>
                <div className="price">
                  ${yearly ? plan.price * 0.8 : plan.price}
                  <span>USD / month</span>
                </div>
                {plan.price > 0 && (
                  <small>
                    {yearly
                      ? `$${(plan.price * 12 * 0.8).toFixed(2)} billed yearly`
                      : 'Billed monthly. Cancel anytime.'}
                  </small>
                )}
                <a
                  className={`button ${plan.name === 'Plus' ? 'button-primary' : 'button-outline'}`}
                  href={
                    plan.name === 'Free'
                      ? '/chat'
                      : `/chat?plan=${plan.name.toLowerCase()}&billing=${yearly ? 'yearly' : 'monthly'}`
                  }
                >
                  {plan.name === 'Free'
                    ? 'Start for free'
                    : `Choose ${plan.name}`}
                  <ArrowUpRight size={18} />
                </a>
                <ul>
                  {plan.items.map((item) => (
                    <li key={item}>
                      <Check size={16} />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
          <p className="pricing-note">
            Paid plans activate after secure checkout. Manage or cancel your
            membership at any time.
          </p>
        </section>
        <section className="faq-section wrap">
          <div>
            <span className="eyebrow">A LITTLE GOOD TO KNOW</span>
            <h2>
              Before you
              <br />
              <span className="serif-word">say hello.</span>
            </h2>
          </div>
          <div className="faq-list">
            {[
              [
                'Do I need an account?',
                'No. Start as a guest with a randomly generated name. Create an account when you want to keep your profile and connections across devices. Guest access belongs to this browser, so clearing cookies can lose access.',
              ],
              [
                'Who will I meet?',
                'Meet other adults through shared interests or chance. Matching depends on who is around.',
              ],
              [
                'Can I keep a good conversation going?',
                'Send a friend request. Once they accept, you can find each other in Friends and message again, including as a guest.',
              ],
              [
                'Is ChatUp free?',
                'Yes. Text, voice, video, friends, rooms, and games are available on Free. Basic and Plus add matching controls, media sharing, and more room for your interests.',
              ],
            ].map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown size={18} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="closing-cta wrap">
          <Compass size={36} />
          <h2>
            Your next connection
            <br />
            starts with <span className="serif-word">hello.</span>
          </h2>
          <a className="button button-dark" href={chatLink}>
            Meet someone new <ArrowUpRight size={20} />
          </a>
          <p>No pressure. Just possibilities.</p>
        </section>
      </main>
      <footer className="site-footer wrap">
        <div>
          <Brand />
          <p>A little curiosity. A new connection.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/safety">Safety</a>
          <a href="/chat?view=settings">Preferences</a>
        </nav>
        <span>
          Made for a more connected world. <Heart size={14} />
        </span>
      </footer>
    </div>
  );
}
