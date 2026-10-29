import React from "react";
import { X } from "lucide-react";

export default function CouponTermsModal({
  termsCoupon,
  setTermsCoupon,
  appliedCoupon,
  applyingCoupon,
  handleApplyCoupon,
}) {
  return (
    <>
      {/* Coupon Terms & Conditions modal — opened from "View Terms" on
          each coupon card. Bottom-sheet on mobile, centred card on sm+.
          z-[100] to clear the BottomNav (which sits at z-50). */}
      {termsCoupon && (() => {
        const c = termsCoupon;
        const isApplied = appliedCoupon?.coupon?.code === c.code;
        const discountLabel = c.discountType === 'percentage'
          ? `${c.discountValue}% OFF`
          : `₹${c.discountValue} OFF`;
        const fmtDate = (d) => {
          if (!d) return null;
          try { return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
          catch { return null; }
        };
        const expiry = fmtDate(c.endDate);
        const startDate = fmtDate(c.startDate);
        const terms = [
          c.minOrderValue > 0       && `Minimum order value: ₹${c.minOrderValue}`,
          (c.discountType === 'percentage' && c.maxDiscountAmount > 0) && `Maximum discount: ₹${c.maxDiscountAmount}`,
          c.scope === 'food'        && `Applies to food items only`,
          c.scope === 'beverages'   && `Applies to beverages only`,
          (c.startTime && c.endTime) && `Valid between ${c.startTime} – ${c.endTime}`,
          c.usagePerUser > 0        && `Limit: ${c.usagePerUser} use${c.usagePerUser > 1 ? 's' : ''} per customer`,
          startDate                 && `Valid from: ${startDate}`,
          expiry                    && `Valid until: ${expiry}`,
          c.couponCategory === 'first_order' && `New customers only (first order)`,
        ].filter(Boolean);

        return (
          <div
            onClick={() => setTermsCoupon(null)}
            className="fixed inset-x-0 top-0 h-[100dvh] z-[100] bg-black/60 flex items-end sm:items-center justify-center"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative w-full sm:max-w-[450px] bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col"
            >
              {/* Drag handle (mobile) */}
              <div className="sm:hidden flex justify-center pt-2 pb-1 shrink-0">
                <span className="w-10 h-1 bg-gray-200 rounded-full" />
              </div>

              {/* Header */}
              <div className="flex items-start justify-between px-5 pt-4 pb-3 shrink-0 border-b border-gray-100">
                <div className="flex-1 min-w-0 pr-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[16px] font-nunito font-bold text-[#1A181B] tracking-tight">{c.code}</span>
                    <span className="text-[10px] font-nunito font-bold px-2 py-0.5 rounded-full bg-[#FE8301] text-white">
                      {discountLabel}
                    </span>
                  </div>
                  {c.title && (
                    <p className="text-[13px] font-varela text-[#364153] mt-1">{c.title}</p>
                  )}
                </div>
                <button
                  onClick={() => setTermsCoupon(null)}
                  aria-label="Close terms"
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0 active:scale-95 transition-all"
                >
                  <X size={16} className="text-gray-700" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
                {c.description && (
                  <div>
                    <h4 className="text-[12px] font-nunito font-semibold text-[#8D848F] uppercase tracking-wider mb-1.5">About</h4>
                    <p className="text-[13px] font-varela text-[#364153] leading-relaxed whitespace-pre-line">{c.description}</p>
                  </div>
                )}
                <div>
                  <h4 className="text-[12px] font-nunito font-semibold text-[#8D848F] uppercase tracking-wider mb-2">Terms &amp; Conditions</h4>
                  {terms.length > 0 ? (
                    <ul className="space-y-2">
                      {terms.map((t, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-[#FE8301] mt-0.5 shrink-0">•</span>
                          <span className="text-[13px] font-varela text-[#1A181B] leading-relaxed">{t}</span>
                        </li>
                      ))}
                      <li className="flex items-start gap-2">
                        <span className="text-[#FE8301] mt-0.5 shrink-0">•</span>
                        <span className="text-[13px] font-varela text-[#1A181B] leading-relaxed">
                          Cannot be combined with other coupons.
                        </span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#FE8301] mt-0.5 shrink-0">•</span>
                        <span className="text-[13px] font-varela text-[#1A181B] leading-relaxed">
                          Restaurant reserves the right to withdraw the offer at any time.
                        </span>
                      </li>
                    </ul>
                  ) : (
                    <p className="text-[13px] font-varela text-[#8D848F]">No additional terms.</p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-gray-100 shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {isApplied ? (
                  <button
                    onClick={() => setTermsCoupon(null)}
                    className="w-full bg-green-600 text-white font-nunito font-semibold py-3 rounded-[12px] text-[14px]"
                  >
                    Already Applied
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const code = c.code;
                      setTermsCoupon(null);
                      handleApplyCoupon(code, 'card');
                    }}
                    disabled={applyingCoupon?.code === String(c.code || '').toUpperCase()}
                    className="w-full bg-[#FE8301] hover:bg-[#E67700] text-white font-nunito font-semibold py-3 rounded-[12px] text-[14px] transition-colors active:scale-[0.98] disabled:opacity-60"
                  >
                    {applyingCoupon?.code === String(c.code || '').toUpperCase() ? 'Applying…' : 'Apply Coupon'}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
