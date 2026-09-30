import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, X } from 'lucide-react';
import { imageForItem, imageForItemPopup, KIOSK_GENERIC_ITEM_IMG } from '../kioskImages';

// KIOSK-FIX — addon chips come from the menu item's real `toppings`
// (Mongo schema: [{ name, price, type }]). The popup used to render a
// hardcoded set of demo extras (Lettuce, Chicken Patty, Oat Buns,
// Cheese Slice, Cheesy Dip) for EVERY item — so Chicken 65 showed
// burger toppings, Pineapple cake showed chicken patty, and the
// items that actually DO have toppings configured (Veg Manchurian:
// Schezwan Twist ₹30, Extra Manchurian Balls ₹60) had their real
// add-ons hidden behind the dummy list. Now the popup mirrors what
// the admin actually configured per item, and the "Customize" section
// hides entirely for items that have no add-ons. Default-image
// fallback per addon type keeps the chip looking right without
// requiring the admin to upload art for every topping.
const ADDON_FALLBACK_IMG_BY_NAME = (name = '') => {
    const n = name.toLowerCase();
    if (n.includes('cheese'))            return '/kiosk/images/Cheese-Slice.png';
    if (n.includes('dip') || n.includes('sauce')) return '/kiosk/images/Cheesy-Dip.png';
    if (n.includes('patty') || n.includes('chicken')) return '/kiosk/images/Chicken-Patty.png';
    if (n.includes('bun') || n.includes('bread'))     return '/kiosk/images/Oat-Buns.png';
    if (n.includes('lettuce') || n.includes('salad')) return '/kiosk/images/lettuce.png';
    return KIOSK_GENERIC_ITEM_IMG;
};

function buildAddons(product) {
    const raw = Array.isArray(product?.toppings) ? product.toppings : [];
    return raw
        .filter(t => t && t.name)
        .map(t => ({
            id: t._id || t.name,
            name: String(t.name),
            price: Number(t.price) || 0,
            type: t.type || 'veg',
            img: t.image || ADDON_FALLBACK_IMG_BY_NAME(t.name),
            qty: 0,
        }));
}

// KIOSK-FIX — pricedSizes derives the size pills from the actual
// menu item's `sizes` array (Mongo schema: [{ name, price, quantity? }]).
// If the item has no sizes configured, fall back to a single "Regular"
// option at the item's own price so the popup still renders for items
// without variants. Previously the popup hardcoded ['Regular','Medium',
// 'Large'] and ignored the real DB shape — clicking Medium / Large for
// a cake with 500g / 1kg / 2kg variants did nothing because:
//   (1) the selected `size` string never matched any real variant, and
//   (2) `unitPrice` always read product.finalPrice (the base/500g price)
//       instead of looking up the variant price for the chosen size.
function buildPricedSizes(product) {
    const base = product?.finalPrice ?? product?.basePrice ?? 0;
    const raw = Array.isArray(product?.sizes) ? product.sizes : [];
    const cleaned = raw
        .filter(s => s && s.name)
        .map(s => ({
            name: String(s.name),
            price: Number(s.price ?? base) || base,
            quantity: s.quantity || '',
        }));
    if (cleaned.length === 0) {
        return [{ name: 'Regular', price: base, quantity: '' }];
    }
    return cleaned;
}

