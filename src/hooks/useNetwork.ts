import {
  DailyEventObject,
  DailyNetworkStats,
  DailyNetworkTopology,
} from '@daily-co/daily-js';
import { useCallback, useEffect } from 'react';
import { atom, useRecoilCallback, useRecoilValue } from 'recoil';

import { RECOIL_PREFIX } from '../lib/constants';
import { useDaily } from './useDaily';
import { useDailyEvent } from './useDailyEvent';

interface UseNetworkArgs {
  onNetworkConnection?(ev: DailyEventObject<'network-connection'>): void;
  onNetworkQualityChange?(ev: DailyEventObject<'network-quality-change'>): void;
}

const topologyState = atom<DailyNetworkTopology | 'none'>({
  key: RECOIL_PREFIX + 'topology',
  default: 'none',
});
const networkQualityState = atom<DailyNetworkStats['quality']>({
  key: RECOIL_PREFIX + 'networkQuality',
  default: 100,
});
const networkThresholdState = atom<DailyNetworkStats['threshold']>({
  key: RECOIL_PREFIX + 'networkThreshold',
  default: 'good',
});

/**
 * Returns current information about network quality and topology.
 * Allows to setup event listeners for daily's [network events](https://docs.daily.co/reference/daily-js/events/network-events).
 */
export const useNetwork = ({
  onNetworkConnection,
  onNetworkQualityChange,
}: UseNetworkArgs = {}) => {
  const daily = useDaily();

  const topology = useRecoilValue(topologyState);
  const quality = useRecoilValue(networkQualityState);
  const threshold = useRecoilValue(networkThresholdState);

  const initTopology = useRecoilCallback(
    ({ set }) =>
      async () => {
        if (!daily) return;
        const topology = await daily.getNetworkTopology();
        if (!topology || topology?.topology === 'none') return;
        set(topologyState, topology.topology);
      },
    [daily]
  );

  useDailyEvent('joined-meeting', initTopology);
  useDailyEvent(
    'network-connection',
    useRecoilCallback(
      ({ transact_UNSTABLE }) =>
        (ev) => {
          transact_UNSTABLE(({ set }) => {
            switch (ev.event) {
              case 'connected':
                if (ev.type === 'peer-to-peer') set(topologyState, 'peer');
                if (ev.type === 'sfu') set(topologyState, 'sfu');
                break;
            }
          });
          onNetworkConnection?.(ev);
        },
      [onNetworkConnection]
    )
  );
  useDailyEvent(
    'network-quality-change',
    useRecoilCallback(
      ({ transact_UNSTABLE }) =>
        (ev) => {
          transact_UNSTABLE(({ set }) => {
            set(networkQualityState, (prevQuality) =>
              prevQuality !== ev.quality ? ev.quality : prevQuality
            );
            set(networkThresholdState, (prevThreshold) =>
              prevThreshold !== ev.threshold ? ev.threshold : prevThreshold
            );
          });
          onNetworkQualityChange?.(ev);
        },
      [onNetworkQualityChange]
    )
  );

  useEffect(() => {
    if (!daily || topology) return;
    initTopology();
  }, [daily, initTopology, topology]);

  const getStats = useCallback(async () => {
    const newStats = await daily?.getNetworkStats();
    return newStats?.stats;
  }, [daily]);

  return {
    getStats,
    quality,
    threshold,
    topology,
  };
};
