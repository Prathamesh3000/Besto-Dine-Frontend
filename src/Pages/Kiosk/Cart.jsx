import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Plus, Minus, ChevronRight } from 'lucide-react';
import ProductPopup from './Components/ProductPopup';
import { useMenu } from '../../Context/MenuContext';
import { KIOSK_KEYS, readCart, writeCart, clearKioskSession, addKioskLine, changeKioskLineQty, kioskSubtotal, kioskItemCount } from './kioskState';
import { imageForItem, imageForRecommendation, KIOSK_GENERIC_ITEM_IMG } from './kioskImages';
import { useKioskIdleReset } from './useKioskIdleReset';
import { useKioskTaxConfig, computeKioskTotals, kioskBackendOrderType } from './useKioskTaxConfig';
import { resolveUnitPrice } from '../../utils/pricing';

export default function Cart() {
    const navigate = useNavigate();
    const { menuItems } = useMenu();
    const [orderType] = useState(() => localStorage.getItem(KIOSK_KEYS.ORDER_TYPE) || 'Eat Here');
    const [cart, setCart] = useState(readCart);

    const [isPopupOpen, setIsPopupOpen] = useState(false);
    const [editingItem, setEditingItem] = useState(null);
    const [editingIndex, setEditingIndex] = useState(-1);

    // Same idle-reset behaviour as Menu — abandon the cart back to
    // landing if the customer walks away mid-review.
    useKioskIdleReset(120);

    useEffect(() => {
        writeCart(cart);
        if (cart.length === 0 && window.location.pathname === '/kiosk/cart') {
            navigate('/kiosk/menu', { replace: true });
        }
    }, [cart, navigate]);

    // ─── Cart mutations ─────────────────────────────────────────────────
    const addSimpleToCart = (product) => {
        setCart(prevCart => addKioskLine(prevCart, {
            menuItemId: product._id,
            name:       product.name,
            image:      imageForItem(product),
            unitPrice:  resolveUnitPrice(product),
            isVeg:      product.vegType === 'veg',
            category:   product.category?.name || '',
            size:       'Regular',
            addons:     [],
        }, 1));
    };

    const updateCartQty = (menuItemId, size, addons, delta) => {
        setCart(prevCart => changeKioskLineQty(prevCart, { menuItemId, size, addons }, delta));
    };

    // ─── Derived totals ─────────────────────────────────────────────────
    // KIOSK-FIX — reads the live admin Tax & Services config from the
    // bootstrap cache instead of hardcoding 3%/2%. Includes additional
    // charges (flat or percent) that the admin has enabled.
    const taxConfig      = useKioskTaxConfig();
    const subtotal       = kioskSubtotal(cart);
    const { gst, gstPct, serviceCharge, servicePct, additionalChargesBreakdown, totalPayment } =
        computeKioskTotals(subtotal, taxConfig, kioskBackendOrderType(orderType));
    const totalItemsCount = kioskItemCount(cart); // distinct products, not total qty

    // ─── Customize (edit) an existing cart line ────────────────────────
    const handleCustomize = (item, index) => {
        // Reconstruct a "product" object the popup understands — popup reads
        // product.finalPrice / name / image.
        setEditingItem({
            _id:        item.menuItemId,
            name:       item.name,
            image:      item.image,
            finalPrice: item.unitPrice,
            basePrice:  item.unitPrice,
            vegType:    item.isVeg ? 'veg' : 'non-veg',
        });
        setEditingIndex(index);
        setIsPopupOpen(true);
    };

    const handleUpdateItem = (product, config, qty) => {
        setCart(prevCart => {
            const newCart = [...prevCart];
            newCart[editingIndex] = {
                ...prevCart[editingIndex],
                size:   config.size,
                addons: config.addons,
                qty,
            };
            return newCart;
        });
        setIsPopupOpen(false);
        setEditingItem(null);
        setEditingIndex(-1);
    };

    // ─── Upsell recommendations: first 5 active items NOT in cart ──────
    const recommendations = useMemo(() => {
        const inCart = new Set(cart.map(i => i.menuItemId));
        return menuItems
            .filter(i => (!i.status || i.status === 'active') && !inCart.has(i._id))
            .slice(0, 5);
    }, [menuItems, cart]);

    if (cart.length === 0) return null;

    return (
        <div className="flex flex-col min-h-screen bg-white font-varela pb-[150px]">
            {/* Header */}
            <div className="px-[50px] pt-[50px] pb-6 flex flex-col w-full">
                <div className="flex justify-between items-center w-full mb-4">
                    <div className="w-[60px] h-[60px] flex items-center justify-center">
                        <img src="/kiosk/icons/logo.svg" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                    <button
                        onClick={() => {
                            clearKioskSession();
                            setCart([]);
                            navigate('/kiosk');
                        }}
                        className="text-[#FE8301] font-semibold font-nunito text-[24px] leading-[24px]"
                    >
                        Restart Order
                    </button>
                </div>
                <h1 className="text-[40px] font-nunito font-bold text-[#1A181B]">Your Order</h1>
            </div>

            <div className="flex flex-1 px-[50px] gap-10">
                {/* Left Column - Cart Items */}
                <div className="flex-1 flex flex-col gap-5 overflow-y-auto scrollbar-hide h-[600px] pr-2">
                    {cart.map((item, index) => (
                        <div key={`${item.menuItemId}-${index}`} className="bg-white border border-[#F2F2F2] rounded-[24px] p-[16px] flex gap-5 relative shadow-sm">
                            <div className="absolute top-5 left-5">
                                {item.isVeg ? (
                                    <div className="w-[18px] h-[18px] border-[2px] border-[#22C55E] flex items-center justify-center rounded-[3px]">
                                        <div className="w-[8px] h-[8px] bg-[#22C55E] rounded-full"></div>
                                    </div>
                                ) : (
                                    <div className="w-[18px] h-[18px] border-[2px] border-[#EF4444] flex items-center justify-center rounded-[3px]">
                                        <div className="w-[8px] h-[8px] bg-[#EF4444] rounded-full"></div>
                                    </div>
                                )}
                            </div>

                            <img
                                src={item.image || KIOSK_GENERIC_ITEM_IMG}
                                onError={(e) => { e.currentTarget.src = KIOSK_GENERIC_ITEM_IMG; }}
                                alt={item.name}
                                className="w-[120px] h-[120px] object-cover rounded-[16px] ml-4"
                            />

                            <div className="flex-1 flex flex-col">
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-[24px] leading-[100%] font-nunito font-semibold text-[#1A181B]">
                                        {item.name}
                                    </h3>
                                </div>

                                <button
                                    onClick={() => handleCustomize(item, index)}
                                    className="text-[#645E66] text-[16px] leading-[18px] font-regular font-varela flex items-center gap-1 mb-[9px]"
                                >
                                    Customize <ChevronRight size={20} />
                                </button>

                                <div className="flex flex-wrap gap-2">
                                    <span className="bg-[#FDF5FF] text-[#645E66] px-4 py-2 rounded-[60px] leading-[12px] text-[14px] font-regular font-varela">
                                        {item.size}
                                    </span>
                                    {item.addons?.map((a, i) => (
                                        <span key={i} className="bg-[#FDF5FF] text-[#645E66] px-4 py-2 rounded-[60px] leading-[12px] text-[14px] font-regular font-varela">
                                            {a.qty > 1 ? `${a.qty}× ${a.name}` : a.name}
                                        </span>
                                    ))}
                                </div>

                                <div className="flex justify-between items-center mt-[13px]">
                                    <span className="text-[20px] leading-[26px] font-nunito font-bold text-[#1A181B]">₹{item.unitPrice}</span>

                                    <div className="flex items-center gap-4 bg-transparent">
                                        <button
                                            onClick={() => updateCartQty(item.menuItemId, item.size, item.addons, -1)}
                                            className="w-[36px] h-[36px] bg-[#EAEAEA] text-[#1A181B] flex items-center justify-center rounded-[10px]"
                                        >
                                            <Minus size={18} strokeWidth={3} />
                                        </button>
                                        <span className="text-[24px] font-semibold text-[#1A181B] min-w-[24px] text-center">
                                            {item.qty < 10 ? `0${item.qty}` : item.qty}
                                        </span>
                                        <button
                                            onClick={() => updateCartQty(item.menuItemId, item.size, item.addons, 1)}
                                            className="w-[36px] h-[36px] bg-[#FE8301] text-white flex items-center justify-center rounded-[10px]"
                                        >
                                            <Plus size={18} strokeWidth={3} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Right Column - Order Summary */}
                <div className="w-[450px]">
                    <div className="bg-white border border-[#F2F2F2] rounded-[24px] p-8 shadow-sm sticky top-10 flex flex-col justify-between h-[600px]">
                        <div>
                            <h2 className="text-[28px] font-nunito font-bold text-[#1A181B] mb-8">Order Summary</h2>

                            <div className="flex flex-col gap-4 text-[#645E66] leading-[145%] font-varela font-regular text-[20px] mb-[16px] border-b border-[#F2F2F2] pb-8">
                                <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span className="text-[#1A181B]">₹{subtotal.toFixed(2)}</span>
                                </div>
                                {gstPct > 0 && (
                                    <div className="flex justify-between">
                                        <span>GST ({gstPct}%)</span>
                                        <span className="text-[#1A181B]">₹{gst.toFixed(2)}</span>
                                    </div>
                                )}
                                {servicePct > 0 && (
                                    <div className="flex justify-between">
                                        <span>Service Charge ({servicePct}%)</span>
                                        <span className="text-[#1A181B]">₹{serviceCharge.toFixed(2)}</span>
                                    </div>
                                )}
                                {additionalChargesBreakdown.map((c, i) => (
                                    <div key={i} className="flex justify-between">
                                        <span>{c.name}</span>
                                        <span className="text-[#1A181B]">₹{c.amount.toFixed(2)}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex justify-between items-center mb-10">
                                <span className="text-[24px] leading-[22px] font-nunito font-semibold text-[#1A181B]">Total Payment</span>
                                <span className="text-[24px] leading-[22px] font-nunito font-semibold text-[#3B82F6]">₹{totalPayment.toFixed(2)}</span>
                            </div>
                        </div>

                        <div className="bg-[#FEF8F3] rounded-[20px] p-5 flex flex-col">
                            <span className="text-[16px] leading-[18px] text-[#A68BA1] font-regular font-varela block mb-2 uppercase tracking-wider">Order Type</span>
                            <span className="text-[24px] leading-[22px] font-nunito font-semibold text-[#1A181B]">{orderType}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recommendations Section */}
            {recommendations.length > 0 && (
                <div className="px-[50px] mt-20">
                    <h2 className="text-[24px] font-nunito font-bold text-[#1A181B] mb-12">You will love pairing it with!</h2>
                    <div className="flex gap-6 overflow-x-auto no-scrollbar pb-10">
                        {recommendations.map((rec, idx) => {
                            const isVeg = rec.vegType === 'veg';
                            const price = resolveUnitPrice(rec);
                            const basePrice = rec.basePrice ?? price;
                            const showStrike = basePrice > price;
                            const recImg = imageForRecommendation(rec, idx);
                            return (
                                <div key={rec._id} className="bg-[#FAFAFA] rounded-[24px] p-6 pt-0 flex flex-col items-center min-w-[180px] shadow-sm relative mt-10 border border-[#F2F2F2]">
                                    <div className="absolute top-4 left-4">
                                        {isVeg ? (
                                            <div className="w-[14px] h-[14px] border-[1.5px] border-[#22C55E] flex items-center justify-center rounded-[2px]">
                                                <div className="w-[6px] h-[6px] bg-[#22C55E] rounded-full"></div>
                                            </div>
                                        ) : (
                                            <div className="w-[14px] h-[14px] border-[1.5px] border-[#EF4444] flex items-center justify-center rounded-[2px]">
                                                <div className="w-[6px] h-[6px] bg-[#EF4444] rounded-full"></div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="-mt-12 mb-4 w-[110px] h-[110px] flex items-center justify-center overflow-hidden rounded-full">
                                        <img
                                            src={recImg}
                                            onError={(e) => { e.currentTarget.src = KIOSK_GENERIC_ITEM_IMG; }}
                                            alt={rec.name}
                                            className="w-full h-full object-cover drop-shadow-lg"
                                        />
                                    </div>
                                    <h4 className="text-[16px] font-regular leading-[18px] font-varela text-[#1A181B] text-center mb-2 truncate w-full">{rec.name}</h4>
                                    <div className="text-[14px] font-regular leading-[18px] font-varela mb-4">
                                        {showStrike && (
                                            <>
                                                <span className="text-[#8492A6] line-through mr-1 font-medium">₹{basePrice}</span>
                                                <span className="text-[#8492A6] font-medium mr-1">/</span>
                                            </>
                                        )}
                                        <span className="text-[#FE8301]">₹{price}</span>
                                    </div>
                                    <button
                                        onClick={() => addSimpleToCart(rec)}
                                        className="w-full bg-[#FE8301] text-white py-2.5 rounded-[12px] font-bold text-[16px] transition-transform active:scale-95"
                                    >
                                        Add
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Persistent Bottom Bar */}
            {!isPopupOpen && (
                <div className="fixed bottom-0 left-0 w-full bg-white h-[140px] flex items-center justify-between px-[50px] z-[110] shadow-[0_-15px_40px_rgba(0,0,0,0.06)]">
                    <button
                        onClick={() => navigate('/kiosk/menu')}
                        className="text-[#FE8301] text-[24px] leading-[24px] font-nunito font-semibold active:scale-95 transition-transform"
                    >
                        Back to menu
                    </button>
                    <button
                        onClick={() => navigate('/kiosk/customer-info', { state: { totalPayment, subtotal, gst, serviceCharge, additionalChargesBreakdown, taxConfig } })}
                        className="flex items-center justify-center gap-4 bg-[#FE8301] text-white py-[18.5px] w-full rounded-[16px] font-nunito font-semibold text-[24px] shadow-[0_10px_25px_rgba(254,131,1,0.25)] active:scale-95 transition-all outline-none"
                    >
                        <ShoppingCart size={24} strokeWidth={2.5} />
                        Proceed to Pay
                    </button>
                </div>
            )}

            <ProductPopup
                isOpen={isPopupOpen}
                onClose={() => setIsPopupOpen(false)}
                product={editingItem}
                onAdd={handleUpdateItem}
                initialQty={cart[editingIndex]?.qty}
                initialSize={cart[editingIndex]?.size}
                initialAddons={cart[editingIndex]?.addons}
            />
        </div>
    );
}
