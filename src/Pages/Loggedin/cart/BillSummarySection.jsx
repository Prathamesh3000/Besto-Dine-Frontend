import React from "react";


export default function BillSummarySection({
  subtotal,
  gst,
  taxConfig,
  serviceCharge,
  bill,
  couponDiscount,
  walletAppliedToBill,
  tipAmount,
  deliveryFee,
  measuredDelivery,
  selectedSlab,
  finalTakeawayTotal,
}) {
  return (
    <>
            {/* Bill Summary Section */}
            <section className="bg-white rounded-[16px] border border-[#F6F6F6] p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <h2 className="text-[18px] leading-[24px] font-nunito font-semibold text-[#1A181B] mb-3">
                Bill Summary
              </h2>
              <div className="flex flex-col gap-2 text-[14px] font-varela">
                <div className="flex justify-between text-[#364153]">
                  <span className="flex items-baseline gap-1">
                    Subtotal
                    <span className="text-[10px] font-varela text-[#8D848F] tracking-tight">(items only)</span>
                  </span>
                  <span>₹{subtotal.toFixed(2)}</span>
                </div>
                {gst > 0 && (
                  <div className="flex justify-between text-[#8D848F]">
                    <span>GST ({taxConfig.gstPct}%)</span>
                    <span>₹{gst.toFixed(2)}</span>
                  </div>
                )}
                {serviceCharge > 0 && (
                  <div className="flex justify-between text-[#8D848F]">
                    <span>Service Charge ({bill.serviceChargePct}%)</span>
                    <span>₹{serviceCharge.toFixed(2)}</span>
                  </div>
                )}
                {bill.additionalCharges.map((c, i) => {
                  const suffix = c.type === 'Percentage' ? ` (${c.value}%)` : '';
                  return (
                    <div key={c.name || i} className="flex justify-between text-[#8D848F]">
                      <span>{c.name}{suffix}</span>
                      <span>₹{c.amount.toFixed(2)}</span>
                    </div>
                  );
                })}
                {couponDiscount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon Discount</span>
                    <span>-₹{couponDiscount.toFixed(2)}</span>
                  </div>
                )}
                {walletAppliedToBill > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Wallet Points</span>
                    <span>-₹{walletAppliedToBill.toFixed(2)}</span>
                  </div>
                )}
                {tipAmount > 0 && (
                  <div className="flex justify-between text-orange-600">
                    <span>Tip</span>
                    <span>₹{tipAmount.toFixed(2)}</span>
                  </div>
                )}
                {deliveryFee > 0 && (
                  <div className="flex justify-between text-[#8D848F]">
                    <span>Delivery{measuredDelivery ? ` (${measuredDelivery.distanceKm.toFixed(1)} km)` : selectedSlab ? ` (${selectedSlab.fromKm}–${selectedSlab.toKm} km)` : ''}</span>
                    <span>₹{deliveryFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="border-t border-dashed border-[#E5E5E5] my-1"></div>
                <div className="flex justify-between text-[#1A181B] font-nunito font-bold text-[16px]">
                  <span>Total</span>
                  <span>₹{finalTakeawayTotal.toFixed(2)}</span>
                </div>
              </div>
            </section>
    </>
  );
}
