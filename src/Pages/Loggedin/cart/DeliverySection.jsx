import React from "react";
import { Loader2 } from "lucide-react";

export default function DeliverySection({
  isTakeaway,
  deliveryConfig,
  deliveryLocked,
  deliveryActive,
  setWantsDelivery,
  setDeliveryError,
  deliveryMinOrder,
  deliveryShortfall,
  handleUseMyLocation,
  isLocating,
  deliveryAddress,
  handleDeliveryAddressChange,
  quoteState,
  measuredDelivery,
  quoteMessage,
  selectedSlabIndex,
  setSelectedSlabIndex,
  deliveryError,
}) {
  return (
    <>
        {/* ── Home Delivery Section (takeaway only) ────────────────────
            Shown only when the cafe has enabled delivery and configured
            at least one distance range. The customer flips the toggle,
            picks the km range that covers their address, and types the
            address — the slab's charge is added to the bill below. */}
        {isTakeaway && deliveryConfig.enabled && (deliveryConfig.slabs || []).length > 0 && (
          <section className="mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-2">
                <span className="text-[20px] min-[375px]:text-[24px] leading-none">🛵</span>
                <h2 className="text-[16px] min-[375px]:text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B]">
                  Home Delivery
                </h2>
              </div>
              <button
                type="button"
                disabled={deliveryLocked}
                onClick={() => {
                  if (deliveryLocked) return;
                  setWantsDelivery(prev => !prev);
                  setDeliveryError('');
                }}
                className={`relative w-[44px] h-[24px] rounded-full transition-colors shrink-0 ${deliveryLocked ? 'bg-[#E5E5EA] opacity-50 cursor-not-allowed' : deliveryActive ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
                aria-pressed={deliveryActive}
                aria-label="Toggle home delivery"
              >
                <div className={`absolute top-[2px] left-[2px] bg-white w-[20px] h-[20px] rounded-full transition-transform shadow-sm ${deliveryActive ? 'translate-x-[20px]' : ''}`} />
              </button>
            </div>
            <p className="text-[12px] font-varela text-[#8D848F] leading-[16px] mb-3">
              Can't pick up? Get it delivered to your doorstep.
            </p>

            {/* Locked notice — cart below the delivery minimum. */}
            {deliveryLocked && (
              <div className="flex items-start gap-2 rounded-[10px] bg-[#FFF7ED] border border-[#FED7AA] px-3 py-2.5 mb-1">
                <span className="text-[14px] leading-none mt-0.5">🔒</span>
                <p className="text-[12px] font-varela text-[#9A3412] leading-[16px]">
                  Home delivery unlocks at a minimum order of <span className="font-bold">₹{deliveryMinOrder}</span>.
                  Add <span className="font-bold">₹{deliveryShortfall}</span> more to your cart to get it delivered.
                </p>
              </div>
            )}

            {deliveryActive && (
              <div className="space-y-3">
                {/* Address - the distance and charge are measured from it. */}
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <label htmlFor="deliveryAddress" className="block text-[13px] font-nunito font-semibold text-[#1A181B]">
                      Delivery address <span className="text-red-500" aria-hidden="true">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleUseMyLocation}
                      disabled={isLocating}
                      className="flex items-center gap-1 text-[12px] font-nunito font-semibold text-[#FE8301] hover:underline disabled:opacity-60"
                    >
                      {isLocating ? <Loader2 size={12} className="animate-spin" /> : <span aria-hidden="true">{"\u{1F4CD}"}</span>}
                      {isLocating ? "Locating..." : "Use my location"}
                    </button>
                  </div>
                  <textarea
                    id="deliveryAddress"
                    required
                    aria-required="true"
                    value={deliveryAddress}
                    onChange={(e) => handleDeliveryAddressChange(e.target.value)}
                    placeholder="House / flat no., building, street, landmark, area, city"
                    rows={3}
                    className="w-full border rounded-[10px] px-3 py-2.5 text-[13px] min-[375px]:text-[14px] leading-[18px] font-varela text-[#333333] placeholder:text-[#0A0A0A80] outline-none border-[#D1D5DC] focus:border-[#FE8301] resize-none"
                  />
                </div>

                {/* Measured distance + charge */}
                {quoteState === "loading" && (
                  <p className="flex items-center gap-1.5 text-[12px] font-varela text-[#8D848F]">
                    <Loader2 size={12} className="animate-spin" /> Calculating distance...
                  </p>
                )}
                {measuredDelivery && (
                  <div className="flex items-center justify-between gap-2 rounded-[10px] bg-[#F0FDF4] border border-[#BBF7D0] px-3 py-2.5">
                    <span className="text-[13px] font-varela text-[#166534]">
                      Distance approx. <span className="font-bold">{measuredDelivery.distanceKm.toFixed(1)} km</span>
                    </span>
                    <span className="text-[13px] font-nunito font-semibold text-[#166534]">
                      Delivery charge {"\u20B9"}{measuredDelivery.charge.toFixed(0)}
                    </span>
                  </div>
                )}
                {quoteState === "error" && quoteMessage && (
                  <p role="alert" className="text-xs text-red-600 font-varela">{quoteMessage}</p>
                )}

                {/* Distance range chips - manual fallback when the distance
                    couldn't be measured automatically. */}
                {!measuredDelivery && quoteState !== "loading" && quoteState !== "error" && (
                <div id="deliveryDistance">
                  <label className="block text-[13px] font-nunito font-semibold text-[#1A181B] mb-1.5">
                    Select your distance <span className="text-red-500" aria-hidden="true">*</span>
                  </label>
                  {quoteMessage && (
                    <p className="text-[11px] font-varela text-[#9A3412] mb-1.5">{quoteMessage}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(deliveryConfig.slabs || []).map((slab, idx) => {
                      const isSel = selectedSlabIndex === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => { setSelectedSlabIndex(idx); setDeliveryError(''); }}
                          className={`px-3 py-2 rounded-[10px] text-[13px] font-varela border transition-colors ${isSel
                            ? 'border-[#FE8301] bg-[#FFF7ED] text-[#FE8301] font-semibold'
                            : 'border-[#D1D5DC] text-[#333333] hover:border-[#FE8301]'}`}
                        >
                          {slab.fromKm}–{slab.toKm} km · ₹{Number(slab.charge).toFixed(0)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                )}

                {deliveryError && (
                  <p role="alert" className="text-xs text-red-600 flex items-center gap-1 font-varela">
                    <span aria-hidden="true">⚠</span>{deliveryError}
                  </p>
                )}
                {deliveryConfig.minOrderValue > 0 && (
                  <p className="text-[11px] font-varela text-[#8D848F]">
                    Minimum order for delivery: ₹{deliveryConfig.minOrderValue}
                  </p>
                )}
              </div>
            )}
          </section>
        )}
    </>
  );
}
