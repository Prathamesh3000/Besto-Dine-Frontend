import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Filter, X, Clock, Users, Star, Plus, Minus, ShoppingCart, ChevronRight, Bookmark, Loader2 } from 'lucide-react';
import FilterPopup from '../../Components/Waiter/FilterPopup';
import ProductDetails from '../../Components/Waiter/ProductDetails';
import { useCart } from '../../Context/CartContext';
import { waiterAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const CategoryItemsPage = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const { cartItems, updateQuantity, totalItems, totalPrice } = useCart();
    const [selectedId, setSelectedId] = useState(id);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [activeFilters, setActiveFilters] = useState([]);
    const [priceRange, setPriceRange] = useState([0, 1000]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [isDetailsOpen, setIsDetailsOpen] = useState(false);

    // API-driven state
    const [apiCategories, setApiCategories] = useState([]);
    const [apiProducts, setApiProducts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch categories from API
    useEffect(() => {
        waiterAPI.getCategories().then(res => {
            if (res.data?.success) {
                setApiCategories(res.data.data || []);
            }
        }).catch(() => { toast.error('Failed to load categories'); });
    }, []);

    // Fetch menu items when selectedId changes
    useEffect(() => {
        setLoading(true);
        const params = selectedId === 'all' ? {} : { category: selectedId };
        const fetcher = selectedId === 'all'
            ? waiterAPI.getMenuItemsByCategory('')
            : waiterAPI.getMenuItemsByCategory(selectedId);

        fetcher.then(res => {
            if (res.data?.success) {
                setApiProducts(res.data.data || []);
            }
        }).catch(() => { toast.error('Failed to load menu items'); }).finally(() => setLoading(false));
    }, [selectedId]);

    const toggleFilter = (filterName) => {
        setActiveFilters(prev =>
            prev.includes(filterName)
                ? prev.filter(f => f !== filterName)
                : [...prev, filterName]
        );
    };

    const removeFilter = (filterName) => {
        if (filterName === 'Price Range') {
            setPriceRange([0, 1000]);
            return;
        }
        setActiveFilters(prev => prev.filter(f => f !== filterName));
    };

    // Build categories list with "All" prepended. Categories without an
    // uploaded image render a letter-avatar fallback in JSX below — no
    // stock photos.
    const categories = useMemo(() => {
        const all = { id: 'all', name: 'All', image: '' };
        const cats = apiCategories.map(c => ({
            id: c._id,
            name: c.name,
            image: c.image || '',
        }));
        return [all, ...cats];
    }, [apiCategories]);

    // Reorder categories to put the selected ID first
    const reorderedCategories = [...categories].sort((a, b) => {
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
    });

    // Map API products to the component's expected format
    const allProducts = useMemo(() => {
        return apiProducts.map(item => ({
            id: item._id,
            category: item.category?._id || item.category,
            name: item.name,
            description: item.description,
            price: item.finalPrice || item.basePrice,
            time: item.cookingTime || null,
            serves: item.serveUpto || null,
            rating: item.rating || null,
            isVeg: item.vegType === 'veg',
            hasOffer: item.offerPercentage > 0,
            offerText: item.offerPercentage > 0 ? `Flat ${item.offerPercentage}% OFF` : '',
            image: item.images?.[0] || 'https://placehold.co/400x300?text=No+Image',
            quantity: 0,
            hasCustomization: (item.sizes?.length > 0 || item.toppings?.length > 0),
            sizes: item.sizes || [],
            toppings: item.toppings || [],
        }));
    }, [apiProducts]);

    const handleQuantityChange = (product, delta, e) => {
        if (e) e.stopPropagation();
        // If it's a simple product (no variants needed or direct add), use standard behavior
        // But for this UI, we might want to open details if adding for the first time
        updateQuantity(product.id, delta, product);
    };

    const openProductDetails = (product) => {
        setSelectedProduct(product);
        setIsDetailsOpen(true);
    };

    let filteredProducts = selectedId === 'all'
        ? allProducts
        : allProducts.filter(product => product.category === selectedId);

    // Apply active filters
    if (activeFilters.includes('Pure Veg')) {
        filteredProducts = filteredProducts.filter(p => p.isVeg);
    }
    if (activeFilters.includes('Non-veg')) {
        filteredProducts = filteredProducts.filter(p => !p.isVeg);
    }

    // Apply price range filter
    filteredProducts = filteredProducts.filter(p => p.price >= priceRange[0] && p.price <= priceRange[1]);
    // Note: Other filters like 'Flat Discounts' can be added similarly if mock data has corresponding properties

    return (
        <div className="min-h-screen bg-white text-[#1A1A1A] pb-32 pt-env(safe-area-inset-top)">
            <div className="max-w-7xl mx-auto">
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
                        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1A181B] truncate">All Category</h1>
                    </div>
                    <div className="text-sm font-semibold text-gray-500 shrink-0">Table {(() => { try { const t = JSON.parse(localStorage.getItem('dineInTable') || '{}'); return t.name || localStorage.getItem('tableNumber') || '—'; } catch { return '—'; } })()}</div>
                </header>

                {/* Horizontal Categories — sticky under the header so
                    the waiter can switch category while scrolling a long
                    item list. Larger touch targets on tablet. */}
                <div className="px-4 sm:px-6 py-4 overflow-x-auto flex gap-4 sm:gap-6 no-scrollbar mb-4">
                {reorderedCategories.map((category) => {
                    const isActive = selectedId === category.id;
                    return (
                        <button
                            key={category.id}
                            type="button"
                            onClick={() => setSelectedId(category.id)}
                            className="flex flex-col items-center gap-2 min-w-[72px] sm:min-w-[80px] cursor-pointer active:scale-95 transition-transform"
                        >
                            <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full p-1 border-2 transition-colors ${isActive ? 'border-[#7C3AED] shadow-sm' : 'border-transparent'}`}>
                                <div className={`w-full h-full rounded-full overflow-hidden flex items-center justify-center ${isActive ? 'bg-[#F9F1FB]' : 'bg-gray-50'}`}>
                                    {category.image ? (
                                        <img src={category.image} alt={category.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className={`font-extrabold text-2xl uppercase ${isActive ? 'text-[#7C3AED]' : 'text-gray-400'}`}>
                                            {category.name?.charAt(0) || '?'}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className={`text-xs sm:text-sm font-semibold whitespace-nowrap ${isActive ? 'text-[#1A181B]' : 'text-gray-500'}`}>
                                {category.name}
                            </span>
                        </button>
                    );
                })}
            </div>

                {/* Sub-heading */}
                <div className="px-4 sm:px-6 mb-5">
                    <h2 className="text-xl sm:text-2xl font-bold text-[#1A181B]">Flavors You'll Come Back For!</h2>
                </div>

                {/* Filters */}
                <div className="px-4 sm:px-6 flex gap-3 overflow-x-auto no-scrollbar mb-6">
                <button
                    onClick={() => setIsFilterOpen(true)}
                    className="flex items-center gap-2 bg-[#F9F1FB] text-[#7C3AED] px-4 py-2 rounded-xl text-[14px] font-bold active:scale-95 transition-all"
                >
                    <Filter size={18} />
                    Filter
                </button>

                {activeFilters.map((filter) => (
                    <div
                        key={filter}
                        className="flex items-center gap-2 bg-[#F9F1FB] text-[#1A181B] px-4 py-2 rounded-xl text-[14px] font-bold whitespace-nowrap"
                    >
                        {filter}
                        <button onClick={() => removeFilter(filter)} className="flex items-center justify-center">
                            <X size={16} />
                        </button>
                    </div>
                ))}

                {(priceRange[0] > 0 || priceRange[1] < 1000) && (
                    <div className="flex items-center gap-2 bg-[#F9F1FB] text-[#1A181B] px-4 py-2 rounded-xl text-[14px] font-bold whitespace-nowrap">
                        ₹{priceRange[0]} - ₹{priceRange[1]}
                        <button onClick={() => removeFilter('Price Range')} className="flex items-center justify-center">
                            <X size={16} />
                        </button>
                    </div>
                )}
            </div>

                <main className="px-4 sm:px-6 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
                {filteredProducts.map((product) => (
                    <div
                        key={product.id}
                        onClick={() => openProductDetails(product)}
                        className="relative bg-white rounded-2xl border border-gray-100 overflow-hidden active:scale-[0.99] hover:border-gray-200 hover:shadow-md transition-all cursor-pointer shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
                    >
                        <div className="p-3 sm:p-4 flex gap-3 sm:gap-4">
                            {/* Product Image and Indicators */}
                            <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0">
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-full object-cover rounded-2xl"
                                    onError={(e) => { e.target.src = 'https://placehold.co/200x200?text=Item'; }}
                                />
                                <div className="absolute top-2 left-2 w-5 h-5 bg-white border border-gray-200 flex items-center justify-center rounded-sm shadow-sm">
                                    <div className={`w-2.5 h-2.5 rounded-full ${product.isVeg ? 'bg-[#34C759]' : 'bg-[#FF3B30]'}`} />
                                </div>
                                {product.hasOffer && (
                                    <div className="absolute -top-1.5 -right-1.5 bg-[#FF7A00] text-white text-[10px] font-extrabold uppercase tracking-wide px-2 py-1 rounded-full shadow-md">
                                        Offer
                                    </div>
                                )}
                            </div>

                            {/* Product Info */}
                            <div className="flex-1 min-w-0 flex flex-col">
                                <div className="flex justify-between items-start gap-2 mb-1">
                                    <h3 className="text-base sm:text-lg font-bold text-[#1A181B] line-clamp-1">{product.name}</h3>
                                    <Bookmark size={20} className="text-[#8D848F]/30 shrink-0" />
                                </div>
                                <p className="text-xs sm:text-sm text-gray-500 line-clamp-2 mb-2 leading-relaxed">{product.description}</p>

                                {(product.time || product.serves || product.rating) && (
                                <div className="flex flex-wrap gap-1.5 mb-3">
                                    {product.time && (
                                        <div className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-md text-[11px] font-semibold text-gray-500">
                                            <Clock size={12} />
                                            {product.time}
                                        </div>
                                    )}
                                    {product.serves && (
                                        <div className="flex items-center gap-1 bg-gray-50 px-2 py-0.5 rounded-md text-[11px] font-semibold text-gray-500">
                                            <Users size={12} />
                                            {product.serves}
                                        </div>
                                    )}
                                    {product.rating && (
                                        <div className="flex items-center gap-1 text-[12px] font-bold text-[#FFB02E] ml-auto">
                                            <Star size={12} fill="#FFB02E" stroke="none" />
                                            {product.rating}
                                        </div>
                                    )}
                                </div>
                                )}

                                <div className="flex items-center justify-between mt-auto gap-2">
                                    <span className="text-xl sm:text-2xl font-extrabold text-[#1A181B] tabular-nums">₹{product.price}</span>

                                    {cartItems[product.id]?.quantity > 0 ? (
                                        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-1.5 py-1 gap-2">
                                            <button
                                                onClick={(e) => handleQuantityChange(product, -1, e)}
                                                aria-label="Decrease"
                                                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#8D848F] hover:bg-white transition"
                                            >
                                                <Minus size={16} />
                                            </button>
                                            <span className="text-base font-bold tabular-nums min-w-5 text-center">{cartItems[product.id].quantity}</span>
                                            <button
                                                onClick={(e) => handleQuantityChange(product, 1, e)}
                                                aria-label="Increase"
                                                className="w-9 h-9 rounded-lg flex items-center justify-center text-[#FE8301] hover:bg-white transition"
                                            >
                                                <Plus size={16} />
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleQuantityChange(product, 1, e);
                                            }}
                                            className="min-h-11 bg-[#FF7A00] hover:bg-orange-600 text-white px-5 rounded-xl text-sm font-bold shadow-md shadow-orange-200 flex items-center gap-1.5 active:scale-95 transition-all"
                                        >
                                            <Plus size={16} strokeWidth={3} />
                                            Add
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Offer Tag — strip at the bottom */}
                        {product.hasOffer && (
                            <div className="bg-[#FFF5ED] px-4 py-2 border-t border-[#FFF1E6] flex items-center gap-2">
                                <span className="text-base">🎉</span>
                                <span className="text-xs font-bold text-[#FF7A00] uppercase tracking-wide truncate">{product.offerText}</span>
                            </div>
                        )}
                    </div>
                ))}
                </main>
            </div>

            {/* View Cart Sticky Footer */}
            {totalItems > 0 && (
                <div className="fixed bottom-0 left-0 right-0 px-4 sm:px-6 pt-4 pb-8 bg-white/90 backdrop-blur-md border-t border-gray-100 z-50 animate-slide-up">
                    <div className="max-w-7xl mx-auto">
                        <button
                            onClick={() => navigate('/waiter/cart')}
                            className="w-full min-h-14 bg-[#FF7A00] hover:bg-orange-600 text-white rounded-2xl px-5 flex items-center justify-between shadow-lg shadow-orange-200 active:scale-[0.98] transition-all"
                        >
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className="bg-white/20 p-2 rounded-xl">
                                    <ShoppingCart size={22} strokeWidth={2.5} />
                                </div>
                                <div className="flex flex-col items-start">
                                    <span className="text-sm sm:text-base font-bold leading-none mb-1">{totalItems} {totalItems === 1 ? 'Item' : 'Items'} added</span>
                                    <span className="text-xs font-medium text-white/80 leading-none">₹{totalPrice} plus taxes</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 font-bold bg-white/15 py-2 px-3 sm:px-4 rounded-xl">
                                <span className="text-sm">View Cart</span>
                                <ChevronRight size={18} strokeWidth={3} />
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* Product Details Popup */}
            <ProductDetails
                product={selectedProduct}
                isOpen={isDetailsOpen}
                onClose={() => setIsDetailsOpen(false)}
            />

            {/* Filter Popup */}
            <FilterPopup
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                activeFilters={activeFilters}
                onToggleFilter={toggleFilter}
                onClearAll={() => {
                    setActiveFilters([]);
                    setPriceRange([0, 1000]);
                }}
                priceRange={priceRange}
                onPriceChange={setPriceRange}
            />
        </div>
    );
};

export default CategoryItemsPage;
