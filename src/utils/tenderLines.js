// Split-payment (per-tender) helpers shared by the counter settle UIs.
// A line is { method, amount, reference } with amount kept as the typed
// string so half-typed numbers don't jump around.

export const TENDER_OPTIONS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'other', label: 'Other' },
]

export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

const amountOf = (l) => {
  const n = Number(l?.amount)
  return Number.isFinite(n) && n > 0 ? round2(n) : 0
}

export function sumLines(lines = []) {
  return round2(lines.reduce((s, l) => s + amountOf(l), 0))
}

/**
 * Where a split stands against the amount due.
 *   remaining  still to collect (>= 0)
 *   change     paid beyond due (>= 0); only cash can give change back
 *   valid      every line has a positive amount, the lines cover the due
 *              and any excess is covered by cash
 */
export function summarizeLines(lines = [], due = 0) {
  const owed = round2(Math.max(0, due))
  const paid = sumLines(lines)
  const cash = sumLines(lines.filter((l) => l.method === 'cash'))
  const remaining = round2(Math.max(0, owed - paid))
  const change = round2(Math.max(0, paid - owed))
  const allPositive = lines.length > 0 && lines.every((l) => amountOf(l) > 0)
  const valid = allPositive && remaining < 0.005 && change <= cash + 0.005
  return { paid, cash, remaining, change, valid, owed }
}

/** The `payments` request body field; blank / zero lines are dropped. */
export function buildPayments(lines = []) {
  return lines
    .filter((l) => amountOf(l) > 0)
    .map((l) => {
      const p = { method: l.method, amount: amountOf(l) }
      const ref = String(l.reference || '').trim()
      if (ref) p.reference = ref
      return p
    })
}

/** Stable text of a payments array for the idempotency fingerprint. */
export function paymentsFingerprint(payments) {
  if (!Array.isArray(payments) || payments.length === 0) return ''
  return payments.map((p) => `${String(p.method || '').toLowerCase()}:${round2(p.amount)}:${p.reference || ''}`).join(',')
}
