import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BottomNav from "../../Components/Loggedin/BottomNav";
import { useAuth } from "../../Context/AuthContext";
import { useHealthContext as useHealth } from "../../Context/Loggedin/HealthContext";
import { isFeatureEnabled, activeRestaurantPath } from "../../utils/tenant";
import { resolveImageUrl } from "../../utils/image";
import i18n, { SUPPORTED_LANGUAGES } from "../../i18n";

const avatarFallback = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=FE8301&color=fff`;

// Toggle flag for the customer-side Notification Preference panel.
// Kept off (do not delete the JSX block below — flip back to true
// when WhatsApp/SMS/Push wiring is ready).
const SHOW_NOTIFICATION_PREFS = false;
// Toggle flag for the Voice Order row inside App Appearance.
// Kept off — flip back to true when voice ordering is wired up.
const SHOW_VOICE_ORDER = false;
// Toggle flag for the Parking Details panel (Vehicle Type, Vehicle
// Number, Parking Required by Default). Kept off — flip back to true
// when parking is part of the customer flow again.
const SHOW_PARKING_DETAILS = false;

// ─── Standalone auth helpers removed ───

import {
  ChevronLeft,
  ChevronRight,
  User,
  Apple,
  Leaf,
  ShoppingCart,
  X,
  Check,
  LogOut,
  Cake,
  MapPin,
} from "lucide-react";

// Diet preference → translation key for the chip label + dot colour.
// The actual label is resolved at render time via t(labelKey) so it
// follows the active language. Mirrors the picker in EditProfile.
const DIET_CHIP = {
  veg:        { labelKey: 'edit_profile.diet_veg',         dot: 'bg-green-600' },
  non_veg:    { labelKey: 'edit_profile.diet_non_veg',     dot: 'bg-red-600' },
  eggetarian: { labelKey: 'edit_profile.diet_eggetarian',  dot: 'bg-amber-500' },
  vegan:      { labelKey: 'edit_profile.diet_vegan',       dot: 'bg-emerald-700' },
  jain:       { labelKey: 'edit_profile.diet_jain',        dot: 'bg-yellow-500' },
};

// "1990-04-15T00:00:00.000Z" → "15 Apr" (no year, since DOB display is
// celebratory not bureaucratic). Returns '' for falsy / unparseable.
const formatDayMonth = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

function Profile() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user, isLoggedIn, logout, setGuestMode, updateProfile } = useAuth();
  const { healthMode, setHealthMode } = useHealth();

  // Allergy sync: when user saves allergy in diet modal, also push to backend.
  // Uses _isBackground so the API interceptor stays silent — we only show
  // a toast on the last actionable error.
  const syncAllergyToBackend = async (text) => {
    try {
      const { default: api } = await import("../../utils/api");
      const res = await api.put('/auth/profile', { allergy: text }, { _isBackground: true });
      if (res.data?.success) {
        updateProfile({ allergy: text });
      }
    } catch (err) {
      // Surface validation errors (e.g. allergy too long) to the user
      const msg = err?.response?.data?.message;
      if (msg && err?.response?.status === 400) {
        const { toast } = await import("react-hot-toast");
        toast.error(msg);
      }
    }
  };

  // Modal State
  const [showDietModal, setShowDietModal] = useState(false);
  const [showAllergyModal, _setShowAllergyModal] = useState(false); // setter unused — allergy modal trigger not wired yet
  const [showLanguageModal, setShowLanguageModal] = useState(false);

  // Phase 2.5: feature flags for the active tenant. Used to hide
  // sections for modules the tenant hasn't paid for so customers don't
  // tap through to a 403 — the backend gate remains authoritative.
  const hasWallet      = isFeatureEnabled('walletLoyalty');
  const hasTableBooking = isFeatureEnabled('advanceBookingTable');
  const hasHallBooking  = isFeatureEnabled('advanceBookingHall');
  const hasAnyBooking   = hasTableBooking || hasHallBooking;

  // Preference States (persisted)
  const [whatsappNotif, setWhatsappNotif] = useState(
    () => JSON.parse(localStorage.getItem("pref_whatsapp")) ?? false,
  );
  const [smsNotif, setSmsNotif] = useState(
    () => JSON.parse(localStorage.getItem("pref_sms")) ?? false,
  );
  const [pushNotif, setPushNotif] = useState(
    () => JSON.parse(localStorage.getItem("pref_push")) ?? true,
  );

  const [voiceOrder, setVoiceOrder] = useState(
    () => JSON.parse(localStorage.getItem("pref_voice")) ?? false,
  );
  const [parkingRequired, setParkingRequired] = useState(
    () => JSON.parse(localStorage.getItem("pref_parking")) ?? false,
  );

  // Diet Preferences
  const [isVeg, setIsVeg] = useState(
    () => JSON.parse(localStorage.getItem("pref_veg")) ?? false,
  );
  const [isNonVeg, setIsNonVeg] = useState(
    () => JSON.parse(localStorage.getItem("pref_nonveg")) ?? true,
  );

  // Allergy Preferences — seed from backend user data, fallback to localStorage
  const [allergyText, setAllergyText] = useState(
    () => user?.allergy || localStorage.getItem("pref_allergy_text") || "",
  );

  // Language preference — tracks the active i18n language CODE ('en' /
  // 'hi' / 'mr'), not the display name. Seeds from the user's saved
  // server-side pref if any, then i18n's current resolvedLanguage
  // (which itself came from localStorage or browser detection).
  const [selectedLanguage, setSelectedLanguage] = useState(
    () => user?.preferredLanguage || i18n.resolvedLanguage || 'en',
  );

  // Handler used by the language picker — switches i18n immediately
  // (whole app re-renders in the new language), then persists to
  // backend so the choice follows the user across devices. We don't
  // block on the API call; if it fails the local switch still works
  // until the next /auth/me refresh overwrites it.
  const handleLanguageChange = async (code) => {
    setSelectedLanguage(code);
    try { await i18n.changeLanguage(code); } catch (_) { /* noop */ }
    if (isLoggedIn) {
      try {
        const { default: api } = await import("../../utils/api");
        const res = await api.put('/auth/profile', { preferredLanguage: code }, { _isBackground: true });
        if (res.data?.success && res.data?.user) updateProfile(res.data.user);
      } catch (_) { /* silent — local switch already applied */ }
    }
  };

  // Persistence Effects
  useEffect(
    () => localStorage.setItem("pref_whatsapp", JSON.stringify(whatsappNotif)),
    [whatsappNotif],
  );
  // SMS Notifications
  useEffect(
    () => localStorage.setItem("pref_sms", JSON.stringify(smsNotif)),
    [smsNotif],
  );
  // Push Notifications
  useEffect(
    () => localStorage.setItem("pref_push", JSON.stringify(pushNotif)),
    [pushNotif],
  );

  // Voice Order
  useEffect(
    () => localStorage.setItem("pref_voice", JSON.stringify(voiceOrder)),
    [voiceOrder],
  );
  // Parking Required
  useEffect(
    () => localStorage.setItem("pref_parking", JSON.stringify(parkingRequired)),
    [parkingRequired],
  );
  // Diet Preferences
  useEffect(
    () => localStorage.setItem("pref_veg", JSON.stringify(isVeg)),
    [isVeg],
  );
  useEffect(
    () => localStorage.setItem("pref_nonveg", JSON.stringify(isNonVeg)),
    [isNonVeg],
  );
  // Allergy Preferences — persist locally and to backend
  useEffect(() => {
    localStorage.setItem("pref_allergy_text", allergyText);
  }, [allergyText]);

  // Debounced backend sync for allergy (also syncs empty values so users can clear)
  useEffect(() => {
    if (!isLoggedIn) return;
    const timer = setTimeout(() => syncAllergyToBackend(allergyText), 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allergyText, isLoggedIn]);
  // Language preference is persisted by i18next-browser-languagedetector
  // (writes to localStorage 'i18nextLng' on every changeLanguage) AND by
  // the backend PUT in handleLanguageChange — no separate effect needed.

  // Logout
  const handleLogin = () => {
    navigate("/login");
  };

  // Prevent body scroll when any modal is open
  useEffect(() => {
    if (showDietModal || showLanguageModal || showAllergyModal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [showDietModal, showLanguageModal]);

  // Handle Health Mode toggle with redirect
  const handleHealthModeToggle = (newValue) => {
    setHealthMode(newValue);
    // If turning ON Health Mode via toggle, show the healthy experience splash
    if (newValue === true) {
      setTimeout(() => navigate("/health/splash"), 100);
    } else {
      setTimeout(() => navigate("/customer/home"), 100);
    }
  };

  // Saved-profile chips shown on the logged-in info card. Hidden entirely
  // when none of the fields are populated so the card stays clean for
  // users who haven't filled in their profile.
  const dietChip   = user?.dietaryPreference ? DIET_CHIP[user.dietaryPreference] : null;
  const dobLabel   = formatDayMonth(user?.dob);
  const annLabel   = formatDayMonth(user?.anniversary);
  const cityLabel  = user?.address?.city || '';
  const hasAnyChip = !!(dietChip || dobLabel || annLabel || cityLabel);

  // Guest user view
  if (!isLoggedIn || !user) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24 sm:pb-28 transition-colors duration-200">
        <header className="p-4 sm:px-6 sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center gap-3 sm:gap-4 transition-colors">
          <button onClick={() => navigate(-1)} className="p-1">
            <ChevronLeft size={24} className="text-gray-900 " />
          </button>
          <h1 className="text-lg sm:text-xl font-semibold text-gray-900">
            {t('profile.title')}
          </h1>
        </header>
        <main className="p-4 sm:p-6">
          <div className="bg-white rounded-2xl p-6 sm:p-8 text-center shadow-sm transition-colors">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 transition-colors">
              <User size={40} className="text-gray-400 " />
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">
              {t('profile.guest_user')}
            </h2>
            <p className="text-sm text-gray-500 mb-4 sm:mb-6">
              {t('profile.guest_subtitle')}
            </p>
            <button
              onClick={handleLogin}
              className="w-full bg-orange-500 text-white py-3 sm:py-4 rounded-xl font-semibold hover:bg-orange-600 active:scale-[0.98] transition-all mb-3"
            >
              {t('auth.login_signup')}
            </button>
            <button
              onClick={() => {
                setGuestMode();
                navigate("/customer/home");
              }}
              className="w-full bg-gray-100 text-gray-700 py-3 sm:py-4 rounded-xl font-semibold hover:bg-gray-200 active:scale-[0.98] transition-all"
            >
              {t('auth.continue_as_guest')}
            </button>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // Logged in user view
  return (
    <div className="min-h-screen pb-24 sm:pb-28 relative transition-colors duration-200 bg-white">
      {/* Header */}
      <header className="p-4 sm:px-6 sticky top-0 z-40 bg-white border-b border-gray-100 flex items-center gap-3 sm:gap-4 transition-colors duration-200">
        <button onClick={() => navigate(-1)} className="p-1">
          <ChevronLeft size={24} className="text-gray-900 " />
        </button>
        <p className="text-4 sm:text-lg font-medium text-[#101828] leading-[28px] font-nunito">
          {t('profile.title')}
        </p>
      </header>

      <main className="pb-4 mx-4 ">
        <div className="p-4 my-4 py-4 border-b rounded-2xl bg-[#FFFAF5] border-gray-100">
          <div className="flex items-center gap-3">
            {/* Profile Image */}
            <div className="w-15 h-15 rounded-full overflow-hidden border-2 border-[#ffffff]">
              <img
                src={resolveImageUrl(user?.avatar) || avatarFallback(user?.name)}
                alt="Profile"
                className="w-full h-full object-cover"
                onError={(e) => {
                  const fb = avatarFallback(user?.name);
                  if (e.target.src !== fb) { e.target.onerror = null; e.target.src = fb; }
                }}
              />
            </div>

            {/* User Info */}
            <div className="flex-1 min-w-0">
              {/* User Name */}
              <h2 className="text-lg sm:text-lg font-semibold text-[#101828] truncate font-nunito leading-[20px]">
                {user?.name || "User"}
              </h2>

              {/* Email */}
              <p className="text-sm sm:text-base font-regular font-varela text-gray-600 truncate mt-1">
                {user?.email || "user@gmail.com"}
              </p>

              {/* Edit Profile Button */}
              <button
                onClick={() => navigate("/customer/profile/edit")}
                className="flex items-center font-varela font-regular leading-[14px] gap-1 mt-1 text-xs sm:text-base text-gray-400 hover:text-orange-500 transition-colors"
              >
                {t('profile.edit_profile')}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>

          {/* Saved-profile chips — second row beneath the avatar/name block.
              Hidden when the user hasn't saved any of these yet so the
              card stays compact for new accounts. */}
          {hasAnyChip && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {dietChip && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white border border-[#F1E7D9] text-[11.5px] font-varela text-[#1A181B]">
                  <span className={`w-2 h-2 rounded-full ${dietChip.dot}`} />
                  {t(dietChip.labelKey)}
                </span>
              )}
              {dobLabel && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#F1E7D9] text-[11.5px] font-varela text-[#1A181B]">
                  <Cake size={12} className="text-[#FE8301]" />
                  {dobLabel}
                </span>
              )}
              {annLabel && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#F1E7D9] text-[11.5px] font-varela text-[#1A181B]">
                  <i className="fi fi-rr-ring text-[#FE8301] text-[12px]" />
                  {annLabel}
                </span>
              )}
              {cityLabel && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-[#F1E7D9] text-[11.5px] font-varela text-[#1A181B]">
                  <MapPin size={12} className="text-[#FE8301]" />
                  {cityLabel}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Health Mode Section */}
        <div
          className="mt-4 font-nunito bg-white border border-[#F2F1FA] rounded-2xl font-semibold transition-colors duration-200"
          style={{ boxShadow: "0px 4px 8.4px 0px #D0C9F833" }}
        >
          <div className="pb-2 px-4 pt-4">
            <h3 className="text-lg font-semibold text-[#101828]">
              {t('profile.health_mode_section')}
            </h3>
          </div>

          <MenuItem
            icon={Apple}
            label={t('profile.diet_preference')}
            onClick={() => setShowDietModal(true)}
          />

          <ToggleItem
            icon="fi fi-rr-heart-health-muscle"
            label={t('profile.health_mode')}
            value={healthMode}
            onChange={handleHealthModeToggle}
          />

          <MenuItem
            icon="fi fi-rr-time-past"
            label={t('profile.bill_history')}
            onClick={() =>
              navigate("/customer/orders", { state: { activeTab: "past" } })
            }
          />
          <MenuItem
            icon="fi fi-rr-heart"
            label={t('profile.favorites')}
            onClick={() => navigate("/customer/favorites")}
            showBorder={false}
          />
        </div>

        {/* Book Table / Event — actionable shortcuts. Each row is gated
            by the matching plan flag, so a Table-only tenant doesn't see
            the Hall row and vice versa. */}
        {hasAnyBooking && (
        <div
          className="mt-4 font-nunito bg-white border border-[#F2F1FA] rounded-2xl font-semibold transition-colors duration-200"
          style={{
            boxShadow: "0px 4px 8.4px 0px #D0C9F833",
          }}
        >
          <div className="pb-2 px-4 pt-4">
            <h3 className="text-lg font-semibold text-[#101828]">
              {t('profile.book_table_event')}
            </h3>
          </div>

          {hasTableBooking && (
            <MenuItem
              icon="fi fi-rr-restaurant"
              label={t('profile.book_table')}
              onClick={() => navigate("/customer/booking-type")}
              showBorder={hasHallBooking}
            />
          )}

          {hasHallBooking && (
            <MenuItem
              icon="fi fi-rr-confetti"
              label={t('profile.book_event_hall')}
              onClick={() =>
                navigate("/customer/book-table-details", {
                  state: { bookingType: "hall" },
                })
              }
              showBorder={false}
            />
          )}
        </div>
        )}

        {/* Parking Details — temporarily hidden, do not delete.
            Flip SHOW_PARKING_DETAILS to true to re-enable. */}
        {SHOW_PARKING_DETAILS && (
          <div
            className="mt-4 font-nunito bg-white border border-[#F2F1FA] font-semibold rounded-2xl transition-colors duration-200"
            style={{
              boxShadow: "0px 4px 8.4px 0px #D0C9F833",
            }}
          >
            <div className="pb-2 px-4 pt-4">
              <h3 className="text-lg font-semibold text-[#101828]">
                Parking Details
              </h3>
            </div>

            <MenuItem
              icon="fi fi-rr-car-alt"
              label="Vehicle Type"
              onClick={() => navigate("/customer/parking-details")}
            />

            <MenuItem
              icon="fi fi-rr-brand"
              label="Vehicle Number"
              onClick={() => navigate("/customer/parking-details")}
            />

            <MenuItem
              icon="fi fi-rr-parking-circle"
              label="Parking Required by Default"
              onClick={() => setParkingRequired(prev => !prev)}
              showBorder={false}
            />
          </div>
        )}

        {/* Notification Preference — temporarily hidden, do not delete.
            Flip SHOW_NOTIFICATION_PREFS to true to re-enable. */}
        {SHOW_NOTIFICATION_PREFS && (
          <div
            className="mt-4 font-nunito bg-white border border-[#F2F1FA] font-semibold rounded-2xl transition-colors duration-200"
            style={{
              boxShadow: "0px 4px 8.4px 0px #D0C9F833",
            }}
          >
            <div className="pb-2 px-4 pt-4">
              <h3 className="text-lg font-semibold text-[#101828]">
                Notification Preference
              </h3>
            </div>

            <ToggleItem
              icon="fi fi-brands-whatsapp" // WhatsApp
              label="WhatsApp Notifications"
              value={whatsappNotif}
              onChange={setWhatsappNotif}
            />

            <ToggleItem
              icon="fi fi-rr-message-sms"
              label="SMS Notifications"
              value={smsNotif}
              onChange={setSmsNotif}
            />

            <ToggleItem
              icon="fi fi-rr-bell"
              label="App Push Notifications"
              value={pushNotif}
              onChange={setPushNotif}
            />

            <MenuItem
              icon="fi fi-rr-megaphone"
              label="Marketing Consent"
              onClick={() => {}}
              showBorder={false}
            />
          </div>
        )}

        {/* App Appearance */}
        <div
          className="mt-4 font-nunito bg-white border border-[#F2F1FA] font-semibold rounded-2xl transition-colors duration-200"
          style={{
            boxShadow: "0px 4px 8.4px 0px #D0C9F833",
          }}
        >
          <div className="pb-2 px-4 pt-4">
            <h3 className="text-lg font-semibold text-[#101828]">
              {t('profile.app_appearance')}
            </h3>
          </div>

          <MenuItem
            icon="fi fi-rr-globe"
            label={t('profile.language_preference')}
            onClick={() => setShowLanguageModal(true)}
          />

          {/* Voice Order — temporarily hidden, do not delete.
              Flip SHOW_VOICE_ORDER to true to re-enable. */}
          {SHOW_VOICE_ORDER && (
            <ToggleItem
              icon="fi fi-rr-microphone"
              label={t('profile.voice_order')}
              value={voiceOrder}
              onChange={setVoiceOrder}
              showBorder={!hasWallet}
            />
          )}

          {hasWallet && (
            <MenuItem
              icon="fi fi-rr-wallet"
              label={t('profile.wallet')}
              onClick={() => navigate("/customer/wallet")}
            />
          )}
        </div>

        {/* Order History Section — only shown if the tenant offers at
            least one booking flow. Individual table/hall rows are also
            gated separately so a Table-only plan hides the Hall row. */}
        {hasAnyBooking && (
        <div
          className="mt-4 font-nunito bg-white border border-[#F2F1FA] font-semibold rounded-2xl transition-colors duration-200"
          style={{
            boxShadow: "0px 4px 8.4px 0px #D0C9F833",
          }}
        >
          <div className="pb-2 px-4 pt-4">
            <h3 className="text-lg font-semibold text-[#101828]">
              {t('profile.order_history')}
            </h3>
          </div>

          {hasTableBooking && (
            <MenuItem
              icon="fi fi-rr-calendar-check"
              label={t('profile.advance_booking_history')}
              onClick={() => navigate("/customer/booking-history?type=table")}
              showBorder={hasHallBooking}
            />
          )}

          {hasHallBooking && (
            <MenuItem
              icon="fi fi-rr-calendar-clock"
              label={t('profile.event_booking_history')}
              onClick={() => navigate("/customer/booking-history?type=hall")}
              showBorder={false}
            />
          )}
        </div>
        )}

        {/* Logout Section */}
        <div className="mt-4 font-nunito bg-white border border-[#F2F1FA] font-semibold rounded-2xl transition-colors duration-200">
          <button
            onClick={() => {
              const isStaff = ['waiter', 'captain', 'chef', 'admin'].includes(user?.role);
              // Read the restaurant before logout — customers land back on
              // that restaurant's page (or the platform home when none).
              const exitTo = isStaff ? '/staff-login' : activeRestaurantPath();
              logout();
              navigate(exitTo);
            }}
            className="w-full flex items-center justify-between px-4 py-4 sm:px-6 sm:py-5 hover:bg-red-50 active:bg-red-100 transition-colors text-red-600 "
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <LogOut size={20} />
              <span className="text-base min-[375px]:text-lg font-medium">
                {t('profile.logout')}
              </span>
            </div>
            <ChevronRight size={16} className="text-red-400 " />
          </button>
        </div>
      </main>

      <BottomNav />

      {/* Diet Preference Modal */}
      {showDietModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-50 transition-opacity"
            onClick={() => setShowDietModal(false)}
          />

          {/* Modal Content */}
          <div className="fixed bottom-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 left-0 right-0 bg-white z-50 rounded-t-[16px] md:rounded-2xl md:max-w-md w-full p-6 transform transition-transform animate-slideUp md:animate-none">
            <div className="flex justify-between items-center mb-1">
              {/* Centered handle indicator */}
              <span />

              {/* Close Button Floating */}
              <button
                onClick={() => setShowDietModal(false)}
                className="absolute -top-14 md:top-4 right-4 md:right-4 p-2 bg-white md:bg-gray-100/50 rounded-full shadow-lg md:shadow-none active:scale-95 transition-transform"
              >
                <X size={24} className="text-[#666666]" />
              </button>
            </div>

            <h2 className="text-[18px] text-left text-[#101828] mb-4 font-nunito font-semibold leading-[24px]">
              {t('profile.diet_modal_title')}
            </h2>

            <div className="space-y-6 mb-7">
              {/* Veg Option */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setIsVeg(!isVeg)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border border-green-600 rounded-sm flex items-center justify-center p-0.5">
                    <div className="w-3 h-3 bg-green-600 rounded-full " />
                  </div>
                  <span className="text-[15px] text-[#101828] font-varela leading-[18px]">
                    {t('profile.diet_veg')}
                  </span>
                </div>

                <div
                  className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all ${isVeg ? "bg-orange-500 border-orange-500" : "border-gray-300 "}`}
                >
                  {isVeg && <Check size={16} className="text-white " />}
                </div>
              </div>

              {/* Non-Veg Option */}
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setIsNonVeg(!isNonVeg)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 border border-red-600 rounded-sm flex items-center justify-center p-0.5">
                    <div className="w-3 h-3 bg-red-600 rounded-full " />
                  </div>
                  <span className="text-[15px] text-[#101828] font-varela leading-[18px]">
                    {t('profile.diet_nonveg')}
                  </span>
                </div>

                <div
                  className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-all ${isNonVeg ? "bg-orange-500 border-orange-500" : "border-gray-300 "}`}
                >
                  {isNonVeg && <Check size={16} className="text-white " />}
                </div>
              </div>
            </div>

            {/* Allergy Selection */}
            <div className="mb-8">
              <h3 className="text-[18px] text-[#101828] mb-4 font-nunito font-semibold leading-[24px]">
                {t('profile.allergy_selection')}
              </h3>
              <div className="bg-[#FCFCFF] min-h-[120px] rounded-[16px] border border-[#F1F0FC] p-4 overflow-hidden">
                <textarea
                  value={allergyText}
                  onChange={(e) => setAllergyText(e.target.value)}
                  maxLength={1000}
                  placeholder={t('profile.allergy_placeholder')}
                  className="w-full bg-transparent text-[#645E66] placeholder:text-[#645E66] outline-none resize-none h-20 text-[14px] font-varela leading-[20px]"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* Language Preference Modal */}
      {showLanguageModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 z-50 transition-opacity"
            onClick={() => setShowLanguageModal(false)}
          />

          {/* Modal Content */}
          <div className="fixed bottom-0 md:bottom-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 left-0 right-0 bg-white z-50 rounded-t-3xl md:rounded-2xl md:max-w-md w-full p-6 transform transition-transform animate-slideUp md:animate-none">
            <div className="flex justify-between items-center mb-1">
              <span />

              {/* Close Button Floating */}
              <button
                onClick={() => setShowLanguageModal(false)}
                className="absolute -top-14 md:top-4 right-4 md:right-4 p-2 bg-white md:bg-gray-100/50 rounded-full shadow-lg md:shadow-none active:scale-95 transition-transform"
              >
                <X size={24} className="text-gray-900 " />
              </button>
            </div>

            <h2 className="text-xl font-bold text-center text-gray-900 mb-2">
              {t('profile.language_preference')}
            </h2>
            <p className="text-center text-gray-500 mb-8">
              {t('profile.lang_modal_subtitle')}
            </p>

            <div className="space-y-4 mb-8">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const active = selectedLanguage === lang.code;
                return (
                  <div
                    key={lang.code}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 cursor-pointer active:bg-gray-100"
                    onClick={() => handleLanguageChange(lang.code)}
                  >
                    <span className="text-base font-medium text-gray-900">
                      {lang.nativeLabel}
                      {lang.nativeLabel !== lang.label && (
                        <span className="ml-2 text-sm text-gray-500 font-normal">
                          ({lang.label})
                        </span>
                      )}
                    </span>
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center ${active ? "border-orange-500" : "border-gray-300"}`}
                    >
                      {active && (
                        <div className="w-2.5 h-2.5 bg-orange-500 rounded-full" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="w-32 h-1 bg-gray-900 rounded-full mx-auto opacity-10 " />
          </div>
        </>
      )}
    </div>
  );
}

