import { generateIdempotencyKey } from "../../../utils/idempotency";

// ─── Checkout idempotency key ────────────────────────────────────────────────
// One key per checkout attempt. It survives a slow-network retry / double
// tap / page refresh (sessionStorage) so the backend returns the original
// order instead of creating a twin, and is dropped on success or on a
// definitive (4xx) rejection. Bound to a fingerprint of the cart so a
// different cart never reuses a stale key.
const CHECKOUT_IDEM_KEY = 'checkout_idem_v1';

export function getCheckoutIdempotencyKey(fingerprint) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(CHECKOUT_IDEM_KEY) || 'null');
    if (saved?.key && saved.fp === fingerprint) return saved.key;
    const key = generateIdempotencyKey();
    sessionStorage.setItem(CHECKOUT_IDEM_KEY, JSON.stringify({ key, fp: fingerprint }));
    return key;
  } catch {
    return generateIdempotencyKey();
  }
}

export function clearCheckoutIdempotencyKey() {
  try { sessionStorage.removeItem(CHECKOUT_IDEM_KEY); } catch { /* ignore */ }
}
