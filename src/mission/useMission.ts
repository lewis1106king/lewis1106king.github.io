import { useCallback, useEffect, useState } from 'react';
import type { DroneStatus, LatLng, ObservationStatus, TaskStatus } from '../domain/rules';
import { flushQueue, OfflineQueued, rpc, signedPhotoUrls } from '../lib/api';
import { compressImage } from '../lib/imageFile';
import { queuePhoto } from '../lib/api';
import { listJobs } from '../lib/queue';
import { getSupabase } from '../lib/supabase';
import { mapActivity, mapHandover, mapMember, mapMission, mapNotice, mapPhoto, mapPoint, mapZone } from './mapRows';
import type { MissionData, Zone } from './types';

async function loadMission(missionId: string): Promise<MissionData> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase 연결 정보가 없습니다.');
  const [mission, members, zones, points, handovers, photos, events, notices] = await Promise.all([
    supabase.from('missions').select('*').eq('id', missionId).single(),
    supabase.from('members').select('*').eq('mission_id', missionId),
    supabase.from('zones').select('*').eq('mission_id', missionId).order('label'),
    supabase.from('points').select('*').eq('mission_id', missionId).order('created_at'),
    supabase.from('handovers').select('*').eq('mission_id', missionId).order('requested_at'),
    supabase.from('photos').select('*').eq('mission_id', missionId).order('created_at'),
    supabase.from('events').select('*').eq('mission_id', missionId).order('created_at', { ascending: false }).limit(80),
    supabase.from('notifications').select('*').eq('mission_id', missionId).order('created_at', { ascending: false }).limit(40),
  ]);
  const failed = [mission.error, members.error, zones.error, points.error, handovers.error, photos.error, events.error, notices.error].find(Boolean);
  if (failed) throw new Error(failed.message);
  const photoRows = ((photos.data ?? []) as Record<string, unknown>[]).map(mapPhoto);
  const urls = await signedPhotoUrls(photoRows.map((photo) => photo.storagePath)).catch(() => ({} as Record<string, string>));
  return {
    mission: mapMission(mission.data as Record<string, unknown>),
    members: ((members.data ?? []) as Record<string, unknown>[]).map(mapMember),
    zones: ((zones.data ?? []) as Record<string, unknown>[]).map(mapZone),
    points: ((points.data ?? []) as Record<string, unknown>[]).map(mapPoint),
    handovers: ((handovers.data ?? []) as Record<string, unknown>[]).map(mapHandover),
    photos: photoRows.map((photo) => ({ ...photo, url: urls[photo.storagePath] ?? null })),
    events: ((events.data ?? []) as Record<string, unknown>[]).map(mapActivity),
    notices: ((notices.data ?? []) as Record<string, unknown>[]).map(mapNotice),
  };
}

