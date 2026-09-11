'use client';
import { preferredDark, applyTheme } from '@/lib/theme';
import { LocationPreferences } from './location-preferences';
import { PlanRequirement } from './plan-requirement';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Bell,
  Check,
  ChevronRight,
  Compass,
  Gamepad2,
  History,
  ImagePlus,
  Info,
  LoaderCircle,
  MessageCircle,
  Moon,
  Plus,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SkipForward,
  SlidersHorizontal,
  Smile,
  Sparkles,
  Sun,
  UserPlus,
  Users,
  Video,
  Volume2,
  VolumeX,
  WifiOff,
  X,
  Flag,
} from 'lucide-react';
import { Sidebar, SidebarProvider } from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Brand } from './brand';
import {
  Avatar,
  Badge,
  Choice,
  Empty,
  Loading,
  ToggleRow,
} from './app-primitives';
import { AccountSettings } from './settings-view';
import { SocialView } from './social-view';
import { PlansView } from './plans-view';
import { AuthDialog } from './auth-dialog';
import { GamePanel } from './game-panel';
import { CallPanel } from './call-panel';
import { InstallPrompt } from './install-prompt';
import {
  api,
  bootstrap,
  clearBootstrap,
  ClientError,
  errorText,
  type AppConfig,
} from '@/lib/client';
import {
  autoEmoji,
  plans,
  roomCatalog,
  type Profile,
  type Conversation,
  type ChatMessage,
  type MatchOptions,
  type Game,
  type Preferences,
  type ProfilePatch,
} from '@/lib/domain';
import { useConversation, type ChatEvent } from '@/hooks/use-conversation';
import { useWebMCP } from '@/hooks/use-webmcp';
import { flushSync } from 'react-dom';
import './chat.css';

type View =
  | 'chat'
  | 'rooms'
  | 'friends'
  | 'history'
  | 'games'
  | 'settings'
  | 'plans';
type Notice = {
  id: string;
  text: string;
  type: string;
  readAt: number | null;
  targetId: string | null;
  createdAt: number;
};
const navigation = [
  { id: 'chat', label: 'Meet someone', icon: Compass },
  { id: 'rooms', label: 'Explore rooms', icon: Users },
  { id: 'friends', label: 'Friends & messages', icon: MessageCircle },
  { id: 'history', label: 'Recent connections', icon: History },
  { id: 'games', label: 'Play together', icon: Gamepad2 },
] as const;
const defaultOptions: MatchOptions = {
  includeCountries: [],
  excludeCountries: [],
  nearMe: false,
  mode: 'text',
  interests: [],
  interestMatch: false,
  waitSeconds: 10,
  genderFilter: 'any',
  partnerType: 'human',
};

