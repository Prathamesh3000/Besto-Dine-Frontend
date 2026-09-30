import React, { useState, useEffect } from 'react';
import { X, Bookmark, Clock3, Users, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { menuSearchAPI } from '../../utils/api';

const ProductDetailsPopup = ({ isOpen, onClose, product }) => {
    const [sizes, setSizes] = useState([]);
    const [toppings, setToppings] = useState([]);

    useEffect(() => {
        if (!isOpen || !product) return;
        // Use product data first, then fetch customizations as fallback
        if (product.sizes?.length || product.toppings?.length) {
            setSizes(product.sizes || []);
            setToppings(product.toppings || []);
        } else if (product._id) {
            menuSearchAPI.getCustomizations(product._id).then(res => {
                if (res.data) {
                    setSizes(res.data.sizes || []);
                    setToppings(res.data.toppings || []);
                }
            }).catch(() => {});
        }
    }, [isOpen, product]);

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60"
                    onClick={onClose}
                >
                    {/* Close button at top right of the overlay */}
                    <button
                        onClick={onClose}
                        className="absolute top-10 right-6 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all z-[110]"
                    >
                        <X size={24} className="text-gray-800" />
                    </button>

                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="w-full max-w-[440px] bg-[#FBFBFF] rounded-t-[32px] overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                        style={{ maxHeight: '92vh', overflowY: 'auto' }}
                    >

                        {/* Product Image */}
                        <div className="relative h-[280px] p-4">
                            <img
                                src={product?.image || 'https://placehold.co/400x300?text=No+Image'}
                                alt={product?.name}
                                className="w-full h-full object-cover rounded-[24px]"
                                onError={(e) => { e.target.src = 'https://placehold.co/400x300?text=No+Image'; }}
                            />
                            {/* Veg Icon */}
                            <div className="absolute top-8 left-8 bg-white p-1 rounded-[4px] border border-green-600 flex items-center justify-center w-5 h-5">
                                <div className={`w-2.5 h-2.5 rounded-full ${product?.isVeg !== false ? 'bg-green-600' : 'bg-red-500'}`} />
                            </div>
                        </div>

                        {/* Content */}
                        <div className="px-6 pb-8">
                            <div className="flex justify-between items-start mb-2">
                                <h2 className="text-[22px] font-bold text-[#1A181B] leading-tight">{product?.name || 'Item'}</h2>
                                <button className="text-gray-400 hover:text-gray-600">
                                    <Bookmark size={24} strokeWidth={1.5} />
                                </button>
                            </div>

                            <p className="text-[#645E66] text-[14px] font-[400] leading-relaxed mb-4">
                                {product?.description}
                            </p>

                            {/* Price */}
                            <div className="text-[22px] font-bold text-[#1A181B] mb-5">
                                ₹{product?.price || 0}
                            </div>

                            <div className="flex gap-2.5 mb-6">
                                {product?.cookingTime && (
                                    <div className="flex items-center gap-1.5 bg-[#FFF2F9] text-[#E91E63] px-3.5 py-1.5 rounded-full text-[12px] font-bold">
                                        <Clock3 size={14} strokeWidth={2.5} /> {product.cookingTime}
                                    </div>
                                )}
                                {product?.servingSize && (
                                    <div className="flex items-center gap-1.5 bg-[#FFF2F9] text-[#E91E63] px-3.5 py-1.5 rounded-full text-[12px] font-bold">
                                        <Users size={14} strokeWidth={2.5} /> {product.servingSize}
                                    </div>
                                )}
                            </div>

                            {/* Size Selection */}
                            {sizes.length > 0 && (
                                <div className="bg-white rounded-[24px] p-5 mb-4 border border-[#F0F0F0] shadow-sm">
                                    <div className="mb-4">
                                        <h3 className="text-[16px] font-bold text-[#1A181B]">Size</h3>
                                        <p className="text-[12px] text-gray-400 font-medium">Select any 1 option</p>
                                    </div>
                                    <div className="space-y-4">
                                        {sizes.map((size, idx) => (
                                            <React.Fragment key={size.name || idx}>
                                                {idx > 0 && <div className="h-[1px] bg-[#F0F0F0] w-full" />}
                                                <div className="flex justify-between items-center group cursor-pointer">
                                                    <span className="text-[15px] font-semibold text-[#1A181B]">{size.name}</span>
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[15px] font-bold text-[#1A181B]">₹{size.price}</span>
                                                        <div className="w-5 h-5 rounded-full border-2 border-gray-200 group-hover:border-gray-300 transition-colors" />
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Toppings Selection */}
                            {toppings.length > 0 && (
                                <div className="bg-white rounded-[24px] p-5 border border-[#F0F0F0] shadow-sm">
                                    <div className="mb-4">
                                        <h3 className="text-[16px] font-bold text-[#1A181B]">Toppings</h3>
                                        <p className="text-[12px] text-gray-400 font-medium">Select any</p>
                                    </div>
                                    <div className="space-y-4">
                                        {toppings.map((topping, idx) => (
                                            <React.Fragment key={topping.id || topping.name || idx}>
                                                {idx > 0 && <div className="h-[1px] bg-[#F0F0F0] w-full" />}
                                                <div className="flex justify-between items-center group cursor-pointer">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-5 h-5 rounded-[4px] border border-green-600 flex items-center justify-center p-[3px]">
                                                            <div className={`w-full h-full rounded-full ${topping.isVeg !== false ? 'bg-green-600' : 'bg-red-500'}`} />
                                                        </div>
                                                        <span className="text-[15px] font-semibold text-[#1A181B]">{topping.name}</span>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <span className="text-[15px] font-bold text-[#1A181B]">₹{topping.price}</span>
                                                        <div className="w-5 h-5 rounded-[6px] border-2 border-gray-200 group-hover:border-gray-300 transition-colors" />
                                                    </div>
                                                </div>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default ProductDetailsPopup;
