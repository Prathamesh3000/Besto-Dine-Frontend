import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus } from 'lucide-react';

const SpecialInstructionsPopup = ({ isOpen, onClose, onSave, item }) => {
    const [instructions, setInstructions] = useState('');

    useEffect(() => {
        if (item) {
            setInstructions(item.instructions || '');
        }
    }, [item, isOpen]);

    const handleSave = () => {
        onSave(item.id, instructions);
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
                        className="fixed inset-0 bg-black/60 z-[100] backdrop-blur-[2px]"
                    />

                    {/* Close button at top right of the overlay */}
                    <button
                        onClick={onClose}
                        className="fixed top-4 right-6 w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all z-[120]"
                    >
                        <X size={24} className="text-gray-800" />
                    </button>

                    {/* Popup Content */}
                    <motion.div
                        initial={{ y: "100%" }}
                        animate={{ y: 0 }}
                        exit={{ y: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-x-0 bottom-0 z-[110] w-full max-w-md mx-auto bg-white rounded-t-[32px] p-8 shadow-2xl"
                    >
                        <div className="text-center mb-8">
                            <h2 className="text-[24px] font-bold text-[#1A181B] mb-2">Add Special Instruction</h2>
                            <p className="text-[14px] text-[#8D848F] leading-relaxed">
                                Add notes for the chef to prepare your dish exactly the way you like.
                            </p>
                        </div>

                        <div className="mb-6">
                            <h3 className="text-[16px] font-bold text-[#1A181B] mb-3">{item?.name}</h3>
                            <div className="relative">
                                <textarea
                                    value={instructions}
                                    onChange={(e) => setInstructions(e.target.value)}
                                    placeholder="Less spicy, no onions, extra cheese, allergy to peanuts..."
                                    className="w-full h-[120px] bg-[#F8F9FF] border border-[#E8EEFF] rounded-[24px] p-5 text-[14px] text-[#1A181B] placeholder-[#8D848F]/50 focus:outline-none focus:border-[#7C3AED]/30 transition-colors resize-none"
                                />
                            </div>
                        </div>

                        <button
                            onClick={handleSave}
                            className="w-full bg-[#FF7A00] text-white rounded-[18px] h-[58px] text-[16px] font-bold shadow-lg shadow-orange-100 active:scale-[0.98] transition-all flex items-center justify-center"
                        >
                            Save Instructions
                        </button>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SpecialInstructionsPopup;
