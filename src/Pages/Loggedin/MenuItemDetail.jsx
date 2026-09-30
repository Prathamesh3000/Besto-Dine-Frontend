// MenuItemDetail.jsx
import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  ChevronLeft,
  SlidersHorizontal,
  Plus,
  Minus,
  ChevronRight,
  Search,
  Mic,
  ShoppingCart,
} from "lucide-react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import FilterModal from "../../Components/Loggedin/FilterModal";
import { useNotifications } from "../../Context/NotificationContext";
import ProductDetails from "../../Components/Loggedin/ProductDetails";
import CelebrationIcon from "/celebration.svg";
import { useCart } from "../../Context/CartContext";
import { useMenu } from "../../Context/MenuContext";
import CartButton from "../../Components/Loggedin/CartButton";
import VegBadge from "../../Components/Common/VegBadge";
import { handleImageError, FALLBACK_IMAGE } from "../../utils/image";
import { resolveUnitPrice } from '../../utils/pricing';
import useCustomerSession from '../../hooks/useCustomerSession';

// ══════════════════════════════════════════════════════════
// HealthMenuItem  –  single product card
// ══════════════════════════════════════════════════════════
const HealthMenuItem = ({
  title,
  desc,
  price,
  image,
  calories,
  protein,
  fats,
  fibre,
  isVeg,
  onClick,
  onAddToCart,
  onIncrease,
  onDecrease,
  quantity = 0,
  id,
}) => {
  if (!title || !price || !image) {
    return null;
  }

  return (
    <div
      onClick={onClick}
      className="flex flex-wrap min-[375px]:flex-row gap-3 min-[375px]:gap-3 sm:gap-4 p-2 md:p-4 bg-white border-1 border-[#F6F6F6] rounded-2xl mb-[10px] md:mb-4 cursor-pointer active:scale-[0.98] transition-transform duration-200"
    >
      {/* ── Thumbnail ── */}
      <div className="relative w-full min-[375px]:w-[100px] h-[180px] min-[375px]:h-[100px] sm:w-28 sm:h-28 md:w-32 md:h-32 flex-shrink-0">
        <img
          src={image}
          alt={title}
          className="w-full h-full object-cover rounded-xl"
          onError={handleImageError}
        />
        {isVeg !== undefined && (
          <div className="absolute top-2 left-2">
            <VegBadge isVeg={isVeg} size="sm" />
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
        <div>
          {/* Title + Bookmark */}
          <div className="flex justify-between items-start mb-2 gap-2">
            <h3
              className="font-semibold text-[#1A181B] text-base sm:text-lg leading-tight truncate flex-1"
              style={{ fontFamily: "Nunito, sans-serif", fontWeight: 600 }}
            >
              {title}
            </h3>
            {/* BookmarkButton removed */}
          </div>

          {/* Kcal ring + macro pills */}
          <div className="flex items-center gap-2 min-[375px]:gap-3 mb-1">
            {calories && (
              <div
                className="relative w-[50px] h-[50px] sm:w-[55px] sm:h-[55px] rounded-full flex items-center justify-center flex-shrink-0"
                style={{
                  background:
                    "conic-gradient(#B3FF49 0deg 280deg, #FBFBFB 280deg 360deg)",
                }}
              >
                <div className="absolute inset-[3px] sm:inset-[4px] bg-white rounded-full flex flex-col items-center justify-center">
                  <span
                    className="text-xs sm:text-base text-[#645E66] leading-none pb-[2px]"
                    style={{
                      fontFamily: "Varela, sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    {calories}
                  </span>
                  <span
                    className="text-[10px] sm:text-sm text-[#645E66] leading-none"
                    style={{
                      fontFamily: "Varela, sans-serif",
                      fontWeight: 400,
                    }}
                  >
                    kcal
                  </span>
                </div>
              </div>
            )}

            {(protein !== undefined ||
              fats !== undefined ||
              fibre !== undefined) && (
                <div className="flex items-center justify-between bg-[#F8FFEF] px-2 min-[375px]:px-[8px] py-[4px] gap-1 min-[375px]:gap-2 rounded-[9px] flex-1 min-w-0">
                  <div className="flex items-center justify-around w-full gap-1">
                    {protein !== undefined && (
                      <div className="flex flex-col items-center min-w-0">
                        <span className="font-regular text-xs md:text-base text-[#645E66]  leading-tight">
                          {protein}g
                        </span>
                        <span className="font-regular text-[10px] md:text-base text-[#645E66] leading-tight whitespace-nowrap">
                          Protein
                        </span>
                      </div>
                    )}
                    {fats !== undefined && (
                      <div className="flex flex-col items-center min-w-0">
                        <span className="font-regular text-xs md:text-base text-[#645E66] leading-tight">
                          {fats}g
                        </span>
                        <span className="font-regular text-[10px] md:text-base text-[#645E66] leading-tight whitespace-nowrap">
                          Fats
                        </span>
                      </div>
                    )}
                    {fibre !== undefined && (
                      <div className="flex flex-col items-center min-w-0">
                        <span className="font-regular text-xs md:text-base text-[#645E66] leading-tight">
                          {fibre}g
                        </span>
                        <span className="font-regular text-[10px] md:text-base text-[#645E66] leading-tight whitespace-nowrap">
                          Fibre
                        </span>
                      </div>
                    )}
                  </div>
                  <ChevronRight
                    size={16}
                    className="text-[#B6AEB8] ml-auto flex-shrink-0"
                  />
                </div>
              )}
          </div>
        </div>

        {/* ── Price + Add / ± buttons ── */}
        <div className="flex items-center justify-between mt-2 gap-2">
          <span
            className="font-semibold text-lg min-[375px]:text-lg md:text-xl text-[#1A181B] whitespace-nowrap"
            style={{
              fontWeight: "600",
              fontFamily: "Nunito, sans-serif",
              lineHeight: "26px",
            }}
          >
            ₹{typeof price === "number" ? price.toFixed(0) : price}
          </span>

          {quantity > 0 ? (
            <div className="flex items-center gap-2 min-[375px]:gap-2 sm:gap-3 bg-[#FE8301]/30 rounded-lg px-2 min-[375px]:px-2 py-1 border border-orange-200">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDecrease && onDecrease();
                }}
                className="text-white  font-bold w-6 h-6 min-[375px]:w-6 min-[375px]:h-6 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Minus size={16} className="min-[375px]:w-4 min-[375px]:h-4" />
              </button>
              <span className="font-bold text-sm min-[375px]:text-sm md:text-base w-5 min-[375px]:w-5 text-center text-white">
                {quantity}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onIncrease && onIncrease();
                }}
                className="text-white  font-bold w-6 h-6 min-[375px]:w-6 min-[375px]:h-6 flex items-center justify-center active:scale-90 transition-transform"
              >
                <Plus size={16} className="min-[375px]:w-4 min-[375px]:h-4" />
              </button>
            </div>
          ) : (
            <button
              className="bg-[#FE8301] text-white px-5 min-[375px]:px-6 py-1.5 md:px-7 md:py-2 rounded-[10px] text-sm min-[375px]:text-sm md:text-base font-semibold shadow-sm active:scale-95 transition-transform whitespace-nowrap"
              style={{ fontWeight: "600", fontFamily: "Nunito, sans-serif" }}
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart &&
                  onAddToCart({
                    id,
                    title,
                    desc,
                    price,
                    image,
                    isVeg,
                    calories,
                    protein,
                    fats,
                    fibre,
                    quantity: 1,
                    size: "regular",
                    toppings: [],
                  });
              }}
              aria-label={`Add ${title} to cart`}
            >
              <span className="mr-1">
                <i className="fi fi-rr-plus-small" />
              </span>{" "}
              Add
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
const MenuItem = ({
  title,
  desc,
  price,
  image,
  time,
  serves,
  isVeg,
  calories,
  protein,
  fats,
  fibre,
  onClick,
  onAddToCart,
  onIncrease,
  onDecrease,
  quantity = 0,
  id,
  discount,
}) => {
  if (!title || !price || !image) {
    return null;
  }

  return (
    <div className="px-4 mb-2 sm:mb-3 md:mb-4">
      <div
        onClick={onClick}
        className={`
          flex flex-col min-[375px]:flex-row gap-3.5
          p-2 sm:p-2 md:p-4
          bg-[#FFFFFF]
          ${discount ? 'rounded-t-[16px]' : 'rounded-[16px]'}
          border border-[#F6F6F6]
          active:scale-[0.98]
          transition-transform
        `}
      >
        {/* Image */}
        <div className="relative flex-shrink-0 w-full h-[180px] min-[375px]:w-[110px] min-[375px]:h-auto md:w-[130px] md:h-[130px]">
          <img
            src={image}
            alt={title}
            className="h-full w-full object-cover rounded-[10px] overflow-hidden"
            onError={handleImageError}
          />

          {isVeg !== undefined && (
            <div className="absolute top-2 left-2">
              <VegBadge isVeg={isVeg} size="sm" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start">
              <h3
                style={{ fontWeight: 600 }}
                className="
                text-16 sm:text-base md:text-lg
                leading-tight
                mb-1
                text-[#333333]
                nunito 
              "
              >
                {title}
              </h3>
            </div>

            <p
              className="
              text-[14px] varela-rounded
              font-normal
              sm:text-xs md:text-sm
              text-[#645E66]
              line-clamp-2
              mb-2
              varela-rounded
            "
            >
              {desc}
            </p>

            <div
              className="
              flex items-center gap-2 sm:gap-3
              text-[9px] sm:text-[10px] md:text-xs
              text-gray-400
            "
            >
              <span className="flex items-center gap-1 rounded-[16px] px-2 py-0.5 bg-[#F6F6F6] text-[#645E66] text-[10px] font-normal varela-rounded">
                <i className="fi fi-rr-clock-three"></i>
                {time}
              </span>
              <span className="flex items-center gap-1 rounded-[16px] px-2 py-0.5 bg-[#F6F6F6] text-[#645E66] text-[10px] font-normal varela-rounded">
                <i className="fi fi-rs-restaurant"></i>
                {serves}
              </span>
            </div>
          </div>

          {/* Price + Actions */}
          <div className="flex items-center justify-between mt-2">
            <span
              style={{ fontWeight: 600 }}
              className="
              nunito
              text-base sm:text-[20px] md:text-xl
              text-[#1A181B]
            "
            >
              ₹{typeof price === "number" ? price.toFixed(2) : price}
            </span>
            <div className="flex gap-1 text-[11px] varela-rounded font-normal text-[#007AFF]">
              <i className="fi fi-sr-star text-[#FFCC00] h-4 w-4"></i>
              4.5
            </div>
            {quantity > 0 ? (
              <div className="flex items-center gap-2 bg-orange-50 rounded-lg px-2 py-1 border border-orange-200">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDecrease();
                  }}
                  className="text-orange-600 font-bold w-6 h-6 flex items-center justify-center active:scale-90"
                >
                  <i className="fi fi-br-minus-small" size={16}></i>
                </button>

                <span className="font-bold text-sm w-5 text-center">
                  {quantity}
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onIncrease();
                  }}
                  className="text-orange-600 font-bold w-6 h-6 flex items-center justify-center active:scale-90"
                >
                  <i className="fi fi-br-plus-small text-[16px]"></i>
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart({
                    id,
                    title,
                    desc,
                    price,
                    image,
                    isVeg,
                    time: time || "10-15 min",
                    serves: serves || "Serves 2",
                    quantity: 1,
                    size: "regular",
                    toppings: [],
                  });
                }}
                className="
                  bg-[#FE8301] text-white
                  pr-[16px] pl-[12px] 
                  py-2 rounded-[10px]
                  flex items-center justify-center
                  active:scale-95 gap-1
                "
              >
                <i className="fi fi-sr-plus-small flex items-center text-[16px]"></i>
                <span className="font-semibold nunito text-[14px]">Add</span>
              </button>
            )}
          </div>
        </div>
      </div>
      {/* Discount Badge */}
      {discount && (
        <div className="flex items-center gap-1.5 py-1 px-4 bg-[#FFFAF5] rounded-b-[16px] border border-t-0 border-[#F6F6F6] translate-y-[-1px]">
          <img src={CelebrationIcon} alt="" />
          <span className="text-[#007AFF] font-normal text-[12px] varela-rounded">{discount}</span>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════
// MenuItemDetail  –  full-screen overlay
// ══════════════════════════════════════════════════════════

const MenuItemDetail = () => {
  const { id } = useParams();
  const { state } = useLocation();
  const [healthMode, setHealthMode] = useState(false);

  const { cartItems: cartItemsObj, updateQuantity } = useCart();
  const { menuItems: contextMenuItems, categories: contextCategories, fetchMenuItems, fetchCategories, menuLoading } = useMenu();

  const navigate = useNavigate();
  // Table label hidden once the dine-in visit is settled (bill paid).
  const { showTableChrome } = useCustomerSession();
  const { unreadCount } = useNotifications();
  const [showCategorySlider, setShowCategorySlider] = useState(true);
  const [hasExplicitlySelected, setHasExplicitlySelected] = useState(false);
  const [hasScrolledSinceSelection, setHasScrolledSinceSelection] = useState(false);
  const lastScrollY = useRef(0);
  const containerRef = useRef(null);

  // Build category list from API data with "All" prepended
  const categoryItems = React.useMemo(() => {
    const all = { _id: "all", id: "all", name: "All", image: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=200&h=200" };
    const cats = contextCategories.map(c => ({
      ...c,
      id: c._id,
      name: c.name,
      image: c.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=150",
    }));
    return [all, ...cats];
  }, [contextCategories]);

  // Fetch categories on mount
  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const currentY = container.scrollTop;
      if (currentY > 70) {
        setHasScrolledSinceSelection(true);
        setShowCategorySlider(true);
      } else {
        setHasScrolledSinceSelection(false);
        setHasExplicitlySelected(false);
        setShowCategorySlider(true);
      }
      lastScrollY.current = currentY;
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasExplicitlySelected]);

  const initialIndex = categoryItems.findIndex((c) => String(c.id) === String(id) || (id === "all" && c.id === "all"));

  const [selectedCategoryIndex, setSelectedCategoryIndex] = useState(
    initialIndex === -1 ? 0 : initialIndex,
  );

  // Update selected index when categories load and id matches
  useEffect(() => {
    const idx = categoryItems.findIndex((c) => String(c.id) === String(id) || (id === "all" && c.id === "all"));
    if (idx !== -1 && idx !== selectedCategoryIndex) {
      setSelectedCategoryIndex(idx);
    }
  }, [categoryItems, id]);

  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      const chips = scrollRef.current.children;
      const idx = categoryItems.findIndex((c) => String(c.id) === String(id) || (id === "all" && c.id === "all"));
      if (idx >= 0 && chips[idx]) {
        chips[idx].scrollIntoView({
          block: "nearest",
          inline: "center",
          behavior: "smooth",
        });
      }
    }
  }, [categoryItems, id]);

  // Fetch menu items when selected category changes
  const currentCategoryId = categoryItems?.[selectedCategoryIndex]?.id;
  useEffect(() => {
    const params = {
      page: 1,
      limit: 1000,
      status: 'active',
      category: currentCategoryId === "all" ? undefined : currentCategoryId,
    };
    fetchMenuItems(params);
  }, [currentCategoryId, fetchMenuItems]);

  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({
    minPrice: 0,
    maxPrice: 1000,
    preference: null,
    offers: [],
    healthyMode: false,
  });

  const [showCartNotification, setShowCartNotification] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const handleProductClick = useCallback((product) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  }, []);

  const handleCloseProductModal = useCallback(() => {
    setIsProductModalOpen(false);
    setSelectedProduct(null);
    if (state?.product?._isCartItem) {
      navigate(-1);
    }
  }, [state, navigate]);

  useEffect(() => {
    if (state?.product) {
      setSelectedProduct(state.product);
      setIsProductModalOpen(true);
    }
  }, [state]);

  useEffect(() => {
    if (isProductModalOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isProductModalOpen]);

  // Map API menu items to the component's expected format
  const rawProducts = React.useMemo(() => {
    let items = contextMenuItems;
    if (currentCategoryId !== "all") {
      items = items.filter(item => {
        const catId = item.category?._id || item.category;
        return String(catId) === String(currentCategoryId);
      });
    }
    return items.map(item => {
      const n = item.nutritionalInfo || {};
      return {
        id: item._id,
        title: item.name,
        desc: item.description,
        price: resolveUnitPrice(item),
        image: item.images?.[0] || FALLBACK_IMAGE,
        unit: item.unit || 'pieces',
        isVeg: item.vegType === 'veg',
        categoryId: item.category?._id || item.category,
        calories: item.calories ?? n.calories,
        protein: item.protein ?? n.protein,
        fats: item.fats ?? n.fat,
        fibre: item.fibre ?? n.fibre,
        time: item.cookingTime || '10-15 min',
        serves: item.serveUpto || 'Serves 1-2',
        hasCustomization: (item.sizes?.length > 0 || item.toppings?.length > 0),
        discount: item.offerPercentage > 0 ? `Flat ${item.offerPercentage}% OFF` : null,
      };
    });
  }, [contextMenuItems, currentCategoryId]);

  const filteredProducts = React.useMemo(() => {
    let list = [...rawProducts];

    if (activeFilters.minPrice > 0 || activeFilters.maxPrice < 1000) {
      list = list.filter(
        (p) =>
          p.price >= activeFilters.minPrice &&
          p.price <= activeFilters.maxPrice,
      );
    }

    if (activeFilters.preference) {
      list = list.filter((p) =>
        activeFilters.preference === "veg" ? p.isVeg : !p.isVeg,
      );
    }

    if (activeFilters.healthyMode) {
      list = list.filter((p) => p.calories && p.calories < 350);
    }

    return list;
  }, [rawProducts, activeFilters]);

  // ── cart helpers (wired to global CartContext) ──
  const getItemQuantity = useCallback(
    (itemId) => {
      return cartItemsObj[itemId]?.quantity || 0;
    },
    [cartItemsObj],
  );

  const handleIncreaseQuantity = useCallback(
    (product) => {
      updateQuantity(product.id, 1, product);
    },
    [updateQuantity]
  );

  const handleDecreaseQuantity = useCallback(
    (product) => {
      updateQuantity(product.id, -1);
    },
    [updateQuantity]
  );

  const handleAddToCart = useCallback(
    (product) => {
      updateQuantity(product.id, 1, product);
    },
    [updateQuantity]
  );

  // ── filter label helpers ──
  const getFilterLabel = (filterType, filters) => {
    if (filterType === "price") {
      return `₹${filters.minPrice}-₹${filters.maxPrice}`;
    }
    if (filterType === "preference")
      return filters.preference === "veg" ? "Pure Veg" : "Non-veg";
    return "";
  };

  const handleRemoveFilter = (filterType) => {
    setActiveFilters((prev) => {
      if (filterType === "price") {
        return { ...prev, minPrice: 0, maxPrice: 1000 };
      }
      return {
        ...prev,
        [filterType]: filterType === "offers" ? [] : null,
      };
    });
  };

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50 ">
      {/* ── fixed full-screen overlay ── */}
      <div
        ref={containerRef}
        className="fixed inset-0 z-10 bg-white overflow-y-auto max-w-2xl lg:max-w-4xl mx-auto"
      >
        {/* ── Sticky Header ── */}
        <header className="bg-white sticky top-0 z-40  transition-colors">
          <div className="flex items-center justify-between  px-4 py-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="p-1 -ml-3 rounded-full hover:bg-gray-100 active:scale-95 transition-transform"
              >
                <i className=
                  "fi fi-sr-angle-left text-[#666666]  text-[14px] flex items-center justify-center "
                ></i>

              </button>

            </div>
            <div className="flex items-center justify-center gap-4" >

              {showTableChrome && (
              <span className="text-[#666666] varela-rounded font-regular text-[14px]">
                Table {(() => { try { const t = JSON.parse(localStorage.getItem('dineInTable') || '{}'); return t.name || localStorage.getItem('tableNumber') || '—'; } catch { return '—'; } })()}
              </span>
              )}
              <button
                onClick={() => navigate("/notifications")}
                className="p-1 rounded-full hover:bg-gray-100 active:scale-95 transition-transform relative"
              >
                <i className="fi fi-rr-bell text-[#8D848F] flex items-center justify-center text-[22px]"></i>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] flex items-center justify-center bg-[#FE8301] text-white text-[9px] font-bold rounded-full px-1 border-2 border-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>

          </div>

        </header>

        {/* ── Main Content ── */}
        <main className="flex flex-col bg-[#FFFFFF] pb-24">

          {/* ── Category Slider Section ── */}
          <div className="mb-4">
            <div
              ref={scrollRef}
              className="flex gap-6 overflow-x-auto scrollbar-hide pb-2  px-4 pt-4"
            >
              {categoryItems?.map((category, index) => (
                <button
                  key={category.id}
                  onClick={() => {
                    setSelectedCategoryIndex(index);
                    setHasExplicitlySelected(true);
                    setHasScrolledSinceSelection(false);
                  }}
                  className={`flex-shrink-0 flex flex-col items-center gap-2 ${selectedCategoryIndex === index ? "scale-105" : "scale-100"
                    }`}
                >
                  <div className="relative w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] rounded-full overflow-hidden">
                    <img
                      src={category.image}
                      alt={category.name}
                      className={`w-full h-full object-cover ${selectedCategoryIndex !== index
                        ? "blur-[0.5px] opacity-70"
                        : ""
                        }`}
                    />
                  </div>
                  <span
                    className={`text-[14px] font-semibold nunito text-center ${selectedCategoryIndex === index
                      ? "text-gray-900"
                      : "text-gray-500"
                      }`}
                  >
                    {category.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* ── Sticky Selected Category & Filter Bars ── */}
          <div className="sticky top-[45px] z-30 w-full h-[100px] bg-white overflow-hidden pointer-events-none">
            <div
              className={`w-full transition-all duration-300 ease-in-out transform shadow-sm py-2
                ${hasScrolledSinceSelection
                  ? "translate-y-0 opacity-100 pointer-events-auto"
                  : "-translate-y-full opacity-0"
                }`}
            >
              {/* Selected Category Name & Count Bar */}
              <div className="flex items-center justify-between bg-[#FFF7EE] mb-2">
                <div className="flex gap-2 items-center px-4 py-2">
                  <h3 className="text-[18px] font-semibold nunito text-[#1A181B] leading-tight">
                    {categoryItems?.[selectedCategoryIndex]?.name}
                  </h3>
                  <p className="text-[18px] font-semibold nunito text-[#645E66] ">
                    ({filteredProducts.length})
                  </p>
                </div>
              </div>

              {/* Sticky Filter Bar (Below Category Bar) */}
              <div className="flex items-center px-4 gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setIsFilterModalOpen(true)}
                  className="flex items-center gap-1 px-4 py-2 bg-[#FDF5FF] rounded-[10px] transition-colors flex-shrink-0 relative"
                >
                  <SlidersHorizontal className="w-4 h-4 text-[#666666] " />

                </button>
                {/* Active price chip */}
                {(activeFilters.minPrice > 0 || activeFilters.maxPrice < 1000) && (
                  <div className="flex items-center gap-1 pr-3 pl-4 py-2 rounded-[10px] bg-[#FDF5FF] flex-shrink-0">
                    <span className="text-[#645E66] font-semibold text-[14px] nunito ">
                      {getFilterLabel("price", activeFilters)}
                    </span>
                    <button
                      onClick={() => handleRemoveFilter("price")}
                      className="text-[#645E66] text-[16px]"
                    >
                      <i className="fi fi-rr-cross-small flex items-center text-[16px] "></i>
                    </button>
                  </div>
                )}

                {/* Active preference chip */}
                {activeFilters.preference && (
                  <div
                    className={`flex items-center gap-2 px-4 py-2 rounded-[10px] ${activeFilters.preference === "veg"
                      ? "bg-[#FDF5FF] "
                      : "bg-[#FDF5FF] "
                      } flex-shrink-0 text-[#645E66]`}
                  >
                    <span className="text-[#645E66] font-semibold text-[14px] nunito ">
                      {getFilterLabel("preference", activeFilters)}
                    </span>
                    <button
                      onClick={() => handleRemoveFilter("preference")}
                      className="text-[#645E66] text-[16px]"
                    >
                      <i className="fi fi-rr-cross-small flex items-center "></i>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Products Section ── */}
          <div className="">
            {showCategorySlider && (
              <h2 className="text-[18px] px-4 font-semibold nunito text-[#101828] mb-[10px]">
                {hasExplicitlySelected ? "" : "Flavors You’ll Come Back For!"}
              </h2>
            )}

            {/* Filter chips row (Fallback for non-sticky state if needed) */}
            <div
              className={`flex px-4 items-center gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1 transition-all duration-300 ease-in-out transform
                ${hasScrolledSinceSelection
                  ? "opacity-0 -translate-y-2 pointer-events-none h-0 overflow-hidden mb-0"
                  : "opacity-100 translate-y-0 h-auto"
                }`}
            >
              <button
                onClick={() => setIsFilterModalOpen(true)}
                className="flex items-center gap-1 px-4 py-2 bg-[#FDF5FF] rounded-[10px] flex-shrink-0 relative"
              >
                <SlidersHorizontal className="w-4 h-4 text-[#666666] " />

                {(activeFilters.preference || activeFilters.minPrice > 0 || activeFilters.maxPrice < 1000) && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-white"></span>
                )}
              </button>

              {/* Active price chip */}
              {(activeFilters.minPrice > 0 || activeFilters.maxPrice < 1000) && (
                <div className="flex items-center gap-1 px-4 py-2 rounded-[10px] bg-[#FDF5FF]/20 flex-shrink-0">
                  <span className="text-[14px] font-semibold nunito text-[#645E66]">
                    {getFilterLabel("price", activeFilters)}
                  </span>
                  <button
                    onClick={() => handleRemoveFilter("price")}
                    className="text-[#645E66] text-[20px] leading-none hover:text-orange-700"
                  >
                    <i className="fi fi-rr-cross-small flex items-center "></i>

                  </button>
                </div>
              )}

              {/* Active preference chip */}
              {activeFilters.preference && (
                <div
                  className={`flex items-center gap-2 px-4 py-2 rounded-[10px] ${activeFilters.preference === "veg"
                    ? "bg-[#FDF5FF] "
                    : "bg-[#FDF5FF] "
                    } flex-shrink-0 text-[#645E66]`}
                >
                  <span className="text-[14px] font-semibold nunito">
                    {getFilterLabel("preference", activeFilters)}
                  </span>
                  <button
                    onClick={() => handleRemoveFilter("preference")}
                    className="text-lg leading-none"
                  >
                    <i className="fi fi-rr-cross-small flex items-center "></i>
                  </button>
                </div>
              )}


            </div>

            <div className="space-y-4">
              {filteredProducts.length > 0 ? (
                filteredProducts.map((product) =>
                  healthMode ? (
                    <HealthMenuItem
                      key={product.id}
                      id={product.id}
                      title={product.title}
                      desc={product.desc}
                      price={product.price}
                      image={product.image}
                      calories={product.calories}
                      protein={product.protein}
                      fats={product.fats}
                      fibre={product.fibre}
                      isVeg={product.isVeg}
                      onClick={() => handleProductClick(product)}
                      onAddToCart={handleAddToCart}
                      quantity={getItemQuantity(product.id)}
                      onIncrease={() => handleIncreaseQuantity(product)}
                      onDecrease={() => handleDecreaseQuantity(product)}
                    />
                  ) : (
                    <MenuItem
                      key={product.id}
                      id={product.id}
                      title={product.title}
                      desc={product.desc}
                      price={product.price}
                      image={product.image}
                      time={product.time}
                      serves={product.serves}
                      isVeg={product.isVeg}
                      discount={product.discount}
                      calories={product.calories}
                      protein={product.protein}
                      fats={product.fats}
                      fibre={product.fibre}
                      onClick={() => handleProductClick(product)}
                      onAddToCart={handleAddToCart}
                      quantity={getItemQuantity(product.id)}
                      onIncrease={() => handleIncreaseQuantity(product)}
                      onDecrease={() => handleDecreaseQuantity(product)}
                    />
                  ),
                )
              ) : (
                <div className="text-center py-8">
                  <p className="text-lg font-semibold font-nunito text-[#645E66] ">
                    No items found matching your filters
                  </p>
                  <button
                    onClick={() =>
                      setActiveFilters({
                        price: null,
                        preference: null,
                        offers: [],
                        healthyMode: false,
                      })
                    }
                    className="mt-4 text-lg font-semibold font-nunito text-orange-500 hover:text-orange-600"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>
        {/* Filter Modal */}
        <FilterModal
          isOpen={isFilterModalOpen}
          activeFilters={activeFilters}
          onClose={() => setIsFilterModalOpen(false)}
          onApplyFilters={(filters) => setActiveFilters(filters)}
        />

        {/* CartButton (global) handles the floating cart bar — no local one needed */}
        <CartButton />

        {/* <BottomNav /> Removed as file not found */}

      </div>

      {/* ══════════════════════════════════════════════════════
        ProductDetailsModal - MenuItemDetail DIV 
        ══════════════════════════════════════════════════════ */}
      {
        isProductModalOpen && selectedProduct && (
          <div
            className="fixed inset-0 z-[100] bg-black/40 flex items-end justify-center"
            onClick={handleCloseProductModal}
          >
            <ProductDetails
              product={selectedProduct}
              onClose={handleCloseProductModal}
            />
          </div>
        )
      }
    </div >

  );
};
export default MenuItemDetail;
