import { NeedsConfigError } from './api';
import { getSupabase } from './supabase';

export async function ensureUser(): Promise<string> {
  const supabase = getSupabase();
  if (!supabase) throw new NeedsConfigError();
  const existing = await supabase.auth.getSession();
  if (existing.data.session?.user.id) return existing.data.session.user.id;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    const message = error?.message ?? '';
    if (/anonymous/i.test(message)) throw new Error('Supabase에서 Anonymous sign-ins를 켜 주세요.');
    throw new Error(message || '시작하지 못했습니다.');
  }
  return data.user.id;
}

export function shareUrl(code: string): string {
  const path = window.location.pathname || '/';
  return `${window.location.origin}${path}#/j/${code}`;
}
