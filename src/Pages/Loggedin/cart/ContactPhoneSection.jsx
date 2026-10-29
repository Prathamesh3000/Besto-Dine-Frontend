import React from "react";


export default function ContactPhoneSection({
  isTakeaway,
  phoneError,
  contactPhone,
  setContactPhone,
  setPhoneError,
}) {
  return (
    <>
        {/* Contact Number Section — takeaway only. The cafe calls this to
            coordinate the chosen pickup/delivery time, so we collect it
            right under the time picker. Prefilled from the profile mobile,
            editable, and required (guests have no profile number). */}
        {isTakeaway && (
          <section
            id="contactPhone"
            className={`mb-4 bg-white rounded-[16px] border p-3 min-[375px]:p-4 shadow-[0px_4px_8.4px_0px_#D0C9F833] ${phoneError ? 'border-red-400' : 'border-[#F6F6F6]'}`}
          >
            <h2 className="text-[15px] min-[375px]:text-[16px] leading-[22px] font-nunito font-semibold text-[#1A181B] mb-1">
              Contact number <span className="text-red-500" aria-hidden="true">*</span>
            </h2>
            <p className="text-[11px] min-[375px]:text-[12px] text-[#8D848F] font-varela mb-3">
              We'll call this number about your order.
            </p>
            <div className={`flex items-center rounded-[10px] border bg-white px-3 ${phoneError ? 'border-red-400' : 'border-[#EEEEEE]'}`}>
              <span className="text-[14px] text-[#645E66] font-varela pr-2 mr-1 border-r border-[#EEEEEE]">+91</span>
              <input
                id="contactPhoneInput"
                type="tel"
                inputMode="numeric"
                maxLength={10}
                required
                aria-required="true"
                value={contactPhone}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                  setContactPhone(digits);
                  if (phoneError) setPhoneError('');
                }}
                placeholder="10-digit mobile number"
                aria-label="Contact number for this order"
                className="flex-1 py-2.5 text-[14px] font-varela text-[#1A181B] outline-none bg-transparent"
              />
            </div>
            {phoneError && (
              <p role="alert" className="mt-2 text-xs text-red-600 flex items-center gap-1 font-varela">
                <span aria-hidden="true">⚠</span>{phoneError}
              </p>
            )}
          </section>
        )}
    </>
  );
}
