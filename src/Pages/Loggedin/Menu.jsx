import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../Context/AuthContext";
import { useMenu } from "../../Context/MenuContext";
import Header from "../../Components/Loggedin/Header";
import BottomNavCustomer from "../../Components/Loggedin/BottomNav";
import BottomNavWaiter from "../../Components/Waiter/BottomNav";
import SidebarWaiter from "../../Components/Waiter/Sidebar";
import CartButton from "../../Components/Loggedin/CartButton";
import { FALLBACK_IMAGE, sizedImage, ALL_CATEGORY_IMAGE, COMBO_CATEGORY_IMAGE } from "../../utils/image";
import { Search, Heart, ChevronLeft } from 'lucide-react';
import VoiceSearchButton from '../../Components/Loggedin/VoiceSearchButton';

// ── Category Card (customer-facing) ─────────────────────────────────────────
const CategoryCard = ({ name, img, onClick }) => (
  <button
    onClick={onClick}
    aria-label={`Browse ${name} category`}
    className="flex flex-col items-center gap-2 cursor-pointer active:scale-95 transition-transform duration-200 bg-transparent border-none p-0"
  >
    <div className="w-25 h-25 rounded-full overflow-hidden bg-gray-100">
      <img
        src={sizedImage(img, { w: 100 })}
        alt={name}
        loading="lazy"
        decoding="async"
        onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
        className="w-full h-full object-cover"
      />
    </div>
    <span className="text-[14px] sm:text-base nunito font-semibold text-[#645E66] text-center">
      {name}
    </span>
  </button>
);

