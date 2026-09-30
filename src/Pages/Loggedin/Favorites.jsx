import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, Heart, Plus, Minus } from "lucide-react";
import { useMenu } from "../../Context/MenuContext";
import { useCart } from "../../Context/CartContext";
import { useDineInLock } from "../../utils/dineInSession";
import { useFavorites } from "../../utils/favorites";
import ProductDetails from "../../Components/Loggedin/ProductDetails";
import BottomNav from "../../Components/Loggedin/BottomNav";
import VegBadge from "../../Components/Common/VegBadge";
import { handleImageError, resolveImageUrl } from "../../utils/image";
import { resolveUnitPrice } from '../../utils/pricing';

function Favorites() {
  const navigate = useNavigate();
  const { menuItems, combos, menuLoading, comboLoading } = useMenu();
  const { cartItems, updateQuantity } = useCart();
  const dineInLocked = useDineInLock();
  const { favorites: favoriteIds, remove: removeFavorite } = useFavorites();

  const [activeProduct, setActiveProduct] = useState(null);

  // Match favorited ids against the menu+combo catalogues. Either
  // collection may be loading on first paint, so we wait for both to
  // resolve before deciding "no items".
  const items = useMemo(() => {
    if (favoriteIds.size === 0) return [];
    const pool = [...(menuItems || []), ...(combos || [])];
    return pool.filter((p) => {
      const pid = p._id || p.id;
      return pid && favoriteIds.has(pid);
    });
  }, [favoriteIds, menuItems, combos]);

  const loading = menuLoading || comboLoading;

  const getCartQuantity = (id) => cartItems?.[id]?.quantity || 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24 sm:pb-28">
      {/* Header */}
      <header className="p-4 sm:px-6 sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center gap-3 sm:gap-4">
        <button onClick={() => navigate(-1)} className="p-1" aria-label="Go back">
          <ChevronLeft size={24} className="text-gray-900" />
        </button>
        <div className="flex items-center gap-2">
          <Heart size={20} className="text-[#E11D48] fill-[#E11D48]" />
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900 font-nunito">
            Your Favorites
          </h1>
        </div>
      </header>

      <main className="p-4 sm:p-6">
        {loading && items.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-20 h-20 mx-auto mb-4 bg-[#FFE4E6] rounded-full flex items-center justify-center">
              <Heart size={36} className="text-[#E11D48]" />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800 mb-2 font-nunito">
              No favorites yet
            </h2>
            <p className="text-gray-500 mb-6 px-6 font-varela">
              Tap the heart icon on any dish to save it here for quick access.
            </p>
            <button
              onClick={() => navigate("/customer/home")}
              className="bg-[#FE8301] text-white py-3 px-6 rounded-xl font-semibold hover:bg-orange-600 active:scale-[0.98] transition-all"
            >
              Browse Menu
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const id = item._id || item.id;
              const title = item.name || item.title || "Item";
              const desc = item.description || item.desc || "";
              const image =
                resolveImageUrl(
                  (Array.isArray(item.images) && item.images[0]) || item.image
                ) || "";
              const price = Number(
                resolveUnitPrice(item)
              );
              const originalPrice = Number(
                item.isCombo ? item.originalPrice ?? 0 : item.basePrice ?? 0
              );
              const isVeg =
                typeof item.isVeg === "boolean"
                  ? item.isVeg
                  : item.vegType === "veg";
              const qty = getCartQuantity(id);

              return (
                <div
                  key={id}
                  onClick={() => setActiveProduct(item)}
                  className="flex gap-3 p-3 bg-white border border-[#F2F1FA] rounded-2xl shadow-sm cursor-pointer active:scale-[0.99] transition-transform"
                >
                  {/* Thumbnail */}
                  <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-gray-100">
                    {image ? (
                      <img
                        src={image}
                        alt={title}
                        className="w-full h-full object-cover"
                        onError={handleImageError}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                        No image
                      </div>
                    )}
                    {typeof isVeg === "boolean" && (
                      <div className="absolute top-1.5 left-1.5">
                        <VegBadge isVeg={isVeg} size="sm" />
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start gap-2">
                        <h3 className="font-bold text-[#1A181B] text-base leading-tight line-clamp-1 font-nunito">
                          {title}
                        </h3>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFavorite(id);
                          }}
                          aria-label="Remove from favorites"
                          className="p-1 -m-1 active:scale-90 transition-transform shrink-0"
                        >
                          <Heart
                            size={20}
                            className="text-[#E11D48] fill-[#E11D48]"
                          />
                        </button>
                      </div>
                      {desc && (
                        <p className="text-xs text-gray-500 line-clamp-2 mt-0.5 font-varela">
                          {desc}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-base font-bold text-[#1A181B] nunito tabular-nums">
                          ₹{price.toFixed(0)}
                        </span>
                        {originalPrice > price && (
                          <span className="text-xs text-gray-400 line-through tabular-nums">
                            ₹{originalPrice.toFixed(0)}
                          </span>
                        )}
                      </div>

                      {qty > 0 ? (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 bg-[#FFF3E6] border border-[#FE830140] rounded-lg px-2 py-1"
                        >
                          <button
                            onClick={() => updateQuantity(id, -1)}
                            disabled={dineInLocked}
                            className="text-[#FE8301] disabled:text-gray-300"
                            aria-label="Decrease quantity"
                          >
                            <Minus size={16} />
                          </button>
                          <span className="text-sm font-bold text-[#1A181B] min-w-5 text-center tabular-nums">
                            {qty}
                          </span>
                          <button
                            onClick={() => updateQuantity(id, 1)}
                            disabled={dineInLocked}
                            className="text-[#FE8301] disabled:text-gray-300"
                            aria-label="Increase quantity"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveProduct(item);
                          }}
                          disabled={dineInLocked}
                          className="bg-[#FE8301] text-white text-xs font-semibold px-3 py-1.5 rounded-lg disabled:bg-gray-200 disabled:text-gray-400 active:scale-95 transition-transform"
                        >
                          {dineInLocked ? "Locked" : "Add"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {activeProduct && (
        <ProductDetails
          product={activeProduct}
          onClose={() => setActiveProduct(null)}
        />
      )}

      <BottomNav />
    </div>
  );
}

export default Favorites;
