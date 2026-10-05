import toast from 'react-hot-toast';

/**
 * QA N2 — one consistent "you missed a required field" response for the
 * customer checkout + booking forms, instead of a silently disabled
 * button or a generic error:
 *   - a toast naming every missing field, and
 *   - scroll to + focus the first one.
 *
 * `missing` is a list of { label, id } in on-screen order; `id` is the
 * DOM id of the field (or of the section wrapping it), or a list of ids. Returns true when
 * something was missing so callers can `if (reportMissingFields(m)) return;`.
 */
export function reportMissingFields(missing) {
  const list = (missing || []).filter(Boolean);
  if (list.length === 0) return false;
  const names = list.map((m) => m.label);
  const message = names.length === 1
    ? `Please fill the required field: ${names[0]}`
    : `Please fill the required fields: ${names.join(', ')}`;
  toast.error(message, { id: 'missing-required-fields', duration: 4500 });

  // `id` may be a list (e.g. separate mobile / desktop layouts) — the
  // first element that is actually rendered wins.
  const visible = (el) => !!el && el.getClientRects().length > 0;
  const findEl = (m) => {
    const ids = Array.isArray(m.id) ? m.id : [m.id];
    const els = ids.map((id) => id && document.getElementById(id)).filter(Boolean);
    return els.find(visible) || els[0] || null;
  };
  const target = list.map(findEl).find(Boolean);
  if (target) {
    // Next tick so the field's error styling has rendered first.
    setTimeout(() => {
      target.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      const focusable = target.matches?.('input, textarea, select, button')
        ? target
        : target.querySelector?.('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])');
      try { focusable?.focus?.({ preventScroll: true }); } catch { /* noop */ }
    }, 0);
  }
  return true;
}
