// Split a takeaway bill between the wallet and Razorpay, in whole paise.
//
// Rules (the customer is never charged more than the bill):
//   - wallet portion = min(applied, bill), to the paisa.
//   - remainder 0            -> wallet pays the whole bill.
//   - remainder < Rs 1       -> Razorpay refuses orders under 100 paise, so
//                               absorb it into the wallet when the balance
//                               covers the whole bill ('absorbed'), otherwise
//                               shrink the wallet portion so Razorpay gets
//                               exactly Rs 1.00 ('reduced'). The total of the
//                               two rails always equals the bill.
// Amounts are returned in rupees with at most 2 decimals.
export const RAZORPAY_MIN_PAISE = 100;

const toPaise = (n) => Math.round((Number(n) || 0) * 100);
const toRupees = (p) => p / 100;

export function splitWalletPayment({ grandTotal, applied, walletBalance } = {}) {
  const bill = Math.max(0, toPaise(grandTotal));
  let wallet = Math.min(Math.max(0, toPaise(applied)), bill);
  let adjusted = null;

  const rest = bill - wallet;
  if (wallet > 0 && rest > 0 && rest < RAZORPAY_MIN_PAISE) {
    const balance = walletBalance === undefined || walletBalance === null ? null : toPaise(walletBalance);
    if (balance !== null && balance >= bill) {
      wallet = bill;
      adjusted = 'absorbed';
    } else {
      wallet = Math.max(0, bill - RAZORPAY_MIN_PAISE);
      adjusted = 'reduced';
    }
  }

  const razorpay = bill - wallet;
  return {
    walletAmount: toRupees(wallet),
    razorpayAmount: toRupees(razorpay),
    walletCoversFull: wallet > 0 && razorpay === 0,
    adjusted,
  };
}
