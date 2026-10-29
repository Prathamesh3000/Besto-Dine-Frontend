// Massage a raw backend coupon-rejection message (moved verbatim from Cart.jsx).
export const enrichCouponError = (raw, currentSubtotal) => {
  const msg = String(raw || 'Could not apply this coupon.').trim();
  const minMatch = msg.match(/[₹$]?\s*(\d+(?:\.\d+)?)/);
  if (/minimum order/i.test(msg) && minMatch) {
    const minVal = Number(minMatch[1]);
    const sub = Number(currentSubtotal || 0);
    const gap = Math.max(0, Math.ceil(minVal - sub));
    if (gap > 0) {
      return `Add ₹${gap} more to apply this coupon. Your subtotal is ₹${sub.toFixed(0)}; this coupon needs ₹${minVal.toFixed(0)} (before tax).`;
    }
  }
  if (/expired/i.test(msg))       return `This coupon has expired. Pick another from the list below.`;
  if (/already used|usage limit/i.test(msg)) return `You've already used this coupon the maximum number of times.`;
  if (/not valid|invalid/i.test(msg))         return `This code isn't valid for your current order. Try a different coupon.`;
  if (/time window|not active yet/i.test(msg)) return `This coupon isn't active right now. Check the time window in View Terms.`;
  return msg;
};
