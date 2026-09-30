import React, { useState, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Check, Heart } from "lucide-react";
import { useCart } from "../../Context/CartContext";
import { useHealthContext } from "../../Context/Loggedin/HealthContext";
import { menuSearchAPI } from "../../utils/api";
import { useDineInLock } from "../../utils/dineInSession";
import { useFavorites } from "../../utils/favorites";
import VegBadge from "../Common/VegBadge";
import { handleImageError, resolveImageUrl, sizedImage } from "../../utils/image";
import { resolveSizePrice, round2, formatPrice } from "../../utils/pricing";

// Normalise a product across two shapes that can arrive here:
//   1. Raw backend `menuItem`  — { _id, name, description, images[], basePrice,
//                                   finalPrice, offerPercentage, cookingTime,
//                                   serveUpto, vegType, category, ... }
//   2. Home-built `itemProps`  — { id, title, desc, image, price, isVeg,
//                                   time, serves, ... }
// Having one shape downstream prevents the "but it was working from Home"
// bugs where a field existed under a different key than the JSX expected.
function normaliseProduct(p) {
  if (!p) return null;
  const images = Array.isArray(p.images) ? p.images : null;
  // Combos carry a `categories` array of embedded items. We use it as
  // the ground-truth signal rather than relying on the caller to set
  // `isCombo` — search results / deep links don't always flag it.
  const isCombo = Boolean(p.isCombo) || Array.isArray(p.categories);

  // Price math — combos store { price, originalPrice, discount, savings,
  // discountType }; regular items store { basePrice, finalPrice,
  // offerPercentage }. Project both onto the same shape so the JSX
  // doesn't need two branches to render the price block.
  let basePrice, finalPrice, offerPercentage;
  if (isCombo) {
    finalPrice = Number(p.price ?? p.finalPrice ?? 0);
    basePrice  = Number(p.originalPrice || finalPrice);
    if (p.discountType === 'Percentage') {
      offerPercentage = Number(p.discount || 0);
    } else if (basePrice > finalPrice) {
      offerPercentage = Math.round(((basePrice - finalPrice) / basePrice) * 100);
    } else {
      offerPercentage = 0;
    }
  } else {
    basePrice = Number(p.basePrice ?? p.price ?? 0);
    finalPrice = Number(p.finalPrice ?? basePrice);
    offerPercentage = Number(p.offerPercentage || 0);
  }

  return {
    id: p.id || p._id,
    title: p.title || p.name || "",
    desc: p.desc || p.description || "",
    image: resolveImageUrl(p.image || images?.[0]) || "",
    isVeg: p.isVeg !== undefined ? Boolean(p.isVeg) : p.vegType === "veg",
    basePrice,
    finalPrice,
    offerPercentage,
    time: p.time || p.cookingTime || "",
    serves: p.serves || p.serveUpto || "",
    unit: p.unit || "pieces",
    categoryName: p.categoryName || p.category?.name || "",
    healthLevel: p.healthLevel || "",
    healthTags: Array.isArray(p.healthTags) ? p.healthTags : [],
    // Backend nests nutrition under `nutritionalInfo` and uses `fat`
    // (singular). Fall back to top-level keys for any caller that
    // already flattened them (e.g. itemProps built in Home.jsx).
    nutrition: {
      calories: Number(p.nutritionalInfo?.calories ?? p.calories ?? 0),
      protein:  Number(p.nutritionalInfo?.protein  ?? p.protein  ?? 0),
      fat:      Number(p.nutritionalInfo?.fat      ?? p.fats     ?? p.fat ?? 0),
      carbs:    Number(p.nutritionalInfo?.carbs    ?? p.carbs    ?? 0),
      fibre:    Number(p.nutritionalInfo?.fibre    ?? p.fibre    ?? 0),
      iron:     Number(p.nutritionalInfo?.iron     ?? p.iron     ?? 0),
    },
    healthyIngredients: Array.isArray(p.healthyIngredients) ? p.healthyIngredients : [],
    ingredients: Array.isArray(p.ingredients) ? p.ingredients : [],
    _isCartItem: p._isCartItem || false,
    // Combo-specific
    isCombo,
    comboCategories: isCombo && Array.isArray(p.categories) ? p.categories : [],
    // Keep the original blob so handleAddToCart can round-trip every field
    // the cart layer might care about.
    _raw: p,
  };
}