// Menu Item Component (with chevron)
function MenuItem({ icon, label, onClick, showBorder = true, iconClassName, iconFill }) {
  const isStringIcon = typeof icon === "string";
  const isImagePath =
    isStringIcon &&
    (icon.endsWith(".svg") ||
      icon.endsWith(".png") ||
      icon.includes("/assets/"));
  const Icon = icon;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5 hover:bg-gray-50 active:bg-gray-100  transition-colors ${showBorder ? "border-b border-gray-100 " : ""
        }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {isImagePath ? (
          <img src={icon} alt="" className="w-6 h-6 object-contain " />
        ) : isStringIcon ? (
          <i className={`${icon} ${iconClassName || "text-[#7D7380]"} text-[24px]`} />
        ) : (
          // Lucide icons render `<svg fill="none">` by default — the
          // `fill` HTML attribute won't be overridden by a Tailwind
          // `fill-*` className on every browser. Pass the colour via
          // the `fill` prop directly when a filled look is wanted
          // (e.g. heart for Favourites).
          <Icon
            className={`w-5 h-5 min-[375px]:w-6 min-[375px]:h-6 ${iconClassName || "text-[#7D7380]"}`}
            {...(iconFill ? { fill: iconFill } : {})}
          />
        )}

        <span className="text-base min-[375px]:text-lg font-semibold text-[#101828] truncate">
          {label}
        </span>
      </div>
      <ChevronRight size={20} className="text-gray-400 " />
    </button>
  );
}

// Toggle Item Component (with toggle switch)
function ToggleItem({ icon, label, value, onChange, showBorder = true }) {
  const isStringIcon = typeof icon === "string";
  const Icon = icon;

  return (
    <div
      className={`w-full flex items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5 ${showBorder ? "border-b border-gray-100 " : ""
        }`}
    >
      <div className="flex items-center gap-3 sm:gap-4">
        {isStringIcon ? (
          <i className={`${icon} text-[#7D7380] text-[24px]`} />
        ) : (
          <Icon size={24} className="text-[#7D7380] " />
        )}

        <span className="text-base min-[375px]:text-lg font-semibold text-[#101828] truncate">
          {label}
        </span>
      </div>

      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors ${value ? "bg-[#4CAF50]" : "bg-gray-300 "
          }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow-sm ${value ? "translate-x-5" : "translate-x-0"
            }`}
        />
      </button>
    </div>
  );
}

export default Profile;
