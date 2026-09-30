import React from 'react';
import { X, Check, Clock, Users, Palette } from 'lucide-react';

const BACKEND_URL = import.meta.env.VITE_API_URL?.replace(/\/api.*$/, '') || '';
const resolveImg = (src) => {
  if (!src) return '';
  if (src.startsWith('/uploads/')) return `${BACKEND_URL}${src}`;
  return src;
};

const DecorationDetailModal = ({ isOpen, decoration, onClose, onConfirm }) => {
  if (!isOpen || !decoration) return null;

  const image = resolveImg(decoration.image);
  const items = decoration.details || [];

  return (
    <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-white w-full max-w-lg lg:max-w-2xl rounded-t-[24px] lg:rounded-[20px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-100"
        >
          <X size={20} className="text-gray-600" />
        </button>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 pb-24 lg:pb-0">
          {/* Image */}
          {image && (
            <div className="w-full h-[220px] lg:h-[280px] overflow-hidden">
              <img src={image} alt={decoration.title} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="p-5 lg:p-8">
            {/* Title + Category */}
            <h2 className="text-[20px] lg:text-[24px] font-[800] text-[#1A181B] mb-1">{decoration.title}</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {decoration.tags?.map((tag, i) => (
                <span key={i} className="px-3 py-1 bg-[#FDF5FF] text-[#645E66] text-[12px] font-[600] rounded-full border border-gray-100">
                  {tag}
                </span>
              ))}
            </div>

            {/* Description */}
            {decoration.description && (
              <p className="text-[14px] text-[#645E66] leading-relaxed mb-5">{decoration.description}</p>
            )}

            {/* Quick Info */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              {decoration.setupTime && (
                <div className="flex items-center gap-2 text-[13px] text-[#645E66] bg-[#F8F9FB] rounded-[12px] p-3">
                  <Clock size={16} className="text-[#8D848F] shrink-0" />
                  <span>Setup: {decoration.setupTime}</span>
                </div>
              )}
              {decoration.teamSize && (
                <div className="flex items-center gap-2 text-[13px] text-[#645E66] bg-[#F8F9FB] rounded-[12px] p-3">
                  <Users size={16} className="text-[#8D848F] shrink-0" />
                  <span>{decoration.teamSize}</span>
                </div>
              )}
              {decoration.isCustomizable && (
                <div className="flex items-center gap-2 text-[13px] text-[#007AFF] bg-[#F0F7FF] rounded-[12px] p-3">
                  <Palette size={16} className="shrink-0" />
                  <span>Customizable</span>
                </div>
              )}
            </div>

            {/* Included Items (from categories) */}
            {items.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-3">What's Included</h3>
                <div className="space-y-4">
                  {items.map((cat, ci) => (
                    <div key={ci}>
                      <p className="text-[14px] font-[600] text-[#1A181B] mb-2">{cat.name}</p>
                      <div className="space-y-1.5">
                        {cat.items?.map((item, ii) => (
                          <div key={ii} className="flex items-center gap-2 text-[13px] text-[#645E66]">
                            <Check size={14} className="text-[#34C759] shrink-0" />
                            <span>{item.name}{item.quantity ? ` x${item.quantity}` : ''}{item.unit ? ` ${item.unit}` : ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Materials */}
            {decoration.materialsUsed?.length > 0 && (
              <div className="mb-5">
                <h3 className="text-[16px] font-[700] text-[#1A181B] mb-3">Materials Used</h3>
                <div className="flex flex-wrap gap-2">
                  {decoration.materialsUsed.map((m, i) => (
                    <span key={i} className="text-[12px] text-[#645E66] bg-[#F8F9FB] border border-[#F2F4F7] px-3 py-1.5 rounded-full">
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Price */}
            <div className="border-t border-dashed border-[#F2F4F7] pt-4 flex justify-between items-center">
              <span className="text-[#645E66] text-[14px] font-[500]">Base Price</span>
              <span className="text-[20px] font-[800] text-[#1A181B]">₹{(decoration.basePrice || 0).toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="fixed bottom-0 left-0 right-0 lg:static bg-white p-4 flex gap-3 border-t border-gray-100 z-20">
          <button onClick={onClose} className="flex-1 bg-[#F2F2F2] text-[#645E66] font-[700] py-3.5 rounded-[16px] text-[14px]">
            Close
          </button>
          <button onClick={onConfirm} className="flex-1 bg-[#FE8301] text-white font-[700] py-3.5 rounded-[16px] text-[14px] active:scale-[0.98] transition-transform">
            Select Package
          </button>
        </div>
      </div>
    </div>
  );
};

export default DecorationDetailModal;
