'use client';
import { PlanRequirement } from './plan-requirement';
import { useEffect, useState } from 'react';
import {
  Check,
  History,
  MessageCircle,
  Search,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { api, errorText } from '@/lib/client';
import {
  plans,
  type Profile,
  type Peer,
  type Conversation,
} from '@/lib/domain';
import { PageHeading } from './chat-app';
import { Avatar, Badge, Empty, Loading } from './app-primitives';
type Friendship = {
  id: string;
  peer: Peer;
  status: string;
  incoming: boolean;
  createdAt: number;
};
export function SocialView({
  view,
  profile,
  refresh,
  onChat,
  onError,
}: {
  view: 'friends' | 'history';
  profile: Profile;
  refresh: number;
  onChat: (id: string) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [friends, setFriends] = useState<Friendship[]>([]),
    [history, setHistory] = useState<(Conversation & { joinedAt: number })[]>(
      [],
    ),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState('friends'),
    [query, setQuery] = useState(''),
    [remove, setRemove] = useState<Friendship | null>(null),
    [version, setVersion] = useState(0),
    [loadError, setLoadError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setLoadError('');
    Promise.all([
      api<Friendship[]>('/friends'),
      api<typeof history>('/history'),
    ])
      .then(([f, h]) => {
        if (alive) {
          setFriends(f);
          setHistory(h);
        }
      })
      .catch((e) => {
        if (alive) setLoadError(errorText(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [refresh, version, view]);
  async function change(id: string, method: 'PATCH' | 'DELETE') {
    try {
      await api(`/friends/${id}`, {
        method,
        body: method === 'PATCH' ? '{}' : undefined,
      });
      setVersion((v) => v + 1);
      setRemove(null);
      onError(
        method === 'PATCH' ? 'Friend request accepted.' : 'Connection removed.',
      );
    } catch (e) {
      onError(errorText(e));
    }
  }
  const listed = friends.filter(
    (f) =>
      (tab === 'friends' ? f.status === 'accepted' : f.status === 'pending') &&
      f.peer.username.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="page-view">
      <PageHeading
        eyebrow={
          view === 'friends' ? 'A HELLO WORTH KEEPING' : 'YOUR PATHS CROSSED'
        }
        title={
          view === 'friends'
            ? 'Some connections stick.'
            : 'A few familiar faces.'
        }
        description={
          view === 'friends'
            ? 'Your people, your messages, and a few hellos waiting for an answer.'
            : `Your ${plans[profile.plan].history} most recent matches. Keep a good connection going.`
        }
      />
      {view === 'history' && (
        <p className="field-note">
          More history: <PlanRequirement plan="basic" /> 15 matches ·{' '}
          <PlanRequirement plan="plus" /> 25 matches
        </p>
      )}
      {loading ? (
        <Loading label="Gathering your connections…" />
      ) : loadError ? (
        <Empty
          icon={<Users />}
          title="Your connections are reconnecting"
          description={loadError}
        >
          <button
            className="button button-outline"
            onClick={() => setVersion((v) => v + 1)}
          >
            Try again
          </button>
        </Empty>
      ) : view === 'history' ? (
        history.length ? (
          <div className="history-list">
            {history.map((item) => {
              const peer = item.peers[0] ?? {
                id: 'ai',
                username: item.title,
                avatar: '✨',
                plan: 'free' as const,
                interests: [],
                ai: item.kind === 'ai',
              };
              return (
                <article className="history-card" key={item.id}>
                  <Avatar person={peer} />
                  <div>
                    <div className="friend-name">
                      <h3>{peer.username}</h3>
                      <Badge person={peer} />
                    </div>
                    <p>
                      {new Date(item.joinedAt).toLocaleDateString(undefined, {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      · {item.mode} chat
                    </p>
                    <div className="history-tags">
                      {peer.interests.slice(0, 3).map((i) => (
                        <span key={i}>#{i}</span>
                      ))}
                    </div>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`View conversation with ${peer.username}`}
                    onClick={() =>
                      void onChat(item.id).catch((e) => onError(errorText(e)))
                    }
                  >
                    <MessageCircle />
                  </button>
                  {item.kind !== 'ai' && (
                    <button
                      className="icon-button"
                      aria-label={`Add ${peer.username} as a friend`}
                      onClick={async () => {
                        try {
                          await api('/friends/request', {
                            method: 'POST',
                            body: JSON.stringify({ peerId: peer.id }),
                          });
                          onError('Friend request sent.');
                        } catch (e) {
                          onError(errorText(e));
                        }
                      }}
                    >
                      <UserPlus />
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={<History />}
            title="A fresh start looks good on you."
            description="People you meet will appear here. Go say your first hello."
          />
        )
      ) : (
        <>
          <div className="friends-toolbar">
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <TabsList className="settings-tabs">
                <TabsTrigger value="friends">
                  Friends{' '}
                  <span className="count-badge">
                    {friends.filter((f) => f.status === 'accepted').length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="requests">
                  Requests{' '}
                  <span className="count-badge">
                    {
                      friends.filter(
                        (f) => f.status === 'pending' && f.incoming,
                      ).length
                    }
                  </span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="room-search">
              <Search size={17} />
              <input
                aria-label="Search friends"
                placeholder="Find a friend"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
          {listed.length ? (
            <div className="friends-list">
              {listed.map((friend) => (
                <article key={friend.id} className="friend-card">
                  <Avatar person={friend.peer} />
                  <div className="friend-info">
                    <div className="friend-name">
                      <h3>{friend.peer.username}</h3>
                      <Badge person={friend.peer} />
                    </div>
                    <p>
                      {friend.status === 'pending'
                        ? friend.incoming
                          ? 'Wants to stay in touch'
                          : 'Request sent'
                        : friend.peer.online
                          ? 'Around right now'
                          : 'Catch up when they’re back'}
                    </p>
                  </div>
                  {friend.status === 'accepted' ? (
                    <>
                      <button
                        className="button button-small button-primary"
                        onClick={async () => {
                          try {
                            const chat = await api<Conversation>('/dm', {
                              method: 'POST',
                              body: JSON.stringify({ peerId: friend.peer.id }),
                            });
                            await onChat(chat.id);
                          } catch (e) {
                            onError(errorText(e));
                          }
                        }}
                      >
                        <MessageCircle size={16} />
                        <span>Message</span>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Unfriend ${friend.peer.username}`}
                        onClick={() => setRemove(friend)}
                      >
                        <X size={17} />
                      </button>
                    </>
                  ) : friend.incoming ? (
                    <>
                      <button
                        className="button button-small button-primary"
                        onClick={() => void change(friend.id, 'PATCH')}
                      >
                        <Check size={16} />
                        Accept
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Decline ${friend.peer.username}`}
                        onClick={() => void change(friend.id, 'DELETE')}
                      >
                        <X size={17} />
                      </button>
                    </>
                  ) : (
                    <button
                      className="button button-outline button-small"
                      onClick={() => void change(friend.id, 'DELETE')}
                    >
                      Cancel
                    </button>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <Empty
              icon={tab === 'friends' ? <Users /> : <UserPlus />}
              title={
                query
                  ? 'No matches here'
                  : tab === 'friends'
                    ? 'Your circle starts with one hello.'
                    : 'No requests waiting.'
              }
              description={
                query
                  ? 'Try another name.'
                  : tab === 'friends'
                    ? 'Meet someone you click with, send a friend request, and pick up where you left off.'
                    : 'When someone wants to keep in touch, their request will appear here.'
              }
            />
          )}
        </>
      )}
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open) setRemove(null);
        }}
      >
        <AlertDialogContent className="app-dialog">
          <AlertDialogTitle>Unfriend {remove?.peer.username}?</AlertDialogTitle>
          <AlertDialogDescription>
            You will need to add each other again before sending new direct
            messages.
          </AlertDialogDescription>
          <div className="dialog-actions">
            <AlertDialogCancel className="button button-outline">
              Keep friend
            </AlertDialogCancel>
            <button
              className="button button-danger"
              onClick={() => remove && void change(remove.id, 'DELETE')}
            >
              Unfriend
            </button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
