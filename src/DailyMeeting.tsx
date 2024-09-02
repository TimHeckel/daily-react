import {
  DailyEventObjectFatalError,
  DailyEventObjectNonFatalError,
  DailyMeetingSessionState,
  DailyMeetingState,
} from '@daily-co/daily-js';
import React, { useCallback } from 'react';
import { atom } from 'jotai';
import { useAtomCallback } from 'jotai/utils';
import { useDaily } from './hooks/useDaily';
import { useDailyEvent } from './hooks/useDailyEvent';

export const meetingStateState = atom<DailyMeetingState>('new');

export const meetingErrorState = atom<DailyEventObjectFatalError | null>(null);

export const nonFatalErrorState = atom<DailyEventObjectNonFatalError | null>(
  null
);

export const meetingSessionDataState = atom<DailyMeetingSessionState>({
  data: undefined,
  topology: 'none',
});

export const DailyMeeting: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => {
  const daily = useDaily();

  /**
   * Updates meeting state.
   */
  const updateMeetingState = useAtomCallback(
    useCallback(
      (_get, set) => {
        if (!daily) return;
        const meetingState = daily.meetingState();
        set(meetingStateState, meetingState);
        return meetingState;
      },
      [daily]
    )
  );

  useDailyEvent('loading', updateMeetingState);
  useDailyEvent('loaded', updateMeetingState);
  useDailyEvent('joining-meeting', updateMeetingState);
  useDailyEvent('joined-meeting', updateMeetingState);
  useDailyEvent('left-meeting', updateMeetingState);
  useDailyEvent(
    'error',
    useAtomCallback(
      useCallback(
        (_get, set) => (ev: DailyEventObjectFatalError) => {
          set(meetingErrorState, ev);
          updateMeetingState();
        },
        [updateMeetingState]
      )
    )
  );
  useDailyEvent(
    'nonfatal-error',
    useAtomCallback(
      useCallback(
        (_get, set) => (ev: DailyEventObjectNonFatalError) => {
          set(nonFatalErrorState, ev);
        },
        []
      )
    )
  );

  /**
   * Updates meeting session state.
   */
  const initMeetingSessionState = useAtomCallback(
    useCallback(
      (_get, set) => {
        if (!daily) return;
        set(meetingSessionDataState, daily.meetingSessionState());
      },
      [daily]
    )
  );

  /**
   * Initialize state when joined meeting or setting up the hook.
   */
  useDailyEvent('joined-meeting', initMeetingSessionState);

  /**
   * Update Jotai state whenever meeting session state is updated.
   */
  useDailyEvent(
    'meeting-session-state-updated',
    useAtomCallback(
      useCallback(
        (_get, set) =>
          (ev: { meetingSessionState: DailyMeetingSessionState }) => {
            set(meetingSessionDataState, ev.meetingSessionState);
          },
        []
      )
    )
  );

  /**
   * Reset Jotai state when meeting ends.
   */
  useDailyEvent(
    'left-meeting',
    useAtomCallback(
      useCallback(
        (_get, set) => () => {
          set(meetingSessionDataState, {
            data: undefined,
            topology: 'none',
          });
        },
        []
      )
    )
  );

  /**
   * Reset Jotai state when call instance is destroyed.
   */
  useDailyEvent(
    'call-instance-destroyed',
    useAtomCallback(
      useCallback(
        (_get, set) => () => {
          set(meetingStateState, 'new');
          set(meetingErrorState, null);
          set(nonFatalErrorState, null);
          set(meetingSessionDataState, {
            data: undefined,
            topology: 'none',
          });
        },
        []
      )
    )
  );

  return <>{children}</>;
};
