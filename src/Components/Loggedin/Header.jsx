import React, { useState, useEffect, useRef } from "react";
import { Search, Mic, ChevronLeft, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import VegIcon from "/vegicon.svg";
import NonVegIcon from "/nonvegicon.svg";
import HealthIcon from "/HealthModeIcon.svg";
import { useHealthContext } from "../../Context/Loggedin/HealthContext";
import { useNotifications } from "../../Context/NotificationContext";
import { settingsAPI } from "../../utils/api";
import { getActiveBranch, subscribeActiveTenant, getActiveTenantSlug } from "../../utils/tenant";
import { resolveImageUrl } from "../../utils/image";
import { getSocket } from "../../utils/socket";
import VoiceModal from "./VoiceModal";
import { getVoiceSupport } from "./voiceSupport";
import { toast } from "react-hot-toast";
import useCustomerSession from '../../hooks/useCustomerSession';

// ─── Tenant branding cache ───────────────────────────────────────────────────
// The Header mounts on EVERY customer page and remounts on each route
// change, so its tenant-branding /settings fetch previously fired on every
// single tab switch — a redundant round-trip that turned visibly slow when
// the backend/host was under load (the "every tab takes forever to open"
// report). Branding (cafe name, logo, address) is effectively static for a
// session, so we cache the resolved `general` block at module scope, keyed
// by tenant slug, and reuse it across navigations. A real change still
// propagates: the `settings:updated` socket event force-refetches and
// busts the cache. Switching tenants (different slug) also refetches.
let _brandingCache = { slug: null, data: null };

// ─── App State — localStorage logic ──────────────────────────────────────────

function getTableNumber() {
  try {
    const dt = localStorage.getItem("dineInTable");
    if (dt) {
      const parsed = JSON.parse(dt);
      if (parsed.name) return parsed.name;
    }
    return localStorage.getItem("tableNumber") || null;
  } catch (_) {
    return null;
  }
}

function getOrderType() {
  try {
    return localStorage.getItem("orderType") || "dine-in";
  } catch (_) {
    return "dine-in";
  }
}

// Branch displayed in the header. Prefer the active-tenant blob (the
// authoritative source set at branch-pick time and used by the api.js
// interceptor for X-Branch-Id) and fall back to the legacy
// `selectedBranch` localStorage key for older sessions.
function getSelectedBranch() {
  try {
    const active = getActiveBranch();
    let legacy = null;
    try {
      const saved = localStorage.getItem("selectedBranch");
      legacy = saved ? JSON.parse(saved) : null;
    } catch (_) { /* ignore */ }
    if (active) {
      return {
        id: active._id,
        name: active.name || legacy?.name || "",
        addressLine1: legacy?.addressLine1 || "",
        addressLine2: legacy?.addressLine2 || "",
        city: active.city || legacy?.city || "",
        phone: legacy?.phone || "",
      };
    }
    return legacy;
  } catch (_) {
    return null;
  }
}

// Tokens that are safe to drop when compacting an address.
// Keep the list short — we only strip things customers don't need in a
// tight header (country name, "District/Dist.", etc.). State names are
// too varied to hardcode, so we rely on the "first 2 segments" rule to
// naturally drop them for the tenant-level address.
const ADDRESS_NOISE_WORDS = new Set(["india", "bharat", "district", "dist", "dist."]);

// Returns true if a single comma segment looks like a postal/pin code,
// a country/district token, or is empty. These segments get filtered out
// before we take the leading parts.
function isAddressNoise(segment) {
  const s = segment.trim();
  if (!s) return true;
  // Matches:  "411004"  |  "– 411004"  |  "India – 411004"  |  "PIN 411004"
  if (/\d{5,6}/.test(s)) return true;
  const lower = s.toLowerCase();
  if (ADDRESS_NOISE_WORDS.has(lower)) return true;
  // Starts with "India – " etc.
  if (/^(india|bharat)\b/i.test(s)) return true;
  return false;
}

// Keep the first N clean segments of a free-form address string.
// "FC Road, Pune, Maharashtra, India – 411004"  →  "FC Road, Pune"
function compactAddressString(full, keep = 2) {
  if (!full) return "";
  // Normalise the en-dash/em-dash that admins sometimes paste in, so the
  // pin-code detector downstream has a predictable delimiter.
  const normalised = String(full).replace(/[–—]/g, "-");
  const parts = normalised
    .split(",")
    .map((s) => s.trim())
    .filter((s) => !isAddressNoise(s));
  return parts.slice(0, keep).join(", ");
}

// Build a compact address for the header from a branch doc. Branches
// store addressLine1 / addressLine2 / city separately, so we can
// reliably pick "street/locality + city".
function shortBranchAddress(branch) {
  if (!branch) return "";
  const line1 = String(branch.addressLine1 || "").trim();
  const line2 = String(branch.addressLine2 || "").trim();

  // Line 1 usually has "Floor, Plaza, Road, Locality" — the last two
  // clean segments are the useful ones (road + locality).
  const l1Parts = line1
    .split(",")
    .map((s) => s.trim())
    .filter((s) => !isAddressNoise(s))
    .slice(-2);

  // Line 2 usually starts with the city. Take the first clean segment.
  const l2First = (line2.split(",")[0] || "").trim().replace(/\s+\d.*$/, "");
  const city = (branch.city || l2First || "").trim();

  const parts = [...l1Parts];
  if (city && !parts.some((p) => p.toLowerCase() === city.toLowerCase())) {
    parts.push(city);
  }
  return parts.filter(Boolean).join(", ");
}

// ─── Health State — localStorage logic ────────────────────────────────────────

function getHealthPrefs() {
  try {
    const saved = localStorage.getItem("healthPreferences");
    if (saved) {
      const prefs = JSON.parse(saved);
      return {
        healthMode: prefs.healthMode ?? false,
        dietPreference: prefs.dietPreference || "veg",
      };
    }
  } catch (_) {
    localStorage.removeItem("healthPreferences");
  }
  return { healthMode: false, dietPreference: "veg" };
}

function saveHealthPrefs(updates) {
  try {
    const saved = localStorage.getItem("healthPreferences");
    const current = saved ? JSON.parse(saved) : {};
    const newData = { ...current, ...updates };
    localStorage.setItem("healthPreferences", JSON.stringify(newData));

    // Manually dispatch storage event for same-window sync
    window.dispatchEvent(new Event("storage_sync"));
  } catch (_) { }
}

// ─── Header Component ─────────────────────────────────────────────────────────

function Header({
  showSearch = true,
  showFilters = true,
  showDietToggle = true,
  title = null,
  searchQuery = "",
  onSearchChange = () => { },
  onSearchKeyDown = () => { },
  onFilterClick = () => { },
  backRoute = null,
}) {
  const { t } = useTranslation();
  const {
    healthMode,
    toggleHealthMode,
    dietPreference,
    setDietPreference
  } = useHealthContext();

  // Local state for other things
  const [tableNumber, setTableNumber] = useState(getTableNumber);
  // Once the bill is settled the visit is over, so the table pill must
  // disappear along with the ordering controls. It used to keep
  // rendering because it read `tableNumber` directly while the buttons
  // read a different key — the screen showed a live table above dead
  // buttons. Both now answer to one session phase.
  const { showTableChrome } = useCustomerSession();
  const [orderType, setOrderType] = useState(getOrderType);
  const [selectedBranch, setSelectedBranch] = useState(getSelectedBranch);
  const [cafeName, setCafeName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [generalAddress, setGeneralAddress] = useState("");
  const [showVoiceModal, setShowVoiceModal] = useState(false);
  // Voice search needs SpeechRecognition AND a secure context (https or
  // localhost) — a phone on http://192.168.x.x can't use the mic.
  const [voiceSupport] = useState(getVoiceSupport);
  const searchInputRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useNotifications();
  const isSearchPage = location.pathname === "/search";

  // Fetch restaurant name, logo, and tenant-level address from settings.
  // We explicitly request the TENANT doc (not the branch-scoped one) so
  // the header's compact "Road, City" line always reflects the address
  // the tenant owner edited in admin settings — regardless of whether the
  // customer has already picked a branch.
  useEffect(() => {
    const slug = getActiveTenantSlug();
    const applyGeneral = (general) => {
      if (general?.cafeName !== undefined) setCafeName(general.cafeName || '');
      if (general?.logoUrl !== undefined)  setLogoUrl(general.logoUrl || '');
      if (general?.address !== undefined)  setGeneralAddress(general.address || '');
    };
    const loadBranding = (force = false) => {
      // Serve from the module cache when the active tenant matches —
      // skips the redundant /settings round-trip on every tab switch.
      if (!force && _brandingCache.slug === slug && _brandingCache.data) {
        applyGeneral(_brandingCache.data);
        return;
      }
      settingsAPI.getSettings({ _skipBranchHeader: true }).then(res => {
        const general = res.data?.data?.general || res.data?.general;
        if (general) {
          _brandingCache = { slug, data: general };
          applyGeneral(general);
        }
      }).catch(() => {});
    };
    loadBranding();

    // Live refresh — backend emits `settings:updated` on every admin
    // settings save. Without this the customer header shows the old
    // logo until a full page reload. Only staff sockets are in the
    // tenant staff rooms, so customers only see this if their socket
    // happens to join a relevant room (e.g. logged-in customer on
    // their own room). Still worth wiring — harmless no-op otherwise.
    const socket = getSocket();
    socket.on('settings:updated', loadBranding);
    return () => socket.off('settings:updated', loadBranding);
  }, []);

  // keep states in sync across tabs or same window events
  useEffect(() => {
    function syncState() {
      setTableNumber(getTableNumber());
      setOrderType(localStorage.getItem("orderType") || "dine-in");
      setSelectedBranch(getSelectedBranch());
    }

    window.addEventListener("storage", syncState); // Other tabs
    window.addEventListener("storage_sync", syncState); // Same window
    // Re-render when the customer changes branch via the picker
    const unsubscribe = subscribeActiveTenant(syncState);

    return () => {
      window.removeEventListener("storage", syncState);
      window.removeEventListener("storage_sync", syncState);
      unsubscribe();
    };
  }, []);


  const handleSearchClick = () => {
    if (!isSearchPage) navigate("/search");
  };

  const handleBack = () => {
    if (backRoute) {
      navigate(backRoute);
    } else {
      navigate(-1);
    }
  };

  return (
    <>
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-100 shadow-[0_1px_3px_rgba(16,24,40,0.04)] transition-colors duration-200">
      {/* Logo & Table Number Row */}
      <div className="flex items-center justify-between gap-3 h-auto px-4 md:px-8 py-2.5">
        {/* Left Side: Logo OR Back Button — min-w-0 + flex-1 so the
            name/address column can actually truncate when the right-side
            table pill needs space. Without min-w-0 on a flex child, the
            child refuses to shrink below its content size. */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {isSearchPage || (title && title !== "logo") ? (
            <button
              onClick={handleBack}
              className="p-1 -ml-1 rounded-full hover:bg-gray-100 active:scale-95 transition-transform flex-shrink-0"
            >
              <ChevronLeft size={24} className="text-[#666666] md:w-7 md:h-7" />
            </button>
          ) : (
            <>
              {resolveImageUrl(logoUrl) ? (
                <img
                  src={resolveImageUrl(logoUrl)}
                  alt={cafeName || "Restaurant"}
                  // Larger, more prominent logo across the whole customer
                  // flow. Transparent (no box/frame); width still capped so
                  // a wide wordmark can't crowd out the cafe name + address
                  // column beside it.
                  className="h-16 md:h-[72px] w-auto max-w-[150px] md:max-w-[260px] flex-shrink-0 object-contain"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.style.display = "none";
                  }}
                />
              ) : (
                // No logo configured — show the cafe initial in a branded
                // tile instead of an empty coloured square so the header
                // never looks unfinished.
                <div
                  className={`w-14 h-14 md:w-16 md:h-16 ${healthMode ? "bg-green-600" : "bg-orange-500"} rounded-xl flex-shrink-0 flex items-center justify-center text-white font-bold font-nunito text-xl md:text-2xl select-none shadow-sm transition-colors duration-300`}
                >
                  {(cafeName || selectedBranch?.name || 'R').trim().charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-semibold font-nunito text-[#232C47] text-[15px] md:text-xl leading-[19px] md:leading-[24px] truncate">
                  {orderType === "takeaway"
                    ? (selectedBranch?.name || cafeName || "Takeaway")
                    : title || selectedBranch?.name || cafeName || ""}
                </span>
                {(() => {
                  const shortAddr =
                    compactAddressString(generalAddress) ||
                    shortBranchAddress(selectedBranch);
                  if (!shortAddr) return null;
                  return (
                    <span className="flex items-center gap-1 text-[#645E66] text-[10.5px] md:text-sm font-normal font-varela truncate mt-0.5">
                      <i className="fi fi-rr-marker text-[10px] leading-none translate-y-[1px] flex-shrink-0" />
                      <span className="truncate">{shortAddr}</span>
                    </span>
                  );
                })()}
              </div>
            </>
          )}
        </div>

        {/* Right Side: Compact pill that NEVER wraps + Bell icon.
            Previous version let "Table GR-01" break into 3 lines because
            it had no whitespace-nowrap and no shrink-0; the right cluster
            was being treated as a single flex item that could collapse
            into a 1-char-wide column. shrink-0 + nowrap on the pill is
            the actual fix. */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {orderType === "takeaway" ? (
            <span className="text-[#FE8301] text-[12px] md:text-[13px] font-semibold bg-[#FFF1E2] px-3 py-1.5 rounded-full border border-orange-200 whitespace-nowrap shadow-[0_1px_2px_rgba(254,131,1,0.08)]">
              {t('common.takeaway')}
            </span>
          ) : (tableNumber && showTableChrome) ? (
            <span className="inline-flex items-center gap-1.5 text-[#FE8301] text-[12px] md:text-[13px] font-semibold font-nunito bg-[#FFF4E8] px-3 py-1.5 rounded-full border border-orange-100 whitespace-nowrap max-w-[120px] shadow-[0_1px_2px_rgba(254,131,1,0.08)]">
              <i className="fi fi-rr-restaurant text-[10px] leading-none translate-y-[1px] flex-shrink-0" />
              <span className="truncate">{t('common.table_label', { name: tableNumber })}</span>
            </span>
          ) : null}
          <button
            onClick={() => navigate("/notifications")}
            className="relative w-9 h-9 md:w-10 md:h-10 rounded-full bg-[#F6F6F7] hover:bg-gray-200/70 active:scale-95 transition-all flex items-center justify-center flex-shrink-0"
            aria-label={t('header.notifications')}
          >
            <i className="fi fi-rr-bell text-[#5A535F] text-[18px] md:text-[20px] flex items-center justify-center"></i>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] flex items-center justify-center bg-[#FE8301] text-white text-[9px] font-bold rounded-full px-1 border-2 border-white shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Search Bar & Filters Section.
          Layout: the search bar gets its OWN full-width row (48px tall —
          a comfortable touch target) instead of being squeezed between
          two round icon buttons, and the diet / health filters sit in a
          labelled chip row underneath. The old icon-only diet button
          cycled through three states and explained itself with a hover
          tooltip; on phones that tooltip stayed pinned after a tap
          (focus-within) and its text overlapped the content below. The
          labelled segmented control needs no tooltip at all. */}
      {showSearch && (
        <div className="px-4 md:px-8 pt-1.5 pb-2.5">
          <div
            onClick={handleSearchClick}
            className="w-full bg-[#F6F6F7] rounded-full flex items-center pl-4 pr-3 h-12 md:h-[52px] md:pl-5 border border-[#EDEDF0] focus-within:border-[#FE8301]/50 focus-within:bg-white transition-all min-w-0 cursor-text"
          >
            <Search className="text-[#645E66] flex-shrink-0" size={20} />
            <input
              ref={searchInputRef}
              type="search"
              enterKeyHint="search"
              aria-label={t('header.search_placeholder')}
              placeholder={t('header.search_placeholder')}
              autoFocus={isSearchPage}
              readOnly={!isSearchPage}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              className={`flex-1 min-w-0 bg-transparent border-none outline-none text-[#1A181B] placeholder:text-[#A8B2C7] text-[15px] md:text-base px-3 h-full [&::-webkit-search-cancel-button]:hidden ${!isSearchPage ? "cursor-text" : ""}`}
            />
            {/* Clear (X) — appears as soon as there is text, empties the
                field and keeps the keyboard up so the diner can retype. */}
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={(e) => {
                  e.stopPropagation();
                  onSearchChange('');
                  searchInputRef.current?.focus();
                }}
                className="flex items-center justify-center w-8 h-8 rounded-full text-[#645E66] hover:bg-[#E9E9EE] active:scale-90 flex-shrink-0 transition-all mr-1"
              >
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[#8D848F] text-white">
                  <X size={12} strokeWidth={3} />
                </span>
              </button>
            )}
            <div className="block w-px h-5 bg-[#E2E2E8] shrink-0"></div>
            <button
              type="button"
              aria-label={voiceSupport.supported ? "Search by voice" : `Voice search unavailable: ${voiceSupport.reasonText}`}
              aria-disabled={!voiceSupport.supported}
              title={voiceSupport.supported ? "Search by voice" : voiceSupport.reasonText}
              className={`flex items-center justify-center w-9 h-9 rounded-full flex-shrink-0 transition-colors ml-1 ${
                voiceSupport.supported
                  ? "text-[#645E66] hover:bg-[#E9E9EE] hover:text-[#1A181B]"
                  : "text-[#C4C0C5] cursor-not-allowed"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                if (!voiceSupport.supported) {
                  // Touch screens have no hover tooltip — explain on tap.
                  toast(voiceSupport.reasonText, { id: "voice-unavailable", icon: "🎤" });
                  return;
                }
                setShowVoiceModal(true);
              }}
            >
              <Mic size={20} />
            </button>
          </div>
        </div>
      )}

      {/* Diet + Health filters — labelled chips, no tooltips. */}
      {showFilters && !isSearchPage && (
        <div className="flex items-center gap-2 px-4 md:px-8 pb-3 overflow-x-auto no-scrollbar">
          {showDietToggle && (
            <div
              role="radiogroup"
              aria-label="Food preference"
              className="flex items-center p-1 bg-[#F6F6F7] rounded-full flex-shrink-0"
            >
              {[
                { key: 'mix',    label: t('header.diet_all', 'All') },
                { key: 'veg',    label: t('header.diet_veg', 'Veg'),     icon: VegIcon,
                  active: 'bg-white text-[#2F7A21] border-[#7ECC00]' },
                { key: 'nonveg', label: t('header.diet_nonveg', 'Non-Veg'), icon: NonVegIcon,
                  active: 'bg-white text-[#D92D20] border-[#FF4D4D]' },
              ].map((opt) => {
                // 'mix' is the no-filter state; any legacy value that
                // isn't veg / nonveg is treated as 'mix' too.
                const current = dietPreference === 'veg' || dietPreference === 'nonveg' ? dietPreference : 'mix';
                const selected = current === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setDietPreference(opt.key)}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[13px] font-semibold font-nunito whitespace-nowrap transition-all active:scale-95 ${
                      selected
                        ? `${opt.active || 'bg-white text-[#FE8301] border-[#FE8301]'} shadow-[0_1px_3px_rgba(16,24,40,0.10)]`
                        : 'border-transparent text-[#645E66] hover:text-[#1A181B]'
                    }`}
                  >
                    {opt.icon && <img src={opt.icon} alt="" className="w-3.5 h-3.5 object-contain" />}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}
          <button
            type="button"
            onClick={toggleHealthMode}
            aria-pressed={healthMode}
            aria-label={healthMode ? t('header.turn_off_health') : t('header.turn_on_health')}
            className={`inline-flex items-center gap-1.5 h-10 pl-2 pr-3.5 rounded-full border text-[13px] font-semibold font-nunito whitespace-nowrap transition-all active:scale-95 flex-shrink-0 ${
              healthMode
                ? 'bg-[#F1FBE3] border-[#7ECC00] text-[#2F7A21]'
                : 'bg-white border-[#E4E4E7] text-[#645E66]'
            }`}
          >
            <img
              src={HealthIcon}
              alt=""
              className={`w-6 h-5 object-contain ${healthMode ? '' : 'grayscale opacity-60'}`}
            />
            {healthMode ? t('header.health_mode_on') : t('header.health_mode_off')}
          </button>
        </div>
      )}
    </header>

    {showVoiceModal && (
      <VoiceModal
        onClose={() => setShowVoiceModal(false)}
        onResult={(text) => {
          if (isSearchPage) {
            // Fill the search box and run the search for the spoken text.
            onSearchChange(text);
            onSearchKeyDown({ key: 'Enter', target: { value: text } });
          } else {
            // Other pages: open /search with the query prefilled (it
            // searches on mount).
            navigate('/search', { state: { query: text } });
          }
        }}
      />
    )}
    </>
  );
}

export default Header;
