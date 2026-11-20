export const REFUND_REASONS = [
  'Wrong or missing item',
  'Food quality issue',
  'Charged more than expected',
  'Paid twice',
  'Order was never served',
  'Other',
];

/** What is still refundable on a paid order (₹, 2 dp). */
export function refundableBalance(order) {
  const paid = Number(order?.amountPaid || 0);
  const back = Number(order?.refundedAmount || 0);
  return Math.max(0, Math.round((paid - back) * 100) / 100);
}
