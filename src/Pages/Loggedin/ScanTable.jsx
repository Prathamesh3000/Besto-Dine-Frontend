import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronLeft,
  QrCode,
  Users,
  MapPin,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  UtensilsCrossed,
  ShoppingBag,
  Coffee,
} from 'lucide-react';
import api from '../../utils/api';
import { useAuth } from '../../Context/AuthContext';
import { setActiveTenant, clearActiveTenant, activeRestaurantPath } from '../../utils/tenant';
import { clearDineInLock } from '../../utils/dineInSession';
import { resolveImageUrl } from '../../utils/image';

// Clear any stale session data when the QR page loads. Must NOT run
// during render — clearActiveTenant() notifies subscribers (MenuProvider),
// which triggers a setState-in-render warning. Called from the mount effect.
function clearStaleSession() {
  localStorage.removeItem('user');
  localStorage.removeItem('cafeUser');
  localStorage.removeItem('token');
  localStorage.removeItem('isGuest');
  localStorage.removeItem('fromQrScan');
  localStorage.removeItem('cafe_orders_v2');
  localStorage.removeItem('cancelled_orders_v1');
  localStorage.removeItem('order_ratings');
  localStorage.removeItem('guest_bill_paid_at');
  localStorage.removeItem('guest_session_start');
  localStorage.removeItem('guest_cart_reset');
  localStorage.removeItem('cart');
  localStorage.removeItem('scanToken');
  clearActiveTenant();
}

