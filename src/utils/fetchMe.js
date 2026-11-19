// One shared GET /auth/me. AuthProvider (session refresh) and HealthProvider
// (saved allergies) both read the signed-in user's profile when the app
// mounts; calls made while one is already in flight reuse its response
// instead of sending their own, so a page load costs one request.
import api from './api';
import { currentAudience } from './authStorage';

const inflight = new Map();

export function fetchMe(aud = currentAudience()) {
  const key = aud || '';
  let p = inflight.get(key);
  if (!p) {
    p = api.get('/auth/me', { _aud: aud }).finally(() => { inflight.delete(key); });
    inflight.set(key, p);
  }
  return p;
}
