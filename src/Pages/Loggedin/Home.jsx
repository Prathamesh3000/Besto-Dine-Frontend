import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  Minus,
  Clock,
  Users,
  ChevronRight,
  ChevronLeft,
  X,
  SlidersHorizontal,
  Search,
  Mic,
  Star as StarIcon,
  ShoppingBag,
  Filter,
  Heart,
  Bell
} from "lucide-react";
import { useAuth } from "../../Context/AuthContext";
import { useCart } from "../../Context/CartContext";
import BottomNavCustomer from "../../Components/Loggedin/BottomNav";
import BottomNavWaiter from "../../Components/Waiter/BottomNav";
import SidebarWaiter from "../../Components/Waiter/Sidebar";
import { useHealthContext } from "../../Context/Loggedin/HealthContext";
import LoginPromptBanner from "../../Components/Loggedin/LoginPromptBanner";
import CallForWaiterIcon from "/callforwaitericon.svg";
import VegIcon from "/vegicon.svg";
import NonVegIcon from "/nonvegicon.svg";
import CartButton from "../../Components/Loggedin/CartButton";
import Header from "../../Components/Loggedin/Header";
import ProductDetails from "../../Components/Loggedin/ProductDetails";
import FilterModal from "../../Components/Loggedin/FilterModal";
import FilterPopup from "../../Components/Waiter/FilterPopup";
import ExitConfirmModal from "../../Components/Loggedin/ExitConfirmModal";
import useExitConfirmation from "../../hooks/useExitConfirmation";
import api, { waiterAPI } from "../../utils/api";
import toast from "react-hot-toast";
import { useMenu } from "../../Context/MenuContext";
import { useDineInLock as useDineInLockState } from "../../utils/dineInSession";
import { sizedImage, ALL_CATEGORY_IMAGE, COMBO_CATEGORY_IMAGE } from "../../utils/image";
import { resolveUnitPrice, formatPrice } from "../../utils/pricing";
import BestoDineMark from "../../assets/BestoDineMark";
import { useFavorites } from "../../utils/favorites";
import useCustomerSession from "../../hooks/useCustomerSession";

// Consistent horizontal padding value
const SECTION_PADDING = "px-4";