function ScanTable() {
  const { qrToken } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { logout } = useAuth();

  // `/scan` with no token is the "scan your table" prompt a guest is
  // routed to when they try to order dine-in without a table (or their
  // table was removed). It must not wipe the session.
  const [status, setStatus] = useState(qrToken ? 'loading' : 'needScan');
  const [table, setTable] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Grab the previous scan token BEFORE the cleanup effect wipes it.
  // Sent with the scan so a diner re-scanning the same table keeps
  // their session (and seat) instead of counting as a new party
  // against the table's capacity.
  const priorScanTokenRef = useRef(qrToken ? localStorage.getItem('scanToken') : null);

  // Runs before the fetch effect below (effects fire in registration
  // order), so the /tables/scan request goes out with a cleared tenant
  // and the backend response establishes the correct one.
  useEffect(() => {
    if (!qrToken) return;
    clearStaleSession();
    logout();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!qrToken) {
      setStatus('needScan');
      return;
    }

    const fetchTable = async () => {
      try {
        const prior = priorScanTokenRef.current;
        const { data } = await api.get(`/tables/scan/${qrToken}`, {
          _silent: true,
          ...(prior ? { headers: { 'X-Scan-Token': prior } } : {}),
        });

        // Phase 1 SaaS: the scan response now includes the table's owning
        // restaurant. Persist that as the active tenant so every customer
        // request from this session sends `X-Restaurant-Slug` and the
        // backend scopes data to the right tenant.
        //
        // Phase 2.5: also persist the tenant's customer-facing feature
        // flags so the UI can hide locked modules (Wallet, Bookings,
        // Coupons) without letting the user tap through to a 403.
        //
        // Phase 6 step 5: also persist the table's branch (if any) so
        // every subsequent request sends X-Branch-Id and the menu
        // automatically scopes to "shared + this branch's items".
        // The QR scan response populates `data.branch` from step 2's
        // tableController change.
        if (data?.restaurant?.slug) {
          setActiveTenant({
            slug: data.restaurant.slug,
            name: data.restaurant.name,
            _id: data.restaurant._id,
            features: data.restaurant.features || {},
            branch: data.branch || null,
            // Phase 7.4 — propagate branding so the customer's
            // session is themed immediately after the QR scan.
            branding: data.restaurant.branding || null,
          });
        }

        // Store table info for the order flow
        localStorage.setItem('dineInTable', JSON.stringify({
          _id: data._id,
          name: data.name,
          capacity: data.capacity,
          area: data.area,
          qrToken: data.qrToken,
        }));
        localStorage.setItem('orderType', 'dine-in');
        localStorage.setItem('fromQrScan', 'true');
        // Fresh QR scan starts a NEW dine-in session — clear any
        // residual "bill settled" lock from the previous customer
        // who used this table. Without this the new customer's UI
        // would stay locked even though they just scanned in.
        clearDineInLock();

        // Persist the signed scan-session token so guest POST /orders
        // can prove the browser actually scanned this table. The api.js
        // interceptor reads this and attaches X-Scan-Token on every
        // request; backend createOrder validates it for guest dine-in.
        if (data.scanToken) {
          localStorage.setItem('scanToken', data.scanToken);
        }

        // Anchor for the client-side inactivity watchdog in
        // CustomerLayout. If no order is placed within the grace
        // window, the overlay auto-exits the guest back to landing.
        localStorage.setItem('scanSessionStart', Date.now().toString());

        // Note: table status is updated to 'occupied' when the order is created (orderController),
        // not here, since this page runs without auth after session cleanup.

        setTable(data);
        setStatus('success');
      } catch (err) {
        setStatus('error');
        const msg = err.response?.data?.message || 'Failed to load table information.';
        setErrorMsg(msg);
      }
    };

    fetchTable();
  }, [qrToken]);

  const handleContinue = () => {
    // Navigate to Splash screen → Splash auto-navigates to Login after 2s
    navigate('/splash', {
      replace: true,
      state: { from: 'qr-scan' },
    });
  };

  // ── Loading State ──────────────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className="min-h-screen font-manrope flex flex-col items-center justify-center gap-6 px-6 relative overflow-hidden selection:bg-orange-100"
           style={{ background: 'radial-gradient(circle at 50% 20%, #FFF4E6 0%, #FDFDFD 55%)' }}>
        {/* Decorative blurred blobs for depth */}
        <div className="pointer-events-none absolute top-[-80px] right-[-60px] w-60 h-60 rounded-full bg-[#FE8301] opacity-[0.08] blur-3xl" />
        <div className="pointer-events-none absolute bottom-[-100px] left-[-60px] w-72 h-72 rounded-full bg-[#FFB266] opacity-[0.10] blur-3xl" />

        {/* Animated scanner ring */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center">
          <div className="absolute inset-0 rounded-[28px] border-2 border-[#FE8301]/20 animate-ping" />
          <div className="absolute inset-2 rounded-[24px] bg-white border border-[#F2F4F7] shadow-[0px_8px_24px_rgba(254,131,1,0.10)] flex items-center justify-center">
            <QrCode size={40} className="text-[#FE8301]" strokeWidth={2.2} />
          </div>
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#FE8301] animate-pulse shadow-[0_0_12px_rgba(254,131,1,0.6)]" />
        </div>

        <div className="text-center relative z-10">
          <p className="text-[18px] font-[700] text-[#1A181B] tracking-tight">Scanning your table</p>
          <p className="text-[13px] font-[500] text-[#8D848F] mt-1.5">Just a moment while we verify…</p>
        </div>
      </div>
    );
  }

  // ── Scan Required (no table bound) ─────────────────────────────────────────
  if (status === 'needScan') {
    const reason = location.state?.reason;
    const heading = reason === 'table_removed'
      ? 'This table is no longer available'
      : 'Scan your table to order';
    const body = reason === 'table_removed'
      ? 'The restaurant has removed the table you were seated at. Please scan the QR code on your current table to continue ordering.'
      : 'Dine-in orders are sent to a specific table. Scan the QR code placed on your table with your phone camera to start ordering.';
    return (
      <div className="min-h-screen font-manrope flex flex-col relative overflow-hidden selection:bg-orange-100"
           style={{ background: 'radial-gradient(circle at 50% 0%, #FFF4E6 0%, #FDFDFD 55%)' }}>
        <header className="relative z-10 flex items-center justify-between px-5 py-5">
          <button
            onClick={() => navigate('/customer/home')}
            className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md border border-[#F2F4F7] flex items-center justify-center text-[#1A181B] active:scale-95 transition-transform shadow-sm"
            aria-label="Back to menu"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-[15px] font-[600] text-[#1A181B] tracking-tight">Scan Table</h1>
          <div className="w-10 h-10" />
        </header>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-40">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mb-7">
            <div className="absolute inset-0 rounded-[28px] border-2 border-[#FE8301]/20 animate-ping" />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-[24px] flex items-center justify-center shadow-[0_8px_24px_rgba(254,131,1,0.15)] border border-[#F2F4F7]">
              <QrCode size={36} className="text-[#FE8301]" strokeWidth={2.2} />
            </div>
          </div>
          <div className="text-center max-w-[340px]">
            <h2 className="text-[22px] sm:text-[24px] font-[800] text-[#1A181B] mb-2.5 tracking-tight leading-tight">
              {heading}
            </h2>
            <p className="text-[14px] font-[500] text-[#645E66] leading-relaxed">
              {body}
            </p>
          </div>
        </div>

        <div className="fixed bottom-0 left-0 right-0 xl:left-[300px] xl:right-[300px] bg-white/85 backdrop-blur-md p-4 sm:p-5 flex flex-col gap-2.5 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.06)] border-t border-[#F2F4F7] z-50">
          <button
            onClick={() => navigate('/customer/home')}
            className="w-full bg-[#F5F5F7] text-[#1A181B] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] active:scale-[0.98] transition-all"
          >
            Keep browsing the menu
          </button>
        </div>
      </div>
    );
  }

  // ── Error State ────────────────────────────────────────────────────────────
  if (status === 'error') {
    return (
      <div className="min-h-screen font-manrope flex flex-col relative overflow-hidden selection:bg-orange-100"
           style={{ background: 'radial-gradient(circle at 50% 0%, #FFF0F0 0%, #FDFDFD 50%)' }}>
        {/* Decorative blob */}
        <div className="pointer-events-none absolute top-[-100px] right-[-80px] w-80 h-80 rounded-full bg-red-200 opacity-30 blur-3xl" />

        {/* Header */}
        <header className="relative z-10 flex items-center justify-between px-5 py-5">
          <button
            onClick={() => navigate(activeRestaurantPath())}
            className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md border border-[#F2F4F7] flex items-center justify-center text-[#1A181B] active:scale-95 transition-transform shadow-sm"
            aria-label="Back to home"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-[15px] font-[600] text-[#1A181B] tracking-tight">Scan Table</h1>
          <div className="w-10 h-10" />
        </header>

        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 pb-40">
          {/* Error Icon — circular badge with concentric ring */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 flex items-center justify-center mb-7">
            <div className="absolute inset-0 rounded-full bg-red-100/60 blur-2xl" />
            <div className="absolute inset-0 rounded-full border border-red-200/60" />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 bg-white rounded-full flex items-center justify-center shadow-[0_8px_24px_rgba(239,68,68,0.15)] border border-red-100">
              <AlertCircle size={32} className="text-red-500 sm:w-9 sm:h-9" strokeWidth={2.2} />
            </div>
          </div>

          {/* Error Content */}
          <div className="text-center max-w-[340px]">
            <h2 className="text-[22px] sm:text-[24px] font-[800] text-[#1A181B] mb-2.5 tracking-tight leading-tight">
              {errorMsg}
            </h2>
            <p className="text-[14px] font-[500] text-[#645E66] leading-relaxed">
              Please ask staff for assistance or try scanning the QR code again.
            </p>
          </div>

          {/* Helpful tip card */}
          <div className="mt-8 w-full max-w-[340px] bg-white border border-[#F2F4F7] rounded-[18px] px-5 py-4 flex items-start gap-3 shadow-[0px_2px_12px_rgba(0,0,0,0.03)]">
            <div className="w-9 h-9 rounded-full bg-[#FFF9F2] flex items-center justify-center flex-shrink-0">
              <Sparkles size={16} className="text-[#FE8301]" />
            </div>
            <div className="min-w-0">
              <p className="text-[13px] font-[700] text-[#1A181B]">Tip</p>
              <p className="text-[12.5px] font-[500] text-[#645E66] leading-relaxed mt-0.5">
                Make sure the QR is clean and the full code is visible in the scanner.
              </p>
            </div>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="fixed bottom-0 left-0 right-0 xl:left-[300px] xl:right-[300px] bg-white/85 backdrop-blur-md p-4 sm:p-5 flex flex-col gap-2.5 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.06)] border-t border-[#F2F4F7] z-50">
          <button
            onClick={() => navigate(-1)}
            className="w-full text-white font-nunito font-semibold text-[14.5px] py-4 rounded-[16px] active:scale-[0.98] transition-all shadow-[0_8px_20px_-4px_rgba(254,131,1,0.45)]"
            style={{ background: 'linear-gradient(135deg, #FE8301 0%, #FF6B00 100%)' }}
          >
            Try Again
          </button>
          <button
            onClick={() => navigate(activeRestaurantPath())}
            className="w-full bg-[#F5F5F7] text-[#1A181B] font-nunito font-semibold text-[14px] py-3.5 rounded-[16px] active:scale-[0.98] transition-all"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // ── Success State — Table Found ────────────────────────────────────────────
  const capacityLabel = `${table.capacity} ${table.capacity === 1 ? 'person' : 'people'}`;

  // Logo: prefer the branding.logoUrl set in the customer-branding panel,
  // fall back to the legacy `restaurant.logo` for tenants that never
  // migrated to the branding object.
  const restaurantName = table.restaurant?.name || '';
  const logoSrc = table.restaurant?.branding?.logoUrl || table.restaurant?.logo || null;
  const resolvedLogo = logoSrc ? resolveImageUrl(logoSrc) : null;

  // Branch label fallback chain — admins commonly set branch.name to the
  // legal/full restaurant name ("Hotel Tip Top") and put the actual
  // location in `displayLabel` ("FC Road") or the address fields. Picking
  // branch.name blindly would just echo the restaurant name back at the
  // user, so walk the chain and skip any value that duplicates the
  // restaurant name.
  const pickBranchLabel = (b) => {
    if (!b) return null;
    const candidates = [b.displayLabel, b.addressLine1, b.city, b.name];
    for (const c of candidates) {
      const v = (c || '').trim();
      if (v && v.toLowerCase() !== restaurantName.toLowerCase()) return v;
    }
    return null;
  };
  const branchLabel = pickBranchLabel(table.branch);

  return (
    <div className="min-h-screen font-manrope flex flex-col relative overflow-hidden selection:bg-orange-100"
         style={{ background: 'radial-gradient(ellipse 80% 50% at 50% 0%, #FFF4E6 0%, #FDFDFD 60%)' }}>
      {/* Decorative blobs — depth without distraction */}
      <div className="pointer-events-none absolute top-[-120px] right-[-80px] w-72 h-72 rounded-full bg-[#FE8301] opacity-[0.08] blur-3xl" />
      <div className="pointer-events-none absolute top-[200px] left-[-100px] w-72 h-72 rounded-full bg-[#FFB266] opacity-[0.08] blur-3xl" />

      {/* Floating Header */}
      <header className="relative z-20 flex items-center justify-between px-5 py-5">
        <button
          onClick={() => navigate(activeRestaurantPath())}
          className="w-10 h-10 rounded-full bg-white/70 backdrop-blur-md border border-[#F2F4F7] flex items-center justify-center text-[#1A181B] active:scale-95 transition-transform shadow-sm"
          aria-label="Back to home"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="px-3.5 py-1.5 rounded-full bg-green-50 border border-green-100 flex items-center gap-1.5">
          <div className="relative w-2 h-2">
            <div className="absolute inset-0 rounded-full bg-green-500" />
            <div className="absolute inset-0 rounded-full bg-green-500 animate-ping opacity-60" />
          </div>
          <span className="text-[11px] font-[700] text-green-700 uppercase tracking-wider">Live</span>
        </div>
        <div className="w-10 h-10" />
      </header>

      {/* Content */}
      <div className="relative z-10 flex-1 px-5 pb-44">
        {/* ── Hero: Restaurant Identity ────────────────────────────────────── */}
        <div className="flex flex-col items-center pt-2 sm:pt-4 mb-7">
          {/* Logo / Brand badge with success ring */}
          <div className="relative mb-5">
            <div className="absolute inset-0 rounded-[28px] bg-[#FE8301]/10 blur-2xl scale-110" />
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 bg-white rounded-[28px] border border-[#F2F4F7] shadow-[0_12px_32px_-8px_rgba(254,131,1,0.25)] flex items-center justify-center overflow-hidden">
              {resolvedLogo ? (
                <img
                  src={resolvedLogo}
                  alt={restaurantName || 'Restaurant logo'}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Hide the broken image and let the parent fall
                    // back to the letter chip behind it by toggling
                    // the sibling's display.
                    e.target.onerror = null;
                    e.target.style.display = 'none';
                    const fb = e.target.nextElementSibling;
                    if (fb) fb.style.display = 'flex';
                  }}
                />
              ) : null}
              {/* Letter fallback — hidden when the img loads, shown if
                  no logo OR if the img errors. Always rendered so the
                  onError handler can flip it on without a state round-trip. */}
              <span
                className="absolute inset-0 flex items-center justify-center text-[36px] font-[900] text-[#FE8301] tracking-tight"
                style={{ display: resolvedLogo ? 'none' : 'flex' }}
              >
                {restaurantName
                  ? restaurantName.charAt(0).toUpperCase()
                  : <UtensilsCrossed size={36} className="text-[#FE8301]" strokeWidth={2.2} />}
              </span>
            </div>
            {/* Small success check overlay */}
            <div className="absolute -bottom-1 -right-1 w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-md border border-[#F2F4F7]">
              <CheckCircle2 size={22} className="text-green-500 fill-green-50" strokeWidth={2.2} />
            </div>
          </div>

          {/* Welcome headline */}
          <h2 className="text-[26px] sm:text-[30px] font-[800] text-[#1A181B] tracking-tight text-center leading-tight max-w-[320px]">
            {table.restaurant?.name ? `Welcome to ${table.restaurant.name}` : 'Table Scanned!'}
          </h2>

          {/* Branch + status line — uses pickBranchLabel() which prefers
              displayLabel → addressLine1 → city → name, skipping any
              candidate that just duplicates the restaurant name. */}
          <div className="mt-2.5 flex items-center gap-2 text-[13.5px] font-[500] text-[#645E66]">
            {branchLabel ? (
              <>
                <MapPin size={14} className="text-[#FE8301]" />
                <span>{branchLabel}</span>
              </>
            ) : (
              <>
                <Sparkles size={14} className="text-[#FE8301]" />
                <span>You're all set to start ordering</span>
              </>
            )}
          </div>
        </div>

        {/* ── Boarding-Pass Style Table Card ───────────────────────────────── */}
        <div className="relative">
          {/* Card body */}
          <div className="relative bg-white border border-[#F2F4F7] rounded-[28px] shadow-[0px_12px_32px_-12px_rgba(0,0,0,0.08)] overflow-hidden">
            {/* Decorative gradient strip at top */}
            <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #FE8301 0%, #FF6B00 50%, #FFB266 100%)' }} />

            {/* Top: Big table number */}
            <div className="px-6 pt-6 pb-5 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-[700] text-[#8D848F] uppercase tracking-[0.12em] mb-1.5">Your Table</p>
                <p className="text-[36px] sm:text-[42px] font-[900] text-[#1A181B] tracking-tight leading-none truncate">
                  {table.name}
                </p>
              </div>
              <div className="w-16 h-16 rounded-[20px] flex items-center justify-center flex-shrink-0"
                   style={{ background: 'linear-gradient(135deg, #FFF4E6 0%, #FFE4C4 100%)' }}>
                <Coffee size={28} className="text-[#FE8301]" strokeWidth={2.2} />
              </div>
            </div>

            {/* Perforated divider — boarding-pass aesthetic */}
            <div className="relative px-6">
              <div className="absolute left-0 -translate-x-1/2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#FDFDFD] border border-[#F2F4F7]" />
              <div className="absolute right-0 translate-x-1/2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[#FDFDFD] border border-[#F2F4F7]" />
              <div className="border-t border-dashed border-[#E5E7EB]" />
            </div>

            {/* Bottom: Capacity + Area in two columns */}
            <div className="px-6 py-5 grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Users size={13} className="text-[#8D848F]" />
                  <p className="text-[10.5px] font-[700] text-[#8D848F] uppercase tracking-[0.1em]">Capacity</p>
                </div>
                <p className="text-[15px] font-[700] text-[#1A181B]">{capacityLabel}</p>
              </div>
              {table.area?.name && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <MapPin size={13} className="text-[#8D848F]" />
                    <p className="text-[10.5px] font-[700] text-[#8D848F] uppercase tracking-[0.1em]">Area</p>
                  </div>
                  <p className="text-[15px] font-[700] text-[#1A181B] truncate">{table.area.name}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Status Badge (only when table.status === 'occupied') ─────────── */}
        {/* Fresh QR scan mints a new scanSessionId, so a new guest CANNOT
            join the previous group's order (socket scanSessionId gate).
            Tell the user to flag staff instead of promising a non-existent
            "add to existing order" path. */}
        {table.status === 'occupied' && (
          <div className="mt-4 bg-gradient-to-br from-[#FFF9F2] to-[#FFF4E6] border border-orange-200/60 rounded-[20px] px-5 py-4 flex items-start gap-3 shadow-[0px_4px_12px_rgba(254,131,1,0.06)]">
            <div className="w-9 h-9 rounded-full bg-white border border-orange-100 flex items-center justify-center flex-shrink-0 shadow-sm">
              <AlertCircle size={18} className="text-[#FE8301]" strokeWidth={2.2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-[700] text-[#1A181B] mb-0.5">Table has an open bill</p>
              <p className="text-[12.5px] font-[500] text-[#645E66] leading-relaxed">
                Please ask staff to settle the previous order or start a new session before ordering.
              </p>
            </div>
          </div>
        )}

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <div className="mt-6">
          <p className="text-[11px] font-[700] text-[#8D848F] uppercase tracking-[0.12em] mb-3 text-center">
            What's next
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: UtensilsCrossed, label: 'Browse', sub: 'the menu' },
              { icon: ShoppingBag,     label: 'Order',  sub: 'at your pace' },
              { icon: Sparkles,        label: 'Enjoy',  sub: 'your meal' },
            ].map((step, i) => (
              <div key={i} className="bg-white/70 backdrop-blur-sm border border-[#F2F4F7] rounded-[18px] px-3 py-3.5 flex flex-col items-center text-center">
                <div className="w-9 h-9 rounded-full bg-[#FFF9F2] flex items-center justify-center mb-1.5">
                  <step.icon size={16} className="text-[#FE8301]" />
                </div>
                <p className="text-[12.5px] font-[700] text-[#1A181B] leading-tight">{step.label}</p>
                <p className="text-[10.5px] font-[500] text-[#8D848F] leading-tight mt-0.5">{step.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fixed Footer — Premium gradient CTA ────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 xl:left-[300px] xl:right-[300px] bg-white/85 backdrop-blur-md p-4 sm:p-5 shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.08)] border-t border-[#F2F4F7] z-50">
        <button
          onClick={handleContinue}
          className="group relative w-full text-white font-nunito font-bold text-[15px] py-4 rounded-[18px] active:scale-[0.98] transition-all shadow-[0_10px_28px_-6px_rgba(254,131,1,0.50)] overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #FE8301 0%, #FF6B00 100%)' }}
        >
          {/* Sheen */}
          <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent -translate-x-full group-active:translate-x-full transition-transform duration-700" />
          <span className="relative flex items-center justify-center gap-2">
            Start Ordering
            <ArrowRight size={18} strokeWidth={2.5} className="transition-transform group-active:translate-x-1" />
          </span>
        </button>
        <p className="text-center text-[11px] font-[500] text-[#8D848F] mt-2.5">
          Dine-in session active · Pay anytime from your order
        </p>
      </div>
    </div>
  );
}

export default ScanTable;
