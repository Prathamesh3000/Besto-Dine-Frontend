import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Plus, Minus, ShoppingCart, Bookmark, ChevronRight, CircleCheck, MessageSquare } from 'lucide-react';
import { useCart } from '../../Context/CartContext';
import { menuSearchAPI } from '../../utils/api';
import SpecialInstructionsPopup from '../../Components/Waiter/SpecialInstructionsPopup';
import ProductDetails from '../../Components/Waiter/ProductDetails';
import WaiterEmptyState from '../../Components/Waiter/WaiterEmptyState';

const CartPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { cartItems, updateQuantity, updateCartItem, totalPrice, totalItems, activeTableId } = useCart();

    // Table info — prefer route state, fall back to whatever table the
    // cart is currently scoped to so a direct navigation (e.g. from the
    // floating CartButton) still knows which table to return to.
    const routeTableId   = location.state?.tableId;
    const routeTableName = location.state?.tableName;
    const tableId        = routeTableId || activeTableId;
    const tableName      = routeTableName || localStorage.getItem('lastWaiterTableName');

    // Popup state
    const [isInstructionsOpen, setIsInstructionsOpen] = useState(false);
    const [selectedItemForInstructions, setSelectedItemForInstructions] = useState(null);
    const [expandedInstructions, setExpandedInstructions] = useState({});

    // Customize popup state
    const [customizeItem, setCustomizeItem] = useState(null);
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);

    // Trending recommendations from API
    const [recommendations, setRecommendations] = useState([]);

    const toggleInstructions = (id) => {
        setExpandedInstructions(prev => ({
            ...prev,
            [id]: !prev[id]
        }));
    };

    useEffect(() => {
        window.scrollTo(0, 0);
        // Fetch trending items for recommendations
        menuSearchAPI.getTrending(6).then(res => {
            if (res.data?.success && res.data.items?.length) {
                setRecommendations(res.data.items.slice(0, 6));
            }
        }).catch(() => {});
    }, []);

    const handleQuantityChange = (item, delta) => {
        updateQuantity(item.id, delta, item);
    };

    const handleOpenInstructions = (item) => {
        setSelectedItemForInstructions(item);
        setIsInstructionsOpen(true);
    };

    const handleSaveInstructions = (itemId, instructions) => {
        updateCartItem(itemId, { instructions });
    };

    const handleCustomize = (item) => {
        setCustomizeItem(item);
        setIsCustomizeOpen(true);
    };

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] pb-32 pt-env(safe-area-inset-top)">
            <div className="max-w-screen-md mx-auto">
                {/* Header */}
                <header className="px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between bg-white/95 backdrop-blur sticky top-0 z-10 border-b border-gray-100">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => navigate(-1)}
                            aria-label="Back"
                            className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1A181B] truncate">Cart</h1>
                    </div>
                    <div className="text-sm font-semibold text-gray-500 shrink-0">Table {tableName || '—'}</div>
                </header>

                {/* Cart Items */}
                <main className="px-4 sm:px-6 mt-4 sm:mt-6 space-y-4">
                {Object.values(cartItems).length > 0 ? (
                    Object.values(cartItems).map((item) => (
                        <div key={item.id} className="relative bg-white rounded-[24px] border border-[#F2F2F2] p-4 shadow-sm overflow-hidden mb-4">
                            {/* Bookmark Icon */}
                            <div className="absolute top-4 right-4 text-[#8D848F]/20">
                                <Bookmark size={20} fill="currentColor" stroke="none" />
                            </div>

                            <div className="flex gap-4">
                                {/* Item Image */}
                                <div className="relative w-[110px] h-[110px] flex-shrink-0">
                                    <img src={item.image} alt={item.name || item.title || ''} className="w-full h-full object-cover rounded-[16px]" />
                                    <div className="absolute top-2 left-2 w-5 h-5 bg-white border border-[#E8E8E8] flex items-center justify-center rounded-sm shadow-sm">
                                        <div className={`w-3 h-3 rounded-full ${item.isVeg !== false ? 'bg-[#34C759]' : 'bg-[#FF3B30]'}`} />
                                    </div>
                                </div>

                                {/* Item Info */}
                                <div className="flex-1 flex flex-col py-0.5">
                                    <h3 className="text-[17px] font-bold text-[#1A181B] pr-10">{item.name || item.title}</h3>

                                    <button
                                        onClick={() => handleCustomize(item)}
                                        className="flex items-center text-[13px] font-semibold text-[#8D848F] mt-1 group"
                                    >
                                        Customize <ChevronRight size={14} className="ml-1 group-active:translate-x-1 transition-transform" />
                                    </button>

                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {item.selectedSize && (
                                            <span className="text-[11px] font-bold text-[#645E66] bg-[#F9F1FB] px-3 py-1.5 rounded-full">
                                                {item.selectedSize}
                                            </span>
                                        )}
                                        {item.selectedToppings?.map((topping) => (
                                            <span key={topping.id} className="text-[11px] font-semibold text-[#645E66] bg-[#F9F1FB] px-3 py-1.5 rounded-full">
                                                {topping.name}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex items-center justify-between mt-auto pt-4">
                                        <span className="text-[22px] font-bold text-[#1A181B]">₹{item.price}</span>

                                        {/* Quantity Selector */}
                                        <div className="flex items-center bg-[#F5F5F7] rounded-xl px-2 py-1 gap-4 border border-[#F0F0FA]">
                                            <button
                                                onClick={() => handleQuantityChange(item, -1)}
                                                className="w-8 h-8 flex items-center justify-center text-[#8D848F] active:scale-95"
                                            >
                                                <Minus size={18} strokeWidth={2.5} />
                                            </button>
                                            <span className="text-[16px] font-bold text-[#1A181B] min-w-[12px] text-center">{item.quantity}</span>
                                            <button
                                                onClick={() => handleQuantityChange(item, 1)}
                                                className="w-8 h-8 flex items-center justify-center text-[#1A181B] active:scale-95"
                                            >
                                                <Plus size={18} strokeWidth={2.5} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Instructions Footer */}
                            <div className="mt-4 pt-4 border-t border-gray-50 flex flex-col gap-3">
                                <div className="flex items-center justify-between">
                                    {item.instructions ? (
                                        <>
                                            <div className="flex items-center gap-[6px]">
                                                <CircleCheck size={16} fill="#007AFF" stroke="white" strokeWidth={2.5} color='#007AFF' />
                                                <span className="text-[12px] font-[400] text-[#007AFF]">Special Instructions Applied</span>
                                            </div>
                                            <button
                                                onClick={() => toggleInstructions(item.id)}
                                                className="text-[14px] font-semibold text-[#FF7A00] active:opacity-70 transition-opacity"
                                            >
                                                {expandedInstructions[item.id] ? 'Hide Details' : 'View Details'}
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={() => handleOpenInstructions(item)}
                                            className="flex items-center gap-2 text-[#4A4A4A] group w-full"
                                        >
                                            <div className="w-6 h-6 rounded-full bg-[#F9F1FB] flex items-center justify-center text-[#7C3AED] group-active:scale-90 transition-transform flex-shrink-0">
                                                <Plus size={14} strokeWidth={3} />
                                            </div>
                                            <span className="text-[14px] font-semibold">Add Special Instructions</span>
                                        </button>
                                    )}
                                </div>

                                {/* Expanded Instructions View */}
                                <AnimatePresence>
                                    {item.instructions && expandedInstructions[item.id] && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="bg-[#F8F9FF] rounded-[20px] p-4 flex items-center justify-between border border-[#E8EEFF]">
                                                <p className="text-[13px] text-[#4A4A4A] flex-1 pr-4 line-clamp-2">
                                                    {item.instructions}
                                                </p>
                                                <button
                                                    onClick={() => handleOpenInstructions(item)}
                                                    className="flex items-center gap-1 text-[#FF7A00] font-bold text-[14px] active:scale-95 transition-transform whitespace-nowrap"
                                                >
                                                    <Plus size={16} strokeWidth={3} /> Add
                                                </button>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    ))
                ) : (
                    <WaiterEmptyState
                        icon={ShoppingCart}
                        title="Your cart is empty"
                        hint="Add items from the menu to start building this order."
                        action={{ label: 'Browse Menu', onClick: () => navigate('/waiter/menu') }}
                    />
                )}
                </main>

                {/* Recommendations Section */}
                {recommendations.length > 0 && (
                    <div className="mt-10 sm:mt-12 bg-[#FFF9F2] pt-6 sm:pt-8 pb-10 sm:pb-12">
                        <div className="px-4 sm:px-6 mb-5">
                            <h2 className="text-lg sm:text-xl font-bold text-[#1A181B]">You will love pairing it with!</h2>
                        </div>
                        <div className="flex gap-4 overflow-x-auto px-4 sm:px-6 no-scrollbar">
                            {recommendations.map((item) => (
                                <div key={item._id || item.id} className="min-w-36 sm:min-w-44 bg-white rounded-2xl p-2 shadow-sm border border-[#F2F2F2]">
                                    <div className="w-full aspect-square rounded-xl overflow-hidden mb-2">
                                        <img
                                            src={item.image || 'https://placehold.co/200x200?text=Item'}
                                            alt={item.name}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.target.src = 'https://placehold.co/200x200?text=Item'; }}
                                        />
                                    </div>
                                    <h3 className="text-sm font-bold text-[#1A181B] line-clamp-1">{item.name}</h3>
                                    <p className="text-sm font-bold text-[#1A181B] mt-1">₹{item.price}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Sticky Footer */}
            {totalItems > 0 && (
                <div className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 pt-4 pb-8 bg-white/90 backdrop-blur-md border-t border-gray-100 z-50">
                    <div className="max-w-screen-md mx-auto">
                        <button
                            onClick={() => navigate('/waiter/details', { state: { tableId, tableName } })}
                            className="w-full min-h-14 bg-[#FF7A00] hover:bg-orange-600 text-white rounded-2xl px-6 flex items-center justify-center gap-3 shadow-lg shadow-orange-200 active:scale-[0.98] transition-all"
                        >
                            <ShoppingCart size={22} />
                            <span className="text-base font-bold">Place Order  ·  ₹{totalPrice}</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Special Instructions Popup */}
            <SpecialInstructionsPopup
                isOpen={isInstructionsOpen}
                onClose={() => setIsInstructionsOpen(false)}
                onSave={handleSaveInstructions}
                item={selectedItemForInstructions}
            />

            {/* Customize Product Popup */}
            <ProductDetails
                isOpen={isCustomizeOpen}
                onClose={() => setIsCustomizeOpen(false)}
                product={customizeItem}
            />
        </div>
    );
};

export default CartPage;
