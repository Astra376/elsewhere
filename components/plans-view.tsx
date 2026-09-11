'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Check,
  CreditCard,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { plans, annualPrice, type Profile } from '@/lib/domain';
import { api, errorText, type AppConfig } from '@/lib/client';
import { PageHeading } from './chat-app';
export function PlansView({
  profile,
  config,
  onAuth,
  onError,
}: {
  profile: Profile;
  config: AppConfig;
  onAuth: () => void;
  onError: (message: string) => void;
}) {
  const [yearly, setYearly] = useState(false),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    setYearly((params.get('billing') ?? params.get('interval')) === 'yearly');
  }, []);
  async function checkout(plan: 'basic' | 'plus') {
    if (profile.guest) {
      onAuth();
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ url: string }>('/billing/checkout', {
        method: 'POST',
        body: JSON.stringify({
          plan,
          interval: yearly ? 'yearly' : 'monthly',
          requestId: crypto.randomUUID(),
        }),
      });
      if (result.url) location.assign(result.url);
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-view plans-view">
      <PageHeading
        eyebrow="YOUR WORLD, A LITTLE BIGGER"
        title="More room for connection."
        description="Always free to say hello. A little extra when you want it."
      />
      <Tabs
        value={yearly ? 'yearly' : 'monthly'}
        onValueChange={(v) => setYearly(v === 'yearly')}
      >
        <TabsList className="billing-tabs">
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="yearly">
            Yearly<span className="save-badge">Save 20%</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="pricing-grid">
        {(Object.keys(plans) as (keyof typeof plans)[]).map((key) => {
          const plan = plans[key],
            features =
              key === 'free'
                ? [
                    'Text, voice, and video matching',
                    '5 interests',
                    'Include 3 countries · exclude 3',
                    '5 recent connections',
                    'Friends, chat rooms, and games',
                  ]
                : key === 'basic'
                  ? [
                      'Everything in Free',
                      'Include 5 countries · exclude 5',
                      'Near me matching (100 km)',
                      'Priority matching',
                      'Gender preferences',
                      'Share images',
                      '13 total interests',
                      '15 recent connections',
                      'Optional Basic badge',
                    ]
                  : [
                      'Everything in Basic',
                      'Include 10 countries · exclude 10',
                      'Share videos and images',
                      '20 total interests',
                      '25 recent connections',
                      'Optional Plus badge',
                      'Ad-free experience',
                      'Priority support',
                    ];
          return (
            <article
              className={`pricing-card ${key === 'plus' ? 'pricing-plus' : ''}`}
              key={key}
            >
              <div className="plan-name">
                <h3>{plan.name}</h3>
                {key === 'plus' && <Sparkles size={20} />}
              </div>
              <p>
                {key === 'free'
                  ? 'Follow your curiosity.'
                  : key === 'basic'
                    ? 'Find more of your people.'
                    : 'The full ChatUp experience.'}
              </p>
              <div className="price">
                ${yearly ? plan.monthly * 0.8 : plan.monthly}
                <span>USD / month</span>
              </div>
              <small>
                {key === 'free'
                  ? 'Free, always.'
                  : yearly
                    ? `$${annualPrice(key).toFixed(2)} billed yearly`
                    : 'Billed monthly. Cancel anytime.'}
              </small>
              <button
                className={`button ${key === 'plus' ? 'button-primary' : 'button-outline'}`}
                disabled={busy || key === 'free' || key === profile.plan}
                onClick={() => key !== 'free' && void checkout(key)}
              >
                {key === profile.plan
                  ? 'Your current plan'
                  : key === 'free'
                    ? 'Included for everyone'
                    : `Choose ${plan.name}`}
                {key !== profile.plan && key !== 'free' && (
                  <ArrowUpRight size={17} />
                )}
              </button>
              <ul>
                {features.map((item) => (
                  <li key={item}>
                    <Check size={15} />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
      {!config.billing && (
        <div className="info-panel">
          <CreditCard size={20} />
          <p>
            Paid memberships are coming soon. Free conversations, friends, and
            games are available now. You won’t be charged until checkout is live
            and you confirm a purchase.
          </p>
        </div>
      )}
      <div className="billing-footer">
        <span>
          <ShieldCheck size={18} /> Secure checkout with Stripe. Cancel anytime.
        </span>
        {!profile.guest && (
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const p = await api<{ url: string }>('/billing/portal', {
                  method: 'POST',
                  body: '{}',
                });
                location.assign(p.url);
              } catch (e) {
                onError(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Manage billing <ArrowUpRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
