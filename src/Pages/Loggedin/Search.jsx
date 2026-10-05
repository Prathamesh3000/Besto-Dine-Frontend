import React, { useState, useEffect, useCallback, useRef } from "react";
import { sizedImage } from "../../utils/image";
import {
  Search,
  TrendingUp,
  Users,
  Clock,
  Minus,
  Plus,
  ShoppingCart,
  ChevronRight,
} from "lucide-react";
import Header from "../../Components/Loggedin/Header";
import CartButton from "../../Components/Loggedin/CartButton";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../Context/CartContext";
import { menuSearchAPI } from "../../utils/api";
import { useDineInLock } from "../../utils/dineInSession";
import { resolveUnitPrice } from '../../utils/pricing';

const SECTION_PADDING = "px-4 sm:px-5 md:px-8";

// Trending/Recent Search Chip
const SearchChip = ({ label, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1 px-3 sm:px-4 py-2 bg-[#FDF5FF] rounded-[10px] active:scale-95 transition-transform"
  >
    <TrendingUp size={16} className="text-[#7D7380] " />
    <span className="text-[14px] sm:text-base font-semibold font-nunito text-[#645E66] leading-[16px]">
      {label}
    </span>
  </button>
);

// Cravings Grid Item
const CravingItem = ({ item, onClick }) => (
  <div
    onClick={onClick}
    className="flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform
"
  >
    <div className="w-20 h-20 rounded-full overflow-hidden border border-gray-100 shadow-sm">
      <img
        src={sizedImage(item.img, { w: 80 })}
        alt={item.name}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover "
      />
    </div>
    <span className="text-xs sm:text-sm font-medium text-gray-600 text-center">
      {item.name}
    </span>
  </div>
);

// Filter Chip Component
const FilterChip = ({ label, active = false, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl flex-shrink-0 active:scale-95 transition-all ${active
      ? "bg-orange-500 text-white"
      : "bg-orange-50 text-orange-600 border border-orange-100"
      }`}
  >
    <span className="text-xs sm:text-sm font-semibold">{label}</span>
  </button>
);

// Search Result Item Component
const SearchResultItem = ({
  item,
  quantity,
  onIncrease,
  onDecrease,
  onClick,
  // Lock state — disables Add / +/- visually when the dine-in
  // bill has been settled and the customer hasn't re-scanned the
  // table QR yet. Mirrors the same prop in Home.jsx's MenuItem.
  disabled = false,
}) => (
  <div
    onClick={onClick}
    className="bg-white rounded-2xl p-3 sm:p-4 shadow-sm border border-gray-100 flex gap-3 sm:gap-4 cursor-pointer active:scale-[0.99] transition-transform
"
  >
    <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0">
      <img
        src={sizedImage(item.image, { w: 160 })}
        alt={item.title}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover rounded-xl "
      />
      {item.isVeg !== undefined && (
        <div className="absolute top-2 right-2 bg-white p-0.5 rounded shadow-sm">
          <div
            className={`w-3 h-3 border ${item.isVeg ? "border-green-600" : "border-red-600"} rounded-sm flex items-center justify-center`}
          >
            <div
              className={`w-1.5 h-1.5 ${item.isVeg ? "bg-green-600" : "bg-red-600"} rounded-full`}
            />
          </div>
        </div>
      )}
    </div>

    <div className="flex-1 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start">
          <h3 className="font-bold text-gray-900 text-base sm:text-lg mb-1 flex-1">
            {item.title}
          </h3>
          {/* <BookmarkButton
            itemId={item.id}
            itemDetails={{
              id: item.id,
              title: item.title,
              desc: item.desc,
              price: item.price,
              image: item.image,
              serves: item.serves,
              time: item.time,
              isVeg: item.isVeg,
            }}
            initialBookmarked={false}
            size={16}
            className="text-gray-300 flex-shrink-0 ml-2
      ariaLabel={`Bookmark ${item.title}`}
"
          /> */}
        </div>
        <p className="text-xs sm:text-sm text-gray-500 line-clamp-1 mb-2">
          {item.desc}
        </p>
        <div className="flex items-center gap-2 sm:gap-3 text-[10px] sm:text-xs text-gray-400 mb-2">
          <span className="flex items-center gap-1">
            <Users size={12} className="sm:size-3.5" /> Serves{" "}
            {item.serves || "1-2"}
          </span>
          <span className="flex items-center gap-1">
            <Clock size={12} className="sm:size-3.5" />{" "}
            {item.time || "10-15 min"}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <span className="font-bold text-base sm:text-lg text-gray-900 ">
          ₹{item.price}
        </span>
        {quantity > 0 ? (
          <div
            className={`flex items-center gap-2 sm:gap-3 rounded-lg px-2 py-1 border ${
              disabled ? 'bg-gray-100 border-gray-200' : 'bg-orange-50 border-orange-200'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); if (disabled) return; onDecrease(); }}
              className={`font-bold w-5 h-5 flex items-center justify-center ${
                disabled ? 'text-gray-400 cursor-not-allowed' : 'text-orange-600'
              }`}
            >
              <Minus size={14} />
            </button>
            <span className={`font-bold text-sm w-4 text-center ${disabled ? 'text-gray-400' : ''}`}>
              {quantity}
            </span>
            <button
              disabled={disabled}
              onClick={(e) => { e.stopPropagation(); if (disabled) return; onIncrease(); }}
              className={`font-bold w-5 h-5 flex items-center justify-center ${
                disabled ? 'text-gray-400 cursor-not-allowed' : 'text-orange-600'
              }`}
            >
              <Plus size={14} />
            </button>
          </div>
        ) : (
          <button
            disabled={disabled}
            title={disabled ? 'Bill settled — re-scan QR to order' : undefined}
            onClick={(e) => { e.stopPropagation(); if (disabled) return; onIncrease(); }}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold active:scale-95 transition-colors ${
              disabled
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-orange-500 text-white'
            }`}
          >
            {disabled ? '🔒 Locked' : '+ Add'}
          </button>
        )}
      </div>
    </div>
  </div>
);

// Pairing Item Component
const PairingItem = ({ item, onClick }) => (
  <div
    onClick={onClick}
    className="flex-shrink-0 w-28 sm:w-32 cursor-pointer active:scale-95 transition-transform
"
  >
    <div className="w-28 sm:w-32 h-20 sm:h-24 rounded-xl overflow-hidden mb-2 relative">
      <img
        src={sizedImage(item.image, { w: 120 })}
        alt={item.title}
        loading="lazy"
        decoding="async"
        className="w-full h-full object-cover "
      />
      {/* <BookmarkButton
        itemId={item.id}
        itemDetails={{
          id: item.id,
          title: item.title,
          price: item.price,
          image: item.image,
        }}
        initialBookmarked={false}
        size={16}
        className="absolute top-2 right-2 bg-white rounded-full p-1 shadow-sm
    ariaLabel={`Bookmark ${item.title}`}
"
      /> */}
    </div>
    <p className="text-xs sm:text-sm font-medium text-gray-800 line-clamp-1">
      {item.title}
    </p>
    <p className="text-xs sm:text-sm font-bold text-gray-900 ">₹{item.price}</p>
  </div>
);

function SearchScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const { cartItems, updateQuantity } = useCart();
  // Dine-in session lock — visually disables Add / +/- on every
  // search result while the bill is settled.
  const dineInLocked = useDineInLock();

  const [searchQuery, setSearchQuery] = useState(location.state?.query || "");
  const [activeFilter, setActiveFilter] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("recent_searches") || "[]");
    } catch { return []; }
  });

  // API-driven state
  const [searchResults, setSearchResults] = useState([]);
  const [categoryMatches, setCategoryMatches] = useState([]);
  const [pairingItems, setPairingItems] = useState([]);
  const [alsoLikeItems, setAlsoLikeItems] = useState([]);
  const [trendingItems, setTrendingItems] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  // Fetch trending items on mount
  useEffect(() => {
    menuSearchAPI.getTrending(6).then(res => {
      if (res.data?.success) setTrendingItems(res.data.trending);
    }).catch(() => {});
  }, []);

  // Debounced API search
  const executeSearch = useCallback(async (query, filter) => {
    if (!query.trim()) {
      setSearchResults([]);
      setCategoryMatches([]);
      setPairingItems([]);
      setAlsoLikeItems([]);
      return;
    }

    setSearching(true);
    try {
      const params = { limit: 20 };
      if (filter) params.type = filter;

      const res = await menuSearchAPI.search(query.trim(), params);
      if (res.data?.success) {
        const items = res.data.results.map(item => ({
          id: item._id,
          title: item.name,
          desc: item.description,
          price: resolveUnitPrice(item),
          image: item.images?.[0] || 'https://placehold.co/300x300?text=No+Image',
          isVeg: item.vegType === 'veg',
          categoryId: item.category?._id,
          categoryName: item.category?.name,
          calories: item.nutritionalInfo?.calories,
          protein: item.nutritionalInfo?.protein,
          fats: item.nutritionalInfo?.fat,
          fibre: item.nutritionalInfo?.fibre,
          time: item.cookingTime || '10-15 min',
          serves: item.serveUpto || 'Serves 1-2',
          hasCustomization: (item.sizes?.length > 0 || item.toppings?.length > 0),
        }));
        setSearchResults(items);
        setCategoryMatches(res.data.categories || []);

        // Suggestion sections — pull from the full menu list (the
        // search endpoint returns [] for empty q). Apply the same
        // veg/non-veg filter so suggestions match the active scope.
        const resultIds = new Set(items.map(i => i.id));
        const suggestParams = { limit: 16 };
        if (filter) suggestParams.type = filter;
        const suggestRes = await menuSearchAPI.list(suggestParams);
        const pool = (suggestRes.data?.success ? suggestRes.data.data : [])
          .filter(i => !resultIds.has(String(i._id)));

        setPairingItems(
          pool.slice(0, 6).map(item => ({
            id: item._id,
            title: item.name,
            price: resolveUnitPrice(item),
            image: item.images?.[0] || 'https://placehold.co/300x300?text=No+Image',
            categoryId: item.category?._id || item.category,
          }))
        );

        setAlsoLikeItems(
          [...pool]
            .sort(() => 0.5 - Math.random())
            .slice(0, 4)
            .map(item => ({
              id: item._id,
              title: item.name,
              desc: item.description,
              price: resolveUnitPrice(item),
              image: item.images?.[0] || 'https://placehold.co/300x300?text=No+Image',
              isVeg: item.vegType === 'veg',
              categoryId: item.category?._id || item.category,
              time: item.cookingTime || '10-15 min',
              serves: item.serveUpto || 'Serves 1-2',
              hasCustomization: (item.sizes?.length > 0 || item.toppings?.length > 0),
            }))
        );
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce search on query/filter change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(searchQuery, activeFilter);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQuery, activeFilter, executeSearch]);

  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };

  const saveRecentSearch = (query) => {
    if (!query.trim()) return;
    setRecentSearches(prev => {
      const updated = [query, ...prev.filter(s => s !== query)].slice(0, 5);
      localStorage.setItem("recent_searches", JSON.stringify(updated));
      return updated;
    });
  };

  const performSearchAction = (query) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    saveRecentSearch(query);

    // Check for category match from API results
    const categoryMatch = categoryMatches.find(
      (cat) => cat.name.toLowerCase() === trimmedQuery.toLowerCase()
    );
    if (categoryMatch) {
      navigate(`/customer/item/${categoryMatch._id}`);
      return;
    }

    // Otherwise just search
    setSearchQuery(query);
  };

  const handleSearchKeyDown = (e) => {
    // Voice search passes the recognised text on a synthetic event —
    // `searchQuery` is still the pre-voice value in this render.
    const query = typeof e?.target?.value === "string" ? e.target.value : searchQuery;
    if (e.key === "Enter" && query.trim()) {
      performSearchAction(query);
    }
  };

  const filteredResults = searchResults;

  const handleSearch = (query) => {
    performSearchAction(query);
  };

  // Opening a result is the clearest "I meant this search" signal — so
  // remember the query that led here. Previously a recent search was only
  // saved on Enter / chip tap, so the common flow (type → tap a result)
  // never populated "Your Recent Searches", leaving it perpetually empty.
  const handleResultOpen = (item) => {
    if (searchQuery.trim()) saveRecentSearch(searchQuery.trim());
    navigate(`/customer/item/${item.categoryId}`, { state: { productId: item.id } });
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem("recent_searches");
  };

  const handleIncrease = (item) => {
    updateQuantity(item.id, 1, {
      ...item,
      // No fabricated size. A made-up "Regular" at the menu price made the
      // server re-price the line from the item's real "Regular" size (or
      // reject it when no such size exists), so the cart/checkout total
      // drifted from the price shown here. Quick-add = plain item at the
      // displayed finalPrice, exactly like the Home card's Add button.
      selectedSizes: [],
      selectedToppings: [],
      specialInstructions: "",
      unitPrice: item.price,
      totalPrice: item.price,
    });
  };

  const handleDecrease = (item) => {
    updateQuantity(item.id, -1);
  };

  const getItemQuantity = (itemId) => {
    return cartItems[itemId]?.quantity || 0;
  };

  const showInitialState = !searchQuery;

  return (
    <div className="min-h-screen bg-white pb-20 sm:pb-32 transition-colors duration-200">
      <Header
        showFilters={false}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchKeyDown={handleSearchKeyDown}
      />

      <main className="flex flex-col gap-4 sm:gap-6 pt-2">
        {showInitialState ? (
          <>
            {/* Recent Searches */}
            {recentSearches.length > 0 && (
              <section className={SECTION_PADDING}>
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-[#666666] font-semibold font-nunito text-[16px] sm:text-lg leading-[22px]">
                    Your Recent Searches
                  </h2>
                  <button
                    onClick={handleClearRecent}
                    className="text-[#FE8301] font-semibold font-nunito text-[16px] sm:text-lg leading-[16px]"
                  >
                    Clear
                  </button>
                </div>
                <div className="flex flex-wrap gap-4">
                  {recentSearches.map((item, index) => (
                    <SearchChip
                      key={index}
                      label={item}
                      onClick={() => handleSearch(item)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Trending Searches */}
            <section className={SECTION_PADDING}>
              <h2 className="text-[#666666] font-semibold font-nunito text-[16px] sm:text-lg leading-[22px] mb-2">
                Trending Searches
              </h2>
              <div className="flex flex-wrap gap-4">
                {trendingItems.map((item) => (
                  <SearchChip
                    key={item.id}
                    label={item.label}
                    onClick={() => handleSearch(item.label)}
                  />
                ))}
              </div>
            </section>
          </>
        ) : (
          <>
            {/* Search Results State */}

            {/* Filter Chips */}
            <section className={SECTION_PADDING}>
              <div className="flex gap-2 text-[14px] font-varela sm:gap-3 overflow-x-auto pb-2 scrollbar-hide">
                <FilterChip
                  label="Veg"
                  active={activeFilter === "veg"}
                  onClick={() =>
                    setActiveFilter(activeFilter === "veg" ? null : "veg")
                  }
                />
                <FilterChip
                  label="Non-veg"
                  active={activeFilter === "non-veg"}
                  onClick={() =>
                    setActiveFilter(
                      activeFilter === "non-veg" ? null : "non-veg",
                    )
                  }
                />
              </div>
            </section>

            {/* Search Results */}
            <section className={SECTION_PADDING}>
              <div className="flex flex-col gap-4">
                {filteredResults.length > 0 ? (
                  filteredResults.map((item) => (
                    <SearchResultItem
                      key={item.id}
                      item={item}
                      quantity={getItemQuantity(item.id)}
                      onIncrease={() => handleIncrease(item)}
                      onDecrease={() => handleDecrease(item)}
                      disabled={dineInLocked}
                      onClick={() => handleResultOpen(item)}
                    />
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-4 px-4 text-center">
                    <div className="w-15 h-15 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                      <Search className="text-[#666666]" size={30} />
                    </div>
                    <h3 className="text-lg font-nunito font-semibold text-gray-900 mb-2">
                      Item not found
                    </h3>
                    <p className="text-[#666666] font-varela max-w-[250px]">
                      Sorry, that item is not available in our cafe right now.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* You will love pairing it with Section - only if results found */}
            {filteredResults.length > 0 && (
              <section className={SECTION_PADDING}>
                <h2 className="text-[18px] font-nunito font-semibold text-gray-900 mb-4">
                  You will love pairing it with
                </h2>
                <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 scrollbar-hide">
                  {pairingItems.map((item) => (
                    <PairingItem
                      key={item.id}
                      item={item}
                      onClick={() =>
                        navigate(`/customer/item/${item.categoryId}`, {
                          state: { productId: item.id },
                        })
                      }
                    />
                  ))}
                </div>
              </section>
            )}

            {/* You May Also Like Section */}
            <section className={SECTION_PADDING}>
              <h2 className="text-[18px] font-nunito font-semibold text-gray-900 mb-4">
                You May Also Like
              </h2>
              <div className="flex flex-col gap-4">
                {alsoLikeItems.map((item) => (
                  <SearchResultItem
                    key={`also-${item.id}`}
                    item={item}
                    quantity={getItemQuantity(item.id)}
                    onIncrease={() => handleIncrease(item)}
                    onDecrease={() => handleDecrease(item)}
                    disabled={dineInLocked}
                    onClick={() =>
                      navigate(`/customer/item/${item.categoryId}`, {
                        state: { productId: item.id },
                      })
                    }
                  />
                ))}
              </div>
            </section>
          </>
        )}
      </main>

      {/* Floating cart bar — slides up from the bottom whenever the cart
          has items. Same component Home / Menu / MenuItemDetail use; was
          missing here, so adding items via the +/- buttons on search
          results never surfaced the "View Cart" CTA. */}
      <CartButton />
    </div>
  );
}

export default SearchScreen;
