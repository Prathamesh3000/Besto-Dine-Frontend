import React from "react";
import { Loader2, ShoppingCart } from "lucide-react";
import QrMenuOnlyNote from "../../../Components/Loggedin/QrMenuOnlyNote";
import { dineInPaymentChoice } from "../../../utils/customerOrdering";

export default function BottomBar({
  dineInLocked,
  isTakeaway,
  tokenOrderMode,
  dineInOrderingOff,
  handlePlaceOrder,
  cartItems,
  isSubmitting,
  selectedTime,
  activeOrdersCount,
  finalTakeawayTotal,
}) {
  return (
    <>
      {/* Floating Bottom Bar */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full lg:max-w-3xl p-3 sm:p-4 md:p-5 bg-white border-t border-gray-100 transition-colors duration-200">
        {/* Dine-in lock banner — surfaces just above the CTA so the
            customer sees the "why" before they try to tap a dead
            button. Only shown for dine-in (the lock util gates
            itself on dineInTable being present). */}
        {dineInLocked && !isTakeaway && (
          <div className="mb-2 flex items-start gap-2 bg-[#FFF8EB] border border-[#FCE7A4] rounded-xl px-3 py-2">
            <span className="text-[16px] leading-none mt-0.5">🔒</span>
            <p className="text-[12px] font-varela text-[#7A4504] leading-snug">
              Your bill is settled. Please <span className="font-semibold">re-scan the table QR</span> to start a new order.
            </p>
          </div>
        )}
        {/* Token-number restaurant: no table on this order — say what
            happens next before the customer taps Place Order. */}
        {tokenOrderMode && !dineInOrderingOff && (
          <div className="mb-2 flex items-start gap-2 bg-[#EAF1FF] border border-[#C7D9FF] rounded-xl px-3 py-2" data-testid="token-mode-note">
            <span className="text-[16px] leading-none mt-0.5" aria-hidden="true">🎟️</span>
            <p className="text-[12px] font-varela text-[#1D4ED8] leading-snug">
              No table needed — you'll get a <span className="font-semibold">token number</span> to collect your food at the counter.
            </p>
          </div>
        )}
        {/* QR is menu-only — no Place Order, just the note. */}
        {dineInOrderingOff ? (
          <QrMenuOnlyNote />
        ) : !isTakeaway && dineInPaymentChoice() === 'either' ? (
          /* Operations profile payment.dineIn:'either' — the customer
             picks: pay now (hand-off to the payment screen, the order is
             created once paid) or pay after the meal (today's path). */
          <div className="flex flex-col gap-2" data-testid="pay-choice">
            <button
              type="button"
              onClick={() => handlePlaceOrder('payFirst')}
              disabled={cartItems.length === 0 || isSubmitting || dineInLocked}
              className={`w-full py-3 rounded-xl semibold font-nunito text-[14px] shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 ${
                isSubmitting || cartItems.length === 0 || dineInLocked
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-[#FE8301] text-white"
              }`}
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <ShoppingCart size={18} />}
              <span>
                {dineInLocked
                  ? "Re-scan QR to order"
                  : isSubmitting
                  ? "Placing Order..."
                  : `Pay now ₹${finalTakeawayTotal.toFixed(2)}`}
              </span>
            </button>
            <button
              type="button"
              onClick={() => handlePlaceOrder('payAfter')}
              disabled={cartItems.length === 0 || isSubmitting || dineInLocked}
              className={`w-full py-2.5 rounded-xl semibold font-nunito text-[14px] border flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 ${
                isSubmitting || cartItems.length === 0 || dineInLocked
                  ? "border-gray-200 text-gray-400 cursor-not-allowed"
                  : "border-[#FE8301] text-[#FE8301] bg-white"
              }`}
            >
              Pay after the meal
            </button>
          </div>
        ) : (
        <button
          onClick={() => handlePlaceOrder()}
          disabled={cartItems.length === 0 || isSubmitting || (dineInLocked && !isTakeaway)}
          className={`w-full py-3 rounded-xl semibold font-nunito text-[14px] shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all duration-300 ${
            isSubmitting || cartItems.length === 0 || (dineInLocked && !isTakeaway)
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : isTakeaway && !selectedTime
              ? "bg-orange-300 text-white cursor-pointer"
              : "bg-[#FE8301] text-white"
            }`}
        >
          {isSubmitting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <ShoppingCart size={18} className="sm:w-5 sm:h-5 md:w-6 md:h-6 " />
          )}
          <span>
            {dineInLocked && !isTakeaway
              ? "Re-scan QR to order"
              : isSubmitting
              ? "Placing Order..."
              : isTakeaway
              ? !selectedTime
                ? "Please Select Pickup Time"
                : `Proceed to Pay ₹${finalTakeawayTotal.toFixed(2)}`
              : activeOrdersCount > 0
                ? `Place New Order · ₹${finalTakeawayTotal.toFixed(2)}`
                : `Place Order ₹${finalTakeawayTotal.toFixed(2)}`}
          </span>
        </button>
        )}
      </div>
    </>
  );
}
