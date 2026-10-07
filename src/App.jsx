import React, { Suspense, useState, useEffect, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigationType, useParams } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { AuthProvider } from './Context/AuthContext';
import LanguageSync from './i18n/LanguageSync';
import { CartProvider } from './Context/CartContext';
import { HealthProvider } from './Context/Loggedin/HealthContext';
import { MenuProvider, useMenu } from './Context/MenuContext';
import { NotificationProvider } from './Context/NotificationContext';
import ProtectedRoute from './Components/ProtectedRoute';
import RequireFeature from './Components/RequireFeature';
import { STAFF_ROLES, CAPTAIN_ROLES, CUSTOMER_ROLES, ADMIN_ROLES, CHEF_ROLES, SUPERADMIN_ROLES } from './Context/AuthContext';
// Roles the waiterDashboard plan gate applies to (admins also use /waiter/*).
const WAITER_APP_ROLES = ['waiter', 'captain'];
import { Toaster } from 'react-hot-toast';
import { UpgradePromptHost } from './Components/Common/UpgradePrompt';
import { isServerDown, subscribeServerStatus, isOffline, subscribeOnlineStatus } from './utils/serverStatus';
import { CUSTOMER_ORDERS_ROOT } from './utils/customerOrderIds';
import { CUSTOMER_DATA_CLEARED_EVENT } from './utils/customerSession';

// ── TanStack Query client ─────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,       // 2 min — data considered fresh
      gcTime: 10 * 60 * 1000,         // 10 min — unused cache kept
      retry: 1,                         // 1 retry on failure
      refetchOnWindowFocus: false,      // avoid surprise refetches
    },
  },
});

// ── Loading fallback ────────────────────────��─────────────────────────────
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Server status banner ──────────────────────────────────────────────────
function ServerStatusBanner() {
  const [isDown, setIsDown] = useState(isServerDown());
  const [offline, setOffline] = useState(isOffline());
  useEffect(() => subscribeServerStatus(setIsDown), []);
  useEffect(() => subscribeOnlineStatus(setOffline), []);
  // The offline banner below already explains failures while offline.
  if (!isDown || offline) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[9999] bg-red-600 text-white text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 shadow-lg">
      <span className="w-2 h-2 rounded-full bg-white opacity-80 animate-pulse inline-block" />
      Server is unreachable — some features may be unavailable
    </div>
  );
}

