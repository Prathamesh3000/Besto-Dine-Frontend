import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import {
    LayoutDashboard,
    Store,
    Receipt,
    CreditCard,
    ClipboardList,
    LogOut,
    Menu as MenuIcon,
    X,
    ChevronRight,
    Inbox,
    Megaphone,
    Globe,
    BookOpen,
} from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';

/**
 * SuperAdminLayout — chrome for the BestoDine platform operator portal.
 *
 * Layout: fixed left sidebar (collapsible to a strip on desktop, sliding
 * sheet on mobile) + sticky top bar with breadcrumb and signed-in
 * profile. Colors and typography mirror the tenant-facing AdminLayout
 * (warm off-white `#FAF5F0` background, `#FE8301` orange accent,
 * Manrope type) so the whole product reads as one brand — the sidebar
 * is the primary visual cue that distinguishes the Super Admin portal.
 *
 * Responsive behavior:
 *   < md  — sidebar is hidden by default; the topbar shows a hamburger
 *           that opens it as a sheet over the content
 *   md+   — sidebar is permanent; users can collapse it to icons-only
 *           via the chevron in the brand header
 */

const NAV_ITEMS = [
    { to: '/superadmin/dashboard',         label: 'Overview',          icon: LayoutDashboard },
    { to: '/superadmin/restaurants',       label: 'Restaurants',       icon: Store },
    { to: '/superadmin/pending-approvals', label: 'Pending Approvals', icon: Inbox },
    { to: '/superadmin/leads',             label: 'Leads',             icon: Megaphone },
    { to: '/superadmin/marketing',         label: 'Marketing',         icon: Globe },
    { to: '/superadmin/blog',              label: 'Blog',              icon: BookOpen },
    { to: '/superadmin/plans',             label: 'Plans',             icon: Receipt },
    { to: '/superadmin/payments',          label: 'Payments',          icon: CreditCard },
    { to: '/superadmin/audit-logs',        label: 'Audit Log',         icon: ClipboardList },
];

const TITLE_BY_PATH = {
    '/superadmin/dashboard':         { title: 'Platform Overview',  crumb: 'Overview' },
    '/superadmin/restaurants':       { title: 'Restaurants',         crumb: 'Restaurants' },
    '/superadmin/pending-approvals': { title: 'Pending Approvals',   crumb: 'Pending Approvals' },
    '/superadmin/leads':             { title: 'Leads',               crumb: 'Leads' },
    '/superadmin/marketing':         { title: 'Marketing Content',   crumb: 'Marketing' },
    '/superadmin/blog':              { title: 'Blog',                crumb: 'Blog' },
    '/superadmin/plans':             { title: 'Subscription Plans',  crumb: 'Plans' },
    '/superadmin/payments':          { title: 'Subscription Payments', crumb: 'Payments' },
    '/superadmin/audit-logs':        { title: 'Audit Log',           crumb: 'Audit Log' },
};

const getCrumb = (pathname) => {
    if (pathname.startsWith('/superadmin/pending-approvals/')) {
        const leaf = pathname.includes('/signups/') ? 'Signup'
            : pathname.includes('/plan-changes/') ? 'Plan change'
            : 'Payment';
        return { title: 'Approval Detail', crumb: 'Pending Approvals', leaf };
    }
    if (pathname.startsWith('/superadmin/restaurants/') && pathname !== '/superadmin/restaurants') {
        return { title: 'Restaurant Detail', crumb: 'Restaurants', leaf: 'Detail' };
    }
    return TITLE_BY_PATH[pathname] || { title: 'Super Admin', crumb: '' };
};

