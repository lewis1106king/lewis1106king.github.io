import { useCallback, useEffect, useState } from 'react';
import type { DroneStatus, LatLng } from '../domain/rules';
import { blobToDataUrl, compressImage } from '../lib/imageFile';
import { addPhoto, addZone, approveStop, completeZone, moveMember, requestStop } from '../sync/edit';
import { openRoom } from '../sync/room';
import type { MissionData } from './types';

export function useMission(code: string, selfId: string) {
  const [data, setData] = useState<MissionData | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  useEffect(() => {
    const room = openRoom(code);
    const stop = room.subscribe((next, isLive) => {
      setData(next);
      setLive(isLive);
      if (next) setError('');
    });
    let cancel = false;
    void room.whenReady().then(() => room.waitForData(5000)).then(() => {
      if (!cancel && !room.data) setError('이 코드를 찾지 못했어요.');
    });
    return () => {
      cancel = true;
      stop();
    };
  }, [code]);

  const change = useCallback((update: (data: MissionData) => MissionData) => {
    openRoom(code).update(update);
  }, [code]);

  const sharePresence = useCallback(async (
    position: { lat: number; lng: number; accuracy: number | null },
    droneStatus: DroneStatus,
  ) => {
    change((current) => moveMember(current, selfId, position, droneStatus));
  }, [change, selfId]);

  const self = data?.members.find((member) => member.userId === selfId) ?? null;

  return {
    data,
    error,
    live,
    self,
    createZone: (label: string, path: LatLng[]) => change((current) => addZone(current, selfId, label, path)),
    completeZone: (zoneId: string) => change((current) => completeZone(current, zoneId)),
    requestHandover: (zoneId: string, reason: string) => change((current) => requestStop(current, zoneId, selfId, reason)),
    decideHandover: (handoverId: string) => change((current) => approveStop(current, handoverId, selfId)),
    uploadPhoto: async (zoneId: string, file: File) => {
      try {
        let blob = await compressImage(file, 720, 0.62);
        if (blob.size > 52000) blob = await compressImage(file, 480, 0.48);
        const url = await blobToDataUrl(blob);
        if (url.length > 100000) throw new Error('사진이 너무 커요.');
        change((current) => addPhoto(current, zoneId, selfId, url));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '사진을 올리지 못했습니다.');
      }
    },
    sharePresence,
  };
}
