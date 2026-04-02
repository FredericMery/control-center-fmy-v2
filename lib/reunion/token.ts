import crypto from 'crypto';

export function createMeetingJoinToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

export function buildMeetingJoinPath(rawToken: string) {
  return `/reunions/join/${encodeURIComponent(rawToken)}`;
}

export function getMeetingJoinBaseUrl(fallback: string) {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    fallback
  ).replace(/\/$/, '');
}
