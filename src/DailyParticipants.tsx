import {
  DailyParticipant,
  DailyParticipantsObject,
  DailyParticipantTracks,
  DailyWaitingParticipant,
} from '@daily-co/daily-js';
import React, { useCallback, useEffect, useState } from 'react';
import { atom } from 'jotai';
import { equalAtomFamily } from './lib/jotai-custom';
import { atomFamily, useAtomCallback } from 'jotai/utils';

import { useDaily } from './hooks/useDaily';
import { useDailyEvent } from './hooks/useDailyEvent';
import {
  participantPropertyPathsState,
  participantPropertyState,
} from './hooks/useParticipantProperty';
import { useThrottledDailyEvent } from './hooks/useThrottledDailyEvent';
import { customDeepEqual } from './lib/customDeepEqual';
import { getParticipantPaths } from './utils/getParticipantPaths';
import { resolveParticipantPaths } from './utils/resolveParticipantPaths';

/**
 * Extends DailyParticipant with convenient additional properties.
 */
export interface ExtendedDailyParticipant
  extends Omit<DailyParticipant, 'tracks'> {
  last_active?: Date;
  tracks: DailyParticipantTracks;
}

export const activeIdState = atom<string | null>(null);

export const localIdState = atom<string>('');

export const localJoinDateState = atom<Date | null>(null);

export const participantIdsState = atom<string[]>([]);

// Define the participantState atomFamily

export const participantState = atomFamily((_id: string) =>
  atom<ExtendedDailyParticipant | null>(null)
);

// export const participantState = atomFamily<
//   ExtendedDailyParticipant | null,
//   string
// >;

export const participantsState = atom<ExtendedDailyParticipant[]>((get) => {
  const ids = get(participantIdsState);
  const participants = ids
    .map((id) => get(participantState(id)))
    .filter(Boolean) as ExtendedDailyParticipant[];
  return participants;
});

export const waitingParticipantsState = atom<string[]>([]);

export const waitingParticipantState = atomFamily((id: string) =>
  atom<DailyWaitingParticipant>({
    awaitingAccess: {
      level: 'full',
    },
    id,
    name: '',
  })
);

// export function equalAtom<T>(options: EqualAtomOptions<T>) {
//   const baseAtom = atom(options.get);
//   const derivedAtom = atom((get) => {
//     const latest = get(baseAtom);
//     if (prior !== undefined && options.equals(latest, prior)) {
//       return prior;
//     }
//     prior = latest;
//     return latest;
//   });

//   let prior: T | undefined;
//   return derivedAtom;
// }

export const allWaitingParticipantsSelector = equalAtomFamily<
  any[],
  DailyWaitingParticipant | undefined
>({
  equals: (a, b) => JSON.stringify(a) === JSON.stringify(b), // Use a custom equality function
  get: () => (get) => {
    const ids = get(waitingParticipantsState);
    return ids.map((id) => get(waitingParticipantState(id)));
  },
});

