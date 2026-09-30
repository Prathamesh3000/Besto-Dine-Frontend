import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, X } from 'lucide-react';
import ProductPopup from './Components/ProductPopup';
import FilterPopup from './Components/FilterPopup';
import { useMenu } from '../../Context/MenuContext';
import { KIOSK_KEYS, readCart, writeCart, addKioskLine, kioskItemCount } from './kioskState';
import { imageForCategory, imageForItem, KIOSK_GENERIC_ITEM_IMG } from './kioskImages';
import { useKioskIdleReset } from './useKioskIdleReset';
import { resolveUnitPrice } from '../../utils/pricing';

// Active menu items for the picked tenant's active category. The backend
// already excludes archived items for guests, but we defend here too.
function isActive(item) {
    return !item.status || item.status === 'active';
}

export default function Menu() {
    const navigate = useNavigate();
    const { categories, menuItems, menuLoading } = useMenu();

    const [activeCategory, setActiveCategory] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [filters, setFilters] = useState({
        priceRange: [0, 1000],
        foodPreference: 'all',
        selectedOffer: 'none'
    });
    const [cart, setCart] = useState(readCart);

    const [orderType] = useState(() => localStorage.getItem(KIOSK_KEYS.ORDER_TYPE) || 'Eat Here');

    // Bounce back to landing after 2min of no interaction so a half-built
    // cart doesn't sit on the screen waiting for the next person.
    useKioskIdleReset(120);

    // Auto-select the first category once categories arrive.
    useEffect(() => {
        if (!activeCategory && categories.length > 0) {
            setActiveCategory(categories[0]._id);
        }
    }, [categories, activeCategory]);

    useEffect(() => {
        writeCart(cart);
    }, [cart]);

    // Pre-warm the Razorpay checkout SDK while the customer is browsing
    // so the modal opens instantly when they reach PayOption. Without
    // this, the script downloads on first Pay tap (1-2s on slow links).
    // Idempotent — PayOption's own loader checks window.Razorpay first.
    useEffect(() => {
        if (window.Razorpay) return;
        if (document.querySelector('script[data-rp-preload]')) return;
        const s = document.createElement('script');
        s.src = 'https://checkout.razorpay.com/v1/checkout.js';
        s.async = true;
        s.dataset.rpPreload = '1';
        // Failure is non-fatal — PayOption falls back to its own loader.
        s.onerror = () => s.remove();
        document.body.appendChild(s);
    }, []);

    // ─── Cart mutations ─────────────────────────────────────────────────
    const addToCart = (product, config, quantity = 1) => {
        // KIOSK-FIX — use the size-specific price the popup computed
        // (config.unitPrice). Previously we always read product.finalPrice
        // which silently dropped the 1kg / 2kg variant uplift — a 2kg cake
        // (₹1600) was being charged at the 500g price (₹450) once it hit
        // the cart. Fallback to the base price so legacy single-size
        // items keep working.
        const resolvedUnitPrice = Number.isFinite(config?.unitPrice)
            ? config.unitPrice
            : resolveUnitPrice(product);
        // Same item + size + add-ons merges into the existing line
        // (shared identity rule — utils/cart via kioskState).
        setCart(prevCart => addKioskLine(prevCart, {
            menuItemId: product._id,
            name:       product.name,
            image:      imageForItem(product),
            unitPrice:  resolvedUnitPrice,
            isVeg:      product.vegType === 'veg',
            category:   product.category?.name || '',
            size:       config.size,
            addons:     config.addons,
        }, quantity));
    };

    // Pre-aggregate cart quantity by menuItemId once per cart change,
    // then lookup is O(1) per card. The previous approach ran a
    // filter+reduce over the whole cart for EVERY menu item on
    // EVERY render — with 50 items and a non-trivial cart this
    // showed up as visible jank when adding items.
    const cartQtyByItemId = useMemo(() => {
        const m = new Map();
        for (const line of cart) {
            m.set(line.menuItemId, (m.get(line.menuItemId) || 0) + line.qty);
        }
        return m;
    }, [cart]);
    const getProductTypeQty = (id) => cartQtyByItemId.get(id) || 0;

    // ─── Filtering ──────────────────────────────────────────────────────
    const filteredItems = useMemo(() => {
        if (!activeCategory) return [];
        return menuItems.filter(item => {
            if (!isActive(item)) return false;
            const itemCatId = item.category?._id || item.category;
            if (String(itemCatId) !== String(activeCategory)) return false;

            const price = resolveUnitPrice(item);
            if (price < filters.priceRange[0] || price > filters.priceRange[1]) return false;

            if (filters.foodPreference === 'veg' && item.vegType !== 'veg') return false;
            if (filters.foodPreference === 'nonveg' && item.vegType === 'veg') return false;

            return true;
        });
    }, [menuItems, activeCategory, filters]);

    const totalItemsCount = kioskItemCount(cart); // distinct products, not total qty
    const activeCategoryName = categories.find(c => c._id === activeCategory)?.name || '';

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-white font-varela relative">
            {/* Header */}
            <div className="w-full flex justify-between items-center px-[50px] pb-6 pt-[50px] shrink-0 bg-white">
                <div className="w-[60px] h-[60px] flex items-center justify-center text-[#FE8301]">
                    <img src="/kiosk/icons/logo.svg" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <div className="flex items-center gap-[16px] ">
                    <button className="bg-[#FF9B0B] text-white px-[12px] py-[13px] rounded-[12px] font-nunito font-semibold text-[20px] leading-[16px]">
                        {orderType}
                    </button>
                    <button onClick={() => { setCart([]); navigate('/kiosk'); }} className="text-[#FE8301] px-[12px] py-[13px] font-nunito font-semibold text-[20px] leading-[16px]">
                        Back to Start
                    </button>
                </div>
            </div>

            {/* Scrollable Main Area */}
            <div className="flex-1 overflow-y-auto w-full no-scrollbar flex flex-col items-center">
                <div className="w-full max-w-[1200px] px-[50px] flex flex-col pb-[140px]">

                    {/* Categories Section */}
                    <div className="w-full mb-[24px] pt-4">
                        <h2 className="text-[24px] font-nunito font-bold text-[#1A181B] mb-[14px] text-left">Categories</h2>
                        <div className="flex overflow-x-auto gap-[18px] no-scrollbar pb-2 w-full justify-start scrollbar-hide">
                            {categories.length === 0 && !menuLoading && (
                                <div className="text-[#645E66] text-[18px] py-8">No categories available.</div>
                            )}
                            {categories.map((cat) => {
                                const isActiveCat = activeCategory === cat._id;
                                const catImg = imageForCategory(cat);
                                return (
                                    <button
                                        key={cat._id}
                                        onClick={() => setActiveCategory(cat._id)}
                                        /* KIOSK-PERF — duration-75 (was 200) so the
                                           selected-pill flip lands immediately under
                                           the finger. 200ms felt sluggish on touch. */
                                        className={`flex flex-col items-center justify-between pt-[16px] pb-[12px] rounded-[24px] border-1 transition-all duration-75 active:scale-[0.97] ${isActiveCat ? 'bg-[#FF9B0B] border-[#FE8301] text-white px-[60px]' : 'bg-[#FFFAF5] text-[#1A181B] border-[#FFFAF5] px-[16px]'}`}
                                    >
                                        <div className="w-[110px] h-[110px] mb-[8px] relative flex items-center justify-center overflow-hidden rounded-[16px]">
                                            <img
                                                src={catImg}
                                                alt={cat.name}
                                                loading="lazy"
                                                decoding="async"
                                                onError={(e) => { e.currentTarget.src = KIOSK_GENERIC_ITEM_IMG; }}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <span className={`text-[20px] leading-[24px] font-nunito font-semibold w-full text-center ${isActiveCat ? 'text-white' : 'text-[#1A181B]'}`}>
                                            {cat.name}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Section Title and Filters */}
                    <div className="w-full mb-[24px] flex flex-col">
                        <h1 className="text-[36px] font-nunito font-bold text-[#1E2939] capitalize mb-[16px] text-left leading-[100%]">
                            {activeCategoryName || 'Menu'}
                        </h1>
                        <div className="flex justify-between items-center w-full">
                            <div className="flex items-center gap-[14px]">
                                <button
                                    onClick={() => setIsFilterOpen(true)}
                                    className={`flex items-center gap-[8px] px-[25px] py-[13px] rounded-[12px] text-[16px] leading-[16px] font-semibold border transition-all active:scale-95 ${isFilterOpen ? 'bg-[#FE8301] text-white border-[#FE8301]' : 'bg-[#FAF5F9] text-[#645E66] border-[#F2EBF5]'}`}
                                >
                                    <img src="/kiosk/icons/filterIcon.svg" alt="Filter" className="w-full h-full object-contain" />
                                    Filter
                                </button>

                                {/* Active Filter Tags */}
                                <div className="flex items-center gap-3">
                                    {filters.foodPreference !== 'all' && (
                                        <div className="flex items-center gap-2 bg-[#FFF5EB] border border-[#FFE7CC] px-4 py-2 rounded-full shadow-sm">
                                            <div className={`w-2.5 h-2.5 rounded-full ${filters.foodPreference === 'veg' ? 'bg-[#22C55E]' : 'bg-[#EF4444]'}`}></div>
                                            <span className="text-[14px] font-bold text-[#1A181B] capitalize">{filters.foodPreference === 'nonveg' ? 'Non-Veg' : 'Veg'} Only</span>
                                            <button
                                                onClick={() => setFilters(prev => ({ ...prev, foodPreference: 'all' }))}
                                                className="hover:bg-[#FE8301]/10 rounded-full p-0.5 transition-colors"
                                            >
                                                <X size={14} className="text-[#64748B]" />
                                            </button>
                                        </div>
                                    )}
                                    {(filters.priceRange[0] > 0 || filters.priceRange[1] < 1000) && (
                                        <div className="flex items-center gap-2 bg-white border border-[#F2F2F2] px-4 py-2 rounded-full shadow-sm">
                                            <span className="text-[14px] font-bold text-[#1A181B]">₹{filters.priceRange[0]} - ₹{filters.priceRange[1]}</span>
                                            <button
                                                onClick={() => setFilters(prev => ({ ...prev, priceRange: [0, 1000] }))}
                                                className="hover:bg-black/5 rounded-full p-0.5 transition-colors"
                                            >
                                                <X size={14} className="text-[#64748B]" />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => setFilters({
                                    priceRange: [0, 1000],
                                    foodPreference: 'all',
                                    selectedOffer: 'none'
                                })}
                                className="text-[#FE8301] font-nunito font-semibold text-[20px] leading-[16px] px-[21px] py-[13px]"
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {/* Product Grid */}
                    {menuLoading && menuItems.length === 0 ? (
                        /* KIOSK-PERF — skeleton grid instead of a centred spinner.
                           A spinner says "wait"; a skeleton says "your content is
                           almost here." The grid layout matches the real cards
                           so the page doesn't visually jump when items land,
                           and the customer's eye lands on the menu zone
                           immediately. Pulse animation cues "loading" without
                           the trapped-on-spinner feeling. */
                        <div className="grid grid-cols-4 gap-x-6 gap-y-10 w-full" aria-busy="true">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="bg-[#FAFAFA] rounded-[24px] p-[16px] pb-[20px] pt-[20px] flex flex-col items-center border border-[#F4F4F4] animate-pulse"
                                >
                                    <div className="w-full aspect-square bg-gray-200 rounded-[16px] mb-3" />
                                    <div className="w-3/4 h-4 bg-gray-200 rounded mb-2" />
                                    <div className="w-1/2 h-3 bg-gray-200 rounded mb-4" />
                                    <div className="w-full h-12 bg-gray-200 rounded-xl" />
                                </div>
                            ))}
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="text-center py-20 text-[#645E66] text-[20px]">
                            No items in this category match your filters.
                        </div>
                    ) : (
                        <div className="grid grid-cols-4 gap-x-6 gap-y-10 w-full">
                            {filteredItems.map((item) => {
                                const qty       = getProductTypeQty(item._id);
                                const price     = resolveUnitPrice(item);
                                const basePrice = item.basePrice ?? price;
                                const showStrike = basePrice > price;
                                const img = imageForItem(item);
                                const isVeg = item.vegType === 'veg';
                                return (
                                    <div
                                        key={item._id}
                                        onClick={() => setSelectedProduct(item)}
                                        /* KIOSK-PERF — instant tap response. The card opens
                                           ProductPopup synchronously, but without active:scale
                                           the kiosk customer can't tell whether their tap
                                           registered, so they tap again — opening + immediately
                                           closing the popup. duration-75 keeps the press snappy. */
                                        className="bg-[#FAFAFA] rounded-[24px] p-[16px] pb-[20px] pt-[20px] flex flex-col items-center relative shadow-sm border border-[#F4F4F4] cursor-pointer hover:shadow-md transition-all duration-75 active:scale-[0.97]"
                                    >
                                        <div className="absolute top-[16px] left-[16px]">
                                            {isVeg ? (
                                                <div className="w-[18px] h-[18px] border-[2px] border-[#22C55E] flex items-center justify-center rounded-[3px]">
                                                    <div className="w-[8px] h-[8px] bg-[#22C55E] rounded-full"></div>
                                                </div>
                                            ) : (
                                                <div className="w-[18px] h-[18px] border-[2px] border-[#EF4444] flex items-center justify-center rounded-[3px]">
                                                    <div className="w-[8px] h-[8px] bg-[#EF4444] rounded-full"></div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="w-full flex items-center justify-center h-[160px] mb-4 mt-2 overflow-hidden rounded-[18px]">
                                            <img
                                                src={img}
                                                alt={item.name}
                                                loading="lazy"
                                                decoding="async"
                                                onError={(e) => { e.currentTarget.src = KIOSK_GENERIC_ITEM_IMG; }}
                                                className="w-full h-full object-cover"
                                            />
                                        </div>
                                        <h3 className="text-[16px] font-varela font-regular text-[#1A181B] text-center mb-[8px] leading-[18px] truncate w-full">
                                            {item.name}
                                        </h3>
                                        <div className="text-[18px] leading-[18px] mb-[16px] flex items-center mt-[8px] justify-center font-varela font-regular w-full gap-1">
                                            {showStrike && (
                                                <>
                                                    <span className="text-[#645E66] line-through ">₹{basePrice}</span>
                                                    <span className='text-[#645E66]'>/</span>
                                                </>
                                            )}
                                            <span className="text-[#FE8301]">₹{price}</span>
                                        </div>
                                        <div className="w-full mt-auto">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedProduct(item); }}
                                                // KIOSK-UX-04 — touchscreen target ≥ 48px tall.
                                                // Previous py-[10px] + text-[16px] ≈ 36px total,
                                                // below the WCAG / iOS / Android minimum.
                                                // py-[14px] + min-h-[48px] guarantees the
                                                // recommended 48px footprint so older customers
                                                // and finger-tap on rolling carts don't miss.
                                                className="bg-[#FE8301] text-white font-nunito font-semibold text-[17px] leading-[100%] w-full min-h-12 py-3.5 rounded-xl flex items-center justify-center gap-2 active:scale-[0.97] transition-transform"
                                            >
                                                Add
                                                {qty > 0 && (
                                                    <span className="bg-white text-[#FE8301] rounded-full font-nunito font-semibold w-[24px] h-[24px] text-[13px] flex items-center justify-center font-bold shadow-sm">
                                                        {qty}
                                                    </span>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Bar */}
            {totalItemsCount > 0 && (
                <div className="fixed bottom-0 left-0 w-full bg-[#FFFFFF] h-[90px] flex items-center justify-between px-10 border-t border-[#F2F2F2] shadow-[0_-4px_20px_rgba(0,0,0,0.04)] z-50">
                    <div className="flex items-center gap-[16px] text-[#1A181B]">
                        <ShoppingCart size={30} strokeWidth={2} className="text-[#1A181B]" />
                        <span className="text-[24px] font-varela font-regular leading-[18px] tracking-tight py-[6px]">
                            {totalItemsCount} {totalItemsCount === 1 ? "Item" : "Items"} added
                        </span>
                    </div>
                    <button
                        onClick={() => navigate('/kiosk/cart')}
                        className="flex items-center gap-3 bg-[#FE8301] text-white px-8 py-[14px] rounded-[16px] font-nunito font-semibold text-[18px] transition-all active:scale-95 shadow-sm"
                    >
                        <ShoppingCart size={30} strokeWidth={2.5} />
                        My Order
                        <div className="bg-white text-[#FE8301] rounded-full min-w-[26px] h-[26px] px-1 flex items-center justify-center font-nunito font-bold text-[15px] ml-1">
                            {totalItemsCount}
                        </div>
                    </button>
                </div>
            )}

            <ProductPopup
                isOpen={!!selectedProduct}
                onClose={() => setSelectedProduct(null)}
                product={selectedProduct}
                onAdd={(prod, conf, quantity) => addToCart(prod, conf, quantity)}
                totalItemsCount={totalItemsCount}
            />

            <FilterPopup
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                filters={filters}
                setFilters={setFilters}
            />
        </div>
    );
}
