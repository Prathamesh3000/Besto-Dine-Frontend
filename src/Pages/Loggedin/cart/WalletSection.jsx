import React from "react";
import { Check, X } from "lucide-react";

export default function WalletSection({
  isTakeaway,
  isGuest,
  navigate,
  pointsToRedeem,
  setPointsToRedeem,
  pointsError,
  setPointsError,
  handleRedeemPoints,
  availablePoints,
  appliedPoints,
  setAppliedPoints,
}) {
  return (
    <>
            {/* Wallet Points Section — guests see it disabled with a
                "Login to use" CTA. Wallet is per-tenant and bound to a
                customer identity (see CLAUDE.md "Wallet semantics") so
                guests literally have nothing to redeem. Takeaway only:
                a dine-in bill is paid (wallet included) on the Payment
                screen after the meal. */}
            {isTakeaway && (
            <section className="mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center">
                  <i className="fi fi-rr-gift text-[#FE8301] text-[20px] leading-none"></i>
                </div>
                <h2 className="text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B]">
                  Wallet
                </h2>
              </div>

              {isGuest && (
                <div className="mb-3 flex items-center gap-2 bg-[#FFF7ED] border border-[#FED7AA] rounded-[10px] px-3 py-2.5">
                  <i className="fi fi-rr-lock text-[#FE8301] text-[16px] leading-none shrink-0" aria-hidden="true" />
                  <p className="flex-1 text-[12px] min-[375px]:text-[13px] font-varela text-[#9A3412] leading-[16px]">
                    Login to earn & redeem wallet rewards.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="shrink-0 bg-[#FE8301] text-white text-[12px] font-nunito font-semibold px-3 py-1.5 rounded-[8px] active:scale-95 transition-transform"
                  >
                    Login
                  </button>
                </div>
              )}

              <div className={`flex gap-3 mb-1 ${isGuest ? 'opacity-60' : ''}`}>
                <input
                  id="pointsToRedeem"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={pointsToRedeem}
                  onChange={(e) => { setPointsToRedeem(e.target.value); if (pointsError) setPointsError('') }}
                  placeholder="Amount to redeem"
                  aria-label="Wallet points to redeem"
                  aria-invalid={pointsError ? 'true' : 'false'}
                  aria-describedby={pointsError ? 'pointsToRedeem-err' : undefined}
                  disabled={isGuest}
                  className={`flex-1 min-w-0 border rounded-[10px] px-3 py-2.5 text-[14px] font-varela text-[#333333] placeholder:text-[#8D848F] outline-none ${pointsError ? 'border-red-400 focus:border-red-500' : 'border-[#D1D5DC] focus:border-[#FE8301]'} disabled:bg-[#F4F4F5] disabled:cursor-not-allowed`}
                />
                <button
                  onClick={handleRedeemPoints}
                  disabled={isGuest}
                  className="bg-[#FE8301] text-white px-6 py-2.5 rounded-[11px] font-semibold font-nunito text-[15px] active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Redeem
                </button>
              </div>
              {pointsError && (
                <p id="pointsToRedeem-err" role="alert" className="text-xs text-red-600 mb-3 flex items-center gap-1 font-varela">
                  <span aria-hidden="true">⚠</span>{pointsError}
                </p>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[14px] font-varela text-[#1A181B] font-medium">
                  Available Points:
                </span>
                <span className="text-[14px] font-varela text-[#007AFF] font-medium">
                  {isGuest ? '— Login to view' : `${availablePoints.toFixed(2)} Points`}
                </span>
              </div>

              {appliedPoints > 0 && (
                <div className="mt-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-[10px] px-3 py-2">
                  <Check size={15} className="text-blue-600 shrink-0" />
                  <span className="text-blue-700 text-[12px] font-varela">
                    ₹{appliedPoints} points applied!
                  </span>
                  <button
                    onClick={() => setAppliedPoints(0)}
                    className="ml-auto text-gray-400 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </section>
            )}
    </>
  );
}