export default function ProductPopup({
    isOpen, onClose, product, onAdd,
    initialQty = 1, initialSize, initialAddons = [],
}) {
    // KIOSK-FIX — Rules of Hooks: every hook below MUST run on every
    // render, otherwise React 19 throws "Expected static flag was
    // missing" when isOpen toggles between renders. The early return
    // is moved AFTER the hook list. All hooks tolerate a null product
    // via optional chaining + defaults.
    const pricedSizes = useMemo(() => buildPricedSizes(product), [product]);
    const defaultSizeName = pricedSizes[0]?.name || 'Regular';
    const baseAddons = useMemo(() => buildAddons(product), [product]);

    const [qty, setQty] = useState(initialQty);
    const [size, setSize] = useState(initialSize || defaultSizeName);
    const [addons, setAddons] = useState(baseAddons);

    useEffect(() => {
        if (isOpen && product) {
            setQty(initialQty);
            // Reset to the caller-supplied size if it's valid for this
            // product's variant list; otherwise pick the first real size.
            const matchInitial = initialSize && pricedSizes.find(s => s.name === initialSize);
            setSize(matchInitial ? initialSize : (pricedSizes[0]?.name || 'Regular'));
            // Rehydrate addons from the real product.toppings list,
            // restoring any quantities the customer had picked
            // previously (matched by name so we survive _id changes).
            setAddons(baseAddons.map(a => {
                const match = initialAddons?.find(x => x.name === a.name);
                return { ...a, qty: match ? match.qty : 0 };
            }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, product?._id]);

    if (!isOpen || !product) return null;

    const updateAddonQty = (id, delta) => {
        setAddons(prev => prev.map(addon =>
            addon.id === id ? { ...addon, qty: Math.max(0, addon.qty + delta) } : addon
        ));
    };

    const updateMainQty = (delta) => {
        setQty(prev => Math.max(1, prev + delta));
    };

    // KIOSK-FIX — unitPrice now reflects the SELECTED size, not the
    // item's base price. Falls back to base if a stale `size` string
    // ever ends up unresolvable (e.g. tenant edited the variants list
    // while the popup was open).
    const selectedSize = pricedSizes.find(s => s.name === size) || pricedSizes[0];
    const unitPrice = selectedSize?.price ?? (product.finalPrice ?? product.basePrice ?? 0);
    const isVeg = product.vegType === 'veg';

    // Addons total — sum of each picked addon's price × its qty.
    // Folded into the headline button so the customer sees the
    // real charge before tapping Add to Order (the previous version
    // ignored addons here, so a cart with ₹60 of Manchurian Balls
    // looked the same as a plain order on the button).
    const addonsTotal = addons.reduce((sum, a) => sum + (a.qty * (a.price || 0)), 0);
    const totalForButton = (unitPrice * qty) + (addonsTotal * qty);

    const handleAddToCart = () => {
        const pickedAddons = addons
            .filter(a => a.qty > 0)
            .map(a => ({ name: a.name, qty: a.qty, price: a.price }));

        // KIOSK-FIX — pass the size-specific unitPrice so the cart
        // stores the correct charge for the chosen variant (Menu.jsx
        // reads config.unitPrice).
        onAdd(product, { size, addons: pickedAddons, unitPrice }, qty);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-[#FFFAF5] bg-opacity-95 backdrop-blur-sm font-varela">
            <div className="relative w-full bg-white rounded-t-[16px] flex flex-col items-center max-h-[90vh] shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute -top-[60px] right-[30px] w-[44px] h-[44px] bg-[#EAEAEA] text-[#645E66] flex items-center justify-center rounded-full active:scale-95 shadow-sm"
                >
                    <X size={24} />
                </button>

                <div className="w-full overflow-y-auto no-scrollbar pt-8 pb-2">
                    <div className="w-full mx-auto flex flex-col items-center px-6">

                        {/* Top Section */}
                        <div className="flex flex-col items-center">
                            <div className="relative">
                                <img
                                    src={imageForItemPopup(product)}
                                    onError={(e) => { e.currentTarget.src = KIOSK_GENERIC_ITEM_IMG; }}
                                    alt={product.name}
                                    className="w-[258px] h-[220px] object-cover rounded-[24px]"
                                />
                                {/* KIOSK-FIX — Veg/Non-veg badge overlay on product
                                   image. Matches the FSSAI symbol convention:
                                   green square+dot = veg, red square+dot = non-veg.
                                   Previously the popup had no veg indicator at all,
                                   so customers ordering with dietary restrictions
                                   had to read the description. The Menu grid card
                                   already shows this badge (Menu.jsx:266); the
                                   popup was the missing piece. */}
                                <div
                                    className={`absolute top-[12px] left-[12px] w-[28px] h-[28px] border-[2.5px] flex items-center justify-center rounded-[4px] bg-white shadow-sm ${isVeg ? 'border-[#22C55E]' : 'border-[#EF4444]'}`}
                                    aria-label={isVeg ? 'Vegetarian' : 'Non-vegetarian'}
                                >
                                    <div className={`w-[12px] h-[12px] rounded-full ${isVeg ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`} />
                                </div>
                            </div>

                            <h2 className="text-[36px] leading-[32px] font-nunito font-semibold text-[#1A181B] mb-[13px] mt-[13px] capitalize">{product.name}</h2>

                            {/* KIOSK-FIX — price reflects the selected size, not
                               the item's base price. selectedSize.quantity is
                               shown alongside if the tenant set it (e.g. "500g",
                               "1L") so customers see what they're paying for. */}
                            <div className="text-[36px] font-nunito font-bold text-[#FE8301] mb-[4px]">
                                ₹{unitPrice}
                            </div>
                            {selectedSize?.quantity && (
                                <div className="text-[16px] text-[#645E66] mb-[14px] font-varela">
                                    {selectedSize.quantity}
                                </div>
                            )}
                            {!selectedSize?.quantity && <div className="mb-[10px]" />}

                            <div className="flex items-center gap-6 mb-[40px]">
                                <button onClick={() => updateMainQty(-1)} className="w-[40px] h-[40px] bg-[#EAEAEA] rounded-[10px] flex items-center justify-center text-[#645E66] active:scale-95 transition-all"><Minus size={20} /></button>
                                <span className="text-[32px] font-semibold text-[#1A181B] w-[30px] text-center">{qty}</span>
                                <button onClick={() => updateMainQty(1)} className="w-[40px] h-[40px] bg-[#FE8301] text-white rounded-[10px] flex items-center justify-center active:scale-95 transition-all"><Plus size={20} /></button>
                            </div>

                            {/* KIOSK-FIX — render the real product.sizes (from
                               buildPricedSizes above) instead of the hardcoded
                               Small/Medium/Large triad. Each pill shows the
                               variant name on top (e.g. "500g", "1kg") and its
                               own price underneath so the customer sees the
                               cost difference before tapping. Only renders the
                               row when there's more than one size — single-
                               size items shouldn't show a meaningless picker. */}
                            {pricedSizes.length > 1 && (
                                <div className="flex flex-wrap items-center justify-center gap-[16px] mb-8 max-w-[640px]">
                                    {pricedSizes.map((s) => {
                                        const active = size === s.name;
                                        return (
                                            <button
                                                key={s.name}
                                                onClick={() => setSize(s.name)}
                                                className={`flex flex-col items-center justify-center py-[12px] px-[28px] min-w-[120px] rounded-[24px] transition-all duration-75 active:scale-[0.97] ${active ? 'bg-[#FE8301] text-white shadow-md' : 'bg-[#F8F9FA] text-[#1A181B]'}`}
                                            >
                                                <span className="text-[22px] leading-[28px] font-nunito font-semibold capitalize">
                                                    {s.name}
                                                </span>
                                                <span className={`text-[16px] font-nunito font-medium mt-[2px] ${active ? 'text-white/90' : 'text-[#645E66]'}`}>
                                                    ₹{s.price}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Bottom Section — only render when the item actually
                           has toppings configured. Hides the entire
                           "Customize" block for items like Chicken 65 / Fish
                           Tikka that don't have add-ons, instead of showing
                           a row of fake burger toppings. */}
                        <div className="flex flex-col w-fit max-w-[100%]">
                            {addons.length > 0 && (
                                <>
                                    <h3 className="text-[22px] font-nunito font-semibold leading-[28px] text-[#1A181B] mb-[12px] text-left">Customize your Order your Way</h3>

                                    <div className="flex overflow-x-auto gap-[16px] w-full no-scrollbar pb-[40px] justify-start">
                                        {addons.map((addon) => (
                                            <div key={addon.id} className="w-[172px] shrink-0 bg-[#F9F9F9] rounded-[16px] flex flex-col items-center pt-[9px] pb-[17px] px-[10px] shadow-sm border border-[#F2F2F2]">
                                                <img src={addon.img} alt={addon.name} onError={(e) => { e.currentTarget.src = KIOSK_GENERIC_ITEM_IMG; }} className="w-[58px] h-[58px] object-contain mb-[12px]" />
                                                <p className="text-[18px] font-regular text-[#1A181B] text-center mb-[4px] leading-tight break-words capitalize">{addon.name}</p>
                                                {addon.price > 0 && (
                                                    <p className="text-[14px] font-nunito font-semibold text-[#FE8301] mb-[12px]">+ ₹{addon.price}</p>
                                                )}
                                                <div className="flex items-center mt-auto w-full justify-center px-[25px]">
                                                    <button onClick={() => updateAddonQty(addon.id, -1)} className="w-[30px] h-[30px] rounded-[10px] bg-[#EAEAEA] flex items-center justify-center text-[#645E66] transition-all active:scale-95">
                                                        <Minus size={16} />
                                                    </button>
                                                    <span className="text-[16px] font-semibold text-[#1A181B] flex-1 text-center">
                                                        {addon.qty > 0 ? String(addon.qty).padStart(2, '0') : '0'}
                                                    </span>
                                                    <button onClick={() => updateAddonQty(addon.id, 1)} className="w-[30px] h-[30px] rounded-[10px] bg-[#FE8301] flex items-center justify-center text-white transition-all active:scale-95">
                                                        <Plus size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            <button
                                onClick={handleAddToCart}
                                className="w-full bg-[#FE8301] text-white py-[24px] mb-[24px] rounded-[16px] font-nunito font-semibold text-[24px] transition-all active:scale-95 flex items-center justify-center"
                            >
                                Add to Order ₹{totalForButton}
                            </button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
