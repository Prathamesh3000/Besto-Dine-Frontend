import React from "react";


export default function PickupTimeSection({
  isTakeaway,
  timeError,
  setTimeError,
  branchError,
  selectedDay,
  setSelectedDay,
  selectedTime,
  setSelectedTime,
  currentTimeSlots,
  timeOffers,
}) {
  return (
    <>
        {/* Select Time Section — takeaway only (pickup time scheduling).
            The other sections (Coupon, Wallet, Tip, Bill Summary) used to
            be nested under the same isTakeaway gate, which hid them from
            dine-in customers entirely — explaining why coupons never
            rendered in dine-in flow even though the backend returned them. */}
        {isTakeaway && (
            <section
              id="pickupTime"
              className={`mt-4 mb-4 bg-white rounded-[16px] border p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833] ${timeError ? 'border-red-400' : 'border-[#F6F6F6]'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[15px] min-[375px]:text-[16px] leading-[22px] font-nunito font-semibold text-[#1A181B]">
                  Select time <span className="text-red-500" aria-hidden="true">*</span>
                </h2>
                <span className="text-[#FE8301] text-[13px] min-[375px]:text-[14px] font-varela leading-[16px]">
                  Today
                </span>
              </div>
              <div className="flex items-center gap-[10px] mb-3">
                <button
                  onClick={() => { setSelectedDay("AM"); if (timeError) setTimeError(''); }}
                  className={`text-[13px] min-[375px]:text-[14px] font-varela transition-colors ${selectedDay === "AM" ? "text-[#FE8301]" : "text-[#007AFF]"
                    }`}
                >
                  AM
                </button>
                <button
                  onClick={() => { setSelectedDay("PM"); if (timeError) setTimeError(''); }}
                  className={`text-[13px] min-[375px]:text-[14px] font-varela transition-colors ${selectedDay === "PM" ? "text-[#FE8301]" : "text-[#007AFF]"
                    }`}
                >
                  PM
                </button>
              </div>
              <div className="flex flex-col gap-3">
                {currentTimeSlots.map((row, rowIndex) => (
                  <div
                    key={rowIndex}
                    className="grid grid-cols-4 gap-1 min-[375px]:gap-3"
                  >
                    {row.map((time, i) => {
                      const isSelected = selectedTime === time;
                      const offer = timeOffers[rowIndex][i];
                      return (
                        <button
                          key={time}
                          onClick={() => { setSelectedTime(time); if (timeError) setTimeError(''); }}
                          className={`flex flex-col items-center py-1.5 min-[375px]:py-2 rounded-[10px] border transition-all ${isSelected
                            ? "border-[#FF9B0B] bg-[#FFFAF5]"
                            : "border-[#EEEEEE] bg-white"
                            }`}
                        >
                          <span className="text-[11px] min-[375px]:text-[13px] font-varela text-[#1A181B] leading-tight">
                            {time}
                          </span>
                          <span className="text-[9px] min-[375px]:text-[11px] font-varela mt-0.5 text-[#007AFF] leading-tight transition-opacity duration-200">
                            {offer}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
                {currentTimeSlots.length === 0 && (
                  <p className="text-center text-gray-400 text-sm py-4 font-varela">
                    No slots available for this period.
                  </p>
                )}
              </div>
              {timeError && (
                <p role="alert" className="mt-3 text-xs text-red-600 flex items-center gap-1 font-varela">
                  <span aria-hidden="true">⚠</span>{timeError}
                </p>
              )}
              {branchError && (
                <p role="alert" className="mt-2 text-xs text-red-600 flex items-center gap-1 font-varela">
                  <span aria-hidden="true">⚠</span>{branchError}
                </p>
              )}
            </section>
        )}
    </>
  );
}
