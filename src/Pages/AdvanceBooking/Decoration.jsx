import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import BookingProgressBar from './BookingProgressBar';
import DecorationDetailModal from './DecorationDetailModal';
import api from '../../utils/api';
import { resolveImageUrl, sizedImage } from '../../utils/image';
import { reportMissingFields } from '../../utils/requiredFields';

// QA N8 — same treatment as CakeDetails: the category filter / select
// used to re-render every package card (inline callbacks, unmemoised
// list) and every card loaded its full-size photo eagerly. Cards are now
// memoised with stable callbacks, the filtered list is memoised and
// images are card-sized, lazy and async-decoded.
const CARD_IMG_PX = 280;

const Decoration = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState(null);
    const [activeCategory, setActiveCategory] = useState('All');
    const [selectedDecorId, setSelectedDecorId] = useState(location.state?.selectedDecorId || null);
    const [previewDecor, setPreviewDecor] = useState(null);

    const categories = ['All', 'Birthday', 'Wedding', 'Anniversary', 'Custom'];

    const fetchDecor = React.useCallback(async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const res = await api.get('/booking-info/decorations');
            if (res.data.success) {
                setPackages(res.data.decorations.filter(d => d.isActive).map(d => ({
                        id: d._id || d.id,
                        title: d.name,
                        description: d.description || '',
                        image: sizedImage(resolveImageUrl(d.images?.[0]) || '', { w: CARD_IMG_PX }) || '',
                        tags: [d.category, d.isCustomizable ? 'Customisable' : null].filter(Boolean),
                        price: `₹${(d.basePrice || 0).toLocaleString('en-IN')}`,
                        basePrice: d.basePrice || 0,
                        category: d.category,
                        details: d.categories || [],
                        materialsUsed: d.materialsUsed || [],
                        setupTime: d.setupTime || '',
                        teamSize: d.numberOfCaretakers ? `${d.numberOfCaretakers} Team` : '',
                        isCustomizable: d.isCustomizable || false
                    })));
            } else {
                setFetchError(res.data?.message || 'Could not load decoration packages.');
            }
        } catch (err) {
            console.error('Fetch decor error:', err);
            const code = err.response?.data?.code;
            const msg = err.response?.data?.message;
            if (code === 'FEATURE_LOCKED') {
                setFetchError(msg || "This restaurant doesn't offer decoration packages.");
            } else {
                setFetchError(msg || 'Could not load decoration packages. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchDecor();
    }, [fetchDecor]);

    const filtered = useMemo(() => (activeCategory === 'All'
        ? packages
        : packages.filter(p => p.category === activeCategory)), [packages, activeCategory]);

    const handleSelect = useCallback((id) => setSelectedDecorId(id), []);
    const handleViewDetails = useCallback((pkg) => setPreviewDecor(pkg), []);

    // QA N2 — Continue explains what's missing (Skip continues without decor).
    const handleContinue = () => {
        const selectedDecor = packages.find(p => p.id === selectedDecorId);
        if (!selectedDecor) {
            reportMissingFields([{ label: 'Decoration package', id: 'decoration-packages' }]);
            return;
        }
        navigate('/customer/add-ons', { state: { ...location.state, selectedDecorId, selectedDecor } });
    };

    return (
        <div className="min-h-screen bg-[#FDFDFD] transition-colors duration-200 font-sans flex flex-col items-center">
            <div className="w-full">
                <BookingProgressBar />
            </div>

            <div className="w-full max-w-[1240px] mx-auto px-5 lg:px-12 pb-24 lg:pb-12 flex-1">
                {/* ─── Desktop Header ─── */}
                <div className="hidden lg:block w-full pt-4 flex-shrink-0">
                    <div className="flex items-center justify-between py-4">
                        <h1 className="text-[28px] font-[800] text-[#1A181B] tracking-tight">Decorations</h1>
                        <button
                            onClick={() => navigate('/customer/add-ons', { state: location.state })}
                             className="bg-[#F8F9FB] border border-[#F2F4F7] px-5 py-2 text-[#645E66] text-[14px] font-[600] rounded-full hover:bg-gray-100 transition-all"
                        >
                            Skip
                        </button>
                    </div>
                </div>

                {/* ─── Mobile Header ─── */}
                <header className="px-4 py-2 flex lg:hidden items-center justify-between sticky top-0 bg-white z-40 w-full flex-shrink-0">
                    <div className="flex items-center -ml-2">
                        <button
                            onClick={() => navigate(-1)}
                            className="w-10 h-10 rounded-full hover:bg-black/5 transition-colors flex items-center justify-center"
                        >
                            <ChevronLeft size={24} className="text-[#1A181B]" />
                        </button>
                        <h1 className="text-[16px] font-semibold text-[#1A181B]">Decoration</h1>
                    </div>
                </header>

                <main className="flex-1">
                    <div className="lg:bg-[#FFFFFF] lg:rounded-[24px] lg:border lg:border-[#F2F4F7] lg:p-10 lg:shadow-sm">
                        
                        <div className="mb-8">
                            <h2 className="hidden lg:block text-[24px] font-[800] text-[#1A181B] mb-1 font-nunito">
                                Decoration Packages
                            </h2>
                            <p className="text-[#645E66] text-[14px] mb-4">Filter by Category</p>
                            <div className="flex gap-3 overflow-x-auto no-scrollbar">
                                {categories.map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setActiveCategory(cat)}
                                        className={`px-6 py-2.5 rounded-full text-[14px] font-bold transition-all whitespace-nowrap
                                        ${activeCategory === cat
                                                ? 'bg-[#FE8301] text-white'
                                                : 'bg-[#FDF5FF] text-[#645E66]'
                                            }`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div id="decoration-packages" className="flex flex-col gap-6">
                            {loading ? (
                                <div className="text-center py-10">Loading packages...</div>
                            ) : fetchError ? (
                                <div className="flex flex-col items-center gap-3 py-10 text-center">
                                    <span className="text-3xl">🎨</span>
                                    <p className="text-[14px] font-[600] text-[#FF3B30] max-w-md">{fetchError}</p>
                                    <button onClick={fetchDecor} className="bg-[#FE8301] text-white px-5 py-2 rounded-[12px] text-[13px] font-[700]">Retry</button>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="text-center py-10 text-gray-500">No packages found for this category.</div>
                            ) : (
                                filtered.map(pkg => (
                                    <PackageCard
                                        key={pkg.id}
                                        pkg={pkg}
                                        isSelected={selectedDecorId === pkg.id}
                                        onSelect={handleSelect}
                                        onViewDetails={handleViewDetails}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </main>

                {/* Footer Buttons */}
                <div className="hidden lg:flex justify-end gap-3 mt-10">
                    <button 
                        onClick={() => navigate(-1)} 
                        className="bg-[#F2F2F2] text-[#645E66] font-bold text-[14px] py-3 px-10 rounded-[16px] w-[160px]"
                    >
                        Previous
                    </button>
                    <button
                        aria-disabled={!selectedDecorId}
                        onClick={handleContinue}
                         className={`font-bold text-[14px] py-3 px-10 rounded-[16px] w-[160px] transition-all ${
                          selectedDecorId ? 'bg-[#FE8301] text-white shadow-lg shadow-orange-200' : 'bg-[#FE8301]/60 text-white'
                        }`}
                    >
                        Continue
                    </button>
                </div>

                {/* Mobile Footer */}
                <div className="fixed lg:hidden bottom-0 left-0 right-0 p-4 bg-white border-t flex gap-4 z-50">
                    <button onClick={() => navigate(-1)} className="flex-1 bg-[#F5F5F5] font-bold py-4 rounded-[16px]">Previous</button>
                    <button
                        aria-disabled={!selectedDecorId}
                        onClick={handleContinue}
                        className={`flex-1 font-bold py-4 rounded-[16px] ${selectedDecorId ? 'bg-[#FE8301] text-white' : 'bg-[#FE8301]/60 text-white'}`}
                    >
                        Continue
                    </button>
                </div>
            </div>

            <DecorationDetailModal
                isOpen={!!previewDecor}
                decoration={previewDecor}
                onClose={() => setPreviewDecor(null)}
                onConfirm={() => {
                    setSelectedDecorId(previewDecor.id);
                    setPreviewDecor(null);
                }}
            />
        </div>
    );
};

const PackageCard = memo(function PackageCard({ pkg, isSelected, onSelect, onViewDetails }) {
    return (
        <div className={`flex flex-col lg:flex-row gap-6 p-4 lg:p-6 rounded-[24px] border-2 transition-all ${
            isSelected ? 'border-[#FE8301] bg-[#FFF9F2]' : 'border-[#F2F4F7] bg-white'
        }`}>
            {/* Image Section */}
            <div className="w-full lg:w-[280px] h-[200px] lg:h-[180px] rounded-[20px] overflow-hidden shrink-0 bg-gray-100">
                {pkg.image ? (
                    <img
                        src={pkg.image}
                        alt={pkg.title}
                        width={CARD_IMG_PX}
                        height={180}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl">🎨</div>
                )}
            </div>

            {/* Content Section */}
            <div className="flex-1 flex flex-col justify-between">
                <div>
                    <h3 className="text-[20px] lg:text-[22px] font-bold text-[#1A181B] mb-1 truncate">{pkg.title}</h3>
                    <p className="text-[#8D848F] text-[14px] lg:text-[15px] mb-4 leading-relaxed font-varela-round line-clamp-2">{pkg.description}</p>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                        {pkg.tags.map((tag, i) => (
                            <span key={i} className="px-4 py-1.5 bg-[#FDF5FF] text-[#645E66] text-[12px] font-bold rounded-full border border-gray-100">
                                {tag}
                            </span>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mt-auto">
                    <div>
                        <div className="flex items-baseline gap-1">
                            <span className="text-[20px] lg:text-[24px] font-bold text-[#1A181B]">{pkg.price}</span>
                            <span className="text-[#1A181B] text-[14px] font-medium">base price</span>
                        </div>
                        <p className="text-[#007AFF] text-[13px] font-semibold">Extra hour charges apply</p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => onSelect(pkg.id)}
                            className={`px-6 py-3 rounded-[12px] font-bold text-[14px] transition-all ${
                                isSelected ? 'bg-orange-600 text-white' : 'bg-[#FE8301] text-white shadow-md'
                            }`}
                        >
                            {isSelected ? 'Selected' : 'Select Package'}
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onViewDetails?.(pkg); }}
                            className="px-6 py-3 bg-[#F2F2F2] text-[#645E66] font-bold text-[14px] rounded-[12px] hover:bg-gray-200"
                        >
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default Decoration;

