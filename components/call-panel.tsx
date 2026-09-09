'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { Conversation, Profile } from '@/lib/domain';
import type { ChatEvent } from '@/hooks/use-conversation';
import { Avatar } from './app-primitives';
import { RoomCallPanel } from './room-call-panel';
type Signal = {
  description?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  ready?: boolean;
  ack?: boolean;
  hangup?: boolean;
};
export function CallPanel(props: React.ComponentProps<typeof DirectCallPanel>) {
  if (props.chat.kind === 'room')
    return <RoomCallPanel key={props.chat.id} {...props} />;
  return <DirectCallPanel key={props.chat.id} {...props} />;
}
function DirectCallPanel({
  chat,
  profile,
  config,
  emit,
  signalHandler,
  onClose,
  onError,
}: {
  chat: Conversation;
  profile: Profile;
  config: AppConfig;
  emit: (event: unknown) => boolean;
  signalHandler: React.RefObject<((event: ChatEvent) => void) | null>;
  onClose: () => void;
  onError: (message: string) => void;
}) {
  const [status, setStatus] = useState('Your camera and microphone are off.'),
    [joined, setJoined] = useState(false),
    [mic, setMic] = useState(true),
    [camera, setCamera] = useState(chat.mode === 'video'),
    [busy, setBusy] = useState(false),
    [remoteConnected, setRemoteConnected] = useState(false);
  const local = useRef<HTMLVideoElement>(null),
    remote = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    pc = useRef<RTCPeerConnection | null>(null),
    started = useRef(false),
    pendingCandidates = useRef<RTCIceCandidateInit[]>([]),
    makingOffer = useRef(false),
    ignoreOffer = useRef(false),
    alive = useRef(true),
    remoteReady = useRef(false);
  const peer = chat.peers[0];
  const peerId = peer?.id;
  const polite = peer ? profile.id.localeCompare(peer.id) > 0 : false;
  const signal = useCallback(
    (data: Signal) => {
      if (peerId) emit({ type: 'signal', to: peerId, signal: data });
    },
    [emit, peerId],
  );
  const offer = useCallback(async () => {
    const connection = pc.current;
    if (!connection || makingOffer.current) return;
    try {
      makingOffer.current = true;
      await connection.setLocalDescription();
      signal({ description: connection.localDescription! });
    } catch (e) {
      onError(errorText(e));
    } finally {
      makingOffer.current = false;
    }
  }, [onError, signal]);
  useEffect(() => {
    alive.current = true;
    signalHandler.current = async (event) => {
      if (!peerId || event.from !== peerId) return;
      const data = event.signal as Signal;
      if (data.hangup) {
        setStatus('The other person left the call.');
        setRemoteConnected(false);
        pc.current?.close();
        pc.current = null;
        setJoined(false);
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        if (local.current) local.current.srcObject = null;
        if (remote.current) remote.current.srcObject = null;
        remoteReady.current = false;
        pendingCandidates.current = [];
        started.current = false;
        return;
      }
      if (data.ready) {
        remoteReady.current = true;
        if (pc.current && !data.ack) signal({ ready: true, ack: true });
        if (
          pc.current &&
          !polite &&
          pc.current.signalingState === 'stable' &&
          pc.current.connectionState !== 'connected'
        )
          await offer();
        return;
      }
      const connection = pc.current;
      if (!connection) return;
      try {
        if (data.description) {
          const collision =
            data.description.type === 'offer' &&
            (makingOffer.current || connection.signalingState !== 'stable');
          ignoreOffer.current = !polite && collision;
          if (ignoreOffer.current) return;
          await connection.setRemoteDescription(data.description);
          for (const candidate of pendingCandidates.current)
            await connection.addIceCandidate(candidate);
          pendingCandidates.current = [];
          if (data.description.type === 'offer') {
            await connection.setLocalDescription();
            signal({ description: connection.localDescription! });
          }
        } else if (data.candidate) {
          if (connection.remoteDescription)
            await connection.addIceCandidate(data.candidate);
          else pendingCandidates.current.push(data.candidate);
        }
      } catch (e) {
        if (!ignoreOffer.current) onError(errorText(e));
      }
    };
    return () => {
      alive.current = false;
      signalHandler.current = null;
      signal({ hangup: true });
      pc.current?.close();
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      remoteReady.current = false;
      pendingCandidates.current = [];
    };
  }, [chat.id, peerId, polite, signal, offer, signalHandler, onError]);
  async function join() {
    if (started.current) return;
    started.current = true;
    setBusy(true);
    setStatus('Connecting your call…');
    try {
      if (!peer) throw new Error('Wait for someone to join first.');
      if (!config.turn)
        throw new Error(
          'The voice and video relay is being connected. Text chat is ready.',
        );
      const ice = await api<RTCConfiguration>(
        `/chats/${encodeURIComponent(chat.id)}/ice`,
        { method: 'POST', body: '{}' },
      );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: camera
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
      });
      if (!alive.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (local.current) local.current.srcObject = media;
      const connection = new RTCPeerConnection(ice);
      pc.current = connection;
      media.getTracks().forEach((track) => connection.addTrack(track, media));
      connection.onicecandidate = (e) => {
        if (e.candidate) signal({ candidate: e.candidate.toJSON() });
      };
      connection.ontrack = (e) => {
        if (remote.current) remote.current.srcObject = e.streams[0];
      };
      connection.onconnectionstatechange = () => {
        if (!alive.current) return;
        const state = connection.connectionState;
        setRemoteConnected(state === 'connected');
        setStatus(
          state === 'connected'
            ? 'You’re connected.'
            : state === 'failed'
              ? 'Reconnecting the call…'
              : state === 'disconnected'
                ? 'Connection interrupted. Reconnecting…'
                : 'Waiting for the other person to join…',
        );
        if (state === 'failed') {
          connection.restartIce();
          void offer();
        }
      };
      connection.onnegotiationneeded = () => {
        if (remoteReady.current) void offer();
      };
      setJoined(true);
      signal({ ready: true });
      if (remoteReady.current && !polite) await offer();
      setStatus('Ready. Waiting for the other person to join…');
    } catch (e) {
      started.current = false;
      setStatus(errorText(e));
      stream.current?.getTracks().forEach((t) => t.stop());
      onError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="call-panel">
      <div className="call-videos">
        <div className="remote-video">
          <video ref={remote} autoPlay playsInline />
          {!remoteConnected && (
            <div className="video-placeholder">
              <Avatar
                person={peer ?? { username: 'Room', avatar: '💬' }}
                size="large"
              />
              <p>{peer?.username ?? chat.title}</p>
              <span>{status}</span>
            </div>
          )}
        </div>
        <div className="local-video">
          <video ref={local} autoPlay playsInline muted />
          <span>You{!camera ? ' · Camera off' : ''}</span>
        </div>
      </div>
      <div className="call-controls">
        {!joined ? (
          <>
            <button
              className="icon-button"
              aria-label={
                camera
                  ? 'Turn camera off before joining'
                  : 'Turn camera on before joining'
              }
              onClick={() => setCamera((v) => !v)}
            >
              {camera ? <Video /> : <VideoOff />}
            </button>
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
          </>
        ) : (
          <>
            <button
              className="icon-button"
              aria-label={mic ? 'Mute microphone' : 'Unmute microphone'}
              onClick={() => {
                const enabled = !mic;
                stream.current
                  ?.getAudioTracks()
                  .forEach((t) => (t.enabled = enabled));
                setMic(enabled);
              }}
            >
              {mic ? <Mic /> : <MicOff />}
            </button>
            <button
              className="icon-button"
              aria-label={camera ? 'Turn camera off' : 'Turn camera on'}
              onClick={async () => {
                const tracks = stream.current?.getVideoTracks();
                if (tracks?.length) {
                  tracks.forEach((t) => (t.enabled = !camera));
                  setCamera((v) => !v);
                } else {
                  try {
                    const videoStream =
                      await navigator.mediaDevices.getUserMedia({
                        video: {
                          width: { ideal: 1280 },
                          height: { ideal: 720 },
                          facingMode: 'user',
                        },
                      });
                    if (!alive.current || !pc.current || !stream.current) {
                      videoStream.getTracks().forEach((t) => t.stop());
                      return;
                    }
                    for (const track of videoStream.getTracks()) {
                      stream.current.addTrack(track);
                      pc.current.addTrack(track, stream.current);
                    }
                    if (local.current) local.current.srcObject = stream.current;
                    setCamera(true);
                  } catch (error) {
                    onError(errorText(error));
                  }
                }
              }}
            >
              {camera ? <Video /> : <VideoOff />}
            </button>
          </>
        )}
        <button
          className="hangup-button"
          aria-label="Leave call"
          onClick={onClose}
        >
          <PhoneOff size={18} />
        </button>
      </div>
    </section>
  );
}
