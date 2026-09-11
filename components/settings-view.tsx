'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Camera,
  Check,
  LogOut,
  Plus,
  ShieldCheck,
  Trash2,
  User,
  Lock,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Avatar, Choice, ToggleRow } from './app-primitives';
import { PageHeading } from './chat-app';
import { api, clearBootstrap, errorText, type AppConfig } from '@/lib/client';
import {
  plans,
  type Profile,
  type Preferences,
  type ProfilePatch,
} from '@/lib/domain';
import { setPushEnabled } from '@/lib/push';
export function AccountSettings({
  profile,
  config,
  onUpdate,
  onPreference,
  onAuth,
  onPlans,
  onError,
}: {
  profile: Profile;
  config: AppConfig;
  onUpdate: (change: ProfilePatch) => Promise<Profile>;
  onPreference: (key: keyof Preferences, value: boolean) => Promise<void>;
  onAuth: () => void;
  onPlans: () => void;
  onError: (text: string) => void;
}) {
  const [draft, setDraft] = useState(profile),
    [tab, setTab] = useState('profile'),
    [interest, setInterest] = useState(''),
    [busy, setBusy] = useState(false),
    [deleteOpen, setDeleteOpen] = useState(false),
    [confirm, setConfirm] = useState(''),
    [blocks, setBlocks] = useState<
      { id: string; username: string; avatar: string }[]
    >([]);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(profile), [profile]);
  useEffect(() => {
    if (tab === 'privacy')
      api<typeof blocks>('/blocks')
        .then(setBlocks)
        .catch((e) => onError(errorText(e)));
  }, [tab, onError]);
  async function save() {
    setBusy(true);
    try {
      await onUpdate({
        username: draft.username,
        avatar: draft.avatar,
        banner: draft.banner,
        gender: draft.gender,
        interests: draft.interests,
      });
      onError('Your profile is saved.');
    } catch (e) {
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page-view settings-page">
      <PageHeading
        eyebrow="YOUR LITTLE CORNER"
        title="Make yourself at home."
        description="A profile that feels like you. Preferences that work for you."
      />
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
        <TabsList className="settings-tabs">
          <TabsTrigger value="profile">
            <User size={16} />
            Profile
          </TabsTrigger>
          <TabsTrigger value="privacy">
            <Lock size={16} />
            Privacy
          </TabsTrigger>
          <TabsTrigger value="preferences">
            <SlidersHorizontal size={16} />
            Preferences
          </TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <section className="settings-card profile-editor">
            <div className={`profile-banner banner-${draft.banner}`}>
              <span>Your next chapter starts here.</span>
            </div>
            <div className="profile-editor-content">
              <div className="profile-avatar-row">
                <Avatar person={draft} size="large" />
                <button
                  className="button button-outline button-small"
                  onClick={() => file.current?.click()}
                >
                  <Camera size={16} />
                  Change photo
                </button>
                <input
                  ref={file}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={async (e) => {
                    const selected = e.target.files?.[0];
                    if (!selected) return;
                    setBusy(true);
                    try {
                      const result = await api<{ url: string }>(
                        '/upload?purpose=avatar',
                        { method: 'POST', body: selected },
                      );
                      setDraft((d) => ({ ...d, avatar: result.url }));
                    } catch (error) {
                      onError(errorText(error));
                    } finally {
                      setBusy(false);
                      e.target.value = '';
                    }
                  }}
                />
              </div>
              <div className="avatar-picker">
                {[
                  '🪐',
                  '🌻',
                  '🍊',
                  '🦊',
                  '🐼',
                  '🌊',
                  '🌵',
                  '🦋',
                  '🎮',
                  '🐙',
                  '🌈',
                  '☕',
                ].map((avatar) => (
                  <button
                    key={avatar}
                    className={draft.avatar === avatar ? 'selected' : ''}
                    aria-label={`Use ${avatar} avatar`}
                    aria-pressed={draft.avatar === avatar}
                    onClick={() => setDraft((d) => ({ ...d, avatar }))}
                  >
                    {avatar}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <label className="form-field">
                  Username
                  <input
                    value={draft.username}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, username: e.target.value }))
                    }
                    minLength={3}
                    maxLength={24}
                  />
                </label>
                <Choice
                  label="Gender"
                  value={draft.gender}
                  onChange={(gender) => setDraft((d) => ({ ...d, gender }))}
                  options={[
                    { value: 'undisclosed', label: 'Prefer not to say' },
                    { value: 'woman', label: 'Woman' },
                    { value: 'man', label: 'Man' },
                    { value: 'nonbinary', label: 'Nonbinary' },
                  ]}
                />
              </div>
              <div className="form-field">
                <span id="banner-label">Banner color</span>
                <div
                  className="banner-picker"
                  role="group"
                  aria-labelledby="banner-label"
                >
                  {['violet', 'ocean', 'sunset', 'forest', 'rose', 'slate'].map(
                    (banner) => (
                      <button
                        key={banner}
                        className={`banner-${banner} ${draft.banner === banner ? 'selected' : ''}`}
                        aria-label={`${banner} banner`}
                        aria-pressed={draft.banner === banner}
                        onClick={() => setDraft((d) => ({ ...d, banner }))}
                      >
                        {draft.banner === banner && <Check size={16} />}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="form-field">
                <label>
                  Your interests{' '}
                  <span>
                    {draft.interests.length}/{plans[profile.plan].interests}
                  </span>
                </label>
                <div className="editable-interests">
                  {draft.interests.map((i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setDraft((d) => ({
                          ...d,
                          interests: d.interests.filter((x) => x !== i),
                        }))
                      }
                    >
                      {i}
                      <X size={12} />
                    </button>
                  ))}
                </div>
                <form
                  className="interest-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const value = interest.trim().toLowerCase();
                    if (
                      value &&
                      !draft.interests.includes(value) &&
                      draft.interests.length < plans[profile.plan].interests
                    ) {
                      setDraft((d) => ({
                        ...d,
                        interests: [...d.interests, value],
                      }));
                      setInterest('');
                    }
                  }}
                >
                  <input
                    placeholder="Add something you love"
                    aria-label="Add profile interest"
                    maxLength={24}
                    value={interest}
                    onChange={(e) => setInterest(e.target.value)}
                  />
                  <button aria-label="Add profile interest">
                    <Plus size={18} />
                  </button>
                </form>
              </div>
              <div className="settings-save">
                <p>Your interests help you find common ground.</p>
                <button
                  className="button button-primary"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  {busy ? 'Saving…' : 'Save changes'}
                  <Check size={17} />
                </button>
              </div>
            </div>
          </section>
          <section className="settings-card standing-card">
            <div className="setting-section-title">
              <ShieldCheck size={22} />
              <div>
                <h2>Account standing</h2>
                <p>
                  {profile.standing === 'good'
                    ? 'All good. Thanks for making this a kind place to connect.'
                    : 'Check your notifications for details about your account standing.'}
                </p>
              </div>
              <span className={`standing-badge standing-${profile.standing}`}>
                {profile.standing === 'good'
                  ? 'All good'
                  : profile.standing.replace('-', ' ')}
              </span>
            </div>
            <div className="standing-scale">
              {['good', 'warning', 'limited', 'at-risk', 'suspended'].map(
                (state) => (
                  <span
                    key={state}
                    className={state === profile.standing ? 'current' : ''}
                  >
                    <i />
                    {state === 'good'
                      ? 'All good'
                      : state === 'at-risk'
                        ? 'At risk'
                        : state.charAt(0).toUpperCase() + state.slice(1)}
                  </span>
                ),
              )}
            </div>
          </section>
          <section className="settings-card account-card">
            <div>
              <h2>
                {profile.guest ? 'Make this profile yours.' : profile.email}
              </h2>
              <p>
                {profile.guest
                  ? 'Create an account to keep your connections across devices.'
                  : `${plans[profile.plan].name} membership`}
              </p>
            </div>
            <button
              className="button button-outline"
              onClick={profile.guest ? onAuth : onPlans}
            >
              {profile.guest ? 'Create an account' : 'Manage membership'}
              <ArrowUpRight size={17} />
            </button>
          </section>
        </TabsContent>
        <TabsContent value="privacy">
          <section className="settings-card settings-list">
            <h2>Your profile, your boundaries.</h2>
            <ToggleRow
              title="Show my membership badge"
              requiredPlan="basic"
              description="Your Basic or Plus badge appears beside your name."
              checked={profile.preferences.badgeVisible}
              onChange={(v) => void onPreference('badgeVisible', v)}
            />
            <ToggleRow
              title="Show my interests"
              description="Let connections see your interests on your profile."
              checked={profile.preferences.interestsVisible}
              onChange={(v) => void onPreference('interestsVisible', v)}
            />
            <ToggleRow
              title="Allow friend requests"
              description="People you meet can ask to stay in touch."
              checked={profile.preferences.friendRequests}
              onChange={(v) => void onPreference('friendRequests', v)}
            />
            <div className="settings-text">
              <h3>AI conversations are your choice.</h3>
              <p>
                Choose “People only” in matching preferences to meet human
                participants. AI companions are always labeled and only
                available in text mode.
              </p>
            </div>
          </section>
          <section className="settings-card settings-list">
            <h2>Blocked accounts</h2>
            {blocks.length ? (
              blocks.map((person) => (
                <div className="blocked-row" key={person.id}>
                  <Avatar person={person} />
                  <strong>{person.username}</strong>
                  <button
                    className="button button-outline button-small"
                    onClick={async () => {
                      try {
                        await api('/blocks', {
                          method: 'DELETE',
                          body: JSON.stringify({ peerId: person.id }),
                        });
                        setBlocks((b) => b.filter((x) => x.id !== person.id));
                      } catch (e) {
                        onError(errorText(e));
                      }
                    }}
                  >
                    Unblock
                  </button>
                </div>
              ))
            ) : (
              <p className="settings-description">
                You haven’t blocked anyone.
              </p>
            )}
          </section>
          <section className="settings-card danger-zone">
            <div>
              <h2>Delete account</h2>
              <p>
                Permanently delete your profile, connections, and uploaded
                media. This cannot be undone.
              </p>
            </div>
            <button
              className="button button-danger-outline"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 size={17} />
              Delete account
            </button>
          </section>
        </TabsContent>
        <TabsContent value="preferences">
          <section className="settings-card settings-list">
            <h2>The little things, your way.</h2>
            <ToggleRow
              title="Auto emoticons to emoji"
              description="Turn :) into 🙂 as you send a message."
              checked={profile.preferences.autoEmoji}
              onChange={(v) => void onPreference('autoEmoji', v)}
            />
            <ToggleRow
              title="Blur incoming images and videos"
              description="Tap an attachment to reveal it when you’re ready."
              checked={profile.preferences.blurImages}
              onChange={(v) => void onPreference('blurImages', v)}
            />
            <ToggleRow
              title="Notification sounds"
              description="A little sound when a new message arrives."
              checked={profile.preferences.sound}
              onChange={(v) => void onPreference('sound', v)}
            />
            <ToggleRow
              title="Push notifications"
              description={
                config.push
                  ? 'Get updates when ChatUp is in the background.'
                  : 'Available after notification delivery is connected.'
              }
              checked={profile.preferences.push}
              disabled={!config.push}
              onChange={async (v) => {
                try {
                  await setPushEnabled(v, config.vapidPublicKey);
                  await onPreference('push', v);
                } catch (error) {
                  onError(errorText(error));
                }
              }}
            />
            <ToggleRow
              title="Dark mode"
              description="Follows your system until you choose a theme."
              checked={profile.preferences.darkMode}
              onChange={(v) => void onPreference('darkMode', v)}
            />
            <button
              type="button"
              className="button button-small"
              onClick={() => {
                localStorage.removeItem('elsewhere-theme');
                window.dispatchEvent(new Event('storage'));
              }}
            >
              Use system theme
            </button>
          </section>
          <section className="settings-card settings-list">
            <h2>Take ChatUp with you.</h2>
            <p className="settings-description">
              On iPhone or iPad, tap Share in Safari, then Add to Home Screen.
              On Android, open your browser menu and choose Install app.
            </p>
            <div className="settings-links">
              <a href="/privacy">
                Privacy policy
                <ArrowUpRight size={17} />
              </a>
              <a href="/terms">
                Terms of service
                <ArrowUpRight size={17} />
              </a>
              <a href="/safety">
                Community and safety
                <ArrowUpRight size={17} />
              </a>
              <a href="/support">
                Support and appeals
                <ArrowUpRight size={17} />
              </a>
              {profile.moderator && (
                <a href="/moderation">
                  Moderation console
                  <ArrowUpRight size={17} />
                </a>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
      <button
        className="logout-button"
        onClick={async () => {
          try {
            await api('/auth/sign-out', { method: 'POST', body: '{}' });
            clearBootstrap();
            sessionStorage.removeItem('elsewhere-active-chat');
            location.assign('/');
          } catch (e) {
            onError(errorText(e));
          }
        }}
      >
        <LogOut size={18} />
        Log out
        {profile.guest && (
          <span>Guest access is tied to this browser session.</span>
        )}
      </button>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent className="app-dialog">
          <AlertDialogTitle>Delete your account permanently?</AlertDialogTitle>
          <AlertDialogDescription>
            Your profile, friends, and media will be removed. Cancel any paid
            subscription first. Type DELETE to confirm.
          </AlertDialogDescription>
          <input
            className="confirm-input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-label="Type DELETE to confirm"
            autoComplete="off"
          />
          <div className="dialog-actions">
            <AlertDialogCancel className="button button-outline">
              Keep my account
            </AlertDialogCancel>
            <button
              className="button button-danger"
              disabled={confirm !== 'DELETE' || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api('/account', {
                    method: 'DELETE',
                    body: JSON.stringify({ confirmation: 'DELETE' }),
                  });
                  clearBootstrap();
                  sessionStorage.clear();
                  location.assign('/');
                } catch (e) {
                  onError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Delete permanently
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