function Menu() {
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const {
    categories: contextCategories,
    combos,
    categoriesLoading,
  } = useMenu();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  // Page renders category cards only — don't block on menu-items or
  // combo downloads (they're megabytes and only matter when the user
  // taps a card and lands on /customer/item/:id).
  //
  // Show the full-screen spinner ONLY on a genuine cold load (no
  // categories cached yet). Once categories have been fetched once,
  // MenuProvider keeps the TanStack query alive at the app root, so
  // every later visit to this tab already has the data in cache. If we
  // gated purely on `categoriesLoading`, a background re-validation
  // (TanStack refetches a stale-but-present query) would flash the
  // spinner and make the tab feel like it "reloads from scratch" every
  // time — the slow-open the customer reported. Rendering the cached
  // grid immediately keeps tab switches instant.
  const loading = categoriesLoading && contextCategories.length === 0;

  // Build the unified category list with "All" and "Combo" virtual entries
  const processedCategories = useMemo(() => {
    const list = [{
      _id: "all",
      name: "All",
      image: ALL_CATEGORY_IMAGE,
    }];

    list.push(...contextCategories);

    // Only surface the "Combo" entry when at least one ACTIVE combo
    // exists — a tenant whose combos are all draft/archived (e.g. every
    // combo auto-archived after its menu item was removed) shouldn't see
    // an empty Combo category.
    if (Array.isArray(combos) && combos.some(c => c.status === 'active')) {
      list.push({
        _id: "combo",
        name: "Combo",
        image: COMBO_CATEGORY_IMAGE,
        isCombo: true
      });
    }
    return list;
  }, [contextCategories, combos]);

  // Filter categories by search query (trimmed, case-insensitive)
  const filteredCategories = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) return processedCategories;
    return processedCategories.filter(category =>
      category.name.toLowerCase().includes(term)
    );
  }, [processedCategories, searchQuery]);

  // Note: MenuContext fetches categories/items/combos automatically via TanStack Query.
  // No useEffect-driven fetch needed here — that would cause duplicate network requests.

  const handleCategoryClick = (item) => {
    if (isStaff) {
      navigate(`/waiter/category/${item._id}`);
    } else {
      navigate(`/customer/item/${item._id}`, {
        state: { category: item },
      });
    }
  };

  return (
    <div className={`min-h-screen ${isStaff ? 'bg-white text-[#1A1A1A] overflow-x-hidden pt-[env(safe-area-inset-top)]' : 'bg-white transition-colors duration-200'} pb-28`}>

      {/* --- Unified Header Section --- */}
      {isStaff ? (
        <>
          <SidebarWaiter isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

          <div className="max-w-7xl mx-auto">
            {/* Header — back button + title on a single row instead of
                stacked. Sticky so the search bar stays reachable while
                the category grid scrolls on long category lists. */}
            <header className="sticky top-0 z-20 bg-white/95 backdrop-blur px-4 sm:px-6 pt-6 pb-3 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigate(-1)}
                  aria-label="Go back"
                  className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                >
                  <ChevronLeft size={24} strokeWidth={1.75} />
                </button>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Menu</h1>
              </div>

              {/* Search */}
              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 bg-[#F5F5F7] rounded-full flex items-center px-4 min-h-12 gap-3 focus-within:ring-2 focus-within:ring-[#FE8301] focus-within:bg-white transition">
                  <Search size={20} className="text-[#645E66] shrink-0" />
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    aria-label="Search categories"
                    className="bg-transparent border-none outline-none flex-1 text-base placeholder:text-[#8D848F] min-w-0"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="text-[#645E66] hover:text-gray-900 text-xs font-semibold uppercase tracking-wider px-2"
                    >
                      Clear
                    </button>
                  )}
                  <div className="w-px h-6 bg-[#DDDDDD]" />
                  <VoiceSearchButton size={20} onResult={(text) => setSearchQuery(text)} />
                </div>
              </div>
            </header>
          </div>
        </>
      ) : (
        <Header />
      )}

      <main className={`${isStaff ? 'max-w-7xl mx-auto' : ''} flex flex-col gap-4 px-4 sm:px-6 ${isStaff ? 'pt-5' : ''}`}>
        {/* Title Section */}
        <section className={isStaff ? 'mb-3' : 'mt-2'}>
          <h2 className={isStaff ? 'text-xl sm:text-2xl font-bold text-[#1A181B] tracking-tight' : 'text-[18px] nunito md:text-2xl font-semibold text-[#101828]'}>
            Feeling hungry already?
          </h2>
          {isStaff && (
            <p className="text-sm text-gray-500 mt-1">Tap a category to browse items.</p>
          )}
        </section>

        {/* Categories Grid */}
        <section>
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredCategories.length > 0 ? (
            <div
              className={`
                grid
                grid-cols-3
                sm:grid-cols-4
                md:grid-cols-5
                lg:grid-cols-6
                xl:grid-cols-7
                ${isStaff ? 'gap-y-6 gap-x-3 sm:gap-x-4' : 'gap-y-6 gap-x-4 sm:gap-x-6 md:gap-x-12 place-items-center'}
              `}
            >
              {filteredCategories.map((item) => (
                isStaff ? (
                  // Waiter Style Category Component — circular thumb with
                  // name underneath. Larger tap target via padding rather
                  // than wider visual footprint.
                  <button
                    key={item._id}
                    onClick={() => handleCategoryClick(item)}
                    aria-label={`Browse ${item.name}`}
                    className="flex flex-col items-center gap-2 cursor-pointer group active:scale-95 transition-all bg-transparent border-none p-1.5 rounded-2xl hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]"
                  >
                    <div className="relative w-full aspect-square rounded-full overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.08)] ring-2 ring-transparent group-hover:ring-[#FE8301] transition-all bg-gray-100">
                      <img
                        src={sizedImage(item.image || FALLBACK_IMAGE, { w: 100 })}
                        alt={item.name}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-semibold text-[#1A181B] group-hover:text-[#FE8301] transition-colors text-center w-full truncate">
                      {item.name}
                    </span>
                  </button>
                ) : (
                  // Customer Style Category Component
                  <CategoryCard
                    key={item._id}
                    name={item.name}
                    img={item.image || FALLBACK_IMAGE}
                    onClick={() => handleCategoryClick(item)}
                  />
                )
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
              <div className="w-16 h-16 rounded-2xl bg-orange-50 ring-1 ring-orange-100 text-[#FE8301] flex items-center justify-center mb-4">
                <Search size={26} strokeWidth={1.75} />
              </div>
              <p className="text-base font-bold text-gray-900">
                {searchQuery.trim() ? 'No matches found' : 'No categories yet'}
              </p>
              <p className="text-sm text-gray-500 mt-1.5 max-w-sm leading-relaxed">
                {searchQuery.trim()
                  ? `Nothing matches "${searchQuery.trim()}". Try a different search.`
                  : 'An admin can add categories under Menu Management.'}
              </p>
            </div>
          )}
        </section>
      </main>

      {/* --- Unified Footer Layout --- */}
      {isStaff ? (
        <BottomNavWaiter />
      ) : (
        <>
          <CartButton />
          <BottomNavCustomer />
        </>
      )}
    </div>
  );
}

export default Menu;
