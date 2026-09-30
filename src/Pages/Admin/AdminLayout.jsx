import React, { useState, useEffect, useRef } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import NotificationModal from './components/NotificationModal'
import { useNotifications } from '../../Context/NotificationContext'
import { useAuth } from '../../Context/AuthContext'
import { AdminBranchProvider, useAdminBranch } from '../../Context/AdminBranchContext'
import BranchSwitcher from './components/BranchSwitcher'
import { settingsAPI } from '../../utils/api'
import { resolveImageUrl } from '../../utils/image'
import { getSocket } from '../../utils/socket'
import { useAdminPrefetch } from '../../hooks/queries/useAdminPrefetch'


// Small inline component for the read-only banner's exit action. It
// flips the switcher back to Main (the owner's home branch) which
// also re-enables every nav tab automatically. Kept as its own
// component so the hook it uses doesn't bloat AdminLayoutInner.
const ReturnToMainButton = () => {
  const { branches, setSelectedBranchId } = useAdminBranch()
  const navigate = useNavigate()
  const handleReturn = () => {
    const main = branches.find(b => b.slug === 'main')
    if (main) {
      setSelectedBranchId(main._id)
      navigate('/admin/dashboard')
    }
  }
  return (
    <button
      type="button"
      onClick={handleReturn}
      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 hover:bg-amber-100 text-xs font-bold transition"
    >
      <i className="fi fi-rr-arrow-left flex" />
      Back to Main
    </button>
  )
}

