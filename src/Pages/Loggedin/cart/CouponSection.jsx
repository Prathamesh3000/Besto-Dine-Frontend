import React from "react";
import { Check, X, Loader2 } from "lucide-react";

export default function CouponSection({
  isGuest,
  navigate,
  couponCode,
  setCouponCode,
  couponError,
  setCouponError,
  handleApplyCoupon,
  applyingCoupon,
  appliedCoupon,
  setAppliedCoupon,
  availableCoupons,
  subtotal,
  setTermsCoupon,
}) {
  return (
    <>
        {/* Apply Coupon Section — guests see the section disabled with
            a "Login to use" CTA. Loyalty / promotional codes require a
            customer account so the redemption ledger has an identity to
            track usage / abuse against. */}
            <section className="mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <div className="flex items-center gap-2 mb-3">
                <i className="fi fi-rr-tags text-[#FE8301] text-[20px] min-[375px]:text-[24px] leading-none"></i>
                <h2 className="text-[16px] min-[375px]:text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B]">
                  Apply Coupon
                </h2>
              </div>
              {isGuest && (
                <div className="mb-3 flex items-center gap-2 bg-[#FFF7ED] border border-[#FED7AA] rounded-[10px] px-3 py-2.5">
                  <i className="fi fi-rr-lock text-[#FE8301] text-[16px] leading-none shrink-0" aria-hidden="true" />
                  <p className="flex-1 text-[12px] min-[375px]:text-[13px] font-varela text-[#9A3412] leading-[16px]">
                    Login to unlock coupons & save on every order.
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
              <div className={`flex gap-2 mb-1 ${isGuest ? 'opacity-60' : ''}`}>
                <input
                  id="couponCode"
                  type="text"
                  value={couponCode}
                  onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); if (couponError) setCouponError('') }}
                  placeholder="FIRST20"
                  aria-label="Coupon code"
                  aria-invalid={couponError ? 'true' : 'false'}
                  aria-describedby={couponError ? 'couponCode-err' : undefined}
                  disabled={isGuest}
                  className={`flex-1 min-w-0 border rounded-[10px] px-3 py-2.5 text-[13px] min-[375px]:text-[14px] leading-[18px] font-varela text-[#333333] placeholder:text-[#0A0A0A80] outline-none ${couponError ? 'border-red-400 focus:border-red-500' : 'border-[#D1D5DC] focus:border-[#FE8301]'} disabled:bg-[#F4F4F5] disabled:cursor-not-allowed`}
                />
                <button
                  onClick={() => handleApplyCoupon()}
                  disabled={applyingCoupon?.source === 'input' || isGuest}
                  aria-busy={applyingCoupon?.source === 'input' ? 'true' : 'false'}
                  className="bg-[#FE8301] text-white px-3 min-[375px]:px-4 py-2.5 rounded-[11px] leading-[16px] font-semibold font-nunito text-[14px] min-[375px]:text-[15px] active:scale-95 transition-transform flex-shrink-0 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {applyingCoupon?.source === 'input' ? <Loader2 size={14} className="animate-spin" /> : null}
                  Apply
                </button>
              </div>
              {couponError && (
                <div
                  id="couponCode-err"
                  role="alert"
                  className="mt-2 mb-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-[10px] px-3 py-2.5"
                >
                  <i className="fi fi-rr-exclamation text-red-500 text-[14px] leading-none mt-0.5 shrink-0" aria-hidden="true" />
                  <p className="flex-1 text-[12px] min-[375px]:text-[13px] font-varela text-red-700 leading-[16px]">
                    {couponError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCouponError('')}
                    aria-label="Dismiss error"
                    className="shrink-0 text-red-400 hover:text-red-600 active:scale-95 transition-all"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {appliedCoupon && (
                <div className="mb-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-[10px] px-3 py-2">
                  <Check size={15} className="text-green-600 flex-shrink-0" />
                  <span className="text-green-700 text-[12px] font-varela">
                    {appliedCoupon.coupon?.code || 'Coupon'} applied!
                  </span>
                  <button
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponCode("");
                    }}
                    className="ml-auto text-gray-400 shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <p className="text-[14px] min-[375px]:text-[15px] leading-[22px] font-nunito text-[#364153] font-semibold mb-2">
                Available Coupons:
              </p>
              <div className="flex flex-col gap-2">
                {availableCoupons.length > 0 ? availableCoupons.map((c) => {
                  const isApplied = appliedCoupon?.coupon?.code === c.code;
                  const discountLabel = c.discountType === 'percentage'
                    ? `${c.discountValue}% OFF`
                    : `₹${c.discountValue} OFF`;
                  // "(subtotal)" suffix matches Swiggy/Zomato copy — kills
                  // the "but my total is over ₹500" confusion before it
                  // happens. The minOrderValue is checked against the
                  // pre-tax subtotal on the backend.
                  const minOrderLabel = c.minOrderValue > 0 ? `Min. order ₹${c.minOrderValue} (subtotal)` : null;
                  const maxDiscountLabel = c.discountType === 'percentage' && c.maxDiscountAmount > 0
                    ? `Up to ₹${c.maxDiscountAmount}`
                    : null;
                  // Proactive minimum-order check — disables Apply when
                  // the subtotal hasn't reached the threshold yet, with
                  // a helpful "Add ₹X more" gap. Final authority still
                  // lives on the server.
                  const minOrderGap = (c.minOrderValue > 0 && subtotal < c.minOrderValue)
                    ? Math.ceil(c.minOrderValue - subtotal)
                    : 0;
                  const isLocked = minOrderGap > 0;
                  return (
                    <div
                      key={c.code || c._id}
                      className={`relative w-full text-left p-3 rounded-[12px] border transition-all ${
                        isApplied
                          ? 'border-green-300 bg-green-50'
                          : isLocked
                            ? 'border-[#F2F4F7] bg-[#FAFAFB] opacity-90'
                            : 'border-[#F2F4F7] bg-white hover:border-[#FDDCB5]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-[10px] flex items-center justify-center shrink-0 ${
                          isApplied ? 'bg-green-100' : 'bg-[#FFF9F2]'
                        }`}>
                          <i className={`fi fi-rr-tags text-[16px] leading-none ${
                            isApplied ? 'text-green-600' : 'text-[#FE8301]'
                          }`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[13px] min-[375px]:text-[14px] font-nunito font-bold text-[#1A181B] tracking-tight">
                              {c.code}
                            </span>
                            <span className={`text-[10px] min-[375px]:text-[11px] font-nunito font-bold px-2 py-0.5 rounded-full ${
                              isApplied ? 'bg-green-600 text-white' : 'bg-[#FE8301] text-white'
                            }`}>
                              {discountLabel}
                            </span>
                          </div>
                          {c.title && (
                            <p className="text-[12px] min-[375px]:text-[13px] font-varela text-[#364153] mt-0.5 truncate">
                              {c.title}
                            </p>
                          )}
                          {(minOrderLabel || maxDiscountLabel) && (
                            <p className="text-[10px] min-[375px]:text-[11px] font-varela text-[#8D848F] mt-1">
                              {[minOrderLabel, maxDiscountLabel].filter(Boolean).join(' · ')}
                            </p>
                          )}

                          {/* Action row — single-tap Apply + View Terms link */}
                          <div className="mt-2.5 flex items-center gap-3 flex-wrap">
                            {isApplied ? (
                              <span className="inline-flex items-center gap-1 text-[12px] font-nunito font-semibold text-green-600">
                                <Check size={14} /> Applied
                              </span>
                            ) : isLocked ? (
                              <span className="text-[11px] min-[375px]:text-[12px] font-varela text-red-600">
                                Add ₹{minOrderGap} more to unlock
                              </span>
                            ) : isGuest ? (
                              <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="bg-white text-[#FE8301] border border-[#FE8301] text-[12px] font-nunito font-semibold px-3 py-1.5 rounded-[8px] active:scale-95 transition-transform inline-flex items-center gap-1"
                              >
                                <i className="fi fi-rr-lock text-[10px] leading-none" aria-hidden="true" />
                                Login to use
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleApplyCoupon(c.code, 'card')}
                                disabled={applyingCoupon?.code === String(c.code || '').toUpperCase()}
                                aria-busy={applyingCoupon?.code === String(c.code || '').toUpperCase() ? 'true' : 'false'}
                                className="bg-[#FE8301] text-white text-[12px] font-nunito font-semibold px-3 py-1.5 rounded-[8px] active:scale-95 transition-transform disabled:opacity-60 inline-flex items-center gap-1"
                              >
                                {applyingCoupon?.code === String(c.code || '').toUpperCase()
                                  ? <><Loader2 size={12} className="animate-spin" /> Applying…</>
                                  : 'Apply'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setTermsCoupon(c)}
                              className="text-[12px] font-nunito font-semibold text-[#1F78FF] hover:text-[#0E5BD9] active:scale-95 transition-all"
                              aria-label={`View terms for coupon ${c.code}`}
                            >
                              View Terms
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <p className="text-[#8D848F] text-[12px] font-varela px-1">No coupons available</p>
                )}
              </div>
            </section>
    </>
  );
}
