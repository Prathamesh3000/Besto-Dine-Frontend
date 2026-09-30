import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Bookmark, Clock, Users, Plus, Minus, Check } from 'lucide-react';
import { useCart } from '../../Context/CartContext';
import { cartLineKey } from '../../utils/cart';
import { menuSearchAPI } from '../../utils/api';

const ProductDetails = ({ product, isOpen, onClose }) => {
    if (!product) return null;

    const { updateQuantity } = useCart();
    const [quantity, setQuantity] = useState(1);
    const [selectedSize, setSelectedSize] = useState(null);
    const [selectedToppings, setSelectedToppings] = useState([]);
    const [sizes, setSizes] = useState([]);
    const [toppingsList, setToppingsList] = useState([]);

    // Load sizes/toppings from product or fetch from API
    useEffect(() => {
        if (!isOpen || !product) return;
        setQuantity(1);
        setSelectedSize(null);
        setSelectedToppings([]);

        if (product.sizes?.length || product.toppings?.length) {
            setSizes(product.sizes || []);
            setToppingsList(product.toppings || []);
            if (product.sizes?.length) setSelectedSize(product.sizes[0].name);
        } else if (product._id || product.id) {
            menuSearchAPI.getCustomizations(product._id || product.id).then(res => {
                if (res.data) {
                    const s = res.data.sizes || [];
                    const t = res.data.toppings || [];
                    setSizes(s);
                    setToppingsList(t);
                    if (s.length) setSelectedSize(s[0].name);
                }
            }).catch(() => {});
        }
    }, [isOpen, product]);

    const toggleTopping = (topping) => {
        setSelectedToppings(prev =>
            prev.find(t => t.id === topping.id)
                ? prev.filter(t => t.id !== topping.id)
                : [...prev, topping]
        );
    };

    const currentBasePrice = (sizes.length > 0 && selectedSize)
        ? (sizes.find(s => s.name === selectedSize)?.price || product.price)
        : product.price;
    const toppingsPrice = selectedToppings.reduce((sum, t) => sum + t.price, 0);
    const totalPrice = (currentBasePrice + toppingsPrice) * quantity;

    const handleAddToCart = () => {
        // Shared line identity (utils/cart): item + size + toppings.
        const comboId = cartLineKey(product.id || product._id, { size: selectedSize, toppings: selectedToppings });
        const cartItem = {
            ...product,
            id: comboId,
            productId: product.id || product._id,
            displayName: selectedSize ? `${product.name} (${selectedSize})` : product.name,
            price: currentBasePrice + toppingsPrice,
            selectedSize,
            selectedToppings,
            quantity: quantity
        };

        updateQuantity(comboId, quantity, cartItem);
        onClose();
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-[60] backdrop-blur-sm"
                    />

                    {/* Close button at top right of the overlay */}
                    <button
                        onClick={onClose}
                        className="fixed top-4 right-6 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all z-[110]"
                    >
                        <X size={24} className="text-gray-800" />
                    </button>

                    {/* Content */}
                    <motion.div
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-x-0 bottom-0 bg-[#F8F8F8] z-[70] rounded-t-[32px] max-h-[92vh] overflow-hidden flex flex-col"
                    >

                        <div className="overflow-y-auto no-scrollbar pb-32">
                            {/* Product Image */}
                            <div className="relative p-4">
                                <div className="relative aspect-[4/3] rounded-[24px] overflow-hidden shadow-sm">
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-full h-full object-cover"
                                        onError={(e) => { e.target.src = 'https://placehold.co/400x300?text=No+Image'; }}
                                    />
                                    {/* Veg/Non-Veg Badge */}
                                    <div className="absolute top-4 left-4 w-6 h-6 bg-white border border-[#E8E8E8] flex items-center justify-center rounded-md shadow-sm">
                                        <div className={`w-3 h-3 rounded-full ${product.isVeg !== false ? 'bg-[#34C759]' : 'bg-[#FF3B30]'}`} />
                                    </div>
                                </div>
                            </div>

                            {/* Product Info */}
                            <div className="px-6 pb-4">
                                <div className="flex justify-between items-start mb-2">
                                    <h2 className="text-[24px] font-bold text-[#1A181B] leading-tight flex-1">
                                        {product.name}
                                    </h2>
                                    <button className="p-1">
                                        <Bookmark size={24} className="text-[#8D848F]/40" />
                                    </button>
                                </div>
                                {product.description && (
                                    <p className="text-[14px] leading-relaxed text-[#8D848F] mb-4">
                                        {product.description}
                                    </p>
                                )}

                                {/* Pills — only show if data exists */}
                                {(product.cookingTime || product.servingSize) && (
                                    <div className="flex gap-2 mb-6">
                                        {product.cookingTime && (
                                            <div className="flex items-center gap-1.5 bg-[#FDF4FF] px-3 py-1.5 rounded-full text-[12px] font-bold text-[#7C3AED]">
                                                <Clock size={14} />
                                                {product.cookingTime}
                                            </div>
                                        )}
                                        {product.servingSize && (
                                            <div className="flex items-center gap-1.5 bg-[#FDF4FF] px-3 py-1.5 rounded-full text-[12px] font-bold text-[#7C3AED]">
                                                <Users size={14} />
                                                {product.servingSize}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Size Selection — only if sizes exist */}
                                {sizes.length > 0 && (
                                    <div className="bg-white rounded-[24px] p-5 mb-4 shadow-sm border border-[#F2F2F2]">
                                        <div className="mb-4">
                                            <h3 className="text-[16px] font-bold text-[#1A181B]">Size</h3>
                                            <p className="text-[12px] text-[#8D848F]">Select any 1 option</p>
                                        </div>
                                        <div className="space-y-4">
                                            {sizes.map((size) => (
                                                <div
                                                    key={size.name}
                                                    onClick={() => setSelectedSize(size.name)}
                                                    className="flex items-center justify-between cursor-pointer group"
                                                >
                                                    <span className={`text-[15px] ${selectedSize === size.name ? 'font-bold text-[#1A181B]' : 'text-[#8D848F]'}`}>
                                                        {size.name}
                                                    </span>
                                                    <div className="flex items-center gap-4">
                                                        <span className={`text-[15px] ${selectedSize === size.name ? 'font-bold text-[#1A181B]' : 'text-[#8D848F]'}`}>
                                                            ₹{size.price}
                                                        </span>
                                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selectedSize === size.name ? 'border-[#FF7A00]' : 'border-[#E8E8E8]'}`}>
                                                            {selectedSize === size.name && <div className="w-2.5 h-2.5 rounded-full bg-[#FF7A00]" />}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Toppings Selection — only if toppings exist */}
                                {toppingsList.length > 0 && (
                                    <div className="bg-white rounded-[24px] p-5 mb-4 shadow-sm border border-[#F2F2F2]">
                                        <div className="mb-4">
                                            <h3 className="text-[16px] font-bold text-[#1A181B]">Toppings</h3>
                                            <p className="text-[12px] text-[#8D848F]">Select any</p>
                                        </div>
                                        <div className="space-y-4">
                                            {toppingsList.map((topping) => (
                                                <div
                                                    key={topping.id || topping.name}
                                                    onClick={() => toggleTopping(topping)}
                                                    className="flex items-center justify-between cursor-pointer"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-5 h-5 bg-white border border-[#E8E8E8] flex items-center justify-center rounded-sm">
                                                            <div className={`w-2.5 h-2.5 rounded-full ${topping.isVeg !== false ? 'bg-[#34C759]' : 'bg-[#FF3B30]'}`} />
                                                        </div>
                                                        <span className={`text-[15px] ${selectedToppings.find(t => t.id === topping.id) ? 'font-bold text-[#1A181B]' : 'text-[#8D848F]'}`}>
                                                            {topping.name}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className={`text-[15px] ${selectedToppings.find(t => t.id === topping.id) ? 'font-bold text-[#1A181B]' : 'text-[#8D848F]'}`}>
                                                            ₹{topping.price}
                                                        </span>
                                                        <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedToppings.find(t => t.id === topping.id) ? 'bg-[#FF7A00] border-[#FF7A00]' : 'bg-white border-[#E8E8E8]'}`}>
                                                            {selectedToppings.find(t => t.id === topping.id) && <Check size={14} className="text-white" strokeWidth={4} />}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bottom Bar */}
                        <div className="absolute bottom-0 inset-x-0 bg-white p-6 pt-4 border-t border-[#F2F2F2] flex gap-4 items-center">
                            {/* Quantity Selector */}
                            <div className="flex items-center bg-[#FFEFDC] rounded-2xl p-1 gap-4">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="w-10 h-10 flex items-center justify-center text-[#FF7A00] font-bold text-xl active:scale-90 transition-transform"
                                >
                                    <Minus size={20} strokeWidth={3} />
                                </button>
                                <span className="text-[18px] font-bold text-[#1A181B] min-w-[20px] text-center">
                                    {quantity}
                                </span>
                                <button
                                    onClick={() => setQuantity(quantity + 1)}
                                    className="w-10 h-10 flex items-center justify-center text-[#FF7A00] font-bold text-xl active:scale-90 transition-transform"
                                >
                                    <Plus size={20} strokeWidth={3} />
                                </button>
                            </div>

                            {/* Add to Cart Button */}
                            <button
                                onClick={handleAddToCart}
                                className="flex-1 bg-[#FF7A00] text-white rounded-2xl h-[52px] flex items-center justify-center gap-2 font-bold text-[16px] shadow-lg shadow-orange-100 active:scale-[0.98] transition-all"
                            >
                                Add to Cart
                                <span className="text-white/60 mx-1">|</span>
                                ₹{totalPrice}
                            </button>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ProductDetails;