export function useMission(missionId: string, selfId: string) {
  const [data, setData] = useState<MissionData | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(0);
  const [live, setLive] = useState(false);

  const reload = useCallback(async () => {
    const next = await loadMission(missionId);
    setData(next);
    setError('');
  }, [missionId]);

  const refreshPending = useCallback(async () => {
    const jobs = await listJobs().catch(() => []);
    setPending(jobs.filter((job) => job.kind === 'rpc' ? job.args.p_mission_id === missionId || job.args.p_zone_id : job.missionId === missionId).length);
  }, [missionId]);

  useEffect(() => {
    let stop = false;
    reload().catch((reason: unknown) => {
      if (!stop) setError(reason instanceof Error ? reason.message : '임무를 불러오지 못했습니다.');
    });
    const supabase = getSupabase();
    if (!supabase) return undefined;
    const channel = supabase.channel(`mission-${missionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones', filter: `mission_id=eq.${missionId}` }, () => { void reload().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `mission_id=eq.${missionId}` }, () => { void reload().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'points', filter: `mission_id=eq.${missionId}` }, () => { void reload().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'handovers', filter: `mission_id=eq.${missionId}` }, () => { void reload().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos', filter: `mission_id=eq.${missionId}` }, () => { void reload().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `mission_id=eq.${missionId}` }, () => { void reload().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `mission_id=eq.${missionId}` }, () => { void reload().catch(() => undefined); })
      .subscribe((status) => setLive(status === 'SUBSCRIBED'));
    return () => {
      stop = true;
      void supabase.removeChannel(channel);
    };
  }, [missionId, reload]);

  useEffect(() => {
    const sync = () => {
      void flushQueue().then(() => reload()).then(() => refreshPending()).catch(() => undefined);
    };
    window.addEventListener('online', sync);
    void refreshPending();
    sync();
    return () => window.removeEventListener('online', sync);
  }, [reload, refreshPending]);

  async function run(work: () => Promise<unknown>): Promise<void> {
    try {
      await work();
      await reload();
      await refreshPending();
    } catch (reason) {
      await refreshPending();
      if (reason instanceof OfflineQueued) return;
      setError(reason instanceof Error ? reason.message : '저장하지 못했습니다.');
      throw reason;
    }
  }

  const self = data?.members.find((member) => member.userId === selfId) ?? null;

  return {
    data,
    error,
    pending,
    live,
    self,
    clearError: () => setError(''),
    createZone: (label: string, path: LatLng[]) => run(() => rpc('create_zone', { p_mission_id: missionId, p_label: label, p_path: path })),
    updateZone: (zone: Zone, patch: Partial<Pick<Zone, 'taskStatus' | 'observationStatus' | 'reviewReason' | 'memo' | 'assigneeId'>>) => run(() => rpc('update_zone', {
      p_zone_id: zone.id,
      p_task_status: patch.taskStatus ?? zone.taskStatus,
      p_observation_status: patch.observationStatus ?? zone.observationStatus,
      p_review_reason: patch.reviewReason ?? zone.reviewReason,
      p_memo: patch.memo ?? zone.memo,
      p_assignee: patch.assigneeId === undefined ? zone.assigneeId : patch.assigneeId,
    })),
    createPoint: (label: string, memo: string, point: LatLng) => run(() => rpc('create_point', {
      p_mission_id: missionId, p_lat: point.lat, p_lng: point.lng, p_label: label, p_memo: memo,
    })),
    requestHandover: (zoneId: string, reason: string, toUser: string | null) => run(() => rpc('request_handover', {
      p_zone_id: zoneId, p_reason: reason, p_to_user: toUser,
    })),
    decideHandover: (handoverId: string, approve: boolean, reason: string, toUser: string | null) => run(() => rpc('decide_handover', {
      p_handover_id: handoverId, p_approve: approve, p_reason: reason, p_to_user: toUser,
    })),
    uploadPhoto: async (zoneId: string, file: File, memo: string) => {
      const blob = await compressImage(file);
      try {
        if (navigator.onLine === false) {
          await queuePhoto({ missionId, zoneId, memo, blob });
          await refreshPending();
          return;
        }
        const path = `${missionId}/${zoneId}/${crypto.randomUUID()}.jpg`;
        const supabase = getSupabase();
        if (!supabase) throw new Error('Supabase 연결 정보가 없습니다.');
        const uploaded = await supabase.storage.from('mission-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (uploaded.error) throw new Error(uploaded.error.message);
        await rpc('register_photo', { p_zone_id: zoneId, p_path: path, p_memo: memo });
        await reload();
      } catch (reason) {
        if (reason instanceof OfflineQueued) return;
        setError(reason instanceof Error ? reason.message : '사진을 올리지 못했습니다.');
      }
    },
    sharePresence: async (position: { lat: number; lng: number; accuracy: number | null }, droneStatus: DroneStatus) => {
      if (navigator.onLine === false) return;
      const supabase = getSupabase();
      if (!supabase) return;
      await supabase.rpc('upsert_presence', {
        p_mission_id: missionId,
        p_lat: position.lat,
        p_lng: position.lng,
        p_accuracy: position.accuracy,
        p_drone_status: droneStatus,
      });
    },
    setDroneStatus: (droneStatus: DroneStatus) => run(() => rpc('upsert_presence', {
      p_mission_id: missionId,
      p_lat: self?.lat ?? null,
      p_lng: self?.lng ?? null,
      p_accuracy: self?.accuracy ?? null,
      p_drone_status: droneStatus,
    })),
    markRead: () => rpc('mark_notifications_read', { p_mission_id: missionId }).then(() => reload()).catch(() => undefined),
  };
}

export type ZonePatch = {
  taskStatus?: TaskStatus;
  observationStatus?: ObservationStatus;
};