// ── Device connectivity banner (#29) ──────────────────────────────────────
// Shows while the browser is offline; on reconnect it briefly confirms and
// refetches every active query so screens don't sit on stale data.
function OnlineStatusBanner() {
  const queryClient = useQueryClient();
  const [offline, setOffline] = useState(isOffline());
  const [justReconnected, setJustReconnected] = useState(false);
  useEffect(() => {
    let timer;
    const unsubscribe = subscribeOnlineStatus((nowOffline) => {
      setOffline(nowOffline);
      clearTimeout(timer);
      if (!nowOffline) {
        queryClient.invalidateQueries();
        setJustReconnected(true);
        timer = setTimeout(() => setJustReconnected(false), 2500);
      } else {
        setJustReconnected(false);
      }
    });
    return () => { unsubscribe(); clearTimeout(timer); };
  }, [queryClient]);

  if (!offline && !justReconnected) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-0 inset-x-0 z-[9999] text-white text-sm font-medium py-2 px-4 flex items-center justify-center gap-2 shadow-lg ${offline ? 'bg-gray-800' : 'bg-green-600'}`}
    >
      <span className={`w-2 h-2 rounded-full bg-white inline-block ${offline ? 'opacity-60' : ''}`} />
      {offline ? "You're offline — showing saved data. We'll refresh when you reconnect." : 'Back online'}
    </div>
  );
}

// ── Scroll management (#27) ───────────────────────────────────────────────
// New navigation (PUSH / REPLACE) → scroll to top. Back / forward (POP) →
// restore the position saved for that history entry. Positions live in
// sessionStorage keyed by location.key so they survive a reload of the
// tab. Lazy pages render after a Suspense tick, so restoring retries for
// a short while until the document is tall enough.
const SCROLL_STORE_KEY = 'scroll_positions_v1';

function readScrollStore() {
  try { return JSON.parse(sessionStorage.getItem(SCROLL_STORE_KEY) || '{}') || {}; } catch { return {}; }
}

function saveScrollPosition(key, y) {
  try {
    const store = readScrollStore();
    store[key] = Math.round(y);
    const keys = Object.keys(store);
    // Keep the store small — only the most recent entries matter.
    if (keys.length > 60) keys.slice(0, keys.length - 60).forEach((k) => { delete store[k]; });
    sessionStorage.setItem(SCROLL_STORE_KEY, JSON.stringify(store));
  } catch { /* storage unavailable */ }
}

function ScrollManager() {
  const location = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';
  }, []);

  useEffect(() => {
    const key = location.key;
    let raf = 0;
    if (navigationType === 'POP') {
      const target = readScrollStore()[key];
      if (target > 0) {
        const started = performance.now();
        const attempt = () => {
          const maxY = document.documentElement.scrollHeight - window.innerHeight;
          if (maxY >= target || performance.now() - started > 1500) {
            window.scrollTo(0, Math.min(target, Math.max(0, maxY)));
            return;
          }
          raf = requestAnimationFrame(attempt);
        };
        attempt();
      } else {
        window.scrollTo(0, 0);
      }
    } else if (!location.hash) {
      window.scrollTo(0, 0);
    }
    // Save this entry's position when we leave it.
    return () => {
      cancelAnimationFrame(raf);
      saveScrollPosition(key, window.scrollY);
    };
  }, [location.key, location.hash, navigationType]);

  return null;
}

// ── Customer order cache guard (#22) ──────────────────────────────────────
// Drops every cached customer order list when the customer's personal data
// is wiped (logout, account switch, new guest session) so a shared phone
// never shows the previous diner's orders, even for a frame.
function CustomerCacheGuard() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const drop = () => queryClient.removeQueries({ queryKey: CUSTOMER_ORDERS_ROOT });
    const events = [CUSTOMER_DATA_CLEARED_EVENT, 'guestSessionChange'];
    events.forEach((e) => window.addEventListener(e, drop));
    return () => events.forEach((e) => window.removeEventListener(e, drop));
  }, [queryClient]);
  return null;
}

// ── Auth / Entry ──────────────────────────────────────────────────────────
// Lazy as well (#25): a QR scan lands on /scan/:token, so the platform
// marketing page and the login screen shouldn't ride in the entry bundle.
// `/` is the BestoDine platform home; each restaurant's own page is /:slug.
const PlatformHome = lazy(() => import('./Pages/Platform/PlatformHome'));
const RegisterRestaurant = lazy(() => import('./Pages/Platform/RegisterRestaurant'));
const RequestDemo = lazy(() => import('./Pages/Platform/RequestDemo'));
const CustomerLogin = lazy(() => import('./Pages/Loggedin/Login'));
const CustomerLayout = lazy(() => import('./Components/Loggedin/CustomerLayout'));
const Unauthorized = lazy(() => import('./Pages/Unauthorized'));

// ── Lazy-loaded pages ─────────────────────────────────────────────────────
const BranchSelection = lazy(() => import('./Pages/BranchSelection'));
const LegalPage = lazy(() => import('./Pages/LegalPage'));
// Public per-restaurant landing page — /:slug and /:slug/:branchSlug.
const RestaurantLandingPage = lazy(() => import('./Pages/Restaurant/RestaurantLandingPage'));
const ResetPassword = lazy(() => import('./Pages/Loggedin/ResetPassword'));
const StaffLogin = lazy(() => import('./Pages/Login'));
const ForceChangePassword = lazy(() => import('./Pages/ForceChangePassword'));
const OTP = lazy(() => import('./Pages/Loggedin/OTP'));
const ScanTable = lazy(() => import('./Pages/Loggedin/ScanTable'));
const CustomerSplash = lazy(() => import('./Components/Loggedin/Splash'));

// Waiter
const WaiterHomePage = lazy(() => import('./Pages/Waiter/WaiterHomePage'));
const CaptainFloor = lazy(() => import('./Pages/Waiter/CaptainFloor'));
const TableDetails = lazy(() => import('./Pages/Waiter/TableDetails'));
const BillPage = lazy(() => import('./Pages/Waiter/BillPage'));
const PaymentOption = lazy(() => import('./Pages/Waiter/PaymentOption'));
const QRPayment = lazy(() => import('./Pages/Waiter/QRPayment'));
const CustomerRequests = lazy(() => import('./Pages/Waiter/CustomerRequests'));
const WaiterOrders = lazy(() => import('./Pages/Waiter/WaiterOrders'));
const CartPage = lazy(() => import('./Pages/Waiter/CartPage'));
const TipHistory = lazy(() => import('./Pages/Waiter/TipHistory'));
const WaiterProfile = lazy(() => import('./Pages/Waiter/WaiterProfile'));
const OrderHistory = lazy(() => import('./Pages/Waiter/OrderHistory'));
const ShiftStatus = lazy(() => import('./Pages/Waiter/ShiftStatus'));
const WaiterNotifications = lazy(() => import('./Pages/Waiter/WaiterNotifications'));

// Chef
const ChefDashboard = lazy(() => import('./Pages/Chef/ChefDashboard'));
const ChefRecipes = lazy(() => import('./Pages/Chef/ChefRecipes'));
const ChefStock = lazy(() => import('./Pages/Chef/ChefStock'));

// Customer
const Home = lazy(() => import('./Pages/Loggedin/Home'));
const Menu = lazy(() => import('./Pages/Loggedin/Menu'));
const Cart = lazy(() => import('./Pages/Loggedin/Cart'));
const Orders = lazy(() => import('./Pages/Loggedin/Orders'));
const Search = lazy(() => import('./Pages/Loggedin/Search'));
const Payment = lazy(() => import('./Pages/Loggedin/Payment'));
const Bill = lazy(() => import('./Pages/Loggedin/Bill'));
const BillDetail = lazy(() => import('./Pages/Loggedin/BillDetail'));
const BillReceipt = lazy(() => import('./Pages/Loggedin/BillReceipt'));
const OrderTracking = lazy(() => import('./Pages/Loggedin/OrderTracking'));
const OrderConfirmed = lazy(() => import('./Pages/Loggedin/OrderConfirmed'));
const BillPreviews = lazy(() => import('./Pages/HealthMode/BillPreviews'));
const Profile = lazy(() => import('./Pages/HealthMode/Profile'));
const HealthSplash = lazy(() => import('./Pages/HealthMode/Splash'));
const Wallet = lazy(() => import('./Pages/Loggedin/wallet.jsx'));
const EditProfile = lazy(() => import('./Pages/Loggedin/EditProfile'));
const BookingHistory = lazy(() => import('./Pages/Loggedin/BookingHistory'));
const Favorites = lazy(() => import('./Pages/Loggedin/Favorites'));
const Notifications = lazy(() => import('./Pages/Notifications'));

// Advance Booking
const AddOns = lazy(() => import('./Pages/AdvanceBooking/AddOns'));
const BookingType = lazy(() => import('./Pages/AdvanceBooking/BookingType'));
const BookTableDetails = lazy(() => import('./Pages/AdvanceBooking/BookTableDetails'));
const ParkingDetails = lazy(() => import('./Pages/AdvanceBooking/ParkingDetails'));
const CakeDetails = lazy(() => import('./Pages/AdvanceBooking/CakeDetails'));
const BookingReview = lazy(() => import('./Pages/AdvanceBooking/BookingReview'));
const BookingSuccess = lazy(() => import('./Pages/AdvanceBooking/BookingSuccess'));
const HallBooking = lazy(() => import('./Pages/AdvanceBooking/HallBooking'));
const PackageSelection = lazy(() => import('./Pages/AdvanceBooking/PackageSelection'));
const Decoration = lazy(() => import('./Pages/AdvanceBooking/Decoration'));
const AdvanceBookingPayment = lazy(() => import('./Pages/AdvanceBooking/Payment'));

// Kiosk (self-order standalone flow — no customer layout, no auth)
const KioskLanding       = lazy(() => import('./Pages/Kiosk/LandingPage'));
const KioskOrderType     = lazy(() => import('./Pages/Kiosk/OrderType'));
const KioskMenu          = lazy(() => import('./Pages/Kiosk/Menu'));
const KioskCart          = lazy(() => import('./Pages/Kiosk/Cart'));
const KioskCustomerInfo  = lazy(() => import('./Pages/Kiosk/CustomerInfo'));
const KioskPayOption     = lazy(() => import('./Pages/Kiosk/PayOption'));
const KioskPaymentSuccess = lazy(() => import('./Pages/Kiosk/PaymentSuccess'));
const KioskOrderToken    = lazy(() => import('./Pages/Kiosk/OrderToken'));

// Super Admin (platform operator portal)
const SuperAdminLayout     = lazy(() => import('./Pages/SuperAdmin/SuperAdminLayout'));
const SuperAdminDashboard  = lazy(() => import('./Pages/SuperAdmin/SuperAdminDashboard'));
const SuperAdminRestaurants     = lazy(() => import('./Pages/SuperAdmin/Restaurants'));
const SuperAdminRestaurantDetail = lazy(() => import('./Pages/SuperAdmin/RestaurantDetail'));
const SuperAdminPlans      = lazy(() => import('./Pages/SuperAdmin/Plans'));
const SuperAdminAuditLogs  = lazy(() => import('./Pages/SuperAdmin/AuditLogs'));
const SuperAdminPendingApprovals = lazy(() => import('./Pages/SuperAdmin/PendingApprovals'));
const SuperAdminSignupApplicationDetail = lazy(() => import('./Pages/SuperAdmin/approvals/SignupApplicationDetail'));
const SuperAdminPlanChangeDetail = lazy(() => import('./Pages/SuperAdmin/approvals/PlanChangeDetail'));
const SuperAdminPaymentApprovalDetail = lazy(() => import('./Pages/SuperAdmin/approvals/PaymentApprovalDetail'));
const SuperAdminLeads      = lazy(() => import('./Pages/SuperAdmin/Leads'));
const SuperAdminMarketing  = lazy(() => import('./Pages/SuperAdmin/Marketing'));
const SuperAdminBlog       = lazy(() => import('./Pages/SuperAdmin/Blog'));
const SuperAdminPayments   = lazy(() => import('./Pages/SuperAdmin/Payments'));

// Admin
const AdminLayout = lazy(() => import('./Pages/Admin/AdminLayout'));
const AdminDashboard = lazy(() => import('./Pages/Admin/Dashboard'));
const TablesDashboard = lazy(() => import('./Pages/Admin/TablesDashboard'));
const OrdersDashboard = lazy(() => import('./Pages/Admin/OrdersDashboard'));
const MenuManagement = lazy(() => import('./Pages/Admin/MenuManagement'));
const AddComboMenu = lazy(() => import('./Pages/Admin/components/AddComboMenu'));
const PaymentsDashboard = lazy(() => import('./Pages/Admin/PaymentsDashboard'));
// RefundsDashboard is no longer a top-level admin tab — it's rendered
// as the "Refunds" section of <PaymentsDashboard /> (2026-05-20). The
// old /admin/refunds path is kept as a redirect below so bookmarks and
// older notification deep-links still land correctly.
const WalletDashboard = lazy(() => import('./Pages/Admin/WalletDashboard'));
const Offers = lazy(() => import('./Pages/Admin/Offers'));
const OfferRedemption = lazy(() => import('./Pages/Admin/components/OfferRedemption'));
const OfferPerformance = lazy(() => import('./Pages/Admin/components/OfferPerformance'));
const StaffDashboard = lazy(() => import('./Pages/Admin/StaffDashboard'));
const CRMDashboard = lazy(() => import('./Pages/Admin/CRMDashboard'));
const Bookings = lazy(() => import('./Pages/Admin/Bookings'));
const Inventory = lazy(() => import('./Pages/Admin/Inventory'));
const Settings = lazy(() => import('./Pages/Admin/Settings'));
const Subscription = lazy(() => import('./Pages/Admin/Subscription'));
const Branches = lazy(() => import('./Pages/Admin/Branches'));
// ─── Legacy restaurant link redirect ──────────────────────────────────────
// /r/<slug>[/<branch>] predates the root-level landing pages; keep old
// links, QR posters and bookmarks working by forwarding them (query string
// included) to /<slug>[/<branch>].
function LegacyRestaurantLinkRedirect() {
  const { slug, branchSlug } = useParams();
  const { search, hash } = useLocation();
  let to = `/${encodeURIComponent(slug)}`;
  if (branchSlug) to += `/${encodeURIComponent(branchSlug)}`;
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

// ─── Global Data Prefetcher ───────────────────────────────────────────────
// Silently fetches all menu data as soon as the app starts.
// By the time the user navigates to Menu/Home, data is already in cache.
function DataPrefetcher() {
  const { fetchMenuItems, fetchCategories, fetchCombos } = useMenu();
  React.useEffect(() => {
    // Parallel prefetch — silently in background, no loading spinners triggered
    fetchMenuItems();
    fetchCategories();
    fetchCombos();
  }, []); // Run only once on app startup
  return null;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
    <Router>
      <AuthProvider>
        <LanguageSync />
        <NotificationProvider>
          <HealthProvider>
            <MenuProvider>
              <CartProvider>
              <div className="min-h-screen bg-[#FBFBFF]">
                {/* Prefetch data globally as soon as app loads */}
                <DataPrefetcher />
                <ScrollManager />
                <CustomerCacheGuard />
                <ServerStatusBanner />
                <OnlineStatusBanner />
                <Toaster
                  position="top-center"
                  reverseOrder={false}
                  gutter={8}
                  toastOptions={{
                    style: { zIndex: 999999 },
                    duration: 4000,
                    success: {
                      duration: 3000,
                      iconTheme: { primary: '#16a34a', secondary: '#fff' },
                    },
                    error: {
                      duration: 5000,
                      iconTheme: { primary: '#dc2626', secondary: '#fff' },
                    },
                  }}
                />
                {/* Phase 5 step 1 — globally-available upgrade prompt, shown
                    by the api.js axios interceptor when a staff user hits
                    a FEATURE_LOCKED 403. Single mount point = no prop
                    drilling; pub-sub via openUpgradePrompt(). */}
                <UpgradePromptHost />
                <Suspense fallback={<PageLoader />}>
                <Routes>

                {/* ── Staff-only Auth (no customer layout) ──────────────── */}
                <Route path="/staff-login" element={<StaffLogin />} />
                {/* Hotel self-signup (pending until a Super Admin approves it)
                    and the request-a-demo lead form — both public. */}
                <Route path="/register-restaurant" element={<RegisterRestaurant />} />
                <Route path="/request-demo" element={<RequestDemo />} />
                <Route path="/force-change-password" element={<ForceChangePassword />} />
                <Route path="/unauthorized" element={<Unauthorized />} />

                {/* ── Waiter Routes (waiter + captain + admin) ───────────── */}
                {/* Plan gate: the waiter / captain app is the
                    `waiterDashboard` module (backend: staffAppGate).
                    Admins using these screens aren't affected. */}
                {/* Shared (Waiter & Captain) */}
                <Route path="/waiter/home"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><WaiterHomePage /></RequireFeature></ProtectedRoute>} />
                {/* Captain Floor Overview — head-waiter command screen
                    (view all tables/sessions, waiter workload, delayed
                    orders, assign/reassign waiters, escalate to admin).
                    Captain-only (CAPTAIN_ROLES blocks plain waiters). */}
                <Route path="/waiter/floor"
                  element={<ProtectedRoute requiredRole={CAPTAIN_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><CaptainFloor /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/requests"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><CustomerRequests /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/orders"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><WaiterOrders /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/tips"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><TipHistory /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/profile"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><WaiterProfile /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/order-history"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><OrderHistory /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/shift-status"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><ShiftStatus /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/notifications"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><WaiterNotifications /></RequireFeature></ProtectedRoute>} />

                {/* Waiter workflow — drill into a table, browse the menu,
                    edit the cart. Open to every staff role (waiter +
                    captain + admin). The table click on WaiterHomePage
                    used to dead-end here for waiters because these were
                    gated to CAPTAIN_ROLES. */}
                <Route path="/waiter/details"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><TableDetails /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/menu"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><Menu /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/category/:id"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><Home /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/cart"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><CartPage /></RequireFeature></ProtectedRoute>} />

                {/* Billing + payment collection. Opened to STAFF_ROLES
                    (waiter + captain + admin + manager) so the waiter who
                    served the table can settle a cash bill themselves —
                    e.g. when a dine-in customer taps "Pay at Counter" the
                    serving waiter gets the cash-request popup and can
                    collect + mark paid. Chef is excluded. Refund
                    authorization remains captain/admin-only (gated
                    separately by permission, not this route). */}
                <Route path="/waiter/bill"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><BillPage /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/payment"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><PaymentOption amount={879} tableNo="no.4" /></RequireFeature></ProtectedRoute>} />
                <Route path="/waiter/qr-payment"
                  element={<ProtectedRoute requiredRole={STAFF_ROLES}><RequireFeature feature="waiterDashboard" roles={WAITER_APP_ROLES}><QRPayment amount={879} tableNo="no.4" /></RequireFeature></ProtectedRoute>} />

                {/* ── Chef Routes ─────────────────────────────────────────── */}
                {/* Plan gate: the chef app is the `kitchenDisplay` module. */}
                <Route path="/chef/dashboard"
                  element={<ProtectedRoute requiredRole={CHEF_ROLES}><RequireFeature feature="kitchenDisplay"><ChefDashboard /></RequireFeature></ProtectedRoute>} />
                {/* Recipe building — visible only when the chef has the
                    `manageRecipe` permission (link surfaced in the KDS header
                    + enforced by the recipeAccess guard on the backend). */}
                <Route path="/chef/recipes"
                  element={<ProtectedRoute requiredRole={CHEF_ROLES}><RequireFeature feature="kitchenDisplay"><ChefRecipes /></RequireFeature></ProtectedRoute>} />
                {/* Stock view + adjust — visible only when the chef has the
                    `manageStock` permission (link surfaced in the KDS header
                    + enforced by the stockAccess guard on the backend). */}
                <Route path="/chef/stock"
                  element={<ProtectedRoute requiredRole={CHEF_ROLES}><RequireFeature feature="kitchenDisplay"><ChefStock /></RequireFeature></ProtectedRoute>} />

                {/* ── Super Admin Portal (platform operators) ──────────── */}
                <Route
                    path="/superadmin"
                    element={
                        <ProtectedRoute requiredRole={SUPERADMIN_ROLES}>
                            <SuperAdminLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Navigate to="dashboard" replace />} />
                    <Route path="dashboard"        element={<SuperAdminDashboard />} />
                    <Route path="restaurants"      element={<SuperAdminRestaurants />} />
                    <Route path="restaurants/:id"  element={<SuperAdminRestaurantDetail />} />
                    <Route path="pending-approvals" element={<SuperAdminPendingApprovals />} />
                    <Route path="pending-approvals/signups/:id"             element={<SuperAdminSignupApplicationDetail />} />
                    <Route path="pending-approvals/plan-changes/:requestId" element={<SuperAdminPlanChangeDetail />} />
                    <Route path="pending-approvals/payments/:id"            element={<SuperAdminPaymentApprovalDetail />} />
                    <Route path="leads"            element={<SuperAdminLeads />} />
                    <Route path="marketing"        element={<SuperAdminMarketing />} />
                    <Route path="blog"             element={<SuperAdminBlog />} />
                    <Route path="plans"            element={<SuperAdminPlans />} />
                    <Route path="payments"         element={<SuperAdminPayments />} />
                    <Route path="audit-logs"       element={<SuperAdminAuditLogs />} />
                </Route>

                {/* ── Admin Routes ────────────────────────────────────────── */}
                <Route path="/admin" element={<ProtectedRoute requiredRole={ADMIN_ROLES}><AdminLayout /></ProtectedRoute>}>
                  <Route index element={<Navigate to="dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="tables" element={<TablesDashboard />} />
                  <Route path="orders" element={<OrdersDashboard />} />
                  <Route path="menu" element={<MenuManagement />} />
                  <Route path="menu/add-combo" element={<AddComboMenu />} />
                  <Route path="payments" element={<PaymentsDashboard />} />
                  {/* Legacy redirect — /admin/refunds → Payments page,
                      Refunds section pre-selected via ?section=refunds. */}
                  <Route path="refunds" element={<Navigate to="/admin/payments?section=refunds" replace />} />
                  <Route path="wallet" element={<RequireFeature feature="walletLoyalty"><WalletDashboard /></RequireFeature>} />
                  <Route path="offers" element={<RequireFeature feature="couponPromotions"><Offers /></RequireFeature>} />
                  <Route path="offers/redemption" element={<RequireFeature feature="couponPromotions"><OfferRedemption /></RequireFeature>} />
                  <Route path="offers/performance" element={<RequireFeature feature="couponPromotions"><OfferPerformance /></RequireFeature>} />
                  <Route path="staff" element={<StaffDashboard />} />
                  <Route path="crm" element={<RequireFeature feature="crm"><CRMDashboard /></RequireFeature>} />
                  <Route path="inventory" element={<RequireFeature feature="inventory"><Inventory /></RequireFeature>} />
                  <Route path="bookings" element={<RequireFeature feature="advanceBookingTable"><Bookings /></RequireFeature>} />
                  <Route path="settings" element={<Settings />} />
                  {/* Phase 5 step 4 — tenant self-service billing page.
                      Protected by adminOnly on the backend; the sidebar
                      also hides this nav item for non-admin staff. */}
                  <Route path="subscription" element={<Subscription />} />
                  {/* Phase 6 step 1 — branch CRUD. Backend gates by
                      adminOnly + featureGate('multiBranch'). */}
                  <Route path="branches" element={<RequireFeature feature="multiBranch"><Branches /></RequireFeature>} />
                </Route>

                {/* ── Kiosk Self-Order Flow (standalone, no layout, no auth) ── */}
                <Route path="/kiosk" element={<KioskLanding />} />
                <Route path="/kiosk/order-type" element={<KioskOrderType />} />
                <Route path="/kiosk/menu" element={<KioskMenu />} />
                <Route path="/kiosk/cart" element={<KioskCart />} />
                <Route path="/kiosk/customer-info" element={<KioskCustomerInfo />} />
                <Route path="/kiosk/pay" element={<KioskPayOption />} />
                <Route path="/kiosk/payment-success" element={<KioskPaymentSuccess />} />
                <Route path="/kiosk/order-token" element={<KioskOrderToken />} />

                {/* ── Full-width pages (no desktop padding) ─────────────── */}
                {/* BestoDine platform home. Signed-in staff are redirected
                    to their workspace; everyone else sees the platform page. */}
                <Route path="/" element={<PlatformHome />} />

                {/* ── Full-width auth pages (no desktop padding) ──────── */}
                <Route path="/login" element={<CustomerLogin />} />
                <Route path="/splash" element={<CustomerSplash />} />

                {/* ── Customer Layout Wrapper (adds desktop padding) ────── */}
                <Route element={<CustomerLayout />}>

                {/* ── Public / Auth ──────────────────────────────────────── */}
                <Route path="/branch-selection" element={<BranchSelection />} />
                {/* Same component, switch semantics: the picker is never
                    auto-skipped and cancelling keeps the current tenant.
                    Unguarded like /branch-selection — it sets the tenant
                    rather than needing one, so ProtectedRoute's slug gate
                    would deadlock it. */}
                <Route path="/switch-restaurant" element={<BranchSelection switchMode />} />
                {/* Legacy shareable entry — /r/<restaurant>[/<branch>] now
                    forwards to the restaurant landing page at the root. */}
                <Route path="/r/:slug" element={<LegacyRestaurantLinkRedirect />} />
                <Route path="/r/:slug/:branchSlug" element={<LegacyRestaurantLinkRedirect />} />
                {/* Legal pages. The registration form linked to both
                    with href="#" and no routes existed, so a customer
                    ticking "I agree" was agreeing to something they had
                    no way to read. Unguarded — a policy must be readable
                    before you have an account. */}
                <Route path="/terms" element={<LegalPage kind="terms" />} />
                <Route path="/privacy" element={<LegalPage kind="privacy" />} />
                {/* Landing page for the emailed reset link. Unguarded by
                    definition: the whole point is that the user can't
                    log in. */}
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/otp" element={<OTP />} />
                <Route path="/scan/:qrToken" element={<ScanTable />} />
                {/* No token: "scan your table QR" prompt. Guests are sent
                    here when they try to order dine-in without a table,
                    or when the restaurant removed the table they had. */}
                <Route path="/scan" element={<ScanTable />} />

                {/* ── Customer Routes ─────────────────────────────────────── */}
                {/* Browse pages — guests (skip) are allowed */}
                <Route path="/customer/home"
                  element={<ProtectedRoute allowGuest><Home /></ProtectedRoute>} />

                <Route path="/customer/menu"
                  element={<ProtectedRoute allowGuest><Menu /></ProtectedRoute>} />

                <Route path="/search"
                  element={<ProtectedRoute allowGuest><Search /></ProtectedRoute>} />

                <Route path="/customer/item/:id"
                  element={<ProtectedRoute allowGuest><Home /></ProtectedRoute>} />

                {/* Cart — accessible by both logged-in customers and guests */}
                <Route path="/customer/cart"
                  element={<ProtectedRoute allowGuest><Cart /></ProtectedRoute>} />

                <Route path="/customer/orders"
                  element={<ProtectedRoute allowGuest><Orders /></ProtectedRoute>} />


                <Route path="/customer/payment"
                  element={<ProtectedRoute allowGuest><Payment /></ProtectedRoute>} />

                <Route path="/customer/order-confirmed"
                  element={<ProtectedRoute allowGuest><OrderConfirmed /></ProtectedRoute>} />

                <Route path="/customer/bill"
                  element={<ProtectedRoute allowGuest><Bill /></ProtectedRoute>} />

                <Route path="/bill/:orderId"
                  element={<ProtectedRoute allowGuest><BillDetail /></ProtectedRoute>} />

                <Route path="/bill-preview"
                  element={<ProtectedRoute allowGuest><BillPreviews /></ProtectedRoute>} />

                <Route path="/customer/bill-receipt"
                  element={<ProtectedRoute allowGuest><BillReceipt /></ProtectedRoute>} />

                <Route path="/customer/profile"
                  element={<ProtectedRoute><Profile /></ProtectedRoute>} />

                <Route path="/customer/profile/edit"
                  element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />

                <Route path="/customer/favorites"
                  element={<ProtectedRoute><Favorites /></ProtectedRoute>} />

                <Route path="/customer/booking-history"
                  element={<ProtectedRoute><BookingHistory /></ProtectedRoute>} />

                <Route path="/health/home"
                  element={<ProtectedRoute allowGuest><Home /></ProtectedRoute>} />

                <Route path="/health/splash"
                  element={<ProtectedRoute allowGuest><HealthSplash /></ProtectedRoute>} />

                {/* R-08: customer-only. The previous declaration had
                    `allowGuest requiredRole={CUSTOMER_ROLES}` which
                    (together with the old ProtectedRoute short-circuit)
                    let guests reach this UI. Wallet balances and loyalty
                    points are tied to a user account — guests should
                    sign in first. */}
                <Route path="/customer/wallet"
                  element={<ProtectedRoute requiredRole={CUSTOMER_ROLES}><Wallet /></ProtectedRoute>} />

                <Route path="/notifications"
                  element={<ProtectedRoute allowGuest><Notifications /></ProtectedRoute>} />
                <Route path="/customer/notifications"
                  element={<ProtectedRoute allowGuest><Notifications /></ProtectedRoute>} />

                <Route path="/customer/order-tracking"
                  element={<ProtectedRoute allowGuest><OrderTracking /></ProtectedRoute>} />
                <Route path="/customer/order-tracking/:orderId"
                  element={<ProtectedRoute allowGuest><OrderTracking /></ProtectedRoute>} />

                {/* ── Advance Booking ────────────────────────────────────── */}
                <Route path="/customer/booking-type"
                  element={<ProtectedRoute><BookingType /></ProtectedRoute>} />
                <Route path="/customer/book-table-details"
                  element={<ProtectedRoute><BookTableDetails /></ProtectedRoute>} />
                <Route path="/customer/add-ons"
                  element={<ProtectedRoute><AddOns /></ProtectedRoute>} />
                <Route path="/customer/parking-details"
                  element={<ProtectedRoute><ParkingDetails /></ProtectedRoute>} />
                <Route path="/customer/cake-details"
                  element={<ProtectedRoute><CakeDetails /></ProtectedRoute>} />
                <Route path="/customer/booking-review"
                  element={<ProtectedRoute><BookingReview /></ProtectedRoute>} />
                <Route path="/customer/booking-success"
                  element={<ProtectedRoute><BookingSuccess /></ProtectedRoute>} />
                <Route path="/customer/advance-payment"
                  element={<ProtectedRoute><AdvanceBookingPayment /></ProtectedRoute>} />

                {/* Hall Booking Specific Routes */}
                <Route path="/customer/hall-booking"
                  element={<ProtectedRoute><HallBooking /></ProtectedRoute>} />
                <Route path="/customer/package-selection"
                  element={<ProtectedRoute><PackageSelection /></ProtectedRoute>} />
                <Route path="/customer/decoration"
                  element={<ProtectedRoute><Decoration /></ProtectedRoute>} />

                <Route path="/home" element={<Navigate to="/customer/home" replace />} />

                </Route>{/* End CustomerLayout */}

                {/* ── Restaurant landing pages ─────────────────────────────
                    Keep these LAST (before the catch-all). React Router
                    ranks static segments above dynamic ones anyway, but a
                    first segment used by any route above must also be listed
                    in utils/reservedSlugs.js — scripts/check-route-slugs.mjs
                    enforces that — so bare prefixes like /customer fall
                    through to the unauthorized screen, not a restaurant. */}
                <Route path="/:slug" element={<RestaurantLandingPage />} />
                <Route path="/:slug/:branchSlug" element={<RestaurantLandingPage />} />

                <Route path="*" element={<Navigate to="/unauthorized" replace />} />

              </Routes>
              </Suspense>
            </div>
          </CartProvider>
        </MenuProvider>
        </HealthProvider>
        </NotificationProvider>
      </AuthProvider>
    </Router>
    </QueryClientProvider>
  );
}

export default App;
