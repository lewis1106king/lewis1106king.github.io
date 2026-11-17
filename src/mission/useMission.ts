import { useCallback, useEffect, useState } from 'react';
import type { DroneStatus, LatLng } from '../domain/rules';
import { blobToDataUrl, compressImage } from '../lib/imageFile';
import { addMark, addPhoto, addZone, beat, completeZone, moveMember, moveVertex, setLevel, setSharing, type Fix } from '../sync/edit';
import type { PointKind } from './types';
import { autoAssign, dropDrone, undoHandover } from '../sync/handover';
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

  useEffect(() => {
    const timer = window.setInterval(() => change((current) => autoAssign(current, Date.now())), 3000);
    return () => window.clearInterval(timer);
  }, [change]);

  const beatPresence = useCallback((position: Fix | null) => {
    change((current) => beat(current, selfId, position));
  }, [change, selfId]);

  const setBattery = useCallback((level: number) => {
    change((current) => setLevel(current, selfId, level));
  }, [change, selfId]);

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
    beat: beatPresence,
    setSharing: (camera: boolean) => change((current) => setSharing(current, selfId, camera)),
    setBattery,
    addMark: (kind: PointKind, point: LatLng, memo: string) => change((current) => addMark(current, selfId, kind, point, memo)),
    moveVertex: (zoneId: string, index: number, point: LatLng) => change((current) => moveVertex(current, zoneId, index, point)),
    dropLink: () => change((current) => dropDrone(current, selfId, 'lost')),
    drainBattery: () => change((current) => dropDrone(current, selfId, 'battery')),
    undoHandover: (handoverId: string) => change((current) => undoHandover(current, handoverId)),
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
