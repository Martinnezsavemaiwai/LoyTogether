/**
 * The token travels in the URL fragment, which browsers never send to servers or
 * put in Referer headers, so it stays out of hosting logs.
 */
export function inviteUrl(token: string): string {
  return `${window.location.origin}/join#t=${encodeURIComponent(token)}`;
}

const SAVED_KEY = 'loynamkan:invites';

/** The creator's own copy of an invite, kept only in their browser so they can share it again. */
export function saveInvite(roomId: string, token: string) {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, string>;
    saved[roomId] = token;
    localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
  } catch {
    // Storage unavailable: the link is still shown once on screen.
  }
}

export function savedInvite(roomId: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVED_KEY) ?? '{}') as Record<string, string>;
    return saved[roomId] ?? null;
  } catch {
    return null;
  }
}

export function readInviteToken(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('t');
  return token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null;
}
