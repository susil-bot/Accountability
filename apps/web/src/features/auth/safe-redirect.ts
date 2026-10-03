/** Only same-origin, in-app paths are accepted as a post-login destination (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = '/app/dashboard'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
}
