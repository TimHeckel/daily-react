import React, {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { useAtomCallback } from 'jotai/utils';

import { ExtendedDailyParticipant } from '../DailyParticipants';
import { useActiveSpeakerId } from '../hooks/useActiveSpeakerId';
import { useDaily } from '../hooks/useDaily';
import { useLocalSessionId } from '../hooks/useLocalSessionId';
import { useParticipantIds } from '../hooks/useParticipantIds';
import { participantPropertyState } from '../hooks/useParticipantProperty';
import { useScreenShare } from '../hooks/useScreenShare';
import { useThrottledDailyEvent } from '../hooks/useThrottledDailyEvent';
import { isTrackOff } from '../utils/isTrackOff';
import { DailyAudioPlayException, DailyAudioTrack } from './DailyAudioTrack';

interface Props {
  autoSubscribeActiveSpeaker?: boolean;
  maxSpeakers?: number;
  onPlayFailed?(e: DailyAudioPlayException): void;
  playLocalScreenAudio?: boolean;
}

export interface DailyAudioHandle {
  getAllAudio(): HTMLAudioElement[];
  getActiveSpeakerAudio(): HTMLAudioElement | null;
  getRmpAudio(): HTMLAudioElement[];
  getScreenAudio(): HTMLAudioElement[];
  getAudioBySessionId(sessionId: string): HTMLAudioElement | null;
  getRmpAudioBySessionId(sessionId: string): HTMLAudioElement | null;
  getScreenAudioBySessionId(sessionId: string): HTMLAudioElement | null;
}

export const DailyAudio = memo(
  forwardRef<DailyAudioHandle, Props>(
    (
      {
        autoSubscribeActiveSpeaker = false,
        maxSpeakers = 5,
        onPlayFailed,
        playLocalScreenAudio = false,
      },
      ref
    ) => {
      const daily = useDaily();
      const [speakers, setSpeakers] = useState<string[]>(
        new Array(maxSpeakers).fill('')
      );
      const { screens } = useScreenShare();
      const localSessionId = useLocalSessionId();
      const activeSpeakerId = useActiveSpeakerId({
        ignoreLocal: true,
      });

      const containerRef = useRef<HTMLDivElement>(null);
      useImperativeHandle(
        ref,
        () => ({
          getActiveSpeakerAudio: () => {
            return (
              containerRef.current?.querySelector(
                `audio[data-session-id="${activeSpeakerId}"][data-audio-type="audio"]`
              ) ?? null
            );
          },
          getAllAudio: () => {
            return Array.from(
              containerRef.current?.querySelectorAll('audio') ?? []
            );
          },
          getAudioBySessionId: (id) => {
            return (
              containerRef.current?.querySelector(
                `audio[data-session-id="${id}"][data-audio-type="audio"]`
              ) ?? null
            );
          },
          getRmpAudio: () => {
            return Array.from(
              containerRef.current?.querySelectorAll(
                'audio[data-audio-type="rmpAudio"]'
              ) ?? []
            );
          },
          getScreenAudio: () => {
            return Array.from(
              containerRef.current?.querySelectorAll(
                'audio[data-audio-type="screenAudio"]'
              ) ?? []
            );
          },
          getRmpAudioBySessionId: (id) => {
            return (
              containerRef.current?.querySelector(
                `audio[data-session-id="${id}"][data-audio-type="rmpAudio"]`
              ) ?? null
            );
          },
          getScreenAudioBySessionId: (id) => {
            return (
              containerRef.current?.querySelector(
                `audio[data-session-id="${id}"][data-audio-type="screenAudio"]`
              ) ?? null
            );
          },
        }),
        [activeSpeakerId]
      );

      const assignSpeaker = useAtomCallback(
        useCallback(
          async (get, _set, sessionId: string) => {
            const subscribedParticipants = Object.values(
              daily?.participants() ?? {}
            ).filter((p) => !p.local && Boolean(p.tracks.audio.subscribed));

            const isSubscribed = (id: string) =>
              subscribedParticipants.some((p) => p.session_id === id);

            if (!isSubscribed(sessionId)) {
              if (
                daily &&
                !daily.isDestroyed() &&
                autoSubscribeActiveSpeaker &&
                !daily.subscribeToTracksAutomatically()
              ) {
                daily.updateParticipant(sessionId, {
                  setSubscribedTracks: {
                    audio: true,
                  },
                });
              } else {
                return;
              }
            }

            setSpeakers((prevSpeakers) => {
              if (prevSpeakers.includes(sessionId)) return prevSpeakers;

              const freeSlotCheck = (id: string) => !id || !isSubscribed(id);
              if (prevSpeakers.some(freeSlotCheck)) {
                const idx = prevSpeakers.findIndex(freeSlotCheck);
                prevSpeakers[idx] = sessionId;
                return [...prevSpeakers];
              }

              const mutedIdx = prevSpeakers.findIndex((id) =>
                subscribedParticipants.some(
                  (p) => p.session_id === id && isTrackOff(p.tracks.audio.state)
                )
              );
              if (mutedIdx >= 0) {
                prevSpeakers[mutedIdx] = sessionId;
                return [...prevSpeakers];
              }

              const speakerObjects = subscribedParticipants
                .filter(
                  (p) =>
                    prevSpeakers.includes(p.session_id) &&
                    p.session_id !== activeSpeakerId
                )
                .sort((a, b) => {
                  const lastActiveA =
                    get(
                      participantPropertyState({
                        id: a.session_id,
                        property: 'last_active',
                      })
                    ) ?? new Date('1970-01-01');
                  const lastActiveB =
                    get(
                      participantPropertyState({
                        id: b.session_id,
                        property: 'last_active',
                      })
                    ) ?? new Date('1970-01-01');
                  if (lastActiveA > lastActiveB) return 1;
                  if (lastActiveA < lastActiveB) return -1;
                  return 0;
                });

              if (!speakerObjects.length) {
                const replaceIdx = prevSpeakers.findIndex(
                  (id) => id !== activeSpeakerId
                );
                prevSpeakers[replaceIdx] = sessionId;
                return [...prevSpeakers];
              }

              const replaceIdx = prevSpeakers.indexOf(
                speakerObjects[0]?.session_id
              );
              prevSpeakers[replaceIdx] = sessionId;
              return [...prevSpeakers];
            });
          },
          [activeSpeakerId, autoSubscribeActiveSpeaker, daily]
        )
      );

      const removeSpeaker = useCallback((sessionId: string) => {
        setSpeakers((prevSpeakers) => {
          if (!prevSpeakers.includes(sessionId)) return prevSpeakers;
          const newSpeakers = [...prevSpeakers];
          const idx = newSpeakers.indexOf(sessionId);
          newSpeakers[idx] = '';
          return newSpeakers;
        });
      }, []);

      useThrottledDailyEvent(
        ['active-speaker-change', 'track-started', 'participant-left'],
        useCallback(
          (evts) => {
            evts.forEach((ev) => {
              switch (ev.action) {
                case 'active-speaker-change':
                  if (ev.activeSpeaker.peerId === localSessionId) return;
                  assignSpeaker(ev.activeSpeaker.peerId);
                  break;
                case 'track-started':
                  if (
                    ev.track.kind === 'audio' &&
                    ev.participant &&
                    !ev.participant.local
                  ) {
                    assignSpeaker(ev.participant.session_id);
                  }
                  break;
                case 'participant-left':
                  removeSpeaker(ev.participant.session_id);
                  break;
              }
            });
          },
          [assignSpeaker, localSessionId, removeSpeaker]
        ),
        200
      );

      const rmpAudioIds = useParticipantIds({
        filter: useCallback(
          (p: ExtendedDailyParticipant) => Boolean(p?.tracks?.rmpAudio),
          []
        ),
      });

      return (
        <div ref={containerRef}>
          {speakers.map((sessionId, idx) => (
            <DailyAudioTrack
              key={`speaker-slot-${idx}`}
              onPlayFailed={onPlayFailed}
              sessionId={sessionId}
              type="audio"
            />
          ))}
          {screens
            .filter((screen) => (playLocalScreenAudio ? true : !screen.local))
            .map((screen) => (
              <DailyAudioTrack
                key={screen.screenId}
                onPlayFailed={onPlayFailed}
                sessionId={screen.session_id}
                type="screenAudio"
              />
            ))}
          {rmpAudioIds.map((id) => (
            <DailyAudioTrack
              key={`${id}-rmp`}
              onPlayFailed={onPlayFailed}
              sessionId={id}
              type="rmpAudio"
            />
          ))}
        </div>
      );
    }
  )
);
DailyAudio.displayName = 'DailyAudio';
