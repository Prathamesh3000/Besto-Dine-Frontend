import React, { useState, useEffect, useRef, useMemo } from "react";
import { sizedImage } from "../../utils/image";
import {
  X,
  Clock,
  UtensilsCrossed,
  Check,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useCart } from "../../Context/CartContext";
import { menuSearchAPI } from "../../utils/api";
import { resolveUnitPrice, resolveSizePrice, round2, formatPrice } from "../../utils/pricing";

function ProductDetailsModal({ product, onClose, isUpdateMode = false }) {
  const { cartItems, updateQuantity, updateCartItem } = useCart();

  const existingCartItem = isUpdateMode ? product : null;

  // Base unit price BEFORE size/toppings. `product.price` on a cart line
  // written by ProductDetails already includes the chosen toppings (and
  // the size), so using it here double-counted toppings every time a
  // line was customised. resolveUnitPrice() reads finalPrice first,
  // which is the plain menu price carried on the line.
  const basePrice = resolveUnitPrice(product);

  // Health Mode controls whether the nutrition strip + health tags show.
  // When the customer has Health Mode toggled OFF we hide them entirely —
  // a regular diner shouldn't see "High Protein" / macros they opted out
  // of. Read once from the same localStorage key the rest of the app uses.
  const healthMode = useMemo(() => {
    try {
      const saved = localStorage.getItem("healthPreferences");
      if (saved) return JSON.parse(saved).healthMode ?? false;
    } catch { /* ignore */ }
    return false;
  }, []);

  // Dynamic customizations from API
  const [apiSizes, setApiSizes] = useState(null);
  const [apiToppings, setApiToppings] = useState(null);
  // Canonical base/final price from the customisations endpoint — lets
  // the size ladder be offer-adjusted even for cart lines that were
  // added via a card's quick-Add and carry only `price`.
  const [apiPricing, setApiPricing] = useState(null);

  useEffect(() => {
    if (!product?.id) return;
    // Combos are NOT menu items — GET /menu/:id/customizations 404s for a
    // combo id and the global axios interceptor then pops a misleading
    // "Menu item not found" toast (the bug seen when customizing a combo
    // line in the cart). Combos carry no per-item sizes/toppings anyway,
    // so skip the lookup entirely for them.
    const isCombo = product.isCombo
      || Array.isArray(product.comboCategories)
      || Array.isArray(product.categories);
    if (isCombo) return;
    // _silent: the modal degrades gracefully to default sizes/toppings on
    // failure, so a 404 (e.g. the item was just deleted) must not fire the
    // global error toast.
    menuSearchAPI.getCustomizations(product.id, { _silent: true }).then(res => {
      if (res.data?.success) {
        const d = res.data.data;
        if (d.sizes?.length > 0) setApiSizes(d.sizes);
        if (d.toppings?.length > 0) setApiToppings(d.toppings);
        setApiPricing({ basePrice: d.basePrice, finalPrice: d.finalPrice });
      }
    }).catch(() => {});
  }, [product?.id, product?.isCombo]);

  // Stable id from a name so the radio/checkbox state matches regardless
  // of which screen wrote the cart item (id schemes differ across the app).
  const slugId = (name, fallback) =>
    String(name || fallback || "").toLowerCase().replace(/\s+/g, "-");

  // Sizes/toppings are sourced from the live customisation API first, then
  // fall back to whatever raw arrays the menu blob carried. NO invented
  // "Regular/Medium/Large" or "Lettuce/Cheese" defaults — an item only shows
  // a Size/Toppings section when it genuinely has options configured.
  // Sizes carry the pre-offer price; the server charges them with the
  // item's offer applied, so project the offer-adjusted price here.
  const pricingSource = useMemo(() => ({
    offerPercentage: product?.offerPercentage,
    basePrice: apiPricing?.basePrice ?? product?.basePrice,
    finalPrice: apiPricing?.finalPrice ?? product?.finalPrice,
  }), [apiPricing, product?.offerPercentage, product?.basePrice, product?.finalPrice]);

  const sizes = useMemo(() => {
    if (apiSizes && apiSizes.length > 0) {
      return apiSizes.map(s => ({ id: slugId(s.name, s._id), name: s.name, price: resolveSizePrice(pricingSource, s) }));
    }
    if (Array.isArray(product?.sizes) && product.sizes.length > 0 && product.sizes.some(s => s?.name)) {
      return product.sizes.map(s => ({
        id: slugId(s.name, s._id),
        name: s.name,
        price: resolveSizePrice(pricingSource, { price: s.price ?? s.finalPrice ?? basePrice }),
      }));
    }
    return [];
  }, [apiSizes, product?.sizes, basePrice, pricingSource]);

  const toppings = useMemo(() => {
    if (apiToppings && apiToppings.length > 0) {
      return apiToppings.map(t => ({ id: slugId(t.name, t._id), name: t.name, price: Number(t.price) }));
    }
    if (Array.isArray(product?.toppings) && product.toppings.length > 0 && product.toppings.some(t => t?.name)) {
      return product.toppings.map(t => ({ id: slugId(t.name, t._id), name: t.name, price: Number(t.price) || 0 }));
    }
    return [];
  }, [apiToppings, product?.toppings]);

  // Derived from real data — true only when the item actually exposes
  // sizes or toppings. Drives the Size/Toppings sections + the Add gate.
  const hasCustomization = sizes.length > 0 || toppings.length > 0;

  // Real discount on the item, replacing the old hardcoded "Flat 20% OFF"
  // placeholder. Prefer the explicit `offerPercentage`; otherwise infer it
  // from basePrice vs finalPrice. 0 ⇒ no offer ⇒ the line is hidden.
  const offerPct = useMemo(() => {
    const explicit = Number(product?.offerPercentage);
    if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
    const base = Number(product?.basePrice);
    const final = Number(product?.finalPrice ?? product?.price);
    if (base > 0 && final > 0 && final < base) {
      return Math.round(((base - final) / base) * 100);
    }
    return 0;
  }, [product?.offerPercentage, product?.basePrice, product?.finalPrice, product?.price]);

  const [quantity, setQuantity] = useState(
    existingCartItem ? existingCartItem.quantity : 1,
  );
  const [selectedSize, setSelectedSize] = useState(
    existingCartItem?.selectedSizes?.[0]?.id
      || (existingCartItem?.size ? slugId(existingCartItem.size) : ""),
  );
  const [selectedToppings, setSelectedToppings] = useState([]);

  // Reconcile the saved selection against the loaded options (the API
  // resolves async, and id schemes vary by source). Match by NAME so a
  // previously-chosen size/topping shows pre-selected when re-opened.
  useEffect(() => {
    if (!existingCartItem || sizes.length === 0) return;
    const chosen = existingCartItem.selectedSizes?.[0]?.name || existingCartItem.size;
    if (!chosen) return;
    const match = sizes.find(s => s.name?.toLowerCase() === String(chosen).toLowerCase());
    if (match) setSelectedSize(match.id); // eslint-disable-line react-hooks/set-state-in-effect
  }, [sizes, existingCartItem]);

  useEffect(() => {
    if (!existingCartItem || toppings.length === 0) return;
    const chosen = existingCartItem.selectedToppings?.length
      ? existingCartItem.selectedToppings
      : existingCartItem.toppings;
    if (!Array.isArray(chosen) || chosen.length === 0) return;
    const ids = chosen
      .map(c => toppings.find(t => t.name?.toLowerCase() === String(c?.name).toLowerCase())?.id)
      .filter(Boolean);
    if (ids.length) setSelectedToppings(ids); // eslint-disable-line react-hooks/set-state-in-effect
  }, [toppings, existingCartItem]);
  const [instructions, setInstructions] = useState(
    existingCartItem?.instructions || "",
  );
  const [isExpanded, setIsExpanded] = useState(false);
  const [showViewMore, setShowViewMore] = useState(false);
  const descriptionRef = useRef(null);
  const internalScrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  //Protein, Fats, Fibre, Carbs, Iron — only keep macros with a REAL
  // value (> 0). An item added without nutrition data carries 0s, and
  // a strip full of "0g" reads as broken — so we drop the empties.
  const macros = useMemo(
    () =>
      [
        { label: "Protein", value: product?.protein, unit: "g" },
        { label: "Fats", value: product?.fats, unit: "g" },
        { label: "Fibre", value: product?.fibre, unit: "g" },
        { label: "Carbs", value: product?.carbs, unit: "g" },
        { label: "Iron", value: product?.iron, unit: "mg" },
      ].filter((m) => m.value !== undefined && Number(m.value) > 0),
    [product],
  );

  const calories = Number(product?.calories) || 0;
  // Has any real nutrition to show at all? Drives BOTH the nutrition strip
  // and the health tags — so a no-data item (added in normal mode) shows
  // neither zeros nor contradictory "High Protein" tags in Health Mode.
  const hasNutrition = calories > 0 || macros.length > 0;

  // Health tags DERIVED from real macros (was hardcoded + always-on, which
  // lied about items with no data). Only truthful badges, only when data
  // exists.
  const healthTags = useMemo(() => {
    if (!hasNutrition) return [];
    const protein = Number(product?.protein) || 0;
    const fats = Number(product?.fats) || 0;
    const tags = [];
    if (protein >= 10) tags.push("💪 High Protein");
    if (fats > 0 && fats <= 20) tags.push("🥑 Healthy Fats");
    if (calories > 0 && calories <= 600) tags.push("🔥 Balanced Calories");
    return tags;
  }, [hasNutrition, calories, product?.protein, product?.fats]);

  const handleScroll = () => {
    if (internalScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } =
        internalScrollRef.current;
      setShowLeftArrow(scrollLeft > 5);
      setShowRightArrow(
        scrollWidth > clientWidth + 5 &&
        scrollLeft < scrollWidth - clientWidth - 5,
      );
    }
  };

  const scroll = (direction) => {
    if (internalScrollRef.current) {
      const scrollAmount = 80;
      internalScrollRef.current.scrollBy({
        left: direction === "right" ? scrollAmount : -scrollAmount,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const el = internalScrollRef.current;
    if (el) {
      handleScroll();
      el.addEventListener("scroll", handleScroll);
      window.addEventListener("resize", handleScroll);
      return () => {
        el.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleScroll);
      };
    }
  }, [macros]);

  useEffect(() => {
    const checkTruncation = () => {
      if (descriptionRef.current) {
        const { scrollHeight, clientHeight } = descriptionRef.current;
        setShowViewMore(scrollHeight > clientHeight);
      }
    };

    checkTruncation();
    window.addEventListener("resize", checkTruncation);
    return () => window.removeEventListener("resize", checkTruncation);
  }, [product?.desc, isExpanded]);

  const handleToppingToggle = (id) => {
    if (selectedToppings.includes(id)) {
      setSelectedToppings(selectedToppings.filter((t) => t !== id));
    } else {
      setSelectedToppings([...selectedToppings, id]);
    }
  };

  const handleSizeSelect = (sizeId) => {
    setSelectedSize(sizeId);
  };

  if (!product) return null;

  // Calculate total price
  const calculateTotalPrice = () => {
    if (!product) return 0;

    let currentPrice = 0;
    if (sizes.length > 0) {
      const selectedSizeObj = sizes.find((s) => s.id === selectedSize);
      currentPrice = selectedSizeObj ? selectedSizeObj.price : basePrice;
    } else {
      currentPrice = basePrice;
    }

    const toppingsPrice = selectedToppings.reduce((total, toppingId) => {
      const topping = toppings.find((t) => t.id === toppingId);
      return total + (topping ? topping.price : 0);
    }, 0);

    return round2((currentPrice + toppingsPrice) * quantity);
  };

  const totalPrice = calculateTotalPrice();

  // Add to cart or update cart logic (if item is already in cart)
  const handleAddOrUpdateCart = () => {
    if (quantity === 0) return;

    if (sizes.length > 0 && !selectedSize) {
      return;
    }

    let sizePrice = basePrice;
    if (sizes.length > 0) {
      const s = sizes.find((sz) => sz.id === selectedSize);
      sizePrice = s ? s.price : basePrice;
    }

    const selectedToppingDetails = selectedToppings.map((toppingId) => {
      const topping = toppings.find((t) => t.id === toppingId);
      return {
        id: toppingId,
        name: topping?.name || "",
        price: topping?.price || 0,
      };
    });

    const selectedSizeDetails = [];
    if (sizes.length > 0) {
      const size = sizes.find((s) => s.id === selectedSize);
      if (size) {
        selectedSizeDetails.push({
          id: size.id,
          name: size.name,
          price: size.price,
        });
      }
    }

    const totalItemPrice = calculateTotalPrice();

    const cartItem = {
      ...product,
      quantity,
      selectedSizes: selectedSizeDetails,
      selectedToppings: selectedToppingDetails,
      instructions,
      totalPrice: totalItemPrice,
      unitPrice: round2(totalItemPrice / quantity),
      // Preserve the REAL flag (derived from whether options exist) so a
      // plain item isn't falsely marked customizable, and a real one keeps
      // its Customize button in the cart.
      hasCustomization,
      _isCartItem: true,
    };

    if (isUpdateMode) {
      updateCartItem(product.id, cartItem);
    } else {
      updateQuantity(product.id, quantity, cartItem);
    }

    onClose();
  };

  // Add button disabled only when the item has sizes and none is picked.
  const isAddDisabled = sizes.length > 0 && !selectedSize;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div
        className="bg-white w-full max-w-[95vw] sm:max-w-md md:max-w-lg lg:max-w-3xl max-h-[95vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl pointer-events-auto animate-slideUp relative flex flex-col"
        style={{ scrollbarWidth: "none" }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 sm:top-4 right-3 sm:right-4 z-10 w-9 h-9 xs:w-10 xs:h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="text-gray-600"
          >
            <line
              x1="18"
              y1="6"
              x2="6"
              y2="18"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="18"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        {/* Content Body */}
        <div className="p-4 flex flex-col gap-4">
          {/* Product Image — full-width hero on every breakpoint. On desktop
              the HEIGHT is capped (full width, shorter) so a tall 4:3 hero
              doesn't dominate; object-cover keeps it filled, no distortion. */}
          <div className="relative w-full aspect-[4/3] sm:aspect-auto sm:h-56 lg:h-64 flex-shrink-0 rounded-2xl xs:rounded-3xl overflow-hidden shadow-sm">
            <img
              src={sizedImage(product.image, { w: 500 })}
              alt={product.title}
              decoding="async"
              className="w-full h-full object-cover"
            />
            {product.isVeg !== undefined && (
              <div className="absolute top-3 left-3 bg-white rounded-[3px] shadow-sm">
                <div
                  className={`w-6 h-6  border-[2px] ${product.isVeg ? "border-[#00B050]" : "border-[#E31E24]"} rounded-[3px] flex items-center justify-center`}
                >
                  <div
                    className={`w-[10px] h-[10px]  ${product.isVeg ? "bg-[#00B050]" : "bg-[#E31E24]"} rounded-full`}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Header Info */}
          <div>
            <div className="flex justify-between items-start gap-2 mb-2.5">
              <h2 className="text-[21px] xs:text-[27px] font-bold font-nunito text-[#1A181B] leading-[1.2] tracking-[-0.01em] flex-1 line-clamp-2">
                {product.title}
              </h2>
              {/* <BookmarkButton
                itemId={product.id}
                itemDetails={{
                  id: product.id,
                  title: product.title,
                  desc: product.desc,
                  price: product.price,
                  image: product.image,
                  isVeg: product.isVeg,
                  ...(product.calories !== undefined ||
                    product.protein !== undefined ||
                    product.fats !== undefined ||
                    product.fibre !== undefined
                    ? {
                      calories: product.calories,
                      protein: product.protein,
                      fats: product.fats,
                      fibre: product.fibre,
                    }
                    : { time: product.time, serves: product.serves }),
                }}
                initialBookmarked={false}
                size={16}
                className="text-[#B6AEB8] mt-1 flex-shrink-0 xs:w-[22px] xs:h-[22px]"
                ariaLabel="Save this item to bookmarks"
              /> */}
            </div>

            {/* Description */}
            <div className="relative mb-4">
              <p
                ref={descriptionRef}
                className={`text-[#7D7380] font-varela text-[14px] sm:text-[15px] leading-[1.6] ${!isExpanded ? "line-clamp-3" : ""
                  }`}
              >
                {product.desc ||
                  "Classic spaghetti tossed in a rich tomato sauce, topped with cherry tomatoes, fresh basil, and grated cheese."}
                {isExpanded && (
                  <button
                    onClick={() => setIsExpanded(false)}
                    className="text-[#FF9800] text-[12px] sm:text-sm regular font-varela hover:underline inline ml-1"
                  >
                    View Less
                  </button>
                )}
              </p>
              {!isExpanded && showViewMore && (
                <div className="absolute bottom-0 right-0 bg-linear-to-l from-white via-white to-transparent pl-10 flex items-center h-[18px]">
                  <button
                    onClick={() => setIsExpanded(true)}
                    className="text-[#FF9800] text-[12px] sm:text-sm regular font-varela hover:underline"
                  >
                    ...View More
                  </button>
                </div>
              )}
            </div>

            {/* Health Tags — Health Mode + only the badges the item's real
                macros actually earn (no hardcoded claims on no-data items). */}
            {healthMode && healthTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 xs:gap-2 mb-4">
                {healthTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-[6px] bg-[#F9FFF2] text-[#8D848F] px-2 xs:px-3 py-1 rounded-[60px] text-[11px] xs:text-xs font-semibold whitespace-nowrap"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Offer — real per-item discount; hidden when the item is at
                full price. (Replaces the old hardcoded "Flat 20% OFF" text.) */}
            {offerPct > 0 && (
              <div className="inline-flex items-center gap-1.5 bg-[#EAF3FF] text-[#007AFF] font-varela font-semibold text-[12px] xs:text-[13px] px-2.5 py-1 rounded-[8px] mb-4">
                <span>🏷️</span>
                <span>Flat {offerPct}% OFF</span>
              </div>
            )}

            {/* Nutritional Info — Health Mode + only when the item actually
                has nutrition data (no all-zeros strip on no-data items). */}
            {healthMode && hasNutrition && (
              <div className="rounded-xl flex items-center gap-2">
                {/* Circle Progress — only when calories are known */}
                {calories > 0 && (
                <div className="relative w-16 h-16 flex items-center justify-center flex-shrink-0">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="#FBFBFB"
                      strokeWidth="4"
                      fill="none"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="28"
                      stroke="#B3FF49"
                      strokeWidth="4"
                      fill="none"
                      strokeDasharray="175"
                      strokeDashoffset="40"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-sm font-bold text-gray-800 leading-none">
                      {calories}
                    </span>
                    <span className="text-[9px] text-gray-500 font-medium">
                      kcal
                    </span>
                  </div>
                </div>
                )}

                {/* Stats */}
                {macros.length > 0 && (
                  <div className="relative flex items-center bg-[#F8FFEF] rounded-[9px] flex-1 min-w-0 overflow-hidden group">
                    {/* Left Arrow */}
                    {showLeftArrow && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          scroll("left");
                        }}
                        className="absolute left-0 z-10 bg-[#F8FFEF]/80 p-0.5 md:hidden"
                      >
                        <ChevronLeft size={16} className="text-[#645E66]" />
                      </button>
                    )}

                    <div
                      ref={internalScrollRef}
                      className="flex items-center gap-1 w-full overflow-x-auto scrollbar-hide px-2 py-[8px] md:overflow-visible md:justify-around"
                    >
                      {macros.map((macro, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col items-center flex-shrink-0 min-w-[60px] md:min-w-0"
                        >
                          <span className="font-bold text-sm sm:text-base text-[#645E66] leading-tight text-center">
                            {macro.value}
                            {macro.unit}
                          </span>
                          <span className="font-normal text-[10px] sm:text-sm text-[#8D848F] leading-tight whitespace-nowrap">
                            {macro.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Right Arrow */}
                    {showRightArrow && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          scroll("right");
                        }}
                        className="absolute right-0 z-10 bg-[#F8FFEF]/80 p-0.5 md:hidden"
                      >
                        <ChevronRight size={16} className="text-[#645E66]" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Time and Serves */}
            {(product.time || product.serves) && (
              <div className="flex items-center gap-1 xs:gap-4 mb-4">
                {product.time && (
                  <div className="inline-flex font-varela items-center gap-1 xs:gap-2 bg-[#FDF5FF] px-2.5 xs:px-3 py-1 xs:py-1.5 rounded-[60px] text-[11px] xs:text-base font-regular text-[#645E66] whitespace-nowrap">
                    <Clock size={10} className="xs:w-[14px] xs:h-[14px]" />{" "}
                    {product.time}
                  </div>
                )}
                {product.serves && (
                  <div className="inline-flex font-varela items-center gap-1 xs:gap-2 bg-[#FDF5FF] px-2.5 xs:px-3 py-1 xs:py-1.5 rounded-[60px] text-[11px] xs:text-base font-regular text-[#645E66] whitespace-nowrap">
                    <UtensilsCrossed
                      size={10}
                      className="xs:w-[14px] xs:h-[14px]"
                    />{" "}
                    {product.serves}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SIZE */}
          {sizes.length > 0 && (
            <div className="border border-[#F0F0F0] rounded-2xl p-4">
              <h3 className="text-[17px] font-nunito font-bold tracking-[-0.01em] text-[#1A181B]">
                Size
              </h3>
              <p className="text-[#8D848F] font-varela text-[13px] leading-snug mt-0.5 mb-3">
                Select an option
              </p>
              <hr className="mb-3 border-[#F0F0F0]" />

              <div className="space-y-3">
                {sizes.map((size) => {
                  const isSelected = selectedSize === size.id;
                  return (
                    <div
                      key={size.id}
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => handleSizeSelect(size.id)}
                    >
                      <span className={`text-[15px] leading-snug font-varela ${isSelected ? "text-[#1A181B] font-semibold" : "text-[#333333]"}`}>
                        {size.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[14px] leading-snug font-varela font-semibold text-[#1A181B] tabular-nums">
                          ₹{formatPrice(size.price)}
                        </span>
                        <div
                          className={`w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? "border-[#FF9800]" : "border-[#E5E5E5]"
                            }`}
                        >
                          {isSelected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-[#FF9800]" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TOPPINGS */}
          {toppings.length > 0 && (
            <div className="border border-[#F0F0F0] rounded-2xl p-4">
              <h3 className="text-[17px] font-nunito font-bold tracking-[-0.01em] text-[#1A181B]">
                Toppings
              </h3>
              <p className="text-[#8D848F] font-varela text-[13px] leading-snug mt-0.5 mb-3">
                Add any extras you like
              </p>
              <hr className="mb-3 border-[#F0F0F0]" />

              <div className="space-y-3">
                {toppings.map((topping) => {
                  const isSelected = selectedToppings.includes(topping.id);
                  return (
                    <div
                      key={topping.id}
                      className="flex items-center justify-between cursor-pointer"
                      onClick={() => handleToppingToggle(topping.id)}
                    >
                      <div className="flex items-center gap-3">
                        {/* Veg indicator */}
                        <div className="w-4 h-4 xs:w-5 xs:h-5 bg-white rounded flex items-center justify-center p-0.5 border border-[#34C759]">
                          <div className="w-full h-full border-2 border-[#34C759] rounded-full flex items-center justify-center">
                            <div className="w-2 h-2 bg-[#34C759] rounded-full" />
                          </div>
                        </div>
                        <span className={`text-[15px] leading-snug font-varela ${isSelected ? "text-[#1A181B] font-semibold" : "text-[#333333]"}`}>
                          {topping.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[14px] font-semibold leading-snug font-varela text-[#1A181B] tabular-nums">
                          +₹{topping.price}
                        </span>
                        <div
                          className={`w-4 h-4 sm:w-5 sm:h-5 rounded-[6px] border flex items-center justify-center transition-all ${isSelected
                            ? "bg-[#FF9800] border-[#FF9800]"
                            : "border-gray-300"
                            }`}
                        >
                          {isSelected && (
                            <Check
                              size={12}
                              className="xs:w-[14px] xs:h-[14px] text-white"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 rounded-t-3xl shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between gap-3 xs:gap-4">
            {/* Quantity */}
            <div className="flex items-center border-[#B3FF49] h-10 xs:h-12 rounded-2xl bg-[#F8FFEF] border px-1.5 xs:px-2">
              <button
                onClick={() => quantity > 1 && setQuantity(quantity - 1)}
                className="w-8 xs:w-10 h-full flex items-center justify-center text-gray-600 active:scale-90"
              >
                <Minus size={16} className="xs:w-[18px] xs:h-[18px]" />
              </button>
              <span className="w-7 xs:w-8 text-center font-bold text-base xs:text-lg text-gray-800">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-8 xs:w-10 h-full flex items-center justify-center text-gray-600 active:scale-90"
              >
                <Plus size={16} className="xs:w-[18px] xs:h-[18px]" />
              </button>
            </div>

            {/* Add Button */}
            <button
              onClick={handleAddOrUpdateCart}
              disabled={isAddDisabled}
              className={`flex-1 h-10 xs:h-12 rounded-xl font-semibold leading-[16px] font-nunito text-[16px] shadow-lg flex items-center justify-center gap-2 min-w-0 transition-all ${isAddDisabled
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-[#FE8301] text-white shadow-orange-500/20 active:scale-95"
                }`}
            >
              <span className="truncate">
                {isAddDisabled
                  ? "Select Size"
                  : isUpdateMode
                    ? `Update - ₹${formatPrice(totalPrice)}`
                    : `Add item - ₹${formatPrice(totalPrice)}`}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailsModal;
