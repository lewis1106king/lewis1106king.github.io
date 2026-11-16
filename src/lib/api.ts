import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { enqueue, isNetworkError, listJobs, removeJob, type PhotoJob } from './queue';

export class NeedsConfigError extends Error {
  constructor() {
    super('Supabase 연결 정보가 없습니다.');
  }
}

export class OfflineQueued extends Error {
  constructor() {
    super('오프라인입니다. 연결되면 서버로 보냅니다.');
  }
}

function client(): SupabaseClient {
  const supabase = getSupabase();
  if (!supabase) throw new NeedsConfigError();
  return supabase;
}

async function remember(name: string, args: Record<string, unknown>): Promise<never> {
  await enqueue({
    id: crypto.randomUUID(),
    kind: 'rpc',
    name,
    args,
    createdAt: new Date().toISOString(),
  });
  throw new OfflineQueued();
}

export async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const supabase = client();
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return remember(name, args);
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    if (isNetworkError(error)) return remember(name, args);
    throw new Error(error.message);
  }
  return data as T;
}

export async function queuePhoto(input: { missionId: string; zoneId: string; memo: string; blob: Blob }): Promise<void> {
  const job: PhotoJob = {
    id: crypto.randomUUID(),
    kind: 'photo',
    missionId: input.missionId,
    zoneId: input.zoneId,
    memo: input.memo,
    filename: `${crypto.randomUUID()}.jpg`,
    blob: input.blob,
    createdAt: new Date().toISOString(),
  };
  await enqueue(job);
}

async function uploadPhoto(supabase: SupabaseClient, job: PhotoJob): Promise<void> {
  const path = `${job.missionId}/${job.zoneId}/${job.filename}`;
  const uploaded = await supabase.storage.from('mission-photos').upload(path, job.blob, {
    contentType: 'image/jpeg',
    upsert: false,
  });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const registered = await supabase.rpc('register_photo', {
    p_zone_id: job.zoneId,
    p_path: path,
    p_memo: job.memo,
  });
  if (registered.error) throw new Error(registered.error.message);
}

export async function flushQueue(): Promise<number> {
  const supabase = getSupabase();
  if (!supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  const jobs = await listJobs();
  let sent = 0;
  for (const job of jobs) {
    try {
      if (job.kind === 'rpc') {
        const { error } = await supabase.rpc(job.name, job.args);
        if (error) {
          if (isNetworkError(error)) break;
          throw new Error(error.message);
        }
      } else {
        await uploadPhoto(supabase, job);
      }
      await removeJob(job.id);
      sent += 1;
    } catch (error) {
      if (isNetworkError(error)) break;
      await removeJob(job.id);
    }
  }
  return sent;
}

export async function signedPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const supabase = client();
  const { data, error } = await supabase.storage.from('mission-photos').createSignedUrls(paths, 60 * 60);
  if (error) throw new Error(error.message);
  const urls: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
  }
  return urls;
}
