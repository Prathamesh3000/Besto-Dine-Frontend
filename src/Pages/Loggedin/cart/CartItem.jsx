import React from "react";
import { Users, Clock, Minus, Plus, ChevronRight } from "lucide-react";
import { formatPrice } from "../../../utils/pricing";
import { realImage, hideBrokenImage } from "../../../utils/image";

// WITHOUT HEALTH MODE REGULAR CART ITEM here add cart items Without healthmode
export const CartItem = ({ item, quantity, onIncrease, onDecrease, onCustomize }) => {
  const hasSizesOrToppings =
    (item.selectedToppings && item.selectedToppings.length > 0) ||
    (item.selectedSizes && item.selectedSizes.length > 0);

  return (
    <div className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-100 flex gap-3 sm:gap-4 transition-colors">
      <div className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0">
        <div className="w-full h-full rounded-2xl overflow-hidden bg-gray-100">
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
        {item.isVeg !== undefined && (
          <div className="absolute top-1 right-1 bg-white p-0.5 rounded shadow-sm">
            <div
              className={`w-3 h-3 border ${item.isVeg ? "border-green-600" : "border-red-600"} rounded-sm flex items-center justify-center`}
            >
              <div
                className={`w-1.5 h-1.5 ${item.isVeg ? "bg-green-600" : "bg-red-600"} rounded-full`}
              />
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 flex flex-col justify-between">
        <div>
          <div className="flex justify-between items-start">
            <h3 className="font-bold text-gray-900 text-base mb-1">
              {item.title}
            </h3>
          </div>
          <p className="text-xs text-gray-500 line-clamp-1 mb-2">{item.desc}</p>

          {hasSizesOrToppings && (
            <div className="flex flex-col gap-1 mb-2">
              <div
                className="flex items-center gap-1 cursor-pointer"
                onClick={onCustomize}
              >
                <span className="text-[12px] font-varela text-[#645E66]">
                  Customize
                </span>
                <ChevronRight size={13} className="text-[#7D7380]" />
              </div>
              <div className="flex flex-wrap gap-1">
                {item.selectedSizes &&
                  item.selectedSizes.map((size) => (
                    <span
                      key={size.id}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 whitespace-nowrap font-varela border border-orange-100"
                    >
                      {size.name}
                    </span>
                  ))}
                {item.selectedToppings &&
                  item.selectedToppings.map((t) => (
                    <span
                      key={t.id}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-600 whitespace-nowrap font-varela border border-orange-100"
                    >
                      {t.name}
                    </span>
                  ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <span className="flex items-center gap-1">
              <Users size={12} /> Serves {item.serves}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={12} /> {item.time}
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="font-bold text-lg text-gray-900 ">
            ₹{formatPrice(item.unitPrice || item.price)}
          </span>
          <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-2 py-1 border border-gray-200 ">
            <button
              onClick={onDecrease}
              className="w-5 h-5 flex items-center justify-center text-gray-600 active:scale-95"
            >
              <Minus size={14} />
            </button>
            <span className="font-bold text-sm w-4 text-center text-gray-800 ">
              {quantity}
            </span>
            <button
              onClick={onIncrease}
              className="w-5 h-5 flex items-center justify-center text-gray-600 active:scale-95"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CartItem;
