import React from "react";
import { realImage, hideBrokenImage } from "../../../utils/image";
import { resolveUnitPrice } from "../../../utils/pricing";

export default function ComplementarySection({
  complementaryItems,
  handleAddComplementary,
}) {
  return (
    <>
        {/* Complete your meal — horizontal-scroll strip of complementary
            items based on what's currently in cart (drinks for mains,
            bread for curries, etc.). Tap +Add for a one-tap drop-in. */}
        {complementaryItems.length > 0 && (
          <section className="mt-2 mb-4 bg-white rounded-[16px] border border-[#F6F6F6] p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833]">
            <div className="flex items-center gap-2 mb-3">
              <i className="fi fi-rr-utensils text-[#FE8301] text-[18px] min-[375px]:text-[20px] leading-none" />
              <h2 className="text-[15px] min-[375px]:text-[17px] leading-[22px] font-nunito font-semibold text-[#1A181B]">
                Complete your meal
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
              {complementaryItems.map((m) => {
                const id = m._id || m.id;
                const img = realImage((m.images && m.images[0]) || m.image);
                const price = resolveUnitPrice(m);
                const basePrice = Number(m.basePrice ?? 0);
                const isVeg = m.vegType === 'veg' || m.isVeg === true;
                return (
                  <div
                    key={id}
                    className="shrink-0 w-[140px] min-[375px]:w-[150px] bg-white border border-[#F2F4F7] rounded-[14px] overflow-hidden flex flex-col"
                  >
                    <div className="relative w-full h-[100px] bg-gray-100">
                      {img ? (
                        <img
                          src={img}
                          alt={m.name}
                          className="w-full h-full object-cover"
                          onError={hideBrokenImage}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-50" aria-hidden="true" />
                      )}
                      <div className="absolute top-1.5 left-1.5">
                        <div className={`w-[16px] h-[16px] border-2 ${isVeg ? 'border-[#00B050]' : 'border-[#E31E24]'} rounded-[3px] bg-white flex items-center justify-center`}>
                          <div className={`w-[8px] h-[8px] ${isVeg ? 'bg-[#00B050]' : 'bg-[#E31E24]'} rounded-full`} />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 flex flex-col p-2.5 gap-1.5">
                      <h3 className="text-[12px] min-[375px]:text-[13px] font-nunito font-semibold text-[#1A181B] line-clamp-2 leading-[16px] min-h-[32px]">
                        {m.name}
                      </h3>
                      <div className="flex items-center justify-between gap-1 mt-auto">
                        <div className="flex items-baseline gap-1 min-w-0">
                          <span className="text-[13px] nunito font-bold text-[#1A181B] tabular-nums">₹{price.toFixed(0)}</span>
                          {basePrice > price && (
                            <span className="text-[10px] text-gray-400 line-through tabular-nums">₹{basePrice.toFixed(0)}</span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleAddComplementary(m)}
                          className="bg-[#FE8301] text-white text-[11px] font-nunito font-semibold px-2.5 py-1 rounded-[8px] active:scale-95 transition-transform shrink-0"
                          aria-label={`Add ${m.name} to cart`}
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
    </>
  );
}