export function ChatApp() {
  const [profile, setProfile] = useState<Profile | null>(null),
    [config, setConfig] = useState<AppConfig | null>(null),
    [view, setView] = useState<View>('chat'),
    [chat, setChat] = useState<Conversation | null>(null),
    [options, setOptions] = useState<MatchOptions>(defaultOptions),
    [bootError, setBootError] = useState(''),
    [toast, setToast] = useState(''),
    [authOpen, setAuthOpen] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [noticesOpen, setNoticesOpen] = useState(false),
    [notices, setNotices] = useState<Notice[]>([]),
    [queue, setQueue] = useState<{
      joinedAt: number;
      interestOnly: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [game, setGame] = useState<Game | null>(null),
    [showGame, setShowGame] = useState(false),
    [callOpen, setCallOpen] = useState(false),
    [reportOpen, setReportOpen] = useState(false),
    [refresh, setRefresh] = useState(0);
  const [ageOpen, setAgeOpen] = useState(false),
    [ageConfirmed, setAgeConfirmed] = useState(false);
  const afterConsent = useRef<(() => Promise<unknown>) | null>(null);
  const [draft, setDraft] = useState(''),
    [interestDraft, setInterestDraft] = useState(''),
    [reportReason, setReportReason] = useState('harassment'),
    [reportDetails, setReportDetails] = useState('');
  const bottom = useRef<HTMLDivElement>(null),
    uploadRef = useRef<HTMLInputElement>(null),
    toastTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    mounted = useRef(true),
    signalHandler = useRef<((event: ChatEvent) => void) | null>(null),
    lastTyping = useRef(0);
  const flash = useCallback((text: string) => {
    setToast(text);
    clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(''), 6000);
  }, []);
  const navigate = useCallback((next: View) => {
    setView(next);
    const url = new URL(location.href);
    if (next === 'chat') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    for (const key of ['auth', 'plan', 'checkout', 'conversation'])
      url.searchParams.delete(key);
    history.replaceState(null, '', url.pathname + url.search);
  }, []);
  const pendingPreferences = useRef<Partial<Preferences>>({});
  const confirmedPreferences = useRef<Partial<Preferences>>({});
  const preferenceVersions = useRef<Partial<Record<keyof Preferences, number>>>(
    {},
  );
  const profileQueue = useRef<Promise<unknown>>(Promise.resolve());
  const updateProfile = useCallback((change: ProfilePatch) => {
    const work = profileQueue.current.then(async () => {
      const saved = await api<Profile>('/profile', {
        method: 'PATCH',
        body: JSON.stringify(change),
      });
      confirmedPreferences.current = { ...saved.preferences };
      setProfile({
        ...saved,
        preferences: {
          ...saved.preferences,
          ...pendingPreferences.current,
          darkMode: preferredDark(),
        },
      });
      return saved;
    });
    profileQueue.current = work.catch(() => {});
    return work;
  }, []);
  const preference = useCallback(
    async (key: keyof Preferences, value: boolean) => {
      const previous = profile?.preferences[key] ?? false;
      const version = (preferenceVersions.current[key] ?? 0) + 1;
      preferenceVersions.current[key] = version;
      pendingPreferences.current[key] = value;
      setProfile((p) =>
        p ? { ...p, preferences: { ...p.preferences, [key]: value } } : p,
      );
      if (key === 'darkMode') {
        applyTheme(value);
        localStorage.setItem('elsewhere-theme', value ? 'dark' : 'light');
      }
      try {
        await updateProfile({ preferences: { [key]: value } });
        if (preferenceVersions.current[key] === version)
          delete pendingPreferences.current[key];
      } catch (error) {
        if (preferenceVersions.current[key] === version) {
          delete pendingPreferences.current[key];
          const rollback = confirmedPreferences.current[key] ?? previous;
          setProfile((p) =>
            p
              ? { ...p, preferences: { ...p.preferences, [key]: rollback } }
              : p,
          );
          if (key === 'darkMode') {
            applyTheme(rollback);
            localStorage.setItem(
              'elsewhere-theme',
              rollback ? 'dark' : 'light',
            );
          }
          flash('Could not save that setting. ' + errorText(error));
        }
      }
    },
    [updateProfile, flash, profile?.preferences],
  );
  const handleEvent = useCallback(
    (event: ChatEvent) => {
      if (event.type === 'left' && event.ended) {
        setChat((prev) => (prev ? { ...prev, endedAt: Date.now() } : null));
        setCallOpen(false);
        flash('This conversation has ended. A new hello is one tap away.');
      }
      if (event.type === 'game' && event.game) {
        setGame(event.game);
        setShowGame(true);
      }
      if (event.type === 'game_sync' && event.game)
        setGame((previous) =>
          !previous ||
          previous.id !== event.game!.id ||
          previous.revision < event.game!.revision
            ? event.game!
            : previous,
        );
      if (
        event.type === 'ai_error' ||
        event.type === 'send_error' ||
        event.type === 'error'
      )
        flash(event.error ?? 'Try again shortly.');
      if (event.type === 'signal') signalHandler.current?.(event);
      if (
        event.type === 'message' &&
        event.message?.senderId !== profile?.id &&
        profile?.preferences.sound
      )
        playSound();
    },
    [profile, flash],
  );
  const { messages, connection, typing, send, emit } = useConversation(
    chat,
    profile?.id ?? '',
    handleEvent,
  );
  useWebMCP(!!profile, {
    read: () => ({
      view,
      profile: profile
        ? {
            username: profile.username,
            plan: profile.plan,
            acceptedTerms: !!profile.acceptedAt,
          }
        : null,
      matching: options,
      queue: queue ? 'waiting' : 'idle',
      conversation: chat
        ? {
            id: chat.id,
            kind: chat.kind,
            mode: chat.mode,
            ended: !!chat.endedAt,
            connection,
          }
        : null,
    }),
    configure: async (next) => {
      if (!profile) throw new Error('Wait for your session to load.');
      if (queue)
        throw new Error(
          'Cancel the current search before changing preferences.',
        );
      if (next.mode !== 'text' && next.partnerType !== 'human')
        throw new Error('AI companions are text-only.');
      if (next.genderFilter !== 'any' && profile.plan === 'free')
        throw new Error('A membership is required for that filter.');
      if (next.partnerType !== 'human' && !config?.ai)
        throw new Error('AI companions are not available yet.');
      const saved = await updateProfile({ interests: next.interests });
      flushSync(() => {
        setOptions({ ...next, interests: saved.interests });
        navigate('chat');
      });
      return {
        status: 'configured',
        matching: { ...next, interests: saved.interests },
      };
    },
    start: async () => {
      if (!profile?.acceptedAt)
        throw new Error(
          'Confirm your age and accept the terms in the app first.',
        );
      if (busy) throw new Error('Another action is in progress.');
      const result = await startMatching();
      if (!result)
        throw new Error(
          'Matching could not start. Read the notice in the app.',
        );
      return result;
    },
  });
  const openChat = useCallback(
    async (id: string) => {
      const data = await api<Conversation>(`/chats/${encodeURIComponent(id)}`);
      setChat(data);
      setQueue(null);
      setDraft('');
      setGame(null);
      setShowGame(false);
      setCallOpen(false);
      navigate('chat');
      sessionStorage.setItem('elsewhere-active-chat', id);
      api<Game | null>(`/chats/${encodeURIComponent(id)}/games`)
        .then(setGame)
        .catch(() => {});
    },
    [navigate],
  );
  useEffect(() => {
    mounted.current = true;
    const params = new URLSearchParams(location.search);
    const initial = params.get('view');
    if (
      ['rooms', 'friends', 'history', 'games', 'settings', 'plans'].includes(
        initial ?? '',
      )
    )
      setView(initial as View);
    if (params.has('plan')) setView('plans');
    if (params.has('auth')) setAuthOpen(true);
    async function init() {
      try {
        const [me, settings] = await Promise.all([
          bootstrap(),
          api<AppConfig>('/config'),
        ]);
        if (!mounted.current) return;
        confirmedPreferences.current = { ...me.preferences };
        me.preferences.darkMode = preferredDark();
        setProfile(me);
        setConfig(settings);
        setAgeConfirmed(!!me.acceptedAt);
        const mode = ['text', 'voice', 'video'].includes(
          params.get('mode') ?? '',
        )
          ? (params.get('mode') as MatchOptions['mode'])
          : 'text';
        const incoming = (params.get('interests') ?? '')
          .split(',')
          .filter(Boolean);
        setOptions({
          ...defaultOptions,
          mode,
          interests: incoming.length
            ? incoming.slice(0, plans[me.plan].interests)
            : me.interests,
          interestMatch: incoming.length > 0,
        });
        applyTheme(preferredDark());
        const active =
          params.get('conversation') ??
          sessionStorage.getItem('elsewhere-active-chat');
        if (
          active &&
          (!params.has('view') || params.get('view') === 'chat') &&
          !params.has('plan') &&
          !params.has('auth')
        )
          await openChat(active).catch(() =>
            sessionStorage.removeItem('elsewhere-active-chat'),
          );
      } catch (error) {
        if (mounted.current) setBootError(errorText(error));
      }
    }
    void init();
    if ('serviceWorker' in navigator)
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {
      mounted.current = false;
      clearTimeout(toastTimeout.current);
    };
  }, [openChat, updateProfile]);
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    const load = () =>
      api<Notice[]>('/notifications')
        .then((n) => {
          if (alive) setNotices(n);
        })
        .catch(() => {});
    void load();
    const timer = setInterval(() => {
      void load();
      api('/me').catch(() => {});
    }, 20000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [profile?.id, refresh]);
  useEffect(() => {
    if (chat?.kind !== 'room') return;
    let alive = true;
    const timer = setInterval(() => {
      api<Conversation>(`/chats/${encodeURIComponent(chat.id)}`)
        .then((next) => {
          if (alive)
            setChat((previous) =>
              previous?.id === next.id
                ? { ...previous, peers: next.peers }
                : previous,
            );
        })
        .catch(() => {});
    }, 15000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [chat?.id, chat?.kind]);
  useEffect(() => {
    if (!queue?.joinedAt) return;
    let alive = true,
      pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await api<{
          status: string;
          chatId?: string;
          interestOnly?: boolean;
        }>('/match');
        if (!alive) return;
        if (result.status === 'matched' && result.chatId)
          await openChat(result.chatId);
        else if (result.status === 'waiting')
          setQueue((q) =>
            q ? { ...q, interestOnly: !!result.interestOnly } : q,
          );
        else if (result.status === 'idle') {
          setQueue(null);
          flash('That search has ended. Start again when you’re ready.');
        }
      } catch (error) {
        if (alive) {
          if (
            error instanceof ClientError &&
            [401, 403, 404].includes(error.status)
          )
            setQueue(null);
          flash(errorText(error));
        }
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(check, 2500),
      clock = setInterval(
        () => setElapsed(Math.floor((Date.now() - queue.joinedAt) / 1000)),
        1000,
      );
    void check();
    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [queue?.joinedAt, openChat, flash]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, typing]);
  async function startMatching(accepted = false) {
    if (!profile?.id) return;
    if (!profile.acceptedAt && !accepted) {
      afterConsent.current = () => startMatching(true);
      setAgeOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (leaving.current) await leaving.current;
      if (chat && !chat.endedAt) await leaveChat();
      if (options.nearMe && !options.location) {
        flash(
          'Choose a city or allow location access in matching preferences.',
        );
        setFiltersOpen(true);
        return;
      }
      if (
        JSON.stringify(profile.interests) !== JSON.stringify(options.interests)
      )
        await updateProfile({ interests: options.interests });
      const result = await api<{
        status: string;
        chatId?: string;
        joinedAt: number;
        interestOnly: boolean;
      }>('/match', { method: 'POST', body: JSON.stringify(options) });
      if (result.chatId) await openChat(result.chatId);
      else {
        setQueue({
          joinedAt: result.joinedAt,
          interestOnly: result.interestOnly,
        });
        setElapsed(0);
        setChat(null);
      }
      return {
        status: result.chatId ? 'matched' : 'waiting',
        chatId: result.chatId ?? null,
      };
    } catch (error) {
      flash(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  const leaving = useRef<Promise<void> | null>(null);
  async function leaveChat() {
    if (leaving.current) return leaving.current;
    const previousChat = chat;
    setChat(null);
    setQueue(null);
    setGame(null);
    setCallOpen(false);
    setShowGame(false);
    sessionStorage.removeItem('elsewhere-active-chat');
    const work = (async () => {
      if (previousChat && !previousChat.endedAt)
        await api(`/chats/${encodeURIComponent(previousChat.id)}/leave`, {
          method: 'POST',
          body: '{}',
        });
      else await api('/match', { method: 'DELETE' });
    })();
    leaving.current = work;
    try {
      await work;
    } catch (error) {
      if (previousChat) {
        setChat(previousChat);
        sessionStorage.setItem('elsewhere-active-chat', previousChat.id);
      }
      throw error;
    } finally {
      leaving.current = null;
    }
  }
  async function joinRoom(slug: string, accepted = false) {
    if (leaving.current) await leaving.current;
    if (!profile?.id) return;
    if (!profile.acceptedAt && !accepted) {
      afterConsent.current = () => joinRoom(slug, true);
      setAgeOpen(true);
      return;
    }
    setBusy(true);
    try {
      if (leaving.current) await leaving.current;
      if (chat && !chat.endedAt) await leaveChat();
      else if (queue) await api('/match', { method: 'DELETE' });
      const joined = await api<Conversation>('/rooms/join', {
        method: 'POST',
        body: JSON.stringify({ slug }),
      });
      await openChat(joined.id);
    } catch (error) {
      flash(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function cancelMatching() {
    const previous = queue;
    setQueue(null);
    setBusy(true);
    try {
      await api('/match', { method: 'DELETE' });
    } catch (error) {
      setQueue(previous);
      flash(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function submitMessage(event?: React.SyntheticEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!profile || !chat || !draft.trim() || chat.endedAt) return;
    const text = profile.preferences.autoEmoji
      ? autoEmoji(draft.trim())
      : draft.trim();
    setDraft('');
    emit({ type: 'typing', typing: false });
    await send({
      id: crypto.randomUUID(),
      chatId: chat.id,
      senderId: profile.id,
      text,
      createdAt: Date.now(),
      kind: 'text',
      sequence: 0,
    });
  }
  async function upload(file: File) {
    if (!chat || !profile) return;
    setBusy(true);
    try {
      const media = await api<{ id: string; kind: 'image' | 'video' }>(
        `/upload?chatId=${encodeURIComponent(chat.id)}`,
        { method: 'POST', body: file },
      );
      await send({
        id: crypto.randomUUID(),
        chatId: chat.id,
        senderId: profile.id,
        text: '',
        createdAt: Date.now(),
        kind: media.kind,
        mediaId: media.id,
        sequence: 0,
      });
    } catch (error) {
      flash(errorText(error));
    } finally {
      setBusy(false);
      if (uploadRef.current) uploadRef.current.value = '';
    }
  }
  async function addFriend() {
    const peer = chat?.peers[0];
    if (!peer || peer.ai) return;
    try {
      await api('/friends/request', {
        method: 'POST',
        body: JSON.stringify({ peerId: peer.id }),
      });
      flash('Friend request sent.');
      setRefresh((r) => r + 1);
    } catch (error) {
      flash(errorText(error));
    }
  }
  async function startGame(kind: 'tic-tac-toe' | 'connect-four') {
    if (!chat) {
      navigate('chat');
      flash('Start a conversation, then invite them to play.');
      return;
    }
    try {
      setGame(
        await api<Game>(`/chats/${encodeURIComponent(chat.id)}/games`, {
          method: 'POST',
          body: JSON.stringify({ action: 'start', kind }),
        }),
      );
      setShowGame(true);
    } catch (error) {
      flash(errorText(error));
    }
  }
  const peer = chat?.peers[0],
    unread = notices.filter((n) => !n.readAt).length;
  const filters = (
    <div className="match-filters">
      <div className="rail-title">
        <SlidersHorizontal size={17} />
        <h3>Your kind of connection</h3>
      </div>
      <div className="form-field">
        <label>
          Your interests
          <span>
            {options.interests.length}/
            {profile ? plans[profile.plan].interests : 5}
          </span>
        </label>
        <div className="editable-interests">
          {options.interests.map((interest) => (
            <button
              key={interest}
              onClick={() =>
                setOptions((o) => ({
                  ...o,
                  interests: o.interests.filter((i) => i !== interest),
                }))
              }
            >
              {interest}
              <X size={12} />
            </button>
          ))}
        </div>
        <form
          className="interest-input"
          onSubmit={(e) => {
            e.preventDefault();
            const value = interestDraft.trim().toLowerCase().slice(0, 24);
            if (
              value &&
              !options.interests.includes(value) &&
              options.interests.length <
                (profile ? plans[profile.plan].interests : 5)
            ) {
              setOptions((o) => ({ ...o, interests: [...o.interests, value] }));
              setInterestDraft('');
            }
          }}
        >
          <input
            value={interestDraft}
            onChange={(e) => setInterestDraft(e.target.value)}
            maxLength={24}
            placeholder="Add an interest"
            aria-label="Add an interest"
          />
          <button aria-label="Add interest">
            <Plus size={17} />
          </button>
        </form>
      </div>
      <p className="field-note">
        Extra interest slots: <PlanRequirement plan="basic" /> 13 total ·{' '}
        <PlanRequirement plan="plus" /> 20 total
      </p>
      <ToggleRow
        title="Match my interests"
        description="Start with something in common."
        checked={options.interestMatch}
        onChange={(v) => setOptions((o) => ({ ...o, interestMatch: v }))}
      />
      <Choice
        label="Wait for shared interests"
        value={String(options.waitSeconds)}
        onChange={(v) =>
          setOptions((o) => ({
            ...o,
            waitSeconds: Number(v) as MatchOptions['waitSeconds'],
          }))
        }
        options={[
          { value: '5', label: '5 seconds' },
          { value: '10', label: '10 seconds' },
          { value: '30', label: '30 seconds' },
          { value: '0', label: 'As long as it takes' },
        ]}
      />
      <Choice
        label="Who would you like to meet?"
        value={options.partnerType}
        disabled={options.mode !== 'text'}
        onChange={(v) =>
          setOptions((o) => ({
            ...o,
            partnerType: v as MatchOptions['partnerType'],
          }))
        }
        options={[
          { value: 'human', label: 'People only' },
          { value: 'anyone', label: 'People & AI companions' },
          { value: 'ai', label: 'An AI companion' },
        ]}
      />
      <p className="field-note">
        AI companions are always labeled and only join text chats.
      </p>
      <Choice
        label="Gender preference"
        requiredPlan="basic"
        value={options.genderFilter}
        onChange={(v) => {
          if (profile?.plan === 'free' && v !== 'any') {
            navigate('plans');
            flash('Gender preferences are included in Basic and Plus.');
            return;
          }
          setOptions((o) => ({
            ...o,
            genderFilter: v as MatchOptions['genderFilter'],
          }));
        }}
        options={[
          { value: 'any', label: 'Everyone' },
          { value: 'woman', label: 'Women' },
          { value: 'man', label: 'Men' },
          { value: 'nonbinary', label: 'Nonbinary people' },
        ]}
      />
      <LocationPreferences
        options={options}
        plan={profile?.plan ?? 'free'}
        onChange={setOptions}
        onUpgrade={() => navigate('plans')}
      />
      <div className="rail-promise">
        <ShieldCheck size={19} />
        <p>
          Be kind. Stay curious.
          <br />
          You can leave any chat, anytime.
        </p>
      </div>
    </div>
  );
  useEffect(() => {
    const sync = () =>
      setProfile((p) =>
        p
          ? {
              ...p,
              preferences: { ...p.preferences, darkMode: preferredDark() },
            }
          : p,
      );
    window.addEventListener('chatup-theme', sync);
    return () => window.removeEventListener('chatup-theme', sync);
  }, []);
  if (bootError)
    return (
      <div className="app-error">
        <Brand />
        <Empty
          icon={<WifiOff />}
          title="Let’s get you connected"
          description={bootError}
        >
          <button
            className="button button-primary"
            onClick={() => location.reload()}
          >
            Try again <ArrowRight size={18} />
          </button>
        </Empty>
      </div>
    );
  if (!profile || !config)
    return (
      <div className="app-loading">
        <Brand />
        <Loading label="Finding your little corner of the world…" />
      </div>
    );
  return (
    <SidebarProvider className="app-shell">
      <a className="skip-link" href="#app-content">
        Skip to conversation
      </a>
      <Sidebar collapsible="none" className="app-sidebar">
        <div className="sidebar-brand">
          <Brand />
        </div>
        <nav className="app-nav" aria-label="App navigation">
          <span className="nav-label">A WORLD OF HELLOS</span>
          {navigation.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              className={view === item.id ? 'active' : ''}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.id === 'chat' && <ArrowUpRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button className="upgrade-card" onClick={() => navigate('plans')}>
            <span className="upgrade-icon">
              <Sparkles size={20} />
            </span>
            <strong>A little more ChatUp</strong>
            <p>More interests. More possibilities.</p>
            <span>
              Explore memberships <ArrowRight size={15} />
            </span>
          </button>
          <button
            className={`nav-setting ${view === 'settings' ? 'active' : ''}`}
            onClick={() => navigate('settings')}
          >
            <Settings size={18} /> Settings <ChevronRight size={15} />
          </button>
          <div className="sidebar-profile">
            <Avatar person={profile} />
            <div>
              <strong>{profile.username}</strong>
              <span>
                {profile.guest
                  ? 'Your guest profile'
                  : `${plans[profile.plan].name} member`}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label={
                profile.guest ? 'Create an account' : 'Account settings'
              }
              onClick={() =>
                profile.guest ? setAuthOpen(true) : navigate('settings')
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </Sidebar>
      <div className="app-main">
        <header className="app-topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumb">
            <span>Your next chapter</span>
            <ChevronRight size={13} />
            <strong>
              {view === 'chat'
                ? 'Meet someone new'
                : view === 'plans'
                  ? 'Memberships'
                  : view.charAt(0).toUpperCase() + view.slice(1)}
            </strong>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label={
                profile.preferences.sound
                  ? 'Mute notification sounds'
                  : 'Enable notification sounds'
              }
              onClick={() =>
                void preference('sound', !profile.preferences.sound)
              }
            >
              {profile.preferences.sound ? <Volume2 /> : <VolumeX />}
            </button>
            <button
              className="icon-button"
              aria-label="Toggle color theme"
              onClick={() =>
                void preference(
                  'darkMode',
                  !document.documentElement.classList.contains('dark'),
                )
              }
            >
              {profile.preferences.darkMode ? <Sun /> : <Moon />}
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
              onClick={() => {
                setNoticesOpen(true);
                api('/notifications/read', { method: 'POST', body: '{}' })
                  .then(() =>
                    setNotices((n) =>
                      n.map((x) => ({ ...x, readAt: Date.now() })),
                    ),
                  )
                  .catch((e) => flash(errorText(e)));
              }}
            >
              <Bell />
              {unread > 0 && <i />}
            </button>
            {profile.guest && (
              <button
                className="button button-small button-outline desktop-signup"
                onClick={() => setAuthOpen(true)}
              >
                Save your profile <ArrowUpRight size={15} />
              </button>
            )}
          </div>
        </header>
        <main
          id="app-content"
          className={`app-content ${view === 'chat' ? 'is-chat' : ''}`}
        >
          {view === 'chat' && (
            <div className="chat-layout">
              <section className="chat-surface">
                <div className="chat-toolbar">
                  {chat ? (
                    <div className="partner-heading">
                      <Avatar
                        person={peer ?? { username: chat.title, avatar: '💬' }}
                      />
                      <div>
                        <div className="partner-name">
                          <strong>
                            {chat.kind === 'room'
                              ? chat.title
                              : (peer?.username ?? chat.title)}
                          </strong>
                          {peer && <Badge person={peer} />}
                        </div>
                        <span className="connection-label">
                          <span
                            className={
                              connection === 'online' && !chat.endedAt
                                ? 'live-dot'
                                : 'status-dot'
                            }
                          />
                          {chat.endedAt
                            ? 'Conversation ended'
                            : connection === 'online'
                              ? chat.kind === 'room'
                                ? `${chat.peers.length + 1} in this conversation`
                                : 'Connected'
                              : connection === 'offline'
                                ? 'Offline — messages can be retried'
                                : 'Reconnecting…'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="toolbar-title">
                      <Compass size={20} />
                      <strong>A new connection awaits</strong>
                    </div>
                  )}
                  <div className="toolbar-actions">
                    {chat && !chat.endedAt && peer && !peer.ai && (
                      <>
                        <button
                          className="icon-button"
                          aria-label="Send friend request"
                          title="Add friend"
                          onClick={() => void addFriend()}
                        >
                          <UserPlus />
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Report and block"
                          title="Report and block"
                          onClick={() => setReportOpen(true)}
                        >
                          <Flag />
                        </button>
                      </>
                    )}
                    <button
                      className="icon-button filter-mobile"
                      aria-label="Matching preferences"
                      onClick={() => setFiltersOpen(true)}
                    >
                      <SlidersHorizontal />
                    </button>
                  </div>
                </div>
                {!chat && !queue && (
                  <div className="chat-lobby">
                    <div className="lobby-orbit">
                      <span>
                        <Compass size={43} />
                      </span>
                      <i className="orbit-dot dot-a" />
                      <i className="orbit-dot dot-b" />
                      <i className="orbit-dot dot-c" />
                    </div>
                    <span className="eyebrow">
                      A LITTLE CURIOSITY GOES A LONG WAY
                    </span>
                    <h1>
                      Good conversations
                      <br />
                      start with <span className="serif-word">hello.</span>
                    </h1>
                    <p>
                      Someone out there shares your interests.
                      <br />
                      Let’s see where this one goes.
                    </p>
                    <Tabs
                      value={options.mode}
                      onValueChange={(value) =>
                        setOptions((o) => ({
                          ...o,
                          mode: String(value) as MatchOptions['mode'],
                          partnerType:
                            value === 'text' ? o.partnerType : 'human',
                        }))
                      }
                    >
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
                    <button
                      className="button button-primary lobby-start"
                      disabled={busy}
                      onClick={() => void startMatching()}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <Sparkles size={18} />
                      )}
                      Start a conversation
                      <ArrowUpRight size={20} />
                    </button>
                    <div className="lobby-chips">
                      {(options.interests.length
                        ? options.interests
                        : ['music', 'gaming', 'deep talks']
                      )
                        .slice(0, 3)
                        .map((i) => (
                          <span key={i}># {i}</span>
                        ))}
                      <button
                        onClick={() => setFiltersOpen(true)}
                        aria-label="Edit matching interests"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <p className="lobby-terms">
                      For adults 18+. By chatting, you agree to our{' '}
                      <a href="/terms">Terms</a> and{' '}
                      <a href="/privacy">Privacy Policy</a>.
                    </p>
                    <div className="lobby-shortcuts">
                      <button onClick={() => navigate('rooms')}>
                        <Users size={18} />
                        <span>
                          Find your people<small>Explore a room</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                      <button
                        onClick={() => {
                          setOptions((o) => ({
                            ...o,
                            mode: 'text',
                            partnerType: 'ai',
                          }));
                          flash(
                            config.ai
                              ? 'AI companion selected. Start when you’re ready.'
                              : 'AI companions will be available when the service is connected.',
                          );
                        }}
                      >
                        <Sparkles size={18} />
                        <span>
                          A different kind of chat
                          <small>Meet an AI companion</small>
                        </span>
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                  </div>
                )}
                {queue && (
                  <div className="matching-state">
                    <div className="match-radar">
                      <Search size={35} />
                      <i />
                      <i />
                    </div>
                    <span className="eyebrow">LEAVING YOUR USUAL CIRCLE</span>
                    <h2>
                      Finding your next{' '}
                      <span className="serif-word">hello.</span>
                    </h2>
                    <p>
                      {queue.interestOnly
                        ? 'Looking for someone who shares your interests.'
                        : 'Looking for someone ready for a conversation.'}
                    </p>
                    <span className="queue-time">
                      {String(Math.floor(elapsed / 60)).padStart(2, '0')}:
                      {String(elapsed % 60).padStart(2, '0')}
                    </span>
                    <div className="lobby-chips">
                      {options.interests.map((i) => (
                        <span key={i}># {i}</span>
                      ))}
                    </div>
                    <button
                      className="button button-outline"
                      onClick={() => void cancelMatching()}
                      disabled={busy}
                    >
                      Cancel search
                    </button>
                    <p className="field-note">
                      Early days, fresh connections. Invite someone to ChatUp
                      <br />
                      or explore a room while more people arrive.
                    </p>
                  </div>
                )}
                {chat && (
                  <>
                    <div className="conversation-scroll">
                      {chat.kind === 'ai' && (
                        <div className="ai-disclosure">
                          <Sparkles size={16} />
                          <span>
                            You’re chatting with {peer?.username}, an AI
                            companion. Replies may be inaccurate. Don’t share
                            sensitive information.
                          </span>
                        </div>
                      )}
                      {callOpen && (
                        <CallPanel
                          chat={chat}
                          profile={profile}
                          config={config}
                          emit={emit}
                          signalHandler={signalHandler}
                          onClose={() => setCallOpen(false)}
                          onError={flash}
                        />
                      )}
                      <div className="chat-start-marker">
                        <span>
                          {chat.kind === 'room'
                            ? 'You joined the conversation'
                            : 'You found each other'}
                        </span>
                        <p>
                          {chat.kind === 'ai'
                            ? 'A new AI conversation starts here.'
                            : peer?.interests.filter((i) =>
                                  options.interests.includes(i),
                                ).length
                              ? `You both like ${peer.interests.filter((i) => options.interests.includes(i)).join(', ')}.`
                              : 'A little hello can go a long way.'}
                        </p>
                      </div>
                      <div
                        className="messages"
                        role="log"
                        aria-label="Conversation messages"
                        aria-live="polite"
                      >
                        {messages.map((message) => (
                          <MessageBubble
                            key={message.id}
                            message={message}
                            self={message.senderId === profile.id}
                            blur={profile.preferences.blurImages}
                            onRetry={() => void send(message)}
                          />
                        ))}
                        {typing && !chat.endedAt && (
                          <div className="typing-indicator">
                            <span className="typing-dots">
                              <i />
                              <i />
                              <i />
                            </span>
                            <small>
                              {peer?.username ?? 'Someone'} is typing
                            </small>
                          </div>
                        )}
                      </div>
                      {showGame && (
                        <GamePanel
                          game={game}
                          profile={profile}
                          chat={chat}
                          onStart={startGame}
                          onMove={async (cell) => {
                            if (!game) return;
                            try {
                              setGame(
                                await api<Game>(
                                  `/chats/${encodeURIComponent(chat.id)}/games`,
                                  {
                                    method: 'POST',
                                    body: JSON.stringify({
                                      action: 'move',
                                      gameId: game.id,
                                      revision: game.revision,
                                      cell,
                                    }),
                                  },
                                ),
                              );
                            } catch (error) {
                              flash(errorText(error));
                              api<Game | null>(
                                `/chats/${encodeURIComponent(chat.id)}/games`,
                              )
                                .then(setGame)
                                .catch(() => {});
                            }
                          }}
                          onClose={() => setShowGame(false)}
                        />
                      )}
                      <div ref={bottom} />
                    </div>
                    <div className="composer-area">
                      {chat.endedAt ? (
                        <div className="ended-chat">
                          <span>Every goodbye makes room for a new hello.</span>
                          <button
                            className="button button-primary"
                            disabled={busy}
                            onClick={() => void startMatching()}
                          >
                            Meet someone new <ArrowRight size={17} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="conversation-actions">
                            <button
                              className="button button-small button-ghost"
                              disabled={busy}
                              onClick={() =>
                                void leaveChat().catch((e) =>
                                  flash(errorText(e)),
                                )
                              }
                            >
                              <SkipForward size={17} />
                              Leave
                            </button>
                            <button
                              className={`chat-action ${showGame ? 'active' : ''}`}
                              onClick={() => setShowGame(!showGame)}
                            >
                              <Gamepad2 size={18} />
                              <span>Play a game</span>
                            </button>
                            {chat.kind !== 'ai' && (
                              <button
                                className={`chat-action ${callOpen ? 'active' : ''}`}
                                onClick={() => setCallOpen(!callOpen)}
                              >
                                <Video size={18} />
                                <span>
                                  {callOpen ? 'Close call' : 'Start a call'}
                                </span>
                              </button>
                            )}
                            <span className="conversation-private">
                              <ShieldCheck size={13} /> Your pace. Your choice.
                            </span>
                          </div>
                          <form
                            className="message-composer"
                            onSubmit={submitMessage}
                          >
                            <button
                              type="button"
                              className="icon-button"
                              aria-label="Attach an image or video"
                              disabled={busy || chat.kind === 'ai'}
                              onClick={() =>
                                profile.plan === 'free'
                                  ? navigate('plans')
                                  : uploadRef.current?.click()
                              }
                            >
                              <ImagePlus />
                            </button>
                            <textarea
                              value={draft}
                              onChange={(e) => {
                                setDraft(e.target.value);
                                if (Date.now() - lastTyping.current > 1500) {
                                  emit({ type: 'typing', typing: true });
                                  lastTyping.current = Date.now();
                                }
                              }}
                              onKeyDown={(e) => {
                                if (
                                  e.key === 'Enter' &&
                                  !e.shiftKey &&
                                  !e.nativeEvent.isComposing
                                ) {
                                  e.preventDefault();
                                  void submitMessage();
                                }
                              }}
                              placeholder="Say something good…"
                              aria-label="Message"
                              maxLength={4000}
                              rows={1}
                            />
                            <button
                              type="button"
                              className="icon-button emoji-button"
                              aria-label="Add smile emoji"
                              onClick={() => setDraft((d) => d + ' 🙂')}
                            >
                              <Smile />
                            </button>
                            <button
                              className="send-button"
                              aria-label="Send message"
                              disabled={!draft.trim()}
                            >
                              <Send size={19} />
                            </button>
                          </form>
                          <input
                            className="sr-only"
                            ref={uploadRef}
                            type="file"
                            accept={
                              profile.plan === 'plus'
                                ? 'image/jpeg,image/png,image/gif,image/webp,video/mp4,video/webm'
                                : 'image/jpeg,image/png,image/gif,image/webp'
                            }
                            onChange={(e) => {
                              if (e.target.files?.[0])
                                void upload(e.target.files[0]);
                            }}
                          />
                          <div className="composer-access">
                            <span>
                              <PlanRequirement plan="basic" /> Images
                            </span>
                            <span>
                              <PlanRequirement plan="plus" /> Videos
                            </span>
                          </div>
                          <p className="composer-hint">
                            <span>
                              Enter to send · Shift + Enter for a new line
                            </span>
                            <span>{draft.length}/4000</span>
                          </p>
                        </>
                      )}
                    </div>
                  </>
                )}
              </section>
              <aside className="chat-rail">
                {chat && peer ? (
                  <>
                    <div className={`peer-banner banner-${profile.banner}`} />
                    <div className="peer-profile">
                      <Avatar person={peer} size="large" />
                      <h3>{peer.username}</h3>
                      <Badge person={peer} />
                      <p>
                        {peer.ai
                          ? 'AI companion · Here for a conversation'
                          : 'A new perspective. A new possibility.'}
                      </p>
                      <div className="lobby-chips">
                        {peer.interests.map((i) => (
                          <span key={i}># {i}</span>
                        ))}
                      </div>
                      {!peer.ai && (
                        <button
                          className="button button-outline"
                          onClick={() => void addFriend()}
                        >
                          <UserPlus size={17} />
                          Add friend
                        </button>
                      )}
                    </div>
                    <div className="rail-promise">
                      <ShieldCheck size={20} />
                      <p>
                        Keep personal details private.
                        <br />
                        Report anything that feels wrong.
                      </p>
                    </div>
                  </>
                ) : (
                  filters
                )}
              </aside>
            </div>
          )}
          {view === 'rooms' && (
            <RoomsView onJoin={(slug) => void joinRoom(slug)} busy={busy} />
          )}
          {(view === 'friends' || view === 'history') && (
            <SocialView
              view={view}
              profile={profile}
              refresh={refresh}
              onChat={openChat}
              onError={flash}
            />
          )}
          {view === 'settings' && (
            <AccountSettings
              profile={profile}
              config={config}
              onUpdate={updateProfile}
              onPreference={preference}
              onAuth={() => setAuthOpen(true)}
              onPlans={() => navigate('plans')}
              onError={flash}
            />
          )}
          {view === 'plans' && (
            <PlansView
              profile={profile}
              config={config}
              onAuth={() => setAuthOpen(true)}
              onError={flash}
            />
          )}
          {view === 'games' && (
            <div className="page-view">
              <PageHeading
                eyebrow="A LITTLE FRIENDLY COMPETITION"
                title="Make your next move."
                description="A game breaks the ice. A rematch keeps the conversation going."
              />
              <div className="game-library">
                {[
                  {
                    kind: 'tic-tac-toe',
                    title: 'Tic-tac-toe',
                    description: 'Three in a row. One small victory.',
                    icon: '× ○',
                  },
                  {
                    kind: 'connect-four',
                    title: 'Connect Four',
                    description: 'Think ahead. Line up four. Claim the board.',
                    icon: '● ●',
                  },
                ].map((g) => (
                  <button
                    key={g.kind}
                    className={`game-card game-${g.kind}`}
                    onClick={() => {
                      if (chat) {
                        navigate('chat');
                        void startGame(
                          g.kind as 'tic-tac-toe' | 'connect-four',
                        );
                      } else {
                        navigate('chat');
                        flash(
                          'Meet someone first, then choose a game in your conversation.',
                        );
                      }
                    }}
                  >
                    <span className="game-card-art">{g.icon}</span>
                    <h2>{g.title}</h2>
                    <p>{g.description}</p>
                    <span>
                      Play together <ArrowUpRight size={18} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="info-panel">
                <Info size={19} />
                <p>
                  Games happen inside your conversation. Meet someone or message
                  a friend, then tap <strong>Play a game</strong>.
                </p>
              </div>
            </div>
          )}
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {[
            { id: 'chat', label: 'Meet', icon: Compass },
            { id: 'rooms', label: 'Rooms', icon: Users },
            { id: 'friends', label: 'Friends', icon: MessageCircle },
            { id: 'history', label: 'Recent', icon: History },
            { id: 'settings', label: 'You', icon: Settings },
          ].map((item) => (
            <button
              key={item.id}
              className={view === item.id ? 'active' : ''}
              onClick={() => navigate(item.id as View)}
            >
              <item.icon size={21} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <AuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        config={config}
        onSuccess={async () => {
          clearBootstrap();
          setProfile(await bootstrap());
          setAuthOpen(false);
          flash('Your profile is ready.');
        }}
      />
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent className="filters-sheet">
          <SheetTitle>Matching preferences</SheetTitle>
          <SheetDescription>
            Make room for your kind of conversation.
          </SheetDescription>
          {filters}
          <button
            className="button button-primary"
            onClick={() => setFiltersOpen(false)}
          >
            Done <Check size={17} />
          </button>
        </SheetContent>
      </Sheet>
      <Sheet open={noticesOpen} onOpenChange={setNoticesOpen}>
        <SheetContent className="notifications-sheet">
          <SheetTitle>Your little updates</SheetTitle>
          <SheetDescription>
            Requests, connections, and things worth knowing.
          </SheetDescription>
          {notices.length ? (
            notices.map((n) => (
              <button
                className="notice"
                key={n.id}
                onClick={() => {
                  setNoticesOpen(false);
                  if (n.type === 'message' && n.targetId)
                    void openChat(n.targetId).catch((e) => flash(errorText(e)));
                  else if (n.type === 'support') location.assign('/support');
                  else
                    navigate(
                      n.type.includes('friend') ? 'friends' : 'settings',
                    );
                }}
              >
                <span>
                  {n.type.includes('friend') ? (
                    <UserPlus size={18} />
                  ) : (
                    <Bell size={18} />
                  )}
                </span>
                <div>
                  <p>{n.text}</p>
                  <small>
                    {new Date(n.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </small>
                </div>
              </button>
            ))
          ) : (
            <Empty
              icon={<Bell />}
              title="All caught up"
              description="Your next connection might bring a little update."
            />
          )}
        </SheetContent>
      </Sheet>
      <Dialog open={ageOpen} onOpenChange={setAgeOpen}>
        <DialogContent className="app-dialog">
          <DialogTitle>A good place to meet.</DialogTitle>
          <DialogDescription>
            ChatUp is for adults 18 and older. Be respectful, keep personal
            information private, and leave or report anything uncomfortable.
          </DialogDescription>
          <ToggleRow
            title="I am 18 or older"
            checked={ageConfirmed}
            onChange={setAgeConfirmed}
          />
          <p className="field-note">
            By continuing, you agree to the <a href="/terms">Terms</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </p>
          <button
            className="button button-primary"
            disabled={!ageConfirmed || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const saved = await api<Profile>('/consent', {
                  method: 'POST',
                  body: JSON.stringify({ adult: true, acceptTerms: true }),
                });
                setProfile(saved);
                setAgeOpen(false);
                const action = afterConsent.current;
                afterConsent.current = null;
                if (action) await action();
              } catch (error) {
                flash(errorText(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Start a conversation <ArrowRight size={18} />
          </button>
        </DialogContent>
      </Dialog>
      <InstallPrompt />
      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent className="app-dialog">
          <DialogTitle>Report and block</DialogTitle>
          <DialogDescription>
            Your report is private. Blocking prevents future matches and
            messages with this account.
          </DialogDescription>
          <Choice
            label="What happened?"
            value={reportReason}
            onChange={setReportReason}
            options={[
              { value: 'harassment', label: 'Harassment or hate' },
              { value: 'sexual-content', label: 'Sexual content' },
              { value: 'underage', label: 'Someone may be under 18' },
              { value: 'spam', label: 'Spam or scam' },
              { value: 'danger', label: 'Danger or threats' },
              { value: 'other', label: 'Something else' },
            ]}
          />
          <label className="form-field">
            Anything else?
            <textarea
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Help us understand what happened."
            />
          </label>
          <button
            className="button button-danger"
            onClick={async () => {
              if (!peer || !chat) return;
              setBusy(true);
              try {
                await api('/report', {
                  method: 'POST',
                  body: JSON.stringify({
                    peerId: peer.id,
                    chatId: chat.id,
                    reason: reportReason,
                    details: reportDetails,
                    block: true,
                  }),
                });
                setReportOpen(false);
                await leaveChat();
                flash('Report received. This account is now blocked.');
              } catch (error) {
                flash(errorText(error));
              } finally {
                setBusy(false);
              }
            }}
            disabled={busy}
          >
            Submit report and block
          </button>
        </DialogContent>
      </Dialog>
      {toast && (
        <div className="app-toast" role="status">
          <Info size={18} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </SidebarProvider>
  );
}

function MessageBubble({
  message,
  self,
  blur,
  onRetry,
}: {
  message: ChatMessage;
  self: boolean;
  blur: boolean;
  onRetry: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  return (
    <div className={`message-row ${self ? 'self' : ''}`}>
      <div className="message-body">
        {!self && <span className="message-author">{message.senderName}</span>}
        <div className="message-bubble">
          {message.kind === 'image' || message.kind === 'video' ? (
            <div className="attachment">
              {message.kind === 'image' ? (
                <img
                  src={`/api/media/${message.mediaId}`}
                  alt="Shared attachment"
                  loading="lazy"
                  className={!self && blur && !revealed ? 'blurred' : ''}
                />
              ) : (
                <video
                  src={`/api/media/${message.mediaId}`}
                  controls={self || !blur || revealed}
                  playsInline
                  preload="metadata"
                  className={!self && blur && !revealed ? 'blurred' : ''}
                />
              )}{' '}
              {!self && blur && !revealed && (
                <button
                  className="reveal-media"
                  onClick={() => setRevealed(true)}
                >
                  <ImagePlus size={22} />
                  Tap to reveal {message.kind}
                </button>
              )}
            </div>
          ) : (
            <p>{message.text}</p>
          )}
        </div>
        <div className="message-meta">
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {new Date(message.createdAt).toLocaleTimeString(undefined, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
          {self &&
            (message.state === 'sending' ? (
              <span>Sending…</span>
            ) : message.state === 'failed' ? (
              <button className="retry-message" onClick={onRetry}>
                Not sent · Retry
              </button>
            ) : (
              <span>
                <Check size={12} />
                Sent
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
function RoomsView({
  onJoin,
  busy,
}: {
  onJoin: (slug: string) => void;
  busy: boolean;
}) {
  const [rooms, setRooms] = useState<
      ((typeof roomCatalog)[number] & { count: number })[]
    >([]),
    [error, setError] = useState(''),
    [query, setQuery] = useState('');
  useEffect(() => {
    api<typeof rooms>('/rooms')
      .then(setRooms)
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <div className="page-view">
      <PageHeading
        eyebrow="FIND YOUR PEOPLE"
        title="A room for your kind of curious."
        description="Pull up a chair. There’s always something to talk about."
      />
      <div className="room-search">
        <Search size={18} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a room or an interest"
          aria-label="Search rooms"
        />
      </div>
      {error ? (
        <Empty
          icon={<WifiOff />}
          title="Rooms are reconnecting"
          description={error}
        />
      ) : rooms.length ? (
        <div className="room-grid">
          {rooms
            .filter((r) =>
              `${r.title} ${r.interests.join(' ')}`
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((room) => (
              <button
                className={`room-card room-${room.color}`}
                key={room.slug}
                onClick={() => onJoin(room.slug)}
                disabled={busy}
              >
                <div className="room-card-top">
                  <span className="room-emoji">{room.icon}</span>
                  <span className="room-mode">
                    {room.mode === 'voice' ? (
                      <AudioLines size={14} />
                    ) : room.mode === 'video' ? (
                      <Video size={14} />
                    ) : (
                      <MessageCircle size={14} />
                    )}{' '}
                    {room.mode}
                  </span>
                </div>
                <h2>{room.title}</h2>
                <p>{room.topic}</p>
                <div className="room-card-footer">
                  <span>
                    <i className="live-dot" />
                    {room.count
                      ? `${room.count} here now`
                      : 'Be the first to say hello'}
                  </span>
                  <ArrowUpRight size={19} />
                </div>
              </button>
            ))}
        </div>
      ) : (
        <Loading label="Opening the doors…" />
      )}
      {rooms.length > 0 &&
        !rooms.some((r) =>
          `${r.title} ${r.interests.join(' ')}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        ) && (
          <Empty
            icon={<Search />}
            title="A little too specific"
            description="Try music, travel, gaming, or a room name."
          />
        )}
    </div>
  );
}
function playSound() {
  try {
    const context = new AudioContext();
    const oscillator = context.createOscillator(),
      gain = context.createGain();
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(
      880,
      context.currentTime + 0.1,
    );
    gain.gain.setValueAtTime(0.025, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    oscillator.onended = () => void context.close();
  } catch {}
}
