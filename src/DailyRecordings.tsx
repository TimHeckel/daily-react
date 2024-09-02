import { DailyStreamingLayoutConfig } from '@daily-co/daily-js';
import React, { useEffect, useCallback } from 'react';
import { atom, useSetAtom } from 'jotai';
import { useAtomCallback } from 'jotai/utils';

import { useDailyEvent } from './hooks/useDailyEvent';
import { useLocalSessionId } from './hooks/useLocalSessionId';
import { useParticipantIds } from './hooks/useParticipantIds';

interface RecordingState {
  /**
   * Determines whether an error occurred during the last recording attempt.
   */
  error?: boolean;
  /**
   * Determines whether the local participant is being recorded, based on the recording settings.
   */
  isLocalParticipantRecorded: boolean;
  /**
   * Determines whether a recording is currently running or not.
   */
  isRecording: boolean;
  /**
   * Contains the last applied cloud recording layout config.
   */
  layout?: DailyStreamingLayoutConfig;
  /**
   * Determines whether the recording is running locally.
   * See [enable_recording](https://docs.daily.co/reference/rest-api/rooms/config#enable_recording).
   */
  local?: boolean;
  /**
   * Contains the recording id.
   */
  recordingId?: string;
  /**
   * Contains the date when the 'recording-started' event was received.
   * This doesn't necessarily match the date the recording was actually started.
   */
  recordingStartedDate?: Date;
  /**
   * Contains the session_id of the participant who started the recording.
   */
  startedBy?: string;
  /**
   * Contains the recording type.
   * See [enable_recording](https://docs.daily.co/reference/rest-api/rooms/config#enable_recording).
   */
  type?: string;
}

export const recordingState = atom<RecordingState>({
  isLocalParticipantRecorded: false,
  isRecording: false,
});

export const DailyRecordings: React.FC<React.PropsWithChildren<unknown>> = ({
  children,
}) => {
  const setState = useSetAtom(recordingState);

  const localSessionId = useLocalSessionId();

  const recordingParticipantIds = useParticipantIds({
    filter: 'record',
  });

  /**
   * Update recording state, whenever amount of recording participants changes.
   */
  useEffect(() => {
    const hasRecordingParticipants = recordingParticipantIds.length > 0;
    const isLocalParticipantRecording = recordingParticipantIds.includes(
      localSessionId || 'local'
    );
    setState((s) => ({
      ...s,
      // In case type is local or not set, determine based on recording participants
      isLocalParticipantRecorded:
        s?.type === 'local' || !s?.type
          ? hasRecordingParticipants
          : s.isLocalParticipantRecorded,
      isRecording:
        s?.type === 'local' || !s?.type
          ? hasRecordingParticipants
          : s.isRecording,
      local:
        (s?.type === 'local' || !s?.type) && hasRecordingParticipants
          ? isLocalParticipantRecording
          : s?.local,
      /**
       * Set type in case recording participants are detected.
       * We only set `record` on participants, when recording type is 'local'.
       */
      type: hasRecordingParticipants ? 'local' : s?.type,
    }));
  }, [localSessionId, recordingParticipantIds, setState]);

  useDailyEvent(
    'recording-started',
    useAtomCallback(
      useCallback(
        (_get: any, set: any) => (ev: any) => {
          let isLocalParticipantRecorded: boolean = true;
          switch (ev.type) {
            case 'cloud-beta':
            case 'cloud': {
              if (
                localSessionId &&
                ev.layout?.preset === 'single-participant' &&
                ev.layout.session_id !== localSessionId
              ) {
                isLocalParticipantRecorded = false;
              }
              break;
            }
          }
          set(recordingState, {
            error: false,
            isLocalParticipantRecorded,
            isRecording: true,
            layout: ev?.layout,
            local: ev?.local,
            recordingId: ev?.recordingId,
            recordingStartedDate: new Date(),
            startedBy: ev?.startedBy,
            type: ev?.type,
          });
        },
        [localSessionId]
      )
    )
  );

  useDailyEvent(
    'recording-stopped',
    useAtomCallback(
      useCallback(
        (_get, set) => () => {
          set(recordingState, (prevState) => ({
            ...prevState,
            isLocalParticipantRecorded: false,
            isRecording: false,
          }));
        },
        []
      )
    )
  );

  useDailyEvent(
    'recording-error',
    useAtomCallback(
      useCallback(
        (_get, set) => () => {
          set(recordingState, (prevState: RecordingState) => ({
            ...prevState,
            error: true,
            isLocalParticipantRecorded: false,
            isRecording: false,
          }));
        },
        []
      )
    )
  );

  useDailyEvent(
    'left-meeting',
    useAtomCallback(
      useCallback(
        (_get, set) => () => {
          set(recordingState, {
            isLocalParticipantRecorded: false,
            isRecording: false,
          });
        },
        []
      )
    )
  );

  return <>{children}</>;
};
