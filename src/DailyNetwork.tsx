import { DailyNetworkStats, DailyNetworkTopology } from '@daily-co/daily-js';
import React, { useEffect, useCallback } from 'react';
import { atom, useAtomValue } from 'jotai';
import { useAtomCallback } from 'jotai/utils';

import { useDaily } from './hooks/useDaily';
import { useDailyEvent } from './hooks/useDailyEvent';

export const topologyState = atom<DailyNetworkTopology | 'none'>('none');
export const networkQualityState = atom<DailyNetworkStats['quality']>(100);
export const networkThresholdState =
  atom<DailyNetworkStats['threshold']>('good');

export const DailyNetwork: React.FC<React.PropsWithChildren<{}>> = ({
  children,
}) => {
  const daily = useDaily();

  const topology = useAtomValue(topologyState);

  const initTopology = useAtomCallback(
    useCallback(
      async (_get, set) => {
        if (!daily) return;
        const topology = await daily.getNetworkTopology();
        if (!topology || topology?.topology === 'none') return;
        set(topologyState, topology.topology);
      },
      [daily]
    )
  );

  useDailyEvent('joined-meeting', initTopology);
  useDailyEvent(
    'network-connection',
    useAtomCallback(
      useCallback(
        (_get, set) => (ev: { event: string; type: string }) => {
          switch (ev.event) {
            case 'connected':
              if (ev.type === 'peer-to-peer') set(topologyState, 'peer');
              if (ev.type === 'sfu') set(topologyState, 'sfu');
              break;
          }
        },
        []
      )
    )
  );
  useDailyEvent(
    'network-quality-change',
    useAtomCallback(
      useCallback(
        (_get, set) =>
          (ev: {
            quality: number;
            threshold: DailyNetworkStats['threshold'];
          }) => {
            set(
              networkQualityState,
              (prevQuality: DailyNetworkStats['quality']) =>
                prevQuality !== ev.quality ? ev.quality : prevQuality
            );
            set(
              networkThresholdState,
              (prevThreshold: DailyNetworkStats['threshold']) =>
                prevThreshold !== ev.threshold ? ev.threshold : prevThreshold
            );
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
          set(topologyState, 'none');
          set(networkQualityState, 100);
          set(networkThresholdState, 'good');
        },
        []
      )
    )
  );

  useEffect(() => {
    if (!daily || topology !== 'none') return;
    initTopology();
  }, [daily, initTopology, topology]);

  return <>{children}</>;
};
