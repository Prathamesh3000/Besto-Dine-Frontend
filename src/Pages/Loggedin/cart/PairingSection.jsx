import React from "react";
import { realImage, hideBrokenImage } from "../../../utils/image";

export default function PairingSection({
  healthMode,
  isTakeaway,
  cartItems,
  pairingItems,
}) {
  return (
    <>
        {/* Health Mode Recommendations */}
        {healthMode && !isTakeaway && cartItems.length > 0 && (
          <>
            {/* Pairing Section */}
            <section className="bg-[#F9FEF2] -mx-4 py-4">
              <h2 className="text-lg font-semibold text-gray-800 mb-2 px-4">
                You will love pairing it with
              </h2>

              <div
                className="flex gap-2 overflow-x-auto pb-4 px-4"
                style={{ scrollbarWidth: "none" }}
              >
                {pairingItems.map((item) => (
                  <div
                    key={item.id}
                    className="shrink-0 w-32 bg-white rounded-2xl p-1.5 shadow-sm cursor-pointer active:scale-95 transition-transform"
                  >
                    <div className="w-full h-24 rounded-xl overflow-hidden mb-2 bg-gray-50">
                      {realImage(item.image) ? (
                        <img
                          src={realImage(item.image)}
                          alt={item.title}
                          className="w-full h-full object-cover"
                          onError={hideBrokenImage}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-50" aria-hidden="true" />
                      )}
                    </div>

                    <p className="text-sm font-medium text-gray-800 line-clamp-1">
                      {item.title}
                    </p>
                    <p className="text-sm font-bold text-gray-900">
                      ₹{item.price}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
    </>
  );
}
