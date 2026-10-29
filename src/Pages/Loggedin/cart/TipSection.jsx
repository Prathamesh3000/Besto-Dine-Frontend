import React from "react";
import { Check, X } from "lucide-react";
import { getCustomerOperations } from "../../../utils/operations";

export default function TipSection({
  tipAmount,
  setTipAmount,
  customTip,
  setCustomTip,
}) {
  return (
    <>
            {/* Add Tip Section — hidden when the restaurant's operations
                profile has no tips (e.g. no waiters to receive them). */}
            {getCustomerOperations().customerApp?.tips !== false && (
            <section className="bg-white rounded-[16px] border border-[#F6F6F6] p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
              <h2 className="text-[20px] leading-[28px] font-nunito font-semibold text-[#1A181B] mb-2">
                Add Tip
              </h2>
              <div className="grid grid-cols-4 gap-1.5 min-[375px]:gap-2 mb-3">
                {[20, 30, 40, 50].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      // Apply the tip IMMEDIATELY on tap (toggle off if
                      // re-tapped). Previously these buttons only filled the
                      // custom-amount input, so a customer who tapped "₹30"
                      // (it highlighted, looked selected) and placed the
                      // order had NO tip stored — tipAmount stayed null
                      // because they never pressed "Add". That's why the tip
                      // never reached the order / admin bill. Apply directly.
                      setTipAmount((prev) => (prev === amt ? null : amt));
                      setCustomTip("");
                    }}
                    className={`py-2 min-[375px]:py-[11px] rounded-[12px] min-[375px]:rounded-[16px] border text-[13px] min-[375px]:text-[15px] font-varela transition-all ${tipAmount === amt
                      ? "border-[#FF9B0B] bg-[#FFFAF5] text-[#1A181B] font-semibold ring-1 ring-[#FF9B0B]"
                      : "border-[#EEEEEE] bg-[#F9F9F9] text-[#1A181B]"
                      }`}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={customTip}
                  onChange={(e) => setCustomTip(e.target.value)}
                  placeholder="Enter custom amount"
                  className="flex-1 min-w-0 border border-[#D1D5DC] rounded-[12px] min-[375px]:rounded-[16px] px-3 min-[375px]:px-4 py-2.5 min-[375px]:py-[14px] text-[13px] min-[375px]:text-[14px] font-varela text-[#333333] placeholder:text-[#8D848F] outline-none focus:border-[#FE8301]"
                />
                <button
                  onClick={() => {
                    const v = Number(customTip);
                    if (v > 0) {
                      setTipAmount(v);
                      setCustomTip("");
                    }
                  }}
                  className="bg-[#FE8301] text-white px-4 min-[375px]:px-6 py-2.5 min-[375px]:py-[14px] rounded-[12px] min-[375px]:rounded-[16px] font-nunito font-semibold text-[13px] min-[375px]:text-[14px] leading-[16px] active:scale-95 transition-transform flex-shrink-0"
                >
                  Add
                </button>
              </div>
              {tipAmount > 0 && (
                <div className="mt-3 flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-[10px] px-3 py-2">
                  <Check size={15} className="text-orange-600 shrink-0" />
                  <span className="text-orange-700 text-[12px] font-varela">
                    Tip of ₹{tipAmount} added. Thank you!
                  </span>
                  <button
                    onClick={() => setTipAmount(null)}
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