export const DailyParticipants: React.FC<React.PropsWithChildren<unknown>> = ({
  children,
}) => {
  const daily = useDaily();
  const [initialized, setInitialized] = useState(false);

  const initParticipants = useAtomCallback(
    useCallback((_get, set, participants: DailyParticipantsObject) => {
      set(localIdState, participants.local.session_id);
      const participantsArray = Object.values(participants);
      const ids = participantsArray.map((p) => p.session_id);
      set(participantIdsState, ids);
      participantsArray.forEach((p) => {
        set(participantState(p.session_id), p);
        const paths = getParticipantPaths(p);
        set(participantPropertyPathsState(p.session_id), paths);
        paths.forEach((property) => {
          const [value] = resolveParticipantPaths(
            p as ExtendedDailyParticipant,
            [property]
          );
          set(
            participantPropertyState({
              id: p.session_id,
              property,
            }),
            value
          );
        });
      });
      setInitialized(true);
    }, [])
  );

  useEffect(() => {
    if (!daily || initialized) return;
    const interval = setInterval(() => {
      const participants = daily.participants();
      if (!('local' in participants)) return;
      initParticipants(participants);
      clearInterval(interval);
    }, 100);
    return () => {
      clearInterval(interval);
    };
  }, [daily, initialized, initParticipants]);

  const handleInitEvent = useCallback(() => {
    if (!daily) return;
    const participants = daily?.participants();
    if (!participants.local) return;
    initParticipants(participants);
  }, [daily, initParticipants]);

  useDailyEvent('started-camera', handleInitEvent, true);
  useDailyEvent('access-state-updated', handleInitEvent, true);

  useDailyEvent(
    'joining-meeting',
    useAtomCallback(
      useCallback(
        (_get, set) => {
          set(localJoinDateState, new Date());
          handleInitEvent();
        },
        [handleInitEvent]
      )
    ),
    true
  );

  useDailyEvent(
    'joined-meeting',
    useCallback(
      (ev) => {
        initParticipants(ev.participants);
      },
      [initParticipants]
    ),
    true
  );

  const handleCleanup = useAtomCallback(
    useCallback((get, set) => {
      set(localIdState, '');
      set(activeIdState, null);
      const ids = get(participantIdsState);
      ids.forEach((id) => set(participantState(id), null));
      set(participantIdsState, []);
    }, [])
  );

  useDailyEvent('call-instance-destroyed', handleCleanup, true);
  useDailyEvent('left-meeting', handleCleanup, true);

  useThrottledDailyEvent(
    [
      'active-speaker-change',
      'participant-joined',
      'participant-updated',
      'participant-left',
    ],
    useAtomCallback(
      useCallback((get, set, evts) => {
        if (!evts.length) return;
        evts.forEach((ev) => {
          switch (ev.action) {
            case 'active-speaker-change': {
              set(activeIdState, ev.activeSpeaker.peerId);
              set(participantState(ev.activeSpeaker.peerId), (prev) => {
                if (!prev) return null;
                return {
                  ...prev,
                  last_active: new Date(),
                };
              });
              break;
            }
            case 'participant-joined': {
              set(participantIdsState, (prevIds) =>
                prevIds.includes(ev.participant.session_id)
                  ? prevIds
                  : [...prevIds, ev.participant.session_id]
              );
              set(participantState(ev.participant.session_id), ev.participant);

              const paths = getParticipantPaths(ev.participant);
              set(
                participantPropertyPathsState(ev.participant.session_id),
                paths
              );
              paths.forEach((property) => {
                const [value] = resolveParticipantPaths(
                  ev.participant as ExtendedDailyParticipant,
                  [property]
                );
                set(
                  participantPropertyState({
                    id: ev.participant.session_id,
                    property,
                  }),
                  value
                );
              });
              break;
            }
            case 'participant-updated': {
              set(participantState(ev.participant.session_id), (prev) => ({
                ...prev,
                ...ev.participant,
              }));
              if (ev.participant.local) {
                set(localIdState, (prevId) =>
                  prevId !== ev.participant.session_id
                    ? ev.participant.session_id
                    : prevId
                );
              }

              const paths = getParticipantPaths(ev.participant);
              const oldPaths = get(
                participantPropertyPathsState(ev.participant.session_id)
              );
              set(
                participantPropertyPathsState(ev.participant.session_id),
                (prev) => (customDeepEqual(prev, paths) ? prev : paths)
              );
              oldPaths
                .filter((p) => !paths.includes(p))
                .forEach((property) => {
                  set(
                    participantPropertyState({
                      id: ev.participant.session_id,
                      property,
                    }),
                    null
                  );
                });
              paths.forEach((property) => {
                const [value] = resolveParticipantPaths(
                  ev.participant as ExtendedDailyParticipant,
                  [property]
                );
                set(
                  participantPropertyState({
                    id: ev.participant.session_id,
                    property,
                  }),
                  (prev: any) => (customDeepEqual(prev, value) ? prev : value)
                );
              });
              break;
            }
            case 'participant-left': {
              set(participantIdsState, (prevIds) =>
                prevIds.includes(ev.participant.session_id)
                  ? prevIds.filter((id) => id !== ev.participant.session_id)
                  : prevIds
              );
              set(participantState(ev.participant.session_id), null);

              const oldPaths = get(
                participantPropertyPathsState(ev.participant.session_id)
              );
              oldPaths.forEach((property) => {
                set(
                  participantPropertyState({
                    id: ev.participant.session_id,
                    property,
                  }),
                  null
                );
              });
              set(participantPropertyPathsState(ev.participant.session_id), []);
              break;
            }
          }
        });
      }, [])
    ),
    100,
    true
  );

  useThrottledDailyEvent(
    [
      'waiting-participant-added',
      'waiting-participant-updated',
      'waiting-participant-removed',
    ],
    useAtomCallback(
      useCallback((_get, set, evts) => {
        evts.forEach((ev) => {
          switch (ev.action) {
            case 'waiting-participant-added':
              set(waitingParticipantsState, (wps) =>
                wps.includes(ev.participant.id)
                  ? wps
                  : [...wps, ev.participant.id]
              );
              set(waitingParticipantState(ev.participant.id), ev.participant);
              break;
            case 'waiting-participant-updated':
              set(waitingParticipantState(ev.participant.id), ev.participant);
              break;
            case 'waiting-participant-removed':
              set(waitingParticipantsState, (wps) =>
                wps.filter((wp) => wp !== ev.participant.id)
              );
              set(waitingParticipantState(ev.participant.id), {
                awaitingAccess: { level: 'full' },
                id: ev.participant.id,
                name: '',
              });
              break;
          }
        });
      }, [])
    ),
    100,
    true
  );

  return <>{children}</>;
};