// Flatten a combo's `categories[].items[]` into a single "X × N" line
// list, collapsing duplicate names into a quantity. The schema doesn't
// carry an explicit quantity field, so admins express "× 2" by adding
// the same item twice — we detect and aggregate that here.
function buildComboLines(comboCategories) {
  const byName = new Map();
  for (const cat of comboCategories || []) {
    for (const item of cat.items || []) {
      const key = item.name;
      if (byName.has(key)) {
        const prev = byName.get(key);
        byName.set(key, { ...prev, qty: prev.qty + 1 });
      } else {
        byName.set(key, {
          name: item.name,
          qty: 1,
          isVeg: item.isVeg !== false,
          price: Number(item.price || 0),
        });
      }
    }
  }
  return [...byName.values()];
}


// Local import — kept inside the component module so the Product
// modal stays a self-contained surface (the dine-in lock toggles
// the Add CTA across every place this modal is opened from: Home,
// Search, MenuItemDetail).
const ProductDetails = ({ product: propProduct, onClose: propOnClose, onAddToCart }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { healthMode } = useHealthContext();
  const { updateQuantity, updateCartItem } = useCart();
  const dineInLocked = useDineInLock();

  // Support both modal (props) and page (route state)
  const rawProduct = propProduct || location.state?.product;
  const onClose = propOnClose || (() => navigate(-1));

  // Single normalised shape so the JSX below never cares which caller
  // passed which key. All downstream reads go through `product.*`.
  const product = useMemo(() => normaliseProduct(rawProduct), [rawProduct]);

  // Dynamic customizations from API. When the API returns nothing we
  // render NO invented sizes / toppings — fake "Regular/Medium/Large"
  // defaults used to show up on items that the admin never configured
  // customisations for, which confused customers at checkout.
  const [apiSizes, setApiSizes] = useState(null);
  const [apiToppings, setApiToppings] = useState(null);
  const [itemUnit, setItemUnit] = useState(product?.unit || 'pieces');
  const [customisationsLoaded, setCustomisationsLoaded] = useState(false);

  useEffect(() => {
    if (!product?.id) return;
    // Combos are a separate collection on the backend — the
    // /menu/:id/customizations endpoint is menuItem-only and would 404
    // with "Menu item not found" (surfaced as a toast by the global
    // interceptor). Combos also don't have sizes/toppings by design,
    // so there's nothing to fetch either way. Skip.
    if (product.isCombo) {
      setCustomisationsLoaded(true);
      return;
    }
    setCustomisationsLoaded(false);
    menuSearchAPI.getCustomizations(product.id, { _silent: true }).then(res => {
      if (res.data?.success) {
        const d = res.data.data;
        if (d.sizes?.length > 0) setApiSizes(d.sizes);
        if (d.toppings?.length > 0) setApiToppings(d.toppings);
        if (d.unit) setItemUnit(d.unit);
      }
    }).catch(() => {}).finally(() => setCustomisationsLoaded(true));
  }, [product?.id, product?.isCombo]);

  // Sizes store the PRE-offer price; the server charges them with the
  // item's offer applied. Project the customer-facing (offer-adjusted)
  // price here so the option list, the header price, the Add button and
  // the cart line all show what checkout will actually charge.
  const sizes = useMemo(() => {
    if (!apiSizes || apiSizes.length === 0) return [];
    return apiSizes.map(s => ({
      id: s.name || s._id,
      name: s.name,
      basePrice: Number(s.price),
      price: resolveSizePrice(product, s),
      quantity: s.quantity || null,
      isVeg: true,
    }));
  }, [apiSizes, product]);

  const toppings = useMemo(() => {
    if (!apiToppings || apiToppings.length === 0) return [];
    return apiToppings.map(t => ({
      id: t.name || t._id,
      name: t.name,
      price: Number(t.price),
      isVeg: t.type !== 'non-veg',
    }));
  }, [apiToppings]);

  // Initialize selection state. If there are no sizes from the API we
  // treat the base price itself as the "single option" and leave the
  // selection empty (the Add button falls back to the base price).
  const [quantity, setQuantity] = useState(rawProduct?.quantity || 1);
  const [selectedSize, setSelectedSize] = useState(
    rawProduct?.size ? [rawProduct.size] : (healthMode ? [] : [])
  );
  const [selectedToppings, setSelectedToppings] = useState(
    rawProduct?.toppings?.map(t => t.id) || []
  );

  // Auto-select the first available size once customisations load, so
  // the Add button isn't stuck on "Select Size" for items the admin has
  // configured sizes for (preserves user's pick when editing a cart item).
  useEffect(() => {
    if (!customisationsLoaded) return;
    if (selectedSize.length > 0) return;
    if (sizes.length > 0) setSelectedSize([sizes[0].id]);
  }, [customisationsLoaded, sizes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Favorites — shared hook keeps every card + modal in sync.
  const { has: hasFavorite, toggle: toggleFavoriteId } = useFavorites();
  const isFavorited = hasFavorite(product?.id);
  const toggleFavorite = () => { if (product?.id) toggleFavoriteId(product.id); };

  const handleSizeToggle = (id) => {
    // Size is a REQUIRED, single-selection field — clicking the same
    // option again shouldn't clear it and force "Select Size".
    setSelectedSize(prev => (prev.includes(id) ? prev : [id]));
  };

  const handleToppingToggle = (id) => {
    if (selectedToppings.includes(id)) {
      setSelectedToppings(selectedToppings.filter((t) => t !== id));
    } else {
      setSelectedToppings([...selectedToppings, id]);
    }
  };

  const calculateUnitPrice = () => {
    if (!product) return 0;
    const selectedSizeObj = sizes.find(s => selectedSize.includes(s.id));
    // No sizes configured → use the item's final price as-is.
    const sizePrice = selectedSizeObj ? selectedSizeObj.price : product.finalPrice;

    const toppingsPrice = selectedToppings.reduce((total, id) => {
      const t = toppings.find((x) => x.id === id);
      return total + (t ? t.price : 0);
    }, 0);

    return round2(sizePrice + toppingsPrice);
  };

  const calculateTotal = () => {
    return round2(calculateUnitPrice() * quantity);
  };

  // Price shown in the header tracks the CURRENT selection (size swaps
  // the base price), so the number the customer reads above is the
  // number that lands in the cart.
  const selectedSizeForDisplay = sizes.find(s => selectedSize.includes(s.id));
  const headerPrice = selectedSizeForDisplay ? selectedSizeForDisplay.price : product?.finalPrice ?? 0;
  const headerStrike = selectedSizeForDisplay ? selectedSizeForDisplay.basePrice : product?.basePrice ?? 0;

  const handleAddToCart = () => {
    if (!product) return;
    // Block submission only when sizes exist and none is picked.
    if (sizes.length > 0 && selectedSize.length === 0) return;

    const selectedSizeObj = sizes.find(s => selectedSize.includes(s.id));
    const selectedToppingObjects = toppings.filter((t) => selectedToppings.includes(t.id));
    const unitPrice = calculateUnitPrice();

    const item = {
      // Start from the raw backend blob so every field the cart layer
      // might want (images, category, vegType, ...) is preserved.
      ...product._raw,
      id: product.id,
      title: product.title,
      desc: product.desc,
      image: product.image,
      isVeg: product.isVeg,
      price: unitPrice,
      // Explicit per-unit line price (size + toppings). The cart line and
      // subtotal read `unitPrice ?? price`; writing it here stops a stale
      // unitPrice from an earlier edit of the same line winning.
      unitPrice,
      quantity,
      size: selectedSizeObj?.name || "Regular",
      sizeQuantity: selectedSizeObj?.quantity || null,
      unit: itemUnit,
      toppings: selectedToppingObjects,
      // Canonical keys the cart line chips + the detail/customize modal
      // both read. ProductDetails historically only wrote `size`/`toppings`,
      // so the chips never rendered and the order payload carried no
      // size/topping. Write the standard arrays so every downstream surface
      // (cart chips, ProductDetailsModal pre-selection, order payload) sees
      // the same selection.
      selectedSizes: selectedSizeObj
        ? [{ id: selectedSizeObj.id, name: selectedSizeObj.name, price: selectedSizeObj.price }]
        : [],
      selectedToppings: selectedToppingObjects.map((t) => ({
        id: t.id, name: t.name, price: t.price,
      })),
      // Authoritative "this item exposes sizes/toppings" flag, stamped at
      // add time from the live customisation options. The cart line reads
      // this to decide whether to show the Customize button — we can't
      // rely on `toppings` here because it's overwritten with the SELECTED
      // toppings (empty when the customer picked none).
      hasCustomization: sizes.length > 0 || toppings.length > 0,
      totalPrice: calculateTotal(),
    };

    if (onAddToCart) {
      onAddToCart(item);
    } else if (product._isCartItem) {
      updateCartItem(product.id, { ...item, quantity });
    } else {
      updateQuantity(product.id, quantity, item);
    }
    onClose();
  };

  if (!product) return null;

  return (
    <div
      onClick={onClose}
      // h-[100dvh] (dynamic viewport height) — on mobile browsers with a
      // hide/show URL bar, vh includes the chrome area which pushed the
      // bottom of the modal (and the Add-to-Cart bar inside) BEHIND the
      // URL bar. dvh always matches the currently-visible viewport so
      // the bar is reliably on-screen.
      className="fixed inset-x-0 top-0 h-[100dvh] z-[100] bg-black/50 flex items-end sm:items-center justify-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        // CRITICAL: wrapper needs an EXPLICIT height for the inner
        // `flex-1` modal card to have something to grow into. With only
        // `max-h`, the wrapper auto-sizes to its content; `flex-1` on
        // an auto-sized parent resolves to 0px, which collapsed the
        // scroll area AND the Add-to-Cart bar out of view.
        // Mobile: fixed 88dvh so the underlying page header peeks above the
        // sheet (bottom-sheet feel). Desktop: size to CONTENT, capped at
        // 92dvh — a short item (e.g. a drink) no longer leaves a big empty
        // gap above the Add-to-Cart bar; a long one still scrolls.
        className="w-full sm:w-[90%] md:w-[560px] lg:w-[600px] xl:w-[640px] h-[88dvh] sm:h-auto sm:max-h-[92dvh] flex flex-col"
      >

        {/* CLOSE BUTTON — sits above the card */}
        <div className="flex justify-end px-4 mb-3 shrink-0">
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/90 backdrop-blur-sm shadow-md flex items-center justify-center active:scale-95 transition-transform"
          >
            <i className="fi fi-br-cross text-[#666] text-[12px]" />
          </button>
        </div>

        {/* MODAL CARD — fills the remaining vertical space in the
            wrapper (flex-1 + min-h-0). Its own flex column then places
            scrollable content above the Add-to-Cart bar. */}
        <div
          className="bg-white rounded-t-[24px] sm:rounded-[24px] flex-1 min-h-0 sm:flex-initial flex flex-col overflow-hidden"
        >
          <div
            className="flex-1 min-h-0 sm:flex-initial overflow-y-auto px-4 pt-4 pb-4 product-detail-scroll"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <style>{`.product-detail-scroll::-webkit-scrollbar { display: none; }`}</style>
            {/* Image Section */}
            <div className="relative w-full overflow-hidden rounded-2xl bg-gray-50">
              {product.isVeg !== undefined && (
                <div className="absolute top-2.5 left-2.5 z-10">
                  <VegBadge isVeg={product.isVeg} size="sm" />
                </div>
              )}
              <img
                src={sizedImage(product.image, { w: 640 })}
                alt={product.title}
                decoding="async"
                className="w-full aspect-[16/9] object-cover"
                onError={handleImageError}
              />
            </div>

            {/* Title, favorite + price */}
            <div className="flex justify-between items-start mt-4 gap-2">
              <h2 className="text-[18px] nunito font-bold text-[#1A181B] leading-[24px] flex-1">
                {product.title}
              </h2>
              <button
                type="button"
                onClick={toggleFavorite}
                aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={isFavorited}
                className="p-1 -m-1 rounded-md hover:bg-[#FFF1F2] active:scale-90 transition-transform shrink-0"
              >
                <Heart
                  size={20}
                  strokeWidth={2}
                  className={isFavorited ? 'text-[#E11D48] fill-[#E11D48]' : 'text-[#667085]'}
                />
              </button>
            </div>

            {product.desc && (
              <p className="text-[#667085] varela-rounded font-normal text-[13px] leading-[18px] mt-1.5">
                {product.desc}
              </p>
            )}

            {/* Price row — show discount when an offer is running */}
            <div className="flex items-baseline gap-2 mt-2">
              <span className="text-[18px] nunito font-bold text-[#1A181B]">
                ₹{formatPrice(headerPrice)}
              </span>
              {product.offerPercentage > 0 && headerStrike > headerPrice && (
                <span className="text-[13px] text-[#8D848F] line-through varela-rounded">
                  ₹{formatPrice(headerStrike)}
                </span>
              )}
            </div>

            {/* Health tags — emoji-prefixed, green chips. Placed BEFORE
                the offer banner so nutritional signal is the first thing
                the user sees after the description. Maps common tag text
                to an appropriate emoji; unknown tags get a leaf icon. */}
            {(product.healthLevel || product.healthTags.length > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {product.healthLevel && (
                  <span className="text-[12px] font-semibold varela-rounded flex items-center gap-1
                      text-[#1A7F37]">
                    <span>🥗</span> {product.healthLevel} Health
                  </span>
                )}
                {product.healthTags.map(tag => {
                  const lower = String(tag).toLowerCase();
                  const emoji =
                    lower.includes('protein') ? '👍'
                    : lower.includes('fat')     ? '🥑'
                    : lower.includes('calorie') ? '🔥'
                    : lower.includes('vitamin') ? '✨'
                    : lower.includes('fibre') || lower.includes('fiber') ? '🌾'
                    : '🌿';
                  return (
                    <span
                      key={tag}
                      className="text-[12px] font-semibold varela-rounded flex items-center gap-1 text-[#1A7F37]"
                    >
                      <span>{emoji}</span> {tag}
                    </span>
                  );
                })}
              </div>
            )}

            {/* Offer banner — "Flat X% OFF on [Combos|Category]" */}
            {product.offerPercentage > 0 && (
              <p className="mt-2 text-[13px] font-semibold text-[#1F78FF] varela-rounded">
                Flat {product.offerPercentage}% OFF
                {product.isCombo
                  ? ' on Combos'
                  : (product.categoryName ? ` on ${product.categoryName}` : '')}
              </p>
            )}

            {/* Nutrition strip — horizontal row: calories donut on the
                left + macro pills (Protein / Carbs / Fats / Fibre).
                Shown ONLY while Health Mode is active, and only when
                there's at least one non-zero value to display. */}
            {healthMode && (() => {
              const n = product.nutrition || {};
              const anyMacro = ['protein','fat','carbs','fibre'].some(k => Number(n[k]) > 0);
              if (!anyMacro && !(Number(n.calories) > 0)) return null;

              // Donut progress assumes 500 kcal as "full" — a reasonable
              // upper bound for a single dish. Anything above shows as
              // a completed ring.
              const caloriePct = Math.min(100, Math.round((Number(n.calories) / 500) * 100));
              // conic-gradient paints the arc; rest is a soft green track.
              const donutBg = `conic-gradient(#4BA03E 0% ${caloriePct}%, #E8F5E1 ${caloriePct}% 100%)`;

              const macros = [
                { key: 'protein', label: 'Protein', unit: 'g', value: n.protein },
                { key: 'carbs',   label: 'Carbs',   unit: 'g', value: n.carbs },
                { key: 'fat',     label: 'Fats',    unit: 'g', value: n.fat },
                { key: 'fibre',   label: 'Fibre',   unit: 'g', value: n.fibre },
              ];

              return (
                <div className="mt-3 flex items-center gap-2">
                  {/* Calories donut */}
                  <div
                    className="relative w-[70px] h-[70px] rounded-full flex items-center justify-center shrink-0"
                    style={{ background: donutBg }}
                    aria-label={`${Number(n.calories).toFixed(0)} kilocalories`}
                  >
                    <div className="w-[58px] h-[58px] rounded-full bg-white flex flex-col items-center justify-center">
                      <span className="text-[14px] font-bold nunito text-[#1A181B] leading-none tabular-nums">
                        {Number(n.calories).toFixed(0)}
                      </span>
                      <span className="text-[9px] text-[#8D848F] varela-rounded mt-0.5">kcal</span>
                    </div>
                  </div>

                  {/* Macro pills */}
                  <div className="flex-1 grid grid-cols-4 gap-1.5">
                    {macros.map(m => (
                      <div
                        key={m.key}
                        className="bg-[#F1F8EC] rounded-[10px] px-1 py-1.5 text-center"
                      >
                        <p className="text-[13px] font-bold nunito text-[#1A181B] leading-tight tabular-nums">
                          {Number(m.value).toFixed(0)}{m.unit}
                        </p>
                        <p className="text-[10px] text-[#5A7A55] varela-rounded">{m.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Time / Serves pills */}
            {(product.time || product.serves) && (
              <div className="flex gap-2 mt-3 flex-wrap">
                {product.time && (
                  <div className="flex items-center gap-1.5 bg-[#F8F7FA] px-2.5 py-1 rounded-full text-[11px] text-[#645E66] font-varela">
                    <i className="fi fi-rr-clock-three text-[10px]" />
                    <span>{typeof product.time === 'number' ? `${product.time} min` : product.time}</span>
                  </div>
                )}
                {product.serves && (
                  <div className="flex items-center gap-1.5 bg-[#F8F7FA] px-2.5 py-1 rounded-full text-[11px] text-[#645E66] font-varela">
                    <i className="fi fi-rr-restaurant text-[10px]" />
                    <span>Serves {product.serves}</span>
                  </div>
                )}
              </div>
            )}

            {/* Ingredients — small chips pulled from menuItem.ingredients */}
            {product.ingredients.length > 0 && (
              <div className="mt-4">
                <h3 className="text-[14px] font-semibold nunito text-[#1A181B] mb-2">Ingredients</h3>
                <div className="flex flex-wrap gap-1.5">
                  {product.ingredients.map((ing, i) => (
                    <span key={i} className="text-[11px] px-2 py-1 rounded-full bg-[#F6F6F6] text-[#645E66] varela-rounded">
                      {ing}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Combo Details — breakdown of what's inside this combo.
                Replaces Size/Toppings for combos since they don't apply. */}
            {product.isCombo && (() => {
              const lines = buildComboLines(product.comboCategories);
              if (lines.length === 0) return null;
              return (
                <div className="mt-4 border border-[#F0F0F0] rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 bg-[#FAFAFA]">
                    <h3 className="text-[15px] font-semibold nunito text-[#1A181B]">Combo Details</h3>
                  </div>
                  <div className="flex flex-col divide-y divide-[#F5F5F5]">
                    {lines.map((line, i) => (
                      <div key={`${line.name}-${i}`} className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-2 min-w-0">
                          {typeof line.isVeg === 'boolean' && <VegBadge isVeg={line.isVeg} size="xs" />}
                          <span className="text-[14px] nunito text-[#333333] truncate">{line.name}</span>
                        </div>
                        <span className="text-[13px] varela-rounded text-[#645E66] shrink-0 tabular-nums">× {line.qty}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Size — regular items only. Combos never render sizes. */}
            {!product.isCombo && sizes.length > 0 && (
            <div className="mt-4 border border-[#F0F0F0] rounded-2xl overflow-hidden">
              <div className="px-4 py-3 bg-[#FAFAFA]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[15px] font-semibold nunito text-[#1A181B]">Size</h3>
                  {itemUnit !== 'pieces' && (
                    <span className="text-[11px] text-[#8D848F] bg-white px-2 py-0.5 rounded-full border border-[#F0F0F0]">{itemUnit}</span>
                  )}
                </div>
                <p className="text-[#8D848F] varela-rounded text-[11px]">Select any 1 option</p>
              </div>

              <div className="flex flex-col divide-y divide-[#F5F5F5]">
                {sizes.map((size) => {
                  const isSelected = selectedSize.includes(size.id);
                  return (
                    <div
                      key={size.id}
                      onClick={() => handleSizeToggle(size.id)}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-[#FFF8F0]' : 'bg-white'}`}
                    >
                      <span className="text-[14px] font-semibold nunito text-[#333333]">
                        {size.name}
                        {size.quantity && <span className="text-[12px] text-[#8D848F] font-normal ml-1">({size.quantity} {itemUnit})</span>}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] varela-rounded text-[#645E66]">₹{formatPrice(size.price)}</span>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? "bg-[#FE8301] border-[#FE8301]" : "border-[#D0D5DD]"}`}>
                          {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}

            {/* Toppings — regular items only */}
            {!product.isCombo && toppings.length > 0 && (
            <div className="mt-3 border border-[#F0F0F0] rounded-2xl overflow-hidden mb-4">
              <div className="px-4 py-3 bg-[#FAFAFA]">
                <h3 className="text-[15px] font-semibold nunito text-[#1A181B]">Toppings</h3>
                <p className="text-[#8D848F] varela-rounded text-[11px]">Optional add-ons</p>
              </div>

              <div className="flex flex-col divide-y divide-[#F5F5F5]">
                {toppings.map((topping) => {
                  const isSelected = selectedToppings.includes(topping.id);
                  return (
                    <div
                      key={topping.id}
                      onClick={() => handleToppingToggle(topping.id)}
                      className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-[#FFF8F0]' : 'bg-white'}`}
                    >
                      <span className="flex items-center gap-2 text-[14px] font-semibold nunito text-[#333333]">
                        <VegBadge isVeg={topping.isVeg} size="xs" />
                        {topping.name}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[13px] varela-rounded text-[#645E66]">+₹{topping.price}</span>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${isSelected ? "bg-[#FE8301] border-[#FE8301]" : "border-[#D0D5DD]"}`}>
                          {isSelected && <Check size={14} className="text-white" strokeWidth={3} />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            )}
          </div>

        {/* Bottom Bar — in-flow flex child, guaranteed visible.
            Omitted entirely once the dine-in visit is settled: the
            ordering controls are hidden, not shown as dead buttons. */}
        {!dineInLocked && (
        <div className="shrink-0 bg-white px-4 py-3 border-t border-[#F0F0F0] safe-bottom">
          <div className="flex gap-3 items-center max-w-[420px] mx-auto w-full">
            {/* Quantity selector */}
            <div className="flex items-center border justify-between bg-[#FFF3E6] gap-2 border-[#FE830140] rounded-xl h-[48px] px-2 min-w-[110px]">
              <button
                onClick={() => quantity > 1 && setQuantity(quantity - 1)}
                className="flex justify-center items-center w-8 h-8 active:scale-90 text-[#FE8301] transition-transform"
              >
                <i className="fi fi-sr-minus-small flex items-center text-[20px]"></i>
              </button>
              <span className="text-center nunito font-bold text-[18px] text-[#1A181B] min-w-[24px]">
                {quantity}
              </span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="flex justify-center items-center w-8 h-8 active:scale-90 text-[#FE8301] transition-transform"
              >
                <i className="fi fi-sr-plus-small flex items-center text-[20px]"></i>
              </button>
            </div>

            {/* Add to cart — disabled when:
                  • size is required but not selected, or
                  • the dine-in bill has been settled (lock active)
                The lock takes precedence since it's the more
                informative state for the customer. */}
            {(() => {
              const needsSize = sizes.length > 0 && selectedSize.length === 0;
              const blocked = dineInLocked || needsSize;
              return (
                <button
                  onClick={handleAddToCart}
                  disabled={blocked}
                  title={dineInLocked ? 'Bill settled — re-scan QR to order' : undefined}
                  className={`flex-1 h-[48px] rounded-xl font-bold text-[15px] nunito transition-all ${
                    blocked
                      ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                      : "bg-[#FE8301] text-white active:scale-[0.98] shadow-sm"
                  }`}
                >
                  {dineInLocked
                    ? "🔒 Locked — Re-scan QR"
                    : needsSize
                      ? "Select Size"
                      : `${product._isCartItem ? 'Update' : 'Add to Cart'} - ₹${formatPrice(calculateTotal())}`
                  }
                </button>
              );
            })()}
          </div>
        </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default ProductDetails;
