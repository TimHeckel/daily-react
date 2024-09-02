import { DailyMeetingState } from '@daily-co/daily-js';
import { useDebugValue } from 'react';
import { useAtomValue } from 'jotai';

import { meetingStateState } from '../DailyMeeting';

/**
 * Returns a meeting's current state.
 */
export const useMeetingState = (): DailyMeetingState | null => {
  const meetingState = useAtomValue(meetingStateState);
  useDebugValue(meetingState);
  return meetingState;
};