// Featured Carousel — 3-up coverflow.
//
// Renders a fixed window of three cards: the active item dead-centre
// at full size and its immediate neighbours peeking from each side
// at ~80% scale and reduced opacity. Cards farther than one step
// from the active index are positioned off-screen and faded out, so
// at any moment the user only sees three regardless of how many
// featured items the tenant has.
//
// Navigation: tap a side card to focus it, swipe horizontally on
// touch devices, or click a dot below. Index wraps circularly so
// the last item's "next" is the first item — useful when the tenant
// has only 4–5 featured items.
const FeaturedCarousel = ({ featuredItems = [], onAddToCart }) => {
  const items = featuredItems;
  const scrollRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(0);

  // ── Infinite loop strategy ──────────────────────────────────────────
  // Native horizontal scroll has hard edges, so to fake an infinite
  // rolling carousel we render the items THREE TIMES and silently
  // teleport the user back to the equivalent card in the middle copy
  // whenever they drift into the first or last copy.
  //
  // Because all three copies are identical, the jump is imperceptible
  // — the user keeps swiping forever in either direction and the
  // strip behaves like a closed ring.
  //
  // Skipped when items.length <= 1 (loop is pointless with one card).
  const triple = useMemo(() => {
    if (items.length <= 1) return items;
    return [...items, ...items, ...items];
  }, [items]);

  // Helper: centre a specific child (by index in `triple`) into the
  // viewport. `instant === true` disables the smooth scroll briefly
  // for the silent boundary-teleport.
  const centreChild = useCallback((childIdx, instant = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[childIdx];
    if (!card) return;
    const target = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
    if (instant) {
      const prev = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollLeft = target;
      // Restore on the next frame so any future programmatic scrolls
      // are smooth again.
      requestAnimationFrame(() => { el.style.scrollBehavior = prev; });
    } else {
      el.scrollTo({ left: target, behavior: 'smooth' });
    }
  }, []);

  // Initial mount + items-changed: jump the scroll position to the
  // first card of the MIDDLE copy so the user has room to swipe in
  // either direction before hitting a boundary.
  useEffect(() => {
    if (items.length <= 1) return;
    // Wait one frame for the cloned children to lay out.
    const id = requestAnimationFrame(() => centreChild(items.length, true));
    return () => cancelAnimationFrame(id);
  }, [items.length, centreChild]);

  // Track active card + silently teleport when in first/last copy.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    let teleportTimer;
    const compute = () => {
      const centre = el.scrollLeft + el.clientWidth / 2;
      const cards = Array.from(el.children);
      let closest = 0;
      let bestDist = Infinity;
      cards.forEach((card, i) => {
        const cardCentre = card.offsetLeft + card.offsetWidth / 2;
        const dist = Math.abs(cardCentre - centre);
        if (dist < bestDist) { bestDist = dist; closest = i; }
      });

      // Modulo'd into the original items range so the visual "active"
      // treatment maps back to the real index regardless of which
      // copy is currently centred.
      setActiveIdx(items.length > 0 ? closest % items.length : 0);

      // Debounced silent teleport — wait for snap to settle before
      // jumping, otherwise we fight the browser's native snap engine
      // mid-animation and the user sees a hiccup.
      if (items.length > 1) {
        clearTimeout(teleportTimer);
        teleportTimer = setTimeout(() => {
          const inFirstCopy = closest < items.length;
          const inLastCopy  = closest >= items.length * 2;
          if (inFirstCopy)  centreChild(closest + items.length, true);
          if (inLastCopy)   centreChild(closest - items.length, true);
        }, 180);
      }
    };

    compute();
    el.addEventListener('scroll', compute, { passive: true });
    window.addEventListener('resize', compute);
    return () => {
      el.removeEventListener('scroll', compute);
      window.removeEventListener('resize', compute);
      clearTimeout(teleportTimer);
    };
  }, [items.length, centreChild]);

  if (items.length === 0) return null;

  return (
    <section className="bg-white -mx-4">
      <div
        ref={scrollRef}
        // Bigger cards + tighter peek per the latest mock. Math:
        //   centred card spans (50% - w/2) to (50% + w/2).
        //   With w=72%, centre card sits at 14%..86%, so the previous
        //   card peeks for ~14% of the viewport (≈ 19% of its own
        //   width) — enough to read as "there's more here" without
        //   eating into the middle card's real estate.
        //   px-[14%] is the matching scroll-padding so the first +
        //   last cards can actually reach centre (snap-center won't
        //   align a card past the edge of its scroll padding).
        // pt-1/pb-3 strips the surplus white-space above the strip
        // that the user flagged.
        className="flex gap-2 overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar pt-1 pb-3 px-[14%]"
      >
        {triple.map((item, i) => {
          // Map cloned index back to the original-items index so the
          // "active" highlight tracks the underlying item, not the
          // particular copy that's currently centred. Without modulo,
          // two clones of the same item could both look active during
          // the boundary-teleport window.
          const originalIdx = items.length > 0 ? i % items.length : 0;
          const isActive = originalIdx === activeIdx;
          return (
            <div
              key={`${item._id || item.id || originalIdx}-${i}`}
              onClick={() => onAddToCart?.(item)}
              className={`snap-center shrink-0 w-[72%] sm:w-[48%] md:w-[34%] aspect-[4/5] relative rounded-[20px] overflow-hidden cursor-pointer transition-all duration-300 origin-center ${
                isActive
                  ? 'scale-100 opacity-100 shadow-[0_20px_40px_-12px_rgba(0,0,0,0.28),_0_8px_20px_-8px_rgba(0,0,0,0.15)]'
                  : 'scale-[0.84] opacity-95 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.15)]'
              }`}
            >
              <img
                src={sizedImage(item.image, { w: 360 })}
                alt={item.title}
                className="w-full h-full object-cover"
                draggable={false}
                loading={originalIdx < 2 ? 'eager' : 'lazy'}
                decoding="async"
              />
              {/* Strong bottom gradient → legible title/price over any
                  food photography; top stays clean. */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              <div className="absolute bottom-0 left-0 right-0 p-3 md:p-4 text-white">
                <h3 className="text-[14px] md:text-base font-nunito font-bold truncate leading-tight">
                  {item.title}
                </h3>
                {item.desc && (
                  <p className="text-[11px] md:text-xs text-gray-200 opacity-90 line-clamp-1 mt-0.5">
                    {item.desc}
                  </p>
                )}
                <div className="flex items-end justify-between mt-2">
                  <span className="text-[16px] md:text-[17px] font-bold leading-none">₹{formatPrice(item.price)}</span>
                  {/* Plus button visible on ALL cards (including side
                      peeks) so the reference's "every card has its own
                      add button" feel is preserved. */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToCart?.(item);
                    }}
                    className="w-9 h-9 md:w-10 md:h-10 bg-orange-500 rounded-full flex items-center justify-center text-white shadow-[0_4px_12px_rgba(254,131,1,0.5)] active:scale-95 transition-transform flex-shrink-0"
                    aria-label={`Add ${item.title} to cart`}
                  >
                    <Plus size={18} strokeWidth={2.5} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

// Menu Item Component (Regular Mode)
const MenuItem = ({
  title,
  desc,
  price,
  image = "https://placehold.co/200x200?text=No+Image",
  time = "--",
  serves = "--",
  isVeg,
  onClick,
  onAddToCart,
  onIncrease,
  onDecrease,
  quantity = 0,
  id,
  // Dine-in lock — when true, every Add / +/- control on the card
  // becomes a styled disabled button. Card itself is still tappable
  // so the customer can browse details (read-only).
  disabled = false,
}) => {
  // Use fallbacks for required display fields
  const displayTitle = title || "Untitled Item";
  const displayPrice = price || 0;
  const displayImage = image || "https://placehold.co/200x200?text=No+Image";

  const { has: hasFavorite, toggle: toggleFavoriteId } = useFavorites();
  const isFavorited = hasFavorite(id);

  return (
    <div
      onClick={onClick}
      className="flex flex-col min-[375px]:flex-row gap-3.5 p-2 md:p-4 bg-[#FFFFFF] rounded-[16px] border border-[#F6F6F6] mb-2 sm:mb-3 md:mb-4 active:scale-[0.98] transition-transform cursor-pointer"
      role="button"
      tabIndex="0"
    >
      <div className="relative flex-shrink-0 w-full h-[180px] min-[375px]:w-[110px] min-[375px]:h-auto md:w-[130px] md:h-[130px]">
        <img
          src={sizedImage(displayImage, { w: 180 })}
          alt={displayTitle}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover rounded-[10px]"
          onError={(e) => {
            e.target.src = "https://placehold.co/200x200?text=No+Image";
          }}
        />
        {isVeg !== undefined && (
          <img
            src={isVeg ? VegIcon : NonVegIcon}
            alt={isVeg ? "Veg" : "Non-Veg"}
            className="absolute top-2 left-2 h-[14px] w-[14px]"
          />
        )}
        {/* Favorite (heart) — stopPropagation so tapping the heart
            doesn't also open the product details modal. */}
        {id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavoriteId(id); }}
            aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorited}
            className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <Heart
              size={16}
              strokeWidth={2}
              className={isFavorited ? "text-[#E11D48] fill-[#E11D48]" : "text-[#667085]"}
            />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between py-1">
        <div>
          <h3 className="font-semibold text-16 sm:text-base md:text-lg leading-tight mb-1 text-[#333333] nunito">
            {displayTitle}
          </h3>
          <p className="text-[14px] font-normal text-[#645E66] line-clamp-2 mb-2 varela-rounded">
            {desc || "No description available"}
          </p>
          <div className="flex items-center gap-2 text-[9px] sm:text-[10px] md:text-xs text-gray-400">
            {/* Dynamic meta pills — only render when the backend supplied a
                value. No hardcoded defaults; the admin's cookingTime and
                serveUpto are the single source of truth. */}
            {time && time !== '--' && (
              <span className="flex items-center gap-1 rounded-[16px] px-2 py-0.5 bg-[#F6F6F6] text-[#645E66] text-[10px] varela-rounded">
                <Clock size={12} /> {typeof time === 'number' ? `${time} min` : time}
              </span>
            )}
            {serves && serves !== '--' && (
              <span className="flex items-center gap-1 rounded-[16px] px-2 py-0.5 bg-[#F6F6F6] text-[#645E66] text-[10px] varela-rounded">
                <i className="fi fi-rs-restaurant"></i> Serves {serves}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2">
          <span className="font-bold nunito text-base sm:text-[20px] md:text-xl text-gray-800">
            ₹{typeof displayPrice === "number" ? formatPrice(displayPrice) : displayPrice}
          </span>
          {/* Settled dine-in visit: no ordering controls at all. */}
          {disabled ? null : quantity > 0 ? (
            <div className={`flex items-center gap-2 rounded-[10px] px-2 py-1 border ${
              disabled
                ? 'bg-gray-100 border-gray-200'
                : 'bg-orange-50 border-orange-200'
            }`}>
              <button
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  onDecrease && onDecrease();
                }}
                className={`font-bold w-6 h-6 flex items-center justify-center active:scale-90 ${
                  disabled ? 'text-gray-400 cursor-not-allowed' : 'text-orange-600'
                }`}
              >
                <i className="fi fi-br-minus-small text-[16px]"></i>
              </button>
              <span className={`font-bold text-sm w-5 text-center ${disabled ? 'text-gray-400' : ''}`}>{quantity}</span>
              <button
                disabled={disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  if (disabled) return;
                  onIncrease && onIncrease();
                }}
                className={`font-bold w-6 h-6 flex items-center justify-center active:scale-90 ${
                  disabled ? 'text-gray-400 cursor-not-allowed' : 'text-orange-600'
                }`}
              >
                <i className="fi fi-br-plus-small text-[16px]"></i>
              </button>
            </div>
          ) : (
            <button
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (disabled) return;
                onAddToCart && onAddToCart({ id, title, desc, price, image, isVeg, quantity: 1, time, serves });
              }}
              title={disabled ? 'Bill settled — re-scan QR to order' : undefined}
              className={`pr-[16px] pl-[12px] py-2 rounded-[10px] flex items-center justify-center active:scale-95 gap-1 transition-colors ${
                disabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#FE8301] text-white'
              }`}
            >
              {disabled ? (
                <>
                  <i className="fi fi-sr-lock flex items-center text-[14px]"></i>
                  <span className="font-semibold nunito text-[14px]">Locked</span>
                </>
              ) : (
                <>
                  <i className="fi fi-sr-plus-small flex items-center text-[16px]"></i>
                  <span className="font-semibold nunito text-[14px]">Add</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Health Mode Menu Item Component (Advanced)
const HealthMenuItem = ({
  title,
  desc,
  price,
  image,
  calories,
  protein,
  fats,
  fibre,
  carbs,
  iron,
  isVeg,
  time,
  serves,
  onClick,
  onAddToCart,
  onIncrease,
  onDecrease,
  quantity = 0,
  id,
  healthMode = false,
  disabled = false,
}) => {
  const scrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);

  const macros = useMemo(
    () =>
      [
        { label: "Protein", value: protein, unit: "g" },
        { label: "Fats", value: fats, unit: "g" },
        { label: "Fibre", value: fibre, unit: "g" },
        { label: "Carbs", value: carbs, unit: "g" },
        { label: "Iron", value: iron, unit: "mg" },
      ].filter((m) => m.value !== undefined && Number(m.value) > 0),
    [protein, fats, fibre, carbs, iron],
  );

  // Real nutrition present? An item added without macro data carries 0s,
  // and a strip full of "0g" reads as broken — so when there's nothing
  // real to show we fall back to the description (like normal mode).
  const hasNutrition = (Number(calories) || 0) > 0 || macros.length > 0;

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setShowLeftArrow(scrollLeft > 5);
      setShowRightArrow(scrollWidth > clientWidth + 5 && scrollLeft < scrollWidth - clientWidth - 5);
    }
  };

  const scroll = (direction) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: direction === "right" ? 80 : -80, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      handleScroll();
      el.addEventListener("scroll", handleScroll);
      window.addEventListener("resize", handleScroll);
      return () => {
        el.removeEventListener("scroll", handleScroll);
        window.removeEventListener("resize", handleScroll);
      };
    }
  }, [macros]);

  const displayTitle = title || "Untitled Item";
  const displayPrice = price || 0;
  const displayImage = image || "https://placehold.co/200x200?text=No+Image";

  const { has: hasFavorite, toggle: toggleFavoriteId } = useFavorites();
  const isFavorited = hasFavorite(id);

  return (
    <div
      onClick={onClick}
      // Uniform card height on desktop (min-h) so a short item matches the
      // taller nutrition cards instead of every card being a different
      // size. Price stays pinned to the bottom (justify-between) and the
      // image stretches to fill, so the extra room reads as intentional.
      className="flex flex-col min-[375px]:flex-row gap-3 p-2 md:p-4 bg-white border border-[#F6F6F6] rounded-2xl mb-[10px] md:mb-4 cursor-pointer active:scale-[0.98] transition-all duration-200 min-[375px]:min-h-[175px] md:min-h-[182px]"
      role="button"
    >
      {/* Image is absolutely positioned so its natural height no longer
          drives the card height. On desktop the card sizes to its CONTENT
          and the image stretches to match — so a short item (e.g. a water
          bottle with no nutrition strip) no longer leaves a white gap
          between the meta and the price. Mobile keeps a fixed 100px. */}
      <div className="relative w-full min-[375px]:w-[100px] sm:w-28 md:w-32 flex-shrink-0 h-[100px] min-[375px]:h-auto min-[375px]:self-stretch overflow-hidden rounded-xl">
        <img
          src={sizedImage(displayImage, { w: 140 })}
          alt={displayTitle}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover rounded-xl min-[375px]:absolute min-[375px]:inset-0"
          onError={(e) => { e.target.src = "https://placehold.co/200x200?text=No+Image"; }}
        />
        {isVeg !== undefined && (
          <div className="absolute top-2 left-2 z-10">
            <div className={`w-[18px] h-[18px] border-2 ${isVeg ? "border-[#00B050]" : "border-[#E31E24]"} rounded-[3px] bg-white flex items-center justify-center`}>
              <div className={`w-[9px] h-[9px] ${isVeg ? "bg-[#00B050]" : "bg-[#E31E24]"} rounded-full`} />
            </div>
          </div>
        )}
        {id && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleFavoriteId(id); }}
            aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={isFavorited}
            className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-white/90 backdrop-blur-sm shadow-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <Heart
              size={16}
              strokeWidth={2}
              className={isFavorited ? "text-[#E11D48] fill-[#E11D48]" : "text-[#667085]"}
            />
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-between py-1 min-w-0">
        <div>
          <h3 className="font-semibold font-nunito text-[#1A181B] text-[16px] sm:text-lg leading-[22px] truncate mb-1">
            {displayTitle}
          </h3>

          {/* Description/caption — now shown in Health Mode too (it was
              missing). For an item with no nutrition data this is all that
              shows under the title (no broken all-"0g" strip below). */}
          {desc && (
            <p className="text-[12px] sm:text-[13px] font-varela text-[#8D848F] line-clamp-1 mb-1">
              {desc}
            </p>
          )}

          {/* Cooking time + serves — quick meta the diner scans before
              ordering. Each renders only when the admin set a value. */}
          {(time || serves) && (
            <div className="flex items-center gap-3 mb-1">
              {time && (
                <span className="inline-flex items-center gap-1 text-[11px] sm:text-[12px] font-varela text-[#8D848F]">
                  <Clock size={12} className="text-[#A79DAA]" /> {time}
                </span>
              )}
              {serves && (
                <span className="inline-flex items-center gap-1 text-[11px] sm:text-[12px] font-varela text-[#8D848F]">
                  <Users size={12} className="text-[#A79DAA]" /> Serves {serves}
                </span>
              )}
            </div>
          )}

          {healthMode && hasNutrition && (
            <div className="flex items-center gap-2 min-[375px]:gap-3 mb-1">
              {calories && (
                <div className="relative w-[40px] h-[40px] sm:w-[50px] sm:h-[50px] rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: "conic-gradient(#B3FF49 0deg 280deg, #FBFBFB 280deg 360deg)" }}>
                  <div className="absolute inset-[3px] sm:inset-[4px] bg-white rounded-full flex flex-col items-center justify-center">
                    <span className="text-[10px] font-varela sm:text-sm text-[#645E66] leading-none">{calories}</span>
                    <span className="text-[8px] font-varela sm:text-[10px] text-[#645E66] leading-none">kcal</span>
                  </div>
                </div>
              )}
              {macros.length > 0 && (
                <div className="relative flex items-center bg-[#F8FFEF] rounded-[9px] flex-1 min-w-0 overflow-hidden">
                  {showLeftArrow && (
                    <button onClick={(e) => { e.stopPropagation(); scroll("left"); }} className="absolute left-0 z-10 bg-[#F8FFEF]/80 p-0.5"><ChevronLeft size={14} /></button>
                  )}
                  <div ref={scrollRef} className="flex items-center w-full overflow-x-auto scrollbar-hide px-2 py-1">
                    {macros.map((macro, idx) => (
                      <div key={idx} className="flex flex-col items-center flex-shrink-0 min-w-[50px]">
                        <span className="font-varela text-[10px] sm:text-sm text-[#645E66]">{macro.value}{macro.unit}</span>
                        <span className="font-varela text-[8px] sm:text-[10px] text-[#645E66]">{macro.label}</span>
                      </div>
                    ))}
                  </div>
                  {showRightArrow && (
                    <button onClick={(e) => { e.stopPropagation(); scroll("right"); }} className="absolute right-0 z-10 bg-[#F8FFEF]/80 p-0.5"><ChevronRight size={14} /></button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="font-semibold font-nunito text-[20px] text-[#1A181B]">
            ₹{typeof price === "number" ? formatPrice(price) : price}
          </span>
          {disabled ? null : quantity > 0 ? (
            <div className={`flex items-center justify-between px-1 rounded-[10px] py-2 text-[14px] font-medium min-w-[80px] border ${
              disabled ? 'bg-gray-100 border-gray-200' : 'bg-[#FAFAFA] border-[#F4F4F4]'
            }`}>
              <button
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); if (disabled) return; onDecrease(); }}
                className={`w-7 flex items-center justify-center active:scale-75 ${disabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
              >
                <Minus size={14} strokeWidth={3} />
              </button>
              <span className={`text-center ${disabled ? 'text-gray-400' : ''}`}>{quantity}</span>
              <button
                disabled={disabled}
                onClick={(e) => { e.stopPropagation(); if (disabled) return; onIncrease(); }}
                className={`w-7 flex items-center justify-center active:scale-75 ${disabled ? 'text-gray-400 cursor-not-allowed' : ''}`}
              >
                <Plus size={14} strokeWidth={3} />
              </button>
            </div>
          ) : (
            <button
              disabled={disabled}
              title={disabled ? 'Bill settled — re-scan QR to order' : undefined}
              className={`pr-4 pl-3 rounded-[10px] py-2 text-[14px] font-semibold flex items-center gap-1 active:scale-95 transition-colors ${
                disabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-[#FE8301] text-[#FFFFFF]'
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (disabled) return;
                onAddToCart && onAddToCart({ id, title, desc, price, image, isVeg, calories, protein, fats, fibre, carbs, iron, quantity: 1 });
              }}
            >
              {disabled ? (
                <>
                  <i className="fi fi-sr-lock text-[12px]" />
                  <span>Locked</span>
                </>
              ) : (
                <>
                  <Plus size={16} strokeWidth={3} />
                  <span>Add</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Categories carousel using real data
const CategoriesCarousel = ({ categories = [], activeId, onCategoryClick }) => {
  return (
    <div className="relative px-4 -mx-4">
      <div className="flex gap-4 md:gap-5 lg:gap-6 overflow-x-auto pb-2 no-scrollbar">
        {categories.map((item) => (
          <div
            key={item._id}
            onClick={() => onCategoryClick(item._id)}
            title={item.name}
            className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer transition-all active:scale-95 w-20 sm:w-24 md:w-28 lg:w-32 xl:w-36"
          >
            <div className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 xl:w-36 xl:h-36 rounded-full overflow-hidden border-2 transition-all ${activeId === item._id ? 'border-orange-500 p-0.5' : 'border-gray-100 shadow-sm'}`}>
              <img src={sizedImage(item.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c", { w: 120 })} alt={item.name} loading="lazy" decoding="async" className="w-full h-full object-cover rounded-full" />
            </div>
            {/*
              Let long names wrap to up to 2 lines within the 84px column
              instead of overflowing (whitespace-nowrap was the cause of
              the overlap with neighbours). break-words handles names that
              are a single very-long token.
            */}
            <span
              className={`w-full text-center align-middle font-nunito font-semibold tracking-normal break-words line-clamp-2
                text-[14px] leading-[16px]
                sm:text-[15px] sm:leading-[18px]
                md:text-[16px] md:leading-[20px]
                lg:text-[17px] lg:leading-[22px]
                xl:text-[18px] xl:leading-[24px]
                ${activeId === item._id ? 'text-orange-500' : 'text-gray-600'}`}
            >
              {item.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const MENU_CARD_CV_STYLE = { contentVisibility: 'auto', containIntrinsicSize: 'auto 160px' };

function Home() {
  const { id: routeCategoryId } = useParams();
  const navigate = useNavigate();
  // Router location (NOT window.location, which has no `.state`) — the
  // search-result deep link below reads `state.productId` from here.
  const location = useLocation();
  const { isLoggedIn, isGuest, isStaff } = useAuth();

  // Exit-confirmation guard for the customer landing page. Customers
  // reach /customer/home from a QR scan or branch pick and an accidental
  // back tap would dump them out of the flow with no way back. The
  // guard only runs on the bare home — never for staff, and never on
  // the /customer/item/:id sub-view (back there should close the item
  // details, not nag).
  const exitGuardEnabled = !isStaff && !routeCategoryId;
  const exitGuard = useExitConfirmation(exitGuardEnabled);
  const { cartItems, updateQuantity, totalItems, totalPrice } = useCart();
  const { healthMode, dietPreference, setDietPreference, toggleHealthMode } = useHealthContext();
  const { 
    menuItems: contextMenuItems, 
    categories: contextCategories, 
    combos: contextCombos,
    menuLoading,
    comboLoading,
    menuPagination,
    comboPagination,
    fetchMenuItems,
    fetchCategories,
    fetchCombos
  } = useMenu();

  const [activeCategoryId, setActiveCategoryId] = useState(routeCategoryId || "all");
  const [page, setPage] = useState(1);

  // Carousel = top sellers across categories. Strategy:
  //   1. Bucket every active menu item by its category id.
  //   2. Cold-start detection: if NO item has any orderCount yet (fresh
  //      tenant, no orders placed), the signal is meaningless — fall
  //      back to "1 item per category" so the strip still feels diverse
  //      and represents the whole menu instead of arbitrarily picking 3
  //      items from whichever bucket happens to be first.
  //   3. Normal path: within each bucket, sort by orderCount DESC
  //      (qty-weighted; bumped in orderController.bumpMenuItemOrderCounts
  //      on every order create/append, so it's an actual sales signal —
  //      not just rating). Take up to 3 per category; tiebreak by
  //      averageRating.
  //   4. Final cross-category sort by the chosen signal so the BIGGEST
  //      sellers (or best-rated items in cold-start) land at the front.
  //
  // Caveat: contextMenuItems is paginated (12 at a time). On a tenant
  // with many categories, the first page may not include any items
  // from long-tail categories, so the carousel will skew toward popular
  // categories until infinite-scroll loads more. Acceptable for v1.
  const featuredItems = useMemo(() => {
    if (!contextMenuItems || contextMenuItems.length === 0) return [];

    const activeItems = contextMenuItems.filter(i => i.status !== 'inactive');
    if (activeItems.length === 0) return [];

    // Cold-start: zero sales recorded across the whole loaded set.
    // Switch to "one-per-category" mode and rank by rating + image
    // presence so the picks still look intentional, not random.
    //
    // Normal mode: 2 items per category. The per-bucket sort is by
    // orderCount DESC, so the carousel is effectively "top 2 sellers
    // per category" — guaranteeing every category gets a fair shake
    // while still surfacing the biggest hits at the front of the
    // global swipe (the final cross-category sort below).
    const isColdStart = activeItems.every(i => (i.orderCount || 0) === 0);
    const perCategoryLimit = isColdStart ? 1 : 2;

    const byCategory = new Map();
    for (const item of activeItems) {
      const catId = String(item.category?._id || item.category || 'uncategorized');
      if (!byCategory.has(catId)) byCategory.set(catId, []);
      byCategory.get(catId).push(item);
    }

    const coldStartSort = (a, b) => {
      // Prefer items with images first (carousel cards need a photo
      // to land), then higher rating, then newest. Keeps the cold-
      // start strip from being a bland "first item we found" list.
      const aHasImg = (a.images?.length || 0) > 0 ? 1 : 0;
      const bHasImg = (b.images?.length || 0) > 0 ? 1 : 0;
      if (bHasImg !== aHasImg) return bHasImg - aHasImg;
      const ar = a.averageRating || 0;
      const br = b.averageRating || 0;
      if (br !== ar) return br - ar;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    };

    const bestSellerSort = (a, b) => {
      const oa = a.orderCount || 0;
      const ob = b.orderCount || 0;
      if (ob !== oa) return ob - oa;
      return (b.averageRating || 0) - (a.averageRating || 0);
    };

    const withinCategorySort = isColdStart ? coldStartSort : bestSellerSort;

    const picked = [];
    for (const [, bucket] of byCategory) {
      const topPerCategory = [...bucket].sort(withinCategorySort).slice(0, perCategoryLimit);
      picked.push(...topPerCategory);
    }

    return picked
      .sort(withinCategorySort)
      .slice(0, 8)
      .map(item => ({
        _id: item._id,
        id: item._id,
        title: item.name,
        desc: item.description || item.shortDescription || '',
        price: resolveUnitPrice(item),
        image: item.images?.[0] || 'https://placehold.co/400x400?text=Menu+Item',
        menuItem: item,
      }));
  }, [contextMenuItems]);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showCartNotification, setShowCartNotification] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeFilters, setActiveFilters] = useState({ priceRange: [0, 1000], preference: null, offers: [], healthyMode: false });
  const [orderType, setOrderType] = useState(() => localStorage.getItem("orderType") || "dine-in");

  const categories = contextCategories;
  const loading = menuLoading || comboLoading;

  const [requestLoading, setRequestLoading] = useState({ water: false, waiter: false });
  // Dine-in session lock — true once the bill is settled but customer
  // hasn't re-scanned the QR yet. Used to visually disable service-
  // request and ordering buttons across the page so the customer
  // doesn't tap something that'll only respond with a "locked" toast.
  const dineInLocked = useDineInLockState();
  // One source of truth for "what may this customer do right now".
  // The service buttons below are HIDDEN (not merely greyed) once the
  // bill is settled: a disabled "🔒 Locked" button invites tapping and
  // explains nothing. See hooks/useCustomerSession.
  const customerSession = useCustomerSession();

  const handleServiceRequest = async (type) => {
    // Dine-in lock — once the bill is settled, no more service
    // requests until the customer re-scans the table QR. Mirrors
    // the cart Add-button lock so every "ask staff for something"
    // surface stays consistent.
    const { isDineInLocked } = await import('../../utils/dineInSession');
    if (isDineInLocked()) {
      toast(
        'Bill settled. Re-scan the table QR to request anything.',
        { id: 'dine-in-locked', icon: '🔒', duration: 4000 }
      );
      return;
    }

    let dineInTable = {};
    try {
      dineInTable = JSON.parse(localStorage.getItem('dineInTable') || '{}');
    } catch {
      dineInTable = {};
    }
    if (!dineInTable._id) {
      toast.error('No table found. Please scan the QR code first.');
      return;
    }
    if (requestLoading[type]) return; // Prevent double-submission

    setRequestLoading(prev => ({ ...prev, [type]: true }));
    try {
      const res = await waiterAPI.createRequest({
        tableId: dineInTable._id,
        type,
        items: type === 'water' ? [{ label: 'Water', qty: 1 }] : [],
        priority: 'medium',
      });
      if (res?.data?.success) {
        toast.success(type === 'water' ? 'Water request sent!' : 'Waiter has been called!');
      } else {
        toast.error(res?.data?.message || 'Failed to send request');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to send request. Try again.');
    } finally {
      setRequestLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  // Reordered categories for the Staff/Waiter horizontal list
  const reorderedCategories = useMemo(() => {
    const list = [...categories];
    if (activeCategoryId === 'all') return list;
    return list.sort((a, b) => {
      if (a._id === activeCategoryId) return -1;
      if (b._id === activeCategoryId) return 1;
      return 0;
    });
  }, [activeCategoryId, categories]);

  // Unified Filtering Logic
  const displayItems = useMemo(() => {
    // 1. Handle Virtual Combo Category.
    // Only ACTIVE combos are orderable — drop draft/archived ones. The
    // anonymous bootstrap already status-filters, but the logged-in
    // /combos fetch returns every status, so a combo auto-archived when
    // one of its menu items was deleted/disabled would otherwise still
    // show here. Filtering on status keeps that guarantee on both paths.
    if (activeCategoryId === "combo") {
      return contextCombos
        .filter(c => c.status === 'active')
        .map(c => ({
          ...c,
          isCombo: true
        }));
    }

    // 2. Filter Regular Menu Items
    let filtered = [...contextMenuItems];

    if (activeCategoryId !== "all") {
      filtered = filtered.filter(item => {
        const itemCatId = item.category?._id || item.category;
        return String(itemCatId) === String(activeCategoryId);
      });
    }

    if (healthMode) {
      filtered = filtered.filter(p => p.isHealthy);
    }

    // Diet preference comes from TWO sources:
    //   1. Global header toggle → dietPreference (context)
    //   2. Filter modal → activeFilters.preference
    // The filter modal value wins when set; otherwise fall back to the
    // header toggle. This keeps the two UIs from fighting each other.
    //
    // 'mix' (new default) and the legacy 'all' both mean "no diet
    // filter" — let everything through so the user sees the full menu.
    const activeDiet = activeFilters?.preference || dietPreference;
    if (activeDiet && activeDiet !== 'all' && activeDiet !== 'mix') {
      filtered = filtered.filter(p =>
        activeDiet === 'veg' ? (p.vegType === 'veg') : (p.vegType === 'non-veg')
      );
    }

    // Price filter: match against the displayed price (finalPrice after
    // discount), not the raw basePrice. If the user says "Under ₹200"
    // they're reading the visible number, not the pre-discount price.
    if (Array.isArray(activeFilters?.priceRange)) {
      const [min, max] = activeFilters.priceRange;
      filtered = filtered.filter(p => {
        const price = resolveUnitPrice(p);
        return price >= (min ?? 0) && price <= (max ?? Infinity);
      });
    }

    // Offers filter: when the user picks any offers option, only keep
    // items currently running a discount. Items with offerPercentage > 0
    // are the ones the "Flat X% OFF" ribbon would have rendered on.
    if (Array.isArray(activeFilters?.offers) && activeFilters.offers.length > 0) {
      filtered = filtered.filter(p => (p.offerPercentage || 0) > 0);
    }

    return filtered;
  }, [activeCategoryId, contextMenuItems, contextCombos, healthMode, dietPreference, activeFilters]);

  // Bare-home render cap.
  //
  // The customer landing ('all', no routeCategoryId) is a fast TEASER —
  // the full catalogue is browsed one category at a time via the
  // category cards. Rendering every item here (a tenant may have
  // thousands) is exactly what froze the page on open. We cap the DOM
  // to a single screenful; the categories carousel directly above is
  // the path to "see everything". Category-detail + staff views render
  // their full (already paginated) list unchanged.
  const BARE_HOME_RENDER_CAP = 24;
  const isBareHome = !routeCategoryId && !isStaff && activeCategoryId === 'all';
  const visibleItems = useMemo(
    () => (isBareHome ? displayItems.slice(0, BARE_HOME_RENDER_CAP) : displayItems),
    [isBareHome, displayItems]
  );
  const bareHomeHasMore = isBareHome && displayItems.length > BARE_HOME_RENDER_CAP;

  // Load More Logic
  const hasMore = useMemo(() => {
    const pagination = activeCategoryId === "combo" ? comboPagination : menuPagination;
    return pagination.currentPage < pagination.totalPages;
  }, [activeCategoryId, menuPagination, comboPagination]);

  // Refs into the latest props/state so the IntersectionObserver
  // callback always sees fresh values. Previously handleLoadMore was a
  // plain function that closed over `activeCategoryId` + `page` etc.,
  // and the observer effect only depended on [isStaff, hasMore, loading].
  // When the user switched category, the observer kept the OLD
  // handleLoadMore until the cleanup/re-create cycle finished — and the
  // queued IntersectionObserver callback fired ONCE with the stale
  // closure, firing a `/menu?page=2` request with the previous
  // category param. Using refs lets the observer attach once and still
  // dispatch the latest fetch params.
  const loadMoreCtxRef = useRef({});
  loadMoreCtxRef.current = {
    page, activeCategoryId, healthMode, dietPreference, hasMore,
    fetchMenuItems, fetchCombos, setPage,
  };

  const handleLoadMore = useCallback(() => {
    const c = loadMoreCtxRef.current;
    if (!c.hasMore) return;
    const nextPage = c.page + 1;
    c.setPage(nextPage);

    const params = {
      page: nextPage,
      limit: 12,
      category: c.activeCategoryId === 'all' || c.activeCategoryId === 'combo' ? undefined : c.activeCategoryId,
      isHealthy: c.healthMode || undefined,
      // 'mix' (new default) and legacy 'all' both mean "send no diet
      // filter to the backend" so the API returns the full menu.
      type: (c.dietPreference === 'all' || c.dietPreference === 'mix') ? undefined : c.dietPreference,
    };

    if (c.activeCategoryId === 'combo') {
      c.fetchCombos(params, true);
    } else {
      c.fetchMenuItems(params, true);
    }
  }, []);

  // Infinite scroll (customer only) — observe a sentinel near the bottom
  // of the list. handleLoadMore reads from a ref so we don't need to
  // re-create the observer when category / page / filters change.
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (isStaff) return;
    if (!hasMore || loading) return;
    const el = loadMoreRef.current;
    if (!el) return;

    // Snapshot the category at observer-create time. If the user
    // switches category between now and when the observer fires, we
    // bail out — the new category's own observer cycle will take over
    // and the OLD observer must not fire a stale page=N+1 fetch.
    const observerCategory = loadMoreCtxRef.current.activeCategoryId;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        const c = loadMoreCtxRef.current;
        if (!c.hasMore || c.activeCategoryId !== observerCategory) return;
        handleLoadMore();
      },
      { rootMargin: '240px 0px' } // start loading just before it enters view
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isStaff, hasMore, loading, activeCategoryId, handleLoadMore]);

  // Filter-change reset.
  //
  // Performance rewrite: previously this effect fired a network
  // `/menu?page=1&category=X&type=veg` call on EVERY category /
  // diet / health toggle. With the `/public/menu-bootstrap` payload
  // already in `contextMenuItems` (top-100 menu items, all categories,
  // both veg + non-veg), the displayItems memo above can satisfy every
  // category + diet + health + price filter CLIENT-SIDE without a
  // round-trip.
  //
  // BUG fix: this effect previously included `contextMenuItems.length`
  // + `contextCombos.length` in its dep array. Every infinite-scroll
  // pagination call appends to those arrays, changing their length —
  // which re-fired this effect on every scroll, calling setPage(1)
  // (clobbering the just-incremented page) and re-firing
  // fetchCategories. The visible symptom was a load flicker on each
  // scroll event. Length deps removed; the empty-context fallback
  // fetch lives in its own effect below that only watches the filter.
  //
  // NOTE: `activeFilters` is intentionally NOT in the dep array.
  // Price/offers filters apply purely client-side; keeping them out
  // stops a duplicate fetch per slider tick.
  useEffect(() => {
    setPage(1);
    // Categories are cheap and always-loaded — invalidate-from-cache only.
    fetchCategories();
  }, [activeCategoryId, healthMode, dietPreference, fetchCategories]);

  // Category fetch on category change.
  //
  // CUSTOMER (perf rewrite): a specific category ALWAYS re-fetches its
  // own items fresh from the server (page 1, limit 20). The customer
  // browses one category at a time via /customer/item/:id, so we no
  // longer depend on whatever slice happened to land in the lightweight
  // first-paint slab — a category with thousands of items now loads
  // quickly + completely, and tail categories beyond the bootstrap cap
  // are no longer silently empty. Infinite scroll (handleLoadMore)
  // appends page 2+. The bare-home 'all' view keeps using the
  // first-paint slab (a fast teaser) — no per-category fetch there.
  //
  // STAFF: unchanged. Keep the original "fetch only when the cache
  // can't satisfy the category" fallback — their state model + the
  // in-page (non-routed) category switch is out of scope here.
  useEffect(() => {
    if (isStaff) {
      const haveItems = activeCategoryId === 'combo'
        ? contextCombos.length > 0
        : activeCategoryId === 'all'
          ? contextMenuItems.length > 0
          : contextMenuItems.some(item => {
              const itemCatId = item.category?._id || item.category;
              return String(itemCatId) === String(activeCategoryId);
            });
      if (haveItems) return;
    } else if (activeCategoryId === 'all') {
      // Customer bare-home — served by the first-paint slab.
      return;
    }

    const params = {
      page: 1,
      limit: 20,
      category: activeCategoryId === 'all' || activeCategoryId === 'combo' ? undefined : activeCategoryId,
      isHealthy: healthMode || undefined,
      type: (dietPreference === 'all' || dietPreference === 'mix') ? undefined : dietPreference,
    };
    if (activeCategoryId === 'combo') fetchCombos(params);
    else fetchMenuItems(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCategoryId, healthMode, dietPreference, isStaff]);

  // Customer: returning to the bare home (routeCategoryId cleared) must
  // drop the per-category param results so the landing shows the
  // lightweight first-paint slab again — not the last category's items.
  // Guarded by a ref so it only fires when LEAVING a detail view (had a
  // category, now don't) and never on a cold bare-home mount.
  const prevRouteCatRef = useRef(routeCategoryId);
  useEffect(() => {
    const prev = prevRouteCatRef.current;
    prevRouteCatRef.current = routeCategoryId;
    if (isStaff || prev === routeCategoryId) return;
    if (prev && !routeCategoryId) {
      setActiveCategoryId('all');
      fetchMenuItems({}); // clears paramMenuItems → first-paint slab
      fetchCombos({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCategoryId, isStaff]);

  useEffect(() => {
    if (routeCategoryId) {
      setActiveCategoryId(routeCategoryId);
    }
  }, [routeCategoryId]);

  useEffect(() => {
    function syncOrderType() {
      setOrderType(localStorage.getItem("orderType") || "dine-in");
    }
    window.addEventListener("storage", syncOrderType);
    window.addEventListener("storage_sync", syncOrderType);
    return () => {
      window.removeEventListener("storage", syncOrderType);
      window.removeEventListener("storage_sync", syncOrderType);
    };
  }, []);

  // Deep-link / search-click → open product details modal.
  //
  // Critical: this effect must ALSO fire once the menu fetch completes,
  // not only on mount. Otherwise when a user clicks a search result,
  // the location.state.productId arrives BEFORE contextMenuItems has
  // loaded, the find() returns undefined, and we silently drop the
  // deep link. Adding the item arrays to the deps lets the effect re-
  // evaluate as soon as the data arrives, and we only wipe
  // location.state AFTER the modal has actually been opened.
  useEffect(() => {
    const productId = location.state?.productId;
    if (!productId || isProductModalOpen) return;
    // Wait for at least the menu fetch to resolve. If both arrays are
    // still empty there's nothing we can match against yet.
    if (contextMenuItems.length === 0 && contextCombos.length === 0) return;

    const allItems = [
      ...contextMenuItems,
      ...contextCombos.map(c => ({ ...c, isCombo: true })),
    ];
    const product = allItems.find(p => p._id === productId);
    if (product) {
      setSelectedProduct(product);
      setIsProductModalOpen(true);
      // Clear navigation state now that the modal is live, so closing
      // the modal (or a back + forward) doesn't re-open it. Done through
      // the router so its own history bookkeeping stays intact.
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.productId, contextMenuItems, contextCombos, healthMode, isProductModalOpen]);

  useEffect(() => {
    if (totalItems === 0) {
      setShowCartNotification(false);
    } else if (healthMode) {
      setShowCartNotification(true);
    }
  }, [totalItems, healthMode]);

  const getDefaultMenuItems = () => {
    if (healthMode) {
      return [
        { id: 101, title: "Greek Quinoa Bowl", desc: "Protein-rich quinoa with feta, olives, and fresh vegetables", price: 299, image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=300&q=80", calories: 320, protein: 12, fats: 8, fibre: 6, carbs: 45, iron: 2.1, isVeg: true },
        { id: 102, title: "Grilled Salmon Salad", desc: "Omega-rich salmon with mixed greens and avocado", price: 449, image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=300&q=80", calories: 380, protein: 28, fats: 18, fibre: 4, carbs: 10, iron: 1.8, isVeg: false },
        { id: 103, title: "Avocado Toast", desc: "Whole grain toast with fresh avocado and seeds", price: 249, image: "https://images.unsplash.com/photo-1541519227354-08fa5d50c44e?auto=format&fit=crop&w=300&q=80", calories: 280, protein: 8, fats: 14, fibre: 8, carbs: 32, iron: 1.2, isVeg: true },
        { id: 104, title: "Veggie Burger", desc: "Plant-based patty with fresh toppings", price: 199, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=300&q=80", calories: 340, protein: 18, fats: 12, fibre: 7, carbs: 42, iron: 3.5, isVeg: true },
      ];
    }
    return [
      { id: 1, title: "Spaghetti Bolognese", desc: "Classic Italian pasta with rich tomato meat sauce.", price: 279, image: "https://images.unsplash.com/photo-1622973536968-3ead9e780960?auto=format&fit=crop&w=300&q=80", time: "10-15 min", serves: "Serves 2", isVeg: false },
      { id: 2, title: "Margherita Pizza", desc: "Traditional pizza with fresh tomato, mozzarella, and basil.", price: 299, image: "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?auto=format&fit=crop&w=300&q=80", time: "15-20 min", serves: "Serves 2", isVeg: true },
      { id: 3, title: "Classic Cheeseburger", desc: "Juicy beef patty with cheddar cheese, lettuce, and tomato.", price: 249, image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=300&q=80", time: "10-15 min", serves: "Serves 1", isVeg: false },
    ];
  };

  const getItemQuantity = (itemId) => cartItems[itemId]?.quantity || 0;

  const handleOpenProductDetails = (product) => {
    setSelectedProduct(product);
    setIsProductModalOpen(true);
  };

  // Skeleton UI for fast perceived loading
  if (loading && displayItems.length === 0) return (
    <div className={`min-h-screen bg-white pb-32`}>
      {isStaff ? (
        <header className="px-6 py-4 flex items-center justify-between bg-white sticky top-0 z-10">
          <div className="h-6 w-32 bg-gray-100 animate-pulse rounded-lg" />
          <div className="h-5 w-20 bg-gray-100 animate-pulse rounded-lg" />
        </header>
      ) : (
        <div className="h-16 bg-white shadow-sm" />
      )}
      <div className="px-4 pt-4 space-y-4">
        {/* Category row skeleton */}
        <div className="flex gap-4 overflow-hidden">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="w-[70px] h-[70px] rounded-full bg-gray-100 animate-pulse" />
              <div className="w-12 h-3 bg-gray-100 animate-pulse rounded" />
            </div>
          ))}
        </div>
        {/* Card skeletons */}
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="flex gap-3 bg-white rounded-2xl p-3 border border-gray-50 shadow-sm">
            <div className="w-[100px] h-[100px] rounded-xl bg-gray-100 animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-2 py-1">
              <div className="h-4 bg-gray-100 animate-pulse rounded w-3/4" />
              <div className="h-3 bg-gray-100 animate-pulse rounded w-full" />
              <div className="h-3 bg-gray-100 animate-pulse rounded w-1/2" />
              <div className="flex justify-between items-center pt-1">
                <div className="h-5 bg-gray-100 animate-pulse rounded w-16" />
                <div className="h-8 w-8 bg-orange-100 animate-pulse rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen bg-white ${isStaff ? 'text-[#1A1A1A] overflow-x-hidden pt-env(safe-area-inset-top)' : 'transition-colors'} pb-32`}>
      {isStaff ? (
        <>
          <SidebarWaiter isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
          <header className="px-6 py-4 flex items-center justify-between bg-white sticky top-0 z-10">
            <div className="flex items-center gap-4">
              <button onClick={() => navigate(-1)} className="text-gray-600">
                <ChevronLeft size={28} />
              </button>
              <h1 className="text-[18px] font-semibold text-[#1A181B]">{activeCategoryId === 'all' ? 'All Category' : 'Category'}</h1>
            </div>
            {/* Hidden once the bill is settled — the visit is over, so
                a live table label would be misleading. Reads the shared
                session rather than poking localStorage inline. */}
            {customerSession.showTableChrome && (
              <div className="text-[14px] font-semibold text-[#8D848F]">
                Table {customerSession.table?.name || '—'}
              </div>
            )}
          </header>
        </>
      ) : routeCategoryId ? (
        /* Customer category-detail header — matches the design spec:
           ← All Category | Table no.X | bell. Skips the full Header
           component (logo / branch picker) since the user is already
           deep in browse mode and needs a focused header. */
        <header className="px-4 py-3 flex items-center justify-between bg-white sticky top-0 z-10 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/customer/home")}
              aria-label="Back to home"
              className="text-gray-700 active:scale-95 transition-transform"
            >
              <ChevronLeft size={26} strokeWidth={2} />
            </button>
            <h1 className="text-[18px] font-semibold text-[#1A181B] font-nunito">
              {activeCategoryId === 'all' || activeCategoryId === 'combo'
                ? 'All Category'
                : (categories.find(c => c._id === activeCategoryId)?.name || 'Category')}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {customerSession.showTableChrome && (() => {
              try {
                const t = JSON.parse(localStorage.getItem('dineInTable') || '{}');
                const name = t.name || localStorage.getItem('tableNumber');
                return name ? (
                  <span className="text-[13px] font-medium text-[#645E66]">
                    Table no.{name}
                  </span>
                ) : null;
              } catch { return null; }
            })()}
            <button
              onClick={() => navigate('/customer/notifications')}
              aria-label="Notifications"
              className="text-gray-700 active:scale-95 transition-transform"
            >
              <Bell size={22} strokeWidth={1.75} />
            </button>
          </div>
        </header>
      ) : (
        <Header />
      )}

      <main className={`flex flex-col px-4 ${isStaff ? 'gap-3 pt-1' : 'gap-4 pt-3'}`}>
        {(isStaff || routeCategoryId) && (
          /* Horizontal Categories — staff / item-route browsing view.
             Matches the customer Home CategoriesCarousel responsive scale
             and brand colors so both surfaces feel like one app.
             Tighter vertical padding for customer category-detail mode
             so the "Flavors You'll Come Back For!" heading sits close
             to the strip (no ~60px dead zone). */
          <div className="pt-3 pb-1 overflow-x-auto flex gap-4 md:gap-5 lg:gap-6 no-scrollbar">
            {(() => {
                // Customer category-detail mode shows an "All" entry
                // at the head of the strip so the user can return to
                // the unfiltered home with a single tap (per design).
                // Staff/waiter view keeps the legacy ordering since
                // they reach this via a dedicated dashboard.
                const list = [];
                if (routeCategoryId && !isStaff) {
                  list.push({
                    _id: 'all',
                    name: 'All',
                    image: ALL_CATEGORY_IMAGE,
                  });
                }
                list.push(...reorderedCategories);
                // Manually add virtual 'Combo' card if it's the current selection
                if (activeCategoryId === 'combo') {
                    list.push({
                        _id: 'combo',
                        name: 'Combo',
                        image: COMBO_CATEGORY_IMAGE
                    });
                }
                return list;
            })().map((category) => {
              const isActive = activeCategoryId === category._id || (category._id === 'all' && !routeCategoryId);
              const activeRing = isStaff ? 'border-[#7C3AED]' : 'border-[#FE8301]';
              const activeText = isStaff ? 'text-[#1A181B]' : 'text-[#FE8301]';
              return (
                <div
                  key={category._id}
                  onClick={() => {
                    if (category._id === 'all') {
                      // Back to the unfiltered home — drops out of the
                      // routeCategoryId mode entirely.
                      navigate('/customer/home');
                    } else if (routeCategoryId) {
                      navigate(`/customer/item/${category._id}`);
                    } else {
                      setActiveCategoryId(category._id);
                    }
                  }}
                  title={category.name}
                  className="flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer active:scale-95 transition-all w-20 sm:w-24 md:w-28 lg:w-32 xl:w-36"
                >
                  <div className={`w-20 h-20 sm:w-24 sm:h-24 md:w-28 md:h-28 lg:w-32 lg:h-32 xl:w-36 xl:h-36 rounded-full p-1 border-2 transition-all ${isActive ? activeRing : 'border-transparent'}`}>
                    <div className="w-full h-full rounded-full overflow-hidden">
                      <img
                        src={sizedImage(category.image || "https://images.unsplash.com/photo-1546069901-ba9599a7e63c", { w: 120 })}
                        alt={category.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                  <span
                    className={`w-full text-center align-middle font-nunito font-semibold tracking-normal break-words line-clamp-2
                      text-[14px] leading-[16px]
                      sm:text-[15px] sm:leading-[18px]
                      md:text-[16px] md:leading-[20px]
                      lg:text-[17px] lg:leading-[22px]
                      xl:text-[18px] xl:leading-[24px]
                      ${isActive ? activeText : 'text-[#645E66]'}`}
                  >
                    {category.name}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!isStaff && !routeCategoryId && (
          <>
            {/* Service quick-actions — the two things a seated diner
                most often needs, so they sit at the top of the landing
                instead of below the fold. Compact side-by-side pills
                (icon + label in one line) rather than 70px tall tiles.
                `canRequestService` is false once the bill is settled, so
                the strip unmounts rather than sitting there greyed out. */}
            {(orderType !== "takeaway" && customerSession.canRequestService) && (
              <div className="grid grid-cols-2 gap-3 w-full">
                <button
                  onClick={() => handleServiceRequest('water')}
                  disabled={requestLoading.water || dineInLocked}
                  aria-label="Request water from waiter"
                  title={dineInLocked ? 'Bill settled — re-scan QR to request' : undefined}
                  className={`rounded-[14px] flex items-center justify-center gap-2 h-12 px-3 text-[14px] font-semibold nunito active:scale-95 transition-all ${
                    dineInLocked
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                      : 'bg-[#FE8301] text-white shadow-[0_4px_12px_rgba(254,131,1,0.25)] disabled:opacity-60'
                  }`}
                >
                  <i className="fi fi-rr-glass-water-droplet text-[16px] flex items-center"></i>
                  <span className="truncate">{dineInLocked ? 'Locked' : requestLoading.water ? 'Sending...' : 'Ask for Water'}</span>
                </button>
                <button
                  onClick={() => handleServiceRequest('waiter')}
                  disabled={requestLoading.waiter || dineInLocked}
                  aria-label="Call a waiter to your table"
                  title={dineInLocked ? 'Bill settled — re-scan QR to request' : undefined}
                  className={`rounded-[14px] flex items-center justify-center gap-2 h-12 px-3 text-[14px] font-semibold nunito active:scale-95 transition-all ${
                    dineInLocked
                      ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed'
                      : 'bg-[#FFF1E2] text-[#FE8301] border border-orange-200 disabled:opacity-60'
                  }`}
                >
                  <img src={CallForWaiterIcon} alt="" className={`w-5 h-5 object-contain ${dineInLocked ? 'opacity-40' : ''}`} />
                  <span className="truncate">{dineInLocked ? 'Locked' : requestLoading.waiter ? 'Calling...' : 'Call a Waiter'}</span>
                </button>
              </div>
            )}
            {isGuest && <LoginPromptBanner />}
            {/* Top-sellers carousel — shown to BOTH guests (QR-scan
                dine-in flow) and logged-in customers. Previously gated
                behind !isGuest, which hid it from every walk-in diner
                since they're in guest mode the whole session. */}
            {featuredItems.length > 0 && (
              <FeaturedCarousel
                featuredItems={featuredItems}
                onAddToCart={(item) => {
                  if (item.menuItem) {
                    handleOpenProductDetails(item.menuItem);
                  }
                }}
              />
            )}
            <section>
              <h2 className="text-[18px] md:text-[20px] font-bold nunito text-[#1A181B] mb-3">Feeling hungry already?</h2>
              <CategoriesCarousel
                categories={categories}
                activeId={activeCategoryId}
                onCategoryClick={(id) => {
                  // Navigate to the dedicated category view (Home re-renders
                  // with routeCategoryId populated, swapping the homepage
                  // carousels for the horizontal category strip + filtered
                  // item list). Cleaner than in-page filter + scroll because
                  // the URL now reflects the active category and the back
                  // button returns to the unfiltered home.
                  navigate(`/customer/item/${id}`);
                }}
              />
            </section>
          </>
        )}

        <section>
          <h2 className="text-[18px] md:text-[20px] font-bold nunito text-[#1A181B] mb-3">
            {routeCategoryId || isStaff ? "Flavors You'll Come Back For!" : (healthMode ? "Fuel the Good Stuff!" : "Flavors You'll Love!")}
          </h2>

          {/* Filter button + active-filter chips row.
              - Filter button always visible (all customer & staff views).
              - Each active chip shows the current filter value with an X
                that clears just that one filter. */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <button
              onClick={() => setIsFilterModalOpen(true)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-[12px] text-[13px] font-semibold active:scale-95 transition-all ${
                isStaff
                  ? 'bg-[#FFF1E2] text-[#FE8301]'
                  : 'bg-[#FFF4E8] text-[#FE8301]'
              }`}
            >
              <SlidersHorizontal size={15} />
              Filter
            </button>

            {/* Price range chip — only when narrower than the default [0, 1000].
                Guarded because some filter popups call setActiveFilters(f)
                with a partial object that drops priceRange entirely. */}
            {Array.isArray(activeFilters?.priceRange)
              && ((activeFilters.priceRange[0] ?? 0) > 0 || (activeFilters.priceRange[1] ?? 1000) < 1000) && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF4E8] text-[#1A181B] rounded-[12px] text-[12px] font-semibold">
                {activeFilters.priceRange[0] > 0
                  ? `₹${activeFilters.priceRange[0]} – ₹${activeFilters.priceRange[1]}`
                  : `Under ₹${activeFilters.priceRange[1]}`}
                <button
                  onClick={() => setActiveFilters(prev => ({ ...prev, priceRange: [0, 1000] }))}
                  className="hover:text-[#FE8301]"
                  aria-label="Clear price filter"
                >
                  <X size={13} />
                </button>
              </span>
            )}

            {/* Diet preference chip — reflects whichever of the two
                sources is active (modal override wins over the header
                toggle). Clearing it wipes both so the list shows all. */}
            {(() => {
              const shown = activeFilters?.preference || dietPreference;
              if (shown !== 'veg' && shown !== 'nonveg') return null;
              return (
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF4E8] text-[#1A181B] rounded-[12px] text-[12px] font-semibold">
                  {shown === 'veg' ? 'Pure Veg' : 'Non-Veg'}
                  <button
                    onClick={() => {
                      setDietPreference('mix');
                      setActiveFilters(prev => ({ ...prev, preference: null }));
                    }}
                    className="hover:text-[#FE8301]"
                    aria-label="Clear diet filter"
                  >
                    <X size={13} />
                  </button>
                </span>
              );
            })()}

            {/* Offers chip — present when at least one offer filter is active */}
            {Array.isArray(activeFilters?.offers) && activeFilters.offers.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF4E8] text-[#1A181B] rounded-[12px] text-[12px] font-semibold">
                With Offers
                <button
                  onClick={() => setActiveFilters(prev => ({ ...prev, offers: [] }))}
                  className="hover:text-[#FE8301]"
                  aria-label="Clear offers filter"
                >
                  <X size={13} />
                </button>
              </span>
            )}

            {/* Health mode chip — only while health mode is ON */}
            {healthMode && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E8F5E0] text-[#2F7A21] rounded-[12px] text-[12px] font-semibold">
                Healthy
                <button
                  onClick={() => toggleHealthMode()}
                  className="hover:text-[#2F7A21]/70"
                  aria-label="Turn off health mode"
                >
                  <X size={13} />
                </button>
              </span>
            )}
          </div>

          <div id="flavors-section" className="space-y-4 scroll-mt-24">
            {visibleItems.map((item) => {
              const itemProps = {
                id: item._id,
                title: item.name,
                desc: item.description,
                price: resolveUnitPrice(item),
                image: (item.images && item.images[0]) || item.image,
                isVeg: item.vegType === 'veg',
                // Backend menuItem schema uses `cookingTime` and `serveUpto`
                // (not `preparationTime`/`serves`). Reading the right keys
                // so regular items surface the values the admin entered.
                time: item.isCombo ? (item.cookingTime || "15-20 min") : item.cookingTime,
                serves: item.isCombo ? item.serveUpto : item.serveUpto,
                // Backend stores these under `nutritionalInfo` (nested
                // sub-doc) and uses `fat` (singular) — not top-level
                // `fats` etc. Previously all values rendered as 0
                // because the frontend read non-existent top-level keys.
                calories: item.nutritionalInfo?.calories ?? item.calories ?? 0,
                protein:  item.nutritionalInfo?.protein  ?? item.protein  ?? 0,
                fats:     item.nutritionalInfo?.fat      ?? item.fats     ?? 0,
                fibre:    item.nutritionalInfo?.fibre    ?? item.fibre    ?? 0,
                carbs:    item.nutritionalInfo?.carbs    ?? item.carbs    ?? 0,
                iron:     item.nutritionalInfo?.iron     ?? item.iron     ?? 0,
                quantity: getItemQuantity(item._id),
                onClick: () => handleOpenProductDetails(item),
                // Stamp isCombo on combo cart entries so the cart's
                // price-sync validates them against /combos (not /menu,
                // which 404s for a combo id). Without the flag the quick-
                // Add path produced a wasted 404 + a benign console error.
                onAddToCart: (i) => updateQuantity(item._id, 1, item.isCombo ? { ...i, isCombo: true } : i),
                onIncrease: () => updateQuantity(item._id, 1),
                onDecrease: () => updateQuantity(item._id, -1),
                // Lock state — disables Add / +/- visually when the
                // dine-in bill is settled. Card itself stays tappable
                // (read-only browse).
                disabled: dineInLocked,
              };

              // content-visibility:auto (#26) lets the browser skip layout
              // + paint for off-screen cards in long category lists; the
              // intrinsic size keeps the scrollbar stable until they render.
              return (
                <div key={item._id} style={MENU_CARD_CV_STYLE}>
                  {healthMode ? (
                    <HealthMenuItem {...itemProps} healthMode={healthMode} />
                  ) : (
                    <MenuItem {...itemProps} />
                  )}
                </div>
              );
            })}
            {displayItems.length === 0 && (
              <div className="text-center py-10 text-gray-400 font-nunito">
                No items found in this section.
              </div>
            )}

            {/* Bare-home teaser CTA — the landing only renders a capped
                slice for speed; nudge the user to a category to see the
                rest instead of leaving them thinking that's the whole
                menu. Scrolls back up to the categories carousel. */}
            {bareHomeHasMore && (
              <div className="flex flex-col items-center gap-2 pt-2 pb-4 text-center">
                <p className="text-[13px] text-[#645E66] font-nunito">
                  Pick a category above to explore the full menu
                </p>
                <button
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                  className="px-5 py-2.5 bg-[#FFF4E8] text-[#FE8301] rounded-[12px] text-[13px] font-semibold active:scale-95 transition-all"
                >
                  Browse by category
                </button>
              </div>
            )}

            {/* Pagination — staff still get a button; customers auto-load via
                an IntersectionObserver on a sentinel div rendered below. */}
            {isStaff && hasMore && (
              <div className="flex justify-center pt-2 pb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-50 text-[#FE8301] border border-orange-200 rounded-2xl text-[14px] font-bold active:scale-95 transition-all hover:bg-orange-100 disabled:opacity-50"
                >
                  {loading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}

            {/* Infinite scroll runs in the category-detail + combo views
                only. The bare-home 'all' landing is a capped teaser (no
                auto-load) — browsing happens per-category, so we never
                paginate the unfiltered firehose here. */}
            {!isStaff && hasMore && !isBareHome && (
              <>
                {/* Sentinel — IntersectionObserver watches this element and
                    fires handleLoadMore when it approaches the viewport. */}
                <div ref={loadMoreRef} aria-hidden="true" className="h-1" />
                {loading && (
                  <div className="flex justify-center items-center gap-2 py-6 text-[#FE8301]" aria-live="polite">
                    <div className="w-4 h-4 border-2 border-[#FE8301]/30 border-t-[#FE8301] rounded-full animate-spin" />
                    <span className="text-[13px] font-semibold">Loading more…</span>
                  </div>
                )}
              </>
            )}

          </div>
        </section>

        {/* Landing footer — platform brand + legal links. The BestoDine
            mark renders at a legible size (it was previously absent /
            too small to see on restaurant landing pages), and Terms /
            Privacy are reachable by guests who never see the sign-up
            form where those links otherwise live. */}
        {!isStaff && !routeCategoryId && (
          <footer className="mt-2 mb-4 flex flex-col items-center gap-2 text-center">
            <div className="inline-flex items-center gap-2 text-[#8D848F]">
              <span className="text-[12px] font-medium font-nunito">Powered by</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-7 h-7 rounded-lg bg-[#FE8301] flex items-center justify-center shadow-sm">
                  <BestoDineMark className="w-5 h-5 text-white" />
                </span>
                <span className="text-[14px] font-bold font-nunito text-[#1A181B]">BestoDine</span>
              </span>
            </div>
            <nav className="flex items-center gap-3 text-[12px] font-medium text-[#645E66]" aria-label="Legal">
              <button type="button" onClick={() => navigate('/terms')} className="py-1 hover:text-[#FE8301] underline-offset-2 hover:underline">
                Terms of Service
              </button>
              <span aria-hidden="true" className="text-[#D0D5DD]">•</span>
              <button type="button" onClick={() => navigate('/privacy')} className="py-1 hover:text-[#FE8301] underline-offset-2 hover:underline">
                Privacy Policy
              </button>
            </nav>
          </footer>
        )}
      </main>

      {/* Staff Sticky Cart Footer */}
      {isStaff && totalItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 xl:left-[300px] xl:right-[300px] p-4 bg-white/80 backdrop-blur-md pb-10 z-50 animate-slide-up border-t border-gray-100">
          <button
            // Staff browsing the customer-style menu (Home is mounted at
            // /waiter/category/:id too) must land on the waiter cart.
            // /customer/cart reads localStorage.orderType and, if it was
            // set to 'takeaway' by a prior customer login on the same
            // browser, renders the takeaway cart UI — which is why a
            // waiter was seeing takeaway fields and pickup-time pickers.
            onClick={() => navigate(window.location.pathname.startsWith('/waiter') ? '/waiter/cart' : '/customer/cart')}
            className="w-full bg-[#FF7A00] text-white rounded-[20px] py-[16px] px-[24px] flex items-center justify-between shadow-2xl shadow-orange-200 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-2 rounded-xl">
                <ShoppingBag size={22} strokeWidth={2.5} />
              </div>
              <div className="flex flex-col items-start">
                <span className="text-[15px] font-bold leading-none mb-1">{totalItems} {totalItems === 1 ? 'Item' : 'Items'} added</span>
                <span className="text-[12px] font-medium text-white/80 leading-none">₹{totalPrice} plus taxes</span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-bold bg-white/10 py-2 px-4 rounded-xl">
              <span className="text-[14px]">View Cart</span>
              <ChevronRight size={18} strokeWidth={3} />
            </div>
          </button>
        </div>
      )}

      {/* ProductDetails renders its own backdrop + close handling. Wrapping
          it in another fixed+items-end div double-anchored the modal to
          the viewport bottom, which pushed the in-flow Add-to-Cart bar
          off-screen on short viewports. */}
      {isProductModalOpen && selectedProduct && (
        <ProductDetails
          product={selectedProduct}
          onClose={() => setIsProductModalOpen(false)}
        />
      )}

      {isFilterModalOpen && (
        isStaff ? (
          <FilterPopup
            isOpen={isFilterModalOpen}
            onClose={() => setIsFilterModalOpen(false)}
            activeFilters={activeFilters.preference ? [activeFilters.preference === 'veg' ? 'Pure Veg' : 'Non-veg'] : []}
            onToggleFilter={(f) => {
              setActiveFilters(prev => ({
                ...prev,
                preference: f === 'Pure Veg' ? 'veg' : (f === 'Non-veg' ? 'non-veg' : null)
              }));
            }}
            onClearAll={() => setActiveFilters({ priceRange: [0, 1000], preference: null, offers: [], healthyMode: false })}
            priceRange={activeFilters.priceRange}
            onPriceChange={(p) => setActiveFilters(prev => ({ ...prev, priceRange: p }))}
          />
        ) : (
          <FilterModal
            isOpen={isFilterModalOpen}
            onClose={() => setIsFilterModalOpen(false)}
            // Translate between the modal's flat {minPrice, maxPrice, ...}
            // shape and Home's internal {priceRange: [min, max], ...} shape.
            // Without this the priceRange slider never took effect because
            // merging {minPrice, maxPrice} into state left priceRange stale.
            activeFilters={{
              minPrice: activeFilters?.priceRange?.[0] ?? 0,
              maxPrice: activeFilters?.priceRange?.[1] ?? 1000,
              preference: activeFilters?.preference ?? null,
              offers: activeFilters?.offers ?? [],
              healthyMode: activeFilters?.healthyMode ?? false,
            }}
            onApplyFilters={(f) => setActiveFilters({
              priceRange: [f.minPrice ?? 0, f.maxPrice ?? 1000],
              preference: f.preference ?? null,
              offers: f.offers ?? [],
              healthyMode: f.healthyMode ?? false,
            })}
            minProductPrice={0}
            maxProductPrice={1000}
            showPreference={true}
          />
        )
      )}

      {!isStaff && <CartButton />}
      {isStaff ? <BottomNavWaiter /> : <BottomNavCustomer />}

      {/* Exit-confirmation guard — only mounted on the bare customer
          home (the entry page of the flow). See useExitConfirmation. */}
      <ExitConfirmModal
        open={exitGuard.isOpen}
        onConfirm={exitGuard.confirmExit}
        onCancel={exitGuard.cancelExit}
      />
    </div>
  );
}

export default Home;
