'use client';
import { useEffect, useRef, useState } from 'react';
import type RealtimeKit from '@cloudflare/realtimekit';
import type {
  RTKParticipant,
  RTKSelf,
  SocketConnectionState,
} from '@cloudflare/realtimekit';
import {
  AudioLines,
  LoaderCircle,
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
} from 'lucide-react';
import { api, errorText, type AppConfig } from '@/lib/client';
import type { Conversation } from '@/lib/domain';

export function RoomCallPanel({
  chat,
  config,
  onClose,
  onError,
}: {
  chat: Conversation;
  config: AppConfig;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const meeting = useRef<RealtimeKit | null>(null);
  const alive = useRef(true);
  const joining = useRef(false);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [camera, setCamera] = useState(chat.mode === 'video');
  const [mic, setMic] = useState(true);
  const [participants, setParticipants] = useState<RTKParticipant[]>([]);
  const [status, setStatus] = useState(
    'Join when you’re ready. Your camera and microphone are off.',
  );
  const cleanup = useRef<() => void>(() => {});
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      cleanup.current();
      const current = meeting.current;
      meeting.current = null;
      if (current) {
        stopMedia(current);
        void current.leave().catch(() => {});
      }
    };
  }, [chat.id]);

  async function join() {
    if (joining.current) return;
    joining.current = true;
    setBusy(true);
    try {
      if (!config.groupCalls)
        throw new Error(
          'Group calls are not available yet. Room text chat is ready.',
        );
      const { authToken } = await api<{ authToken: string }>(
        `/chats/${encodeURIComponent(chat.id)}/call`,
        { method: 'POST', body: '{}' },
      );
      const { default: Client } = await import('@cloudflare/realtimekit');
      if (!alive.current) return;
      const current = await Client.init({
        authToken,
        defaults: { audio: true, video: camera },
        overrides: { forceRelay: true },
      });
      if (!alive.current) {
        await current.leave();
        return;
      }
      meeting.current = current;
      const refresh = () => {
        if (alive.current)
          setParticipants(current.participants.joined.toArray());
      };
      const connection = (state: SocketConnectionState) => {
        if (alive.current)
          setStatus(
            state.state !== 'connected'
              ? 'Connection interrupted. Reconnecting…'
              : 'You’re in the room.',
          );
      };
      const ended = ({ state }: { state: string }) => {
        if (meeting.current !== current) return;
        cleanup.current();
        meeting.current = null;
        joining.current = false;
        stopMedia(current);
        void current.leave().catch(() => {});
        if (alive.current) {
          setJoined(false);
          setParticipants([]);
          setStatus(
            state === 'kicked'
              ? 'You were removed from this call.'
              : state === 'ended'
                ? 'This room call has ended.'
                : 'The call disconnected. Join again when you’re ready.',
          );
        }
      };
      current.participants.joined.on('participantJoined', refresh);
      current.participants.joined.on('participantLeft', refresh);
      current.participants.joined.on('participantsCleared', refresh);
      current.meta.on('socketConnectionUpdate', connection);
      current.self.on('roomLeft', ended);
      cleanup.current = () => {
        current.participants.joined.off('participantJoined', refresh);
        current.participants.joined.off('participantLeft', refresh);
        current.participants.joined.off('participantsCleared', refresh);
        current.meta.off('socketConnectionUpdate', connection);
        current.self.off('roomLeft', ended);
      };
      await current.join();
      if (!alive.current || meeting.current !== current) {
        stopMedia(current);
        await current.leave();
        return;
      }
      refresh();
      setJoined(true);
      setStatus('You’re in the room.');
    } catch (error) {
      cleanup.current();
      const current = meeting.current;
      meeting.current = null;
      if (current) {
        stopMedia(current);
        await current.leave().catch(() => {});
      }
      joining.current = false;
      if (alive.current) {
        setStatus(errorText(error));
        onError(errorText(error));
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function toggle(kind: 'audio' | 'video') {
    const self = meeting.current?.self;
    if (!self) {
      if (kind === 'video') setCamera((v) => !v);
      return;
    }
    try {
      if (kind === 'audio') {
        if (mic) await self.disableAudio();
        else await self.enableAudio();
        setMic((v) => !v);
      } else {
        if (camera) await self.disableVideo();
        else await self.enableVideo();
        setCamera((v) => !v);
      }
    } catch (error) {
      onError(errorText(error));
    }
  }
  return (
    <section className="call-panel room-call-panel" aria-label="Room call">
      <div className="room-call-status" role="status">
        <AudioLines size={18} />
        <span>{status}</span>
        {joined && <small>{participants.length + 1} in call</small>}
      </div>
      {joined && meeting.current ? (
        <div className="room-video-grid">
          <ParticipantTile participant={meeting.current.self} self />
          {participants.map((p) => (
            <ParticipantTile key={p.id} participant={p} />
          ))}
        </div>
      ) : (
        <div className="room-call-ready">
          <AudioLines size={36} />
          <h3>A little closer than text.</h3>
          <p>Choose voice or video, then join the conversation.</p>
        </div>
      )}
      <div className="call-controls">
        <button
          className="icon-button"
          aria-label={camera ? 'Turn camera off' : 'Turn camera on'}
          disabled={busy}
          onClick={() => void toggle('video')}
        >
          {camera ? <Video /> : <VideoOff />}
        </button>
        {joined ? (
          <button
            className="icon-button"
            aria-label={mic ? 'Mute microphone' : 'Unmute microphone'}
            onClick={() => void toggle('audio')}
          >
            {mic ? <Mic /> : <MicOff />}
          </button>
        ) : (
          <button
            className="button button-primary button-small"
            disabled={busy}
            onClick={() => void join()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <AudioLines size={16} />
            )}
            Join {camera ? 'video' : 'voice'} call
          </button>
        )}
        <button
          className="hangup-button"
          aria-label="Leave room call"
          onClick={onClose}
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </section>
  );
}

function stopMedia(current: RealtimeKit) {
  current.self.audioTrack?.stop();
  current.self.videoTrack?.stop();
}

function ParticipantTile({
  participant,
  self = false,
}: {
  participant: RTKParticipant | Readonly<RTKSelf>;
  self?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const [videoEnabled, setVideoEnabled] = useState(participant.videoEnabled);
  const [audioEnabled, setAudioEnabled] = useState(participant.audioEnabled);
  const [needsPlay, setNeedsPlay] = useState(false);
  useEffect(() => {
    const syncVideo = () => {
      setVideoEnabled(participant.videoEnabled);
      if (video.current)
        video.current.srcObject = participant.videoTrack
          ? new MediaStream([participant.videoTrack])
          : null;
    };
    const syncAudio = () => {
      setAudioEnabled(participant.audioEnabled);
      if (!self && audio.current) {
        audio.current.srcObject = participant.audioTrack
          ? new MediaStream([participant.audioTrack])
          : null;
        if (participant.audioTrack)
          void audio.current.play().catch(() => setNeedsPlay(true));
      }
    };
    const events = participant as Pick<RTKParticipant, 'on' | 'off'>;
    events.on('videoUpdate', syncVideo);
    events.on('audioUpdate', syncAudio);
    syncVideo();
    syncAudio();
    return () => {
      events.off('videoUpdate', syncVideo);
      events.off('audioUpdate', syncAudio);
    };
  }, [participant, self]);
  return (
    <div className="room-participant">
      <video ref={video} autoPlay playsInline muted hidden={!videoEnabled} />
      {!videoEnabled && (
        <span className="room-avatar">
          {participant.name?.slice(0, 1).toUpperCase() || '?'}
        </span>
      )}
      {!self && <audio ref={audio} autoPlay />}
      {needsPlay && (
        <button
          className="button button-small"
          onClick={() =>
            void audio.current?.play().then(() => setNeedsPlay(false))
          }
        >
          Enable audio
        </button>
      )}
      <span className="participant-label">
        {self ? 'You' : participant.name}
        {!audioEnabled && <MicOff size={13} />}
      </span>
    </div>
  );
}
