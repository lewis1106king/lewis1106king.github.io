const ID_KEY = 'suseak-id';

export function selfId(): string {
  const existing = localStorage.getItem(ID_KEY);
  if (existing) return existing;
  const next = crypto.randomUUID();
  localStorage.setItem(ID_KEY, next);
  return next;
}

export function shareUrl(code: string): string {
  return `${location.origin}${location.pathname}#/j/${code}`;
}