const AdminLayoutInner = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [isNotificationOpen, setIsNotificationOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const { unreadCount } = useNotifications()
  const { user, logout, hasPermission, hasFeature, tenant } = useAuth()
  // Cross-branch read-only mode: tenant owner has picked a SUB-branch
  // in the header switcher. They're "peeking" at that branch's
  // Dashboard — every other tab is hidden, and a hard navigation guard
  // bounces them back to /admin/dashboard if they try to deep-link.
  const { isCrossBranchReadOnly, selectedBranchId, branches } = useAdminBranch()
  const viewedBranch = branches.find(b => b._id === selectedBranchId) || null
  const [cafeName, setCafeName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const profileRef = useRef(null)
  // Horizontal scroll controls for the nav tab strip. On narrow screens
  // the tab list overflows and previously could only be panned with
  // touch/trackpad — admins on a small laptop couldn't reach the tail
  // tabs. These arrows appear only when scrolling is actually possible
  // in that direction.
  const navScrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  // Prefetch the destination page's data on hover/focus — the click that
  // follows ~150ms later finds the cache already warm and renders instantly.
  const prefetchAdminPage = useAdminPrefetch()

  useEffect(() => {
    const loadCafeConfig = () => {
      settingsAPI.getSettings().then(res => {
        const general = res.data?.general
        if (general?.cafeName !== undefined) setCafeName(general.cafeName || '')
        if (general?.logoUrl !== undefined) setLogoUrl(general.logoUrl || '')
      }).catch(() => {})
    }
    loadCafeConfig()

    // Live-refresh when the cafe branding changes elsewhere (e.g. the
    // admin just uploaded a new logo from the Settings page). Backend
    // broadcasts `settings:updated` on every save, so we re-pull fresh
    // instead of waiting for the next full page reload.
    const socket = getSocket()
    const onSettingsUpdated = () => loadCafeConfig()
    socket.on('settings:updated', onSettingsUpdated)
    return () => socket.off('settings:updated', onSettingsUpdated)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setIsProfileOpen(false)
      }
    }
    if (isProfileOpen) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isProfileOpen])

  const handleLogout = () => {
    logout()
    navigate('/staff-login')
  }

  // Navigation Items
  //   permission : per-staff granular permission flag (set by restaurant admin)
  //   feature    : plan-level feature flag (set by Super Admin / subscription)
  //   ownerOnly  : item only visible to the tenant owner (role 'admin' with
  //                branch===null). Branch-pinned Branch Admins never see it.
  // Both are checked: a missing permission HIDES the item; a locked feature
  // KEEPS the item visible but renders a 'PRO' badge and routes to an
  // upgrade prompt instead of the page.
  const isBranchPinned = !!user?.branch          // true for Branch Admins
  const isTenantOwner  = user?.role === 'admin' && !isBranchPinned

  const allNavItems = [
    { name: 'Dashboard',  path: '/admin/dashboard', icon: 'fi fi-rr-dashboard-panel',    permission: null,           feature: null },
    { name: 'Tables & QR',path: '/admin/tables',    icon: 'fi fi-rr-qrcode',             permission: 'tables',       feature: null },
    { name: 'Orders',     path: '/admin/orders',    icon: 'fi fi-rr-shopping-cart',      permission: 'addOrders',    feature: null },
    { name: 'Menu',       path: '/admin/menu',      icon: 'fi fi-rr-restaurant',         permission: 'editMenu',     feature: null },
    // Refunds was its own tab until 2026-05-20 — now merged into the
    // Payments page as a Payments/Refunds section toggle. Keep the
    // permission gate on `viewPayments` since that's the role flag that
    // already covered both surfaces.
    { name: 'Payments',   path: '/admin/payments',  icon: 'fi fi-rr-money-bills-simple', permission: 'viewPayments', feature: null },
    { name: 'Wallet',     path: '/admin/wallet',    icon: 'fi fi-rr-wallet',             permission: null,           feature: 'walletLoyalty' },
    { name: 'Offers',     path: '/admin/offers',    icon: 'fi fi-rr-badge-percent',      permission: null,           feature: 'couponPromotions' },
    { name: 'Staff',      path: '/admin/staff',     icon: 'fi fi-rs-users',              permission: 'manageStaff',  feature: null },
    { name: 'CRM',        path: '/admin/crm',       icon: 'fi fi-rr-circle-user',        permission: 'crm',          feature: 'crm' },
    { name: 'Inventory',  path: '/admin/inventory', icon: 'fi fi-rr-box',                permission: null,           feature: 'inventory' },
    { name: 'Bookings',   path: '/admin/bookings',  icon: 'fi fi-rr-calendar-check',     permission: 'reservation',  feature: 'advanceBookingTable' },
    // Phase 6 — branch management is an owner-only feature. A branch-pinned
    // Branch Admin has nothing to do here; the whole tab is hidden for them.
    { name: 'Branches',   path: '/admin/branches',  icon: 'fi fi-rr-building',           permission: null,           feature: 'multiBranch', ownerOnly: true },
  ]

  const navItems = allNavItems
    .filter(item => !item.ownerOnly || isTenantOwner)
    .filter(item => !item.permission || hasPermission(item.permission))
    // Cross-branch peek: only the Dashboard tab is reachable. Every
    // other tab is hidden so the owner can't accidentally make a
    // change against the sub-branch they're just viewing.
    .filter(item => !isCrossBranchReadOnly || item.path === '/admin/dashboard')
    .map(item => ({ ...item, locked: item.feature ? !hasFeature(item.feature) : false }))

  // Hard guard for deep links — if the URL points anywhere other than
  // /admin/dashboard while we're in read-only sub-branch mode, bounce
  // back to the dashboard. Belt-and-braces alongside the nav filter,
  // since users can still type URLs or follow stale browser history.
  useEffect(() => {
    if (!isCrossBranchReadOnly) return
    if (location.pathname.startsWith('/admin/dashboard')) return
    navigate('/admin/dashboard', { replace: true })
  }, [isCrossBranchReadOnly, location.pathname, navigate])

  // Recompute whether the nav tab strip can scroll further left/right.
  // Runs on mount, on every resize, on scroll, and whenever the nav
  // item list changes (e.g. a permission-gated tab appears for a
  // different role).
  useEffect(() => {
    const el = navScrollRef.current
    if (!el) return
    const updateScrollState = () => {
      const { scrollLeft, scrollWidth, clientWidth } = el
      setCanScrollLeft(scrollLeft > 4)
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 4)
    }
    updateScrollState()
    el.addEventListener('scroll', updateScrollState, { passive: true })
    window.addEventListener('resize', updateScrollState)
    return () => {
      el.removeEventListener('scroll', updateScrollState)
      window.removeEventListener('resize', updateScrollState)
    }
  }, [navItems.length])

  const scrollNav = (direction) => {
    const el = navScrollRef.current
    if (!el) return
    const amount = Math.max(160, Math.round(el.clientWidth * 0.6))
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  const userName = user?.name || 'Admin'
  const fallbackAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=FE8301&color=fff`
  const userAvatar = resolveImageUrl(user?.avatar) || fallbackAvatar
  const cafeLogoUrl = resolveImageUrl(logoUrl)

  return (
    <div data-admin-layout className="min-h-screen w-full bg-[#FAF5F0] flex flex-col font-manrope text-gray-800">
      {/* Top Header */}
      <header className="bg-white pt-[14px] pb-[10px] relative z-50">
        <div className="w-full max-w-[1920px] mx-auto px-4 md:px-6 flex justify-between items-center">
          <div className="flex items-center gap-3">
            {cafeLogoUrl && (
              <img
                src={cafeLogoUrl}
                alt={cafeName || 'Restaurant'}
                // Header sits on a white background, so the logo renders
                // naked (no inner bg/border/padding box that would shrink
                // the actual artwork). Tall height + generous max-width
                // so wordmarks ("BESTO DINE") stay legible and square
                // crests still look proportionate via object-contain.
                className="h-14 md:h-16 w-auto max-w-[220px] object-contain"
              />
            )}
            <div>
              {/* Header label
                * --------------
                * Branch-pinned admin (e.g. "FC Road 2" under "Hotel Tip Top"):
                *   "Hotel Tip Top — FC Road 2"  — brand context first, branch second.
                * Tenant owner: just the brand ("Hotel Tip Top"). The cafeName
                * resolves to either Settings.general.cafeName (admin-edited)
                * or the tenant name as fallback, so we still get a sensible
                * value when Settings hasn't loaded yet.
                */}
              <h1 className="text-[20px] leading-[28px] font-semibold text-gray-900 tracking-tight">
                {(() => {
                  const brand = tenant?.name?.trim();
                  const branchLabel = (user?.branch?.displayLabel || user?.branch?.name || cafeName || '').trim();
                  if (isBranchPinned && brand && branchLabel && brand !== branchLabel) {
                    return `${brand} — ${branchLabel}`;
                  }
                  return brand || cafeName || 'Admin Panel';
                })()}
              </h1>
              <div className="flex items-center gap-2">
                <p className="text-[14px] leading-[20px] font-semibold font-manrope tracking-normal text-gray-900">Hello, {userName}</p>
              </div>
            </div>
          </div>
          {/* Branch switcher — tenant owner picks which branch to view;
              branch-pinned admins see a locked badge. Re-enabled 2026-05-20
              after the user reported "FC Road tables/areas leaking into
              Main" — the actual root cause was no UI to switch into Main
              specifically, so the default (no switcher = unfiltered)
              showed every branch's data merged together. */}
          <BranchSwitcher />
          <div className="flex items-center gap-[16px]">
            {/* Phase 5 step 4 — self-service subscription / upgrade page.
                Owner-only (tenant admin with no branch pin). The backend
                adminExclusive middleware on /tenant-billing/* is the
                actual source of truth — this is just a discoverability
                nudge that also gets hidden from Branch Admins. */}
            {isTenantOwner && (
              <NavLink
                to="/admin/subscription"
                className={({ isActive }) =>
                  `p-2.5 rounded-xl transition-all ${isActive
                    ? 'bg-[#FE8301] text-white shadow-sm'
                    : 'text-[#7D7380] hover:bg-orange-50 hover:text-[#FE8301]'
                  }`
                }
                title="Subscription & billing"
              >
                <i className="fi fi-rr-credit-card text-[20px] flex"></i>
              </NavLink>
            )}

            {/* Settings — owner-only (managers use section-level PATCH
                for the sections they're allowed to edit) */}
            {(
              <NavLink
                to="/admin/settings"
                className={({ isActive }) =>
                  `p-2.5 rounded-xl transition-all ${isActive
                    ? 'bg-[#FE8301] text-white shadow-sm'
                    : 'text-[#7D7380] hover:bg-orange-50 hover:text-[#FE8301]'
                  }`
                }
              >
                <i className="fi fi-rr-settings text-[20px] flex"></i>
              </NavLink>
            )}

            {/* Notification */}
            <button
              onClick={() => setIsNotificationOpen(true)}
              className={`relative p-2 transition-colors ${isNotificationOpen ? 'text-[#FE8301]' : 'text-gray-400 hover:text-orange-500'}`}
            >
              <i className="fi fi-rr-bell text-[20px]"></i>
              {unreadCount > 0 && (
                <span className="absolute top-[3px] right-[4px] min-w-[16px] h-[16px] flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 border-2 border-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Admin Profile */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="w-[40px] h-[40px] rounded-full overflow-hidden border border-gray-200 cursor-pointer hover:ring-2 hover:ring-[#FE8301]/30 transition-all"
              >
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-full h-full object-cover"
                  onError={(e) => { e.target.onerror = null; e.target.src = fallbackAvatar }}
                />
              </button>

              {isProfileOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-[200px] bg-white border border-gray-100 rounded-[12px] shadow-lg py-2 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-[14px] font-[600] text-[#1A181B] truncate">{userName}</p>
                    <p className="text-[12px] text-[#6B7280] truncate">{user?.email || ''}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-[13px] font-[500] text-[#DC2626] hover:bg-red-50 transition-colors flex items-center gap-2"
                  >
                    <i className="fi fi-rr-sign-out-alt text-[14px] flex"></i>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="bg-white shadow-[0px_2px_8px_0px_#00000014] sticky top-0 z-40">
        {/* Left scroll arrow — sits on a solid-white fade so tabs
            scrolling underneath are masked instead of overlapping. */}
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollNav('left')}
            aria-label="Scroll tabs left"
            className="absolute left-0 top-0 bottom-[3px] z-20 flex items-center justify-start pl-2 pr-6 bg-gradient-to-r from-white via-white to-transparent text-[#FE8301] hover:text-[#e57400] active:scale-95 transition-all"
          >
            <i className="fi fi-rr-arrow-left text-[22px] flex" />
          </button>
        )}
        {/* Right scroll arrow — same white-fade mask, mirrored. */}
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollNav('right')}
            aria-label="Scroll tabs right"
            className="absolute right-0 top-0 bottom-[3px] z-20 flex items-center justify-end pr-2 pl-6 bg-gradient-to-l from-white via-white to-transparent text-[#FE8301] hover:text-[#e57400] active:scale-95 transition-all"
          >
            <i className="fi fi-rr-arrow-right text-[22px] flex" />
          </button>
        )}
        <div ref={navScrollRef} className="w-full max-w-[1920px] mx-auto px-4 md:px-6 overflow-x-auto no-scrollbar scroll-smooth">
          <ul className="flex items-center justify-start md:justify-center min-w-max mx-auto border-b border-gray-100">
            {navItems.map((item) => {
              // Locked features stay visible but cannot be navigated to —
              // clicking shows an upgrade toast that surfaces the current
              // plan name. The matching backend route returns 403 with
              // FEATURE_LOCKED, so this is purely a UX shortcut.
              if (item.locked) {
                return (
                  <li key={item.name}>
                    <button
                      type="button"
                      onClick={() => toast(
                        `Upgrade your plan to unlock ${item.name}.${tenant?.planName ? ` Current plan: ${tenant.planName}.` : ''}`,
                        { icon: '🔒' }
                      )}
                      className="flex items-center justify-center gap-2 h-[44px] px-6 text-[14px] leading-[20px] font-[600] tracking-normal font-manrope font-semibold transition-all relative whitespace-nowrap w-full group cursor-not-allowed text-gray-400 hover:text-gray-500 hover:bg-gray-50"
                    >
                      <i className={`${item.icon} text-[20px]`}></i>
                      {item.name}
                      <span className="ml-1 text-[9px] font-bold tracking-wider px-1.5 py-[1px] rounded-full bg-gray-100 text-gray-500 uppercase">
                        Pro
                      </span>
                    </button>
                  </li>
                )
              }

              return (
                <li key={item.name}>
                  <NavLink
                    to={item.path}
                    onMouseEnter={() => prefetchAdminPage(item.path)}
                    onFocus={() => prefetchAdminPage(item.path)}
                    className={({ isActive }) => `
                      flex items-center justify-center gap-2 h-[44px] px-6 text-[14px] leading-[20px] font-[600] tracking-normal font-manrope font-semibold transition-all relative whitespace-nowrap w-full group hover:bg-[#FFF3E6]
                      ${isActive ? '!text-[#FE8301]' : 'text-gray-500 hover:text-[#FE8301]'}
                    `}
                  >
                    {({ isActive }) => (
                      <>
                        <i className={`${item.icon} text-[20px] ${isActive ? 'font-bold' : ''}`}></i>
                        {item.name}
                        {isActive && (
                          <span className="absolute bottom-0 left-0 w-full h-[3px] bg-[#FE8301]"></span>
                        )}
                        {!isActive && (
                          <span className="absolute bottom-0 left-0 w-full h-[3px] bg-transparent transition-colors"></span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      </nav>

      {/* Cross-branch read-only banner — only when tenant owner is
          peeking at a sub-branch dashboard from Main. Loud enough that
          the owner cannot miss what scope they're in; the "Back to
          Main" button flips them back to full edit access. */}
      {isCrossBranchReadOnly && (
        <div className="w-full max-w-[1920px] mx-auto px-4 md:px-6 pt-3">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200">
            <div className="flex items-center gap-2 text-amber-900 text-[13px] font-semibold">
              <i className="fi fi-rr-eye flex" />
              <span>
                Viewing <span className="font-bold">{viewedBranch?.name || 'sub-branch'}</span> in read-only mode.
                Other tabs are disabled — branch admins manage their own data.
              </span>
            </div>
            <ReturnToMainButton />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col pt-4 px-4 md:pt-4 md:px-6 overflow-visible w-full max-w-[1920px] mx-auto">
        <Outlet />
      </main>

      <NotificationModal
        isOpen={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
    </div>
  )
}

// Wrap the inner layout with AdminBranchProvider so that all admin
// pages can read the branch selection via useAdminBranch().
const AdminLayout = () => (
  <AdminBranchProvider>
    <AdminLayoutInner />
  </AdminBranchProvider>
)

export default AdminLayout
