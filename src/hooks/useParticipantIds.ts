import { useAtomValue } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { useCallback, useDebugValue, useEffect, useState } from 'react';
import { DailyEventObject } from '@daily-co/daily-js';

import {
  ExtendedDailyParticipant,
  participantIdsState,
  participantState,
} from '../DailyParticipants';
import { customDeepEqual } from '../lib/customDeepEqual';
import { Atom } from 'jotai';
import { equalAtomFamily } from '../lib/jotai-custom';
import { isTrackOff } from '../utils/isTrackOff';
import {
  participantPropertiesState,
  participantPropertyState,
} from './useParticipantProperty';
import { useThrottledDailyEvent } from './useThrottledDailyEvent';

type FilterParticipantsFunction = (
  p: ExtendedDailyParticipant,
  index: number,
  arr: ExtendedDailyParticipant[]
) => boolean;
type SerializableFilterParticipants =
  | 'local'
  | 'remote'
  | 'owner'
  | 'record'
  | 'screen';
type FilterParticipants =
  | SerializableFilterParticipants
  | FilterParticipantsFunction;

type SortParticipantsFunction = (
  a: ExtendedDailyParticipant,
  b: ExtendedDailyParticipant
) => 1 | -1 | 0;
type SerializableSortParticipants =
  | 'joined_at'
  | 'session_id'
  | 'user_id'
  | 'user_name';
type SortParticipants = SerializableSortParticipants | SortParticipantsFunction;

/**
 * Short-cut state selector for useParticipantIds({ filter: 'local' })
 */
export const participantIdsFilteredAndSortedState = equalAtomFamily<
  string[],
  {
    filter: SerializableFilterParticipants | null;
    sort: SerializableSortParticipants | null;
  }
>({
  equals: customDeepEqual,
  get:
    ({ filter, sort }) =>
    (get) => {
      const ids = get(participantIdsState);
      return ids
        .filter((id) => {
          switch (filter) {
            case 'local':
            case 'owner':
            case 'record': {
              return get(participantPropertyState({ id, property: filter }));
            }
            case 'remote': {
              return !get(participantPropertyState({ id, property: 'local' }));
            }
            case 'screen': {
              const [screenAudioState, screenVideoState] = get(
                participantPropertiesState({
                  id,
                  properties: [
                    'tracks.screenAudio.state',
                    'tracks.screenVideo.state',
                  ],
                })
              );
              return (
                !isTrackOff(screenAudioState) || !isTrackOff(screenVideoState)
              );
            }
            default:
              return true;
          }
        })
        .sort((idA, idB) => {
          switch (sort) {
            case 'joined_at':
            case 'session_id':
            case 'user_id':
            case 'user_name': {
              const [aSort] = get(
                participantPropertiesState({ id: idA, properties: [sort] })
              );
              const [bSort] = get(
                participantPropertiesState({ id: idB, properties: [sort] })
              );
              if (aSort !== undefined || bSort !== undefined) {
                if (aSort === undefined) return -1;
                if (bSort === undefined) return 1;
                if (aSort > bSort) return 1;
                if (aSort < bSort) return -1;
              }
              return 0;
            }
            default:
              return 0;
          }
        });
    },
});

interface UseParticipantIdsArgs {
  filter?: FilterParticipants;
  onActiveSpeakerChange?(ev: DailyEventObject<'active-speaker-change'>): void;
  onParticipantJoined?(ev: DailyEventObject<'participant-joined'>): void;
  onParticipantLeft?(ev: DailyEventObject<'participant-left'>): void;
  onParticipantUpdated?(ev: DailyEventObject<'participant-updated'>): void;
  sort?: SortParticipants;
}

/**
 * Returns a list of participant ids (= session_id).
 * The list can optionally be filtered and sorted, using the filter and sort options.
 */
export const useParticipantIds = ({
  filter,
  onActiveSpeakerChange,
  onParticipantJoined,
  onParticipantLeft,
  onParticipantUpdated,
  sort,
}: UseParticipantIdsArgs = {}) => {
  /**
   * For instances of useParticipantIds with string-based filter and sort,
   * we can immediately return the correct ids from Jotai's state.
   */
  const preFilteredSortedIds = useAtomValue(
    participantIdsFilteredAndSortedState({
      filter: typeof filter === 'string' ? filter : null,
      sort: typeof sort === 'string' ? sort : null,
    })
  );

  // Define types for filter and sort functions
  type FilterFunction = (participant: ExtendedDailyParticipant) => boolean;
  type SortFunction = (
    a: ExtendedDailyParticipant,
    b: ExtendedDailyParticipant
  ) => number;

  // Define the type for the get function
  type GetFunction = <T>(atom: Atom<T>) => T;

  const shouldUseCustomIds =
    typeof filter === 'function' || typeof sort === 'function';

  const getCustomFilteredIds = useCallback(
    (get: GetFunction) => {
      if (typeof filter !== 'function' && typeof sort !== 'function') return [];

      const participants: (ExtendedDailyParticipant | null)[] =
        preFilteredSortedIds.map((id) => get(participantState(id)));

      return participants
        .filter(
          (participant): participant is ExtendedDailyParticipant =>
            participant !== null
        )
        .filter((participant: ExtendedDailyParticipant) =>
          typeof filter === 'function'
            ? (filter as FilterFunction)(participant)
            : true
        )
        .sort((a: ExtendedDailyParticipant, b: ExtendedDailyParticipant) =>
          typeof sort === 'function' ? (sort as SortFunction)(a, b) : 0
        )
        .map((p) => p.session_id)
        .filter((id): id is string => id !== null && id !== undefined);
    },
    [filter, preFilteredSortedIds, sort] as const
  );

  const [customIds, setCustomIds] = useState<string[]>([]);

  const maybeUpdateCustomIds = useAtomCallback(
    useCallback(
      (get) => () => {
        if (!shouldUseCustomIds) return;
        const newIds = getCustomFilteredIds(get);
        if (customDeepEqual(newIds, customIds)) return;
        setCustomIds(newIds);
      },
      [customIds, getCustomFilteredIds, shouldUseCustomIds]
    )
  );

  useEffect(() => {
    maybeUpdateCustomIds()();
  }, [maybeUpdateCustomIds]);

  useThrottledDailyEvent(
    [
      'participant-joined',
      'participant-updated',
      'active-speaker-change',
      'participant-left',
    ],
    useCallback(
      (evts) => {
        if (!evts.length) return;
        evts.forEach((ev) => {
          switch (ev.action) {
            case 'participant-joined':
              onParticipantJoined?.(ev);
              break;
            case 'participant-updated':
              onParticipantUpdated?.(ev);
              break;
            case 'active-speaker-change':
              onActiveSpeakerChange?.(ev);
              break;
            case 'participant-left':
              onParticipantLeft?.(ev);
              break;
          }
        });
        maybeUpdateCustomIds()();
      },
      [
        maybeUpdateCustomIds,
        onActiveSpeakerChange,
        onParticipantJoined,
        onParticipantLeft,
        onParticipantUpdated,
      ]
    )
  );

  const result =
    typeof filter === 'function' || typeof sort === 'function'
      ? customIds
      : preFilteredSortedIds;

  useDebugValue(result);

  return result;
};