const SuperAdminLayout = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close the mobile sheet whenever the route changes — without this
    // a tap on a nav item leaves the overlay covering the new page.
    const [prevPath, setPrevPath] = useState(location.pathname);
    if (prevPath !== location.pathname) {
        setPrevPath(location.pathname);
        if (mobileOpen) setMobileOpen(false);
    }

    const handleLogout = () => {
        logout();
        navigate('/staff-login', { replace: true });
    };

    const meta = getCrumb(location.pathname);
    const initial = (user?.name || user?.email || 'S').trim().charAt(0).toUpperCase();
    const sidebarWidth = collapsed ? 'md:w-[78px]' : 'md:w-[260px]';
    const mainOffset   = collapsed ? 'md:ml-[78px]' : 'md:ml-[260px]';

    return (
        <div className="min-h-screen bg-[#FAF5F0] text-gray-900 antialiased font-manrope">
            {/* ── Mobile backdrop ─────────────────────────────────────── */}
            {mobileOpen && (
                <div
                    onClick={() => setMobileOpen(false)}
                    className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-30 md:hidden"
                />
            )}

            {/* ── Sidebar ─────────────────────────────────────────────── */}
            <aside
                className={[
                    'fixed inset-y-0 left-0 z-40 bg-white border-r border-orange-100/70 flex flex-col transition-all duration-300',
                    mobileOpen ? 'w-[260px] translate-x-0' : 'w-[260px] -translate-x-full md:translate-x-0',
                    sidebarWidth,
                ].join(' ')}
            >
                {/* Brand */}
                <div className={`h-16 px-4 flex items-center border-b border-orange-100/70 ${collapsed ? 'md:justify-center md:px-2' : 'justify-between'}`}>
                    <Link to="/superadmin/dashboard" className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-linear-to-br from-[#FE8301] to-[#e57601] text-white font-bold flex items-center justify-center shadow-[0_6px_16px_rgba(254,131,1,0.28)] shrink-0">
                            B
                        </div>
                        {!collapsed && (
                            <div className="min-w-0">
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FE8301] leading-none">
                                    BestoDine
                                </div>
                                <div className="text-[15px] font-bold text-gray-900 leading-tight mt-1">
                                    Platform
                                </div>
                            </div>
                        )}
                    </Link>
                    <button
                        type="button"
                        onClick={() => setMobileOpen(false)}
                        className="md:hidden w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-orange-50 hover:text-[#FE8301]"
                        aria-label="Close menu"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto custom-scrollbar">
                    {!collapsed && (
                        <div className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-400">
                            Workspace
                        </div>
                    )}
                    {NAV_ITEMS.map(item => {
                        const Icon = item.icon;
                        return (
                            <NavLink
                                key={item.to}
                                to={item.to}
                                end={item.to === '/superadmin/restaurants' ? false : undefined}
                                title={collapsed ? item.label : undefined}
                                className={({ isActive }) =>
                                    [
                                        'group relative flex items-center gap-3 rounded-xl text-sm font-semibold transition-all',
                                        collapsed ? 'md:justify-center md:px-0 md:py-2.5 px-3 py-2.5' : 'px-3 py-2.5',
                                        isActive
                                            ? 'bg-[#FE8301] text-white shadow-[0_6px_16px_rgba(254,131,1,0.28)]'
                                            : 'text-gray-600 hover:bg-orange-50 hover:text-[#FE8301]',
                                    ].join(' ')
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <Icon
                                            size={18}
                                            strokeWidth={isActive ? 2.4 : 2}
                                            className={isActive ? 'text-white' : 'text-gray-500 group-hover:text-[#FE8301]'}
                                        />
                                        {!collapsed && <span className="truncate">{item.label}</span>}
                                        {!collapsed && isActive && (
                                            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />
                                        )}
                                    </>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Profile footer */}
                <div className={`border-t border-orange-100/70 ${collapsed ? 'p-2' : 'p-3'}`}>
                    {collapsed ? (
                        <div className="hidden md:flex flex-col items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-linear-to-br from-[#FE8301] to-[#cc6a01] text-white text-sm font-bold flex items-center justify-center shadow-sm">
                                {initial}
                            </div>
                            <button
                                type="button"
                                onClick={handleLogout}
                                title="Sign out"
                                className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-500 hover:text-rose-600 hover:bg-rose-50 transition"
                            >
                                <LogOut size={16} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-orange-50/60 transition">
                            <div className="w-10 h-10 rounded-full bg-linear-to-br from-[#FE8301] to-[#cc6a01] text-white text-sm font-bold flex items-center justify-center shrink-0 shadow-sm">
                                {initial}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-semibold text-gray-900 truncate">
                                    {user?.name || 'Super Admin'}
                                </div>
                                <div className="text-[11px] text-gray-500 truncate">{user?.email}</div>
                            </div>
                            <button
                                type="button"
                                onClick={handleLogout}
                                title="Sign out"
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                            >
                                <LogOut size={15} />
                            </button>
                        </div>
                    )}
                </div>

                {/* Collapse toggle (desktop only) */}
                <button
                    type="button"
                    onClick={() => setCollapsed(c => !c)}
                    className="hidden md:flex absolute -right-3 top-20 w-6 h-6 rounded-full bg-white border border-orange-200 shadow-sm items-center justify-center text-[#FE8301] hover:bg-orange-50 hover:border-[#FE8301]/40 transition"
                    aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <ChevronRight size={13} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                </button>
            </aside>

            {/* ── Main column ─────────────────────────────────────────── */}
            <div className={`min-h-screen flex flex-col transition-[margin] duration-300 ${mainOffset}`}>
                {/* Topbar */}
                <header className="sticky top-0 z-20 h-16 bg-white/90 backdrop-blur-md border-b border-orange-100/70 flex items-center px-4 sm:px-6 lg:px-8 gap-4 shadow-[0_2px_8px_0px_rgba(254,131,1,0.06)]">
                    <button
                        type="button"
                        onClick={() => setMobileOpen(true)}
                        className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-gray-700 hover:bg-orange-50 hover:text-[#FE8301]"
                        aria-label="Open menu"
                    >
                        <MenuIcon size={20} />
                    </button>
                    <div className="min-w-0 flex-1">
                        {meta.crumb && (
                            <nav className="hidden sm:flex items-center text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 mb-0.5">
                                <span>Super Admin</span>
                                <ChevronRight size={11} className="mx-1" />
                                <span>{meta.crumb}</span>
                                {meta.leaf && (
                                    <>
                                        <ChevronRight size={11} className="mx-1" />
                                        <span className="text-[#FE8301]">{meta.leaf}</span>
                                    </>
                                )}
                            </nav>
                        )}
                        <h1 className="text-base sm:text-[15px] font-bold text-gray-900 truncate">{meta.title}</h1>
                    </div>

                    {/* Right slot — live indicator + profile */}
                    <div className="flex items-center gap-2">
                        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-100 text-[11px] font-semibold uppercase tracking-wider text-[#FE8301]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                            Live
                        </div>
                        <div className="hidden md:flex items-center gap-3 pl-3 ml-1 border-l border-orange-100/80">
                            <div className="text-right hidden lg:block">
                                <div className="text-xs font-semibold text-gray-900 truncate max-w-[160px]">
                                    {user?.name || 'Super Admin'}
                                </div>
                                <div className="text-[10px] text-gray-500 truncate max-w-[160px]">{user?.email}</div>
                            </div>
                            <div className="w-9 h-9 rounded-full bg-linear-to-br from-[#FE8301] to-[#cc6a01] text-white text-sm font-bold flex items-center justify-center shadow-sm">
                                {initial}
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page content */}
                <main className="flex-1">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default SuperAdminLayout;
