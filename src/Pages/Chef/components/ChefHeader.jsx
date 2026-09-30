import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
    Volume2,
    VolumeX,
    RefreshCw,
    LogOut,
    ChefHat,
    Wifi,
    WifiOff,
    BookOpen,
    Boxes,
    MoreVertical,
} from 'lucide-react';
import { resolveImageUrl } from '../../../utils/image';

/**
 * ChefHeader — admin-themed top bar for the Kitchen Display System.
 *
 * Responsive strategy (single non-wrapping row at every width):
 *   • Brand     — logo always; identity text shows from `sm` (truncates).
 *   • Stats     — compact time/active/load cluster below `lg`; the full
 *                 date + big clock + active + load cluster only on `lg+`.
 *   • Actions   — sound / refresh / sign-out always visible. The nav
 *                 links (Recipes, Stock) sit inline from `sm`, and collapse
 *                 into a "⋮ More" menu on phones so the bar never overflows.
 *   • Open/Wifi — secondary indicators, `lg+` / `xl+` only.
 *
 * White card surface over the cream page background — matches the admin
 * panel so chefs moving between screens don't feel a tone change.
 */

// ─── Kitchen-load color ramp (light-theme) ──────────────────────────
const LOAD_COLORS = {
    Low:    { text: 'text-emerald-600', dot: 'bg-emerald-500' },
    Medium: { text: 'text-sky-600',     dot: 'bg-sky-500' },
    High:   { text: 'text-amber-600',   dot: 'bg-amber-500' },
    Maxed:  { text: 'text-red-600',     dot: 'bg-red-500 animate-pulse' },
};

const ChefHeader = ({
    user,
    cafeName,
    logoUrl = '',
    isCafeClosed,
    soundEnabled,
    toggleSound,
    fetchOrders,
    refreshing,
    handleLogout,
    activeCount = 0,
    kitchenLoad = 'Low',
    isOnline = true,
}) => {
    // Tenant logo (same source as the Admin/Waiter headers — Settings >
    // general.logoUrl). Falls back to the ChefHat mark when the cafe
    // hasn't uploaded a logo. One small cached request, no per-row images.
    const cafeLogo = resolveImageUrl(logoUrl);

    // Live clock — ticks every second so the chef has a glanceable
    // wall-clock readout without leaving the KDS.
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    // Phone-only overflow menu for the secondary nav links.
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef(null);
    useEffect(() => {
        if (!menuOpen) return undefined;
        const onClick = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setMenuOpen(false); };
        document.addEventListener('mousedown', onClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [menuOpen]);

    const time = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
    });
    const timeShort = now.toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
    });
    const date = now.toLocaleDateString('en-IN', {
        weekday: 'short', day: '2-digit', month: 'short',
    });

    const load = LOAD_COLORS[kitchenLoad] || LOAD_COLORS.Low;
    const canRecipes = !!user?.permissions?.manageRecipe;
    const canStock = !!user?.permissions?.manageStock;
    const hasNav = canRecipes || canStock;

    return (
        <header className="sticky top-0 z-40 bg-white border-b border-gray-100 font-manrope shadow-[0px_2px_8px_0px_#00000014]">
            <div className="max-w-480 mx-auto px-3 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center gap-2 sm:gap-4">

                {/* ── Brand (left) ────────────────────────────────── */}
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    {cafeLogo ? (
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                            <img src={cafeLogo} alt={cafeName || 'Cafe logo'} className="w-full h-full object-contain" />
                        </div>
                    ) : (
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-linear-to-br from-[#FE8301] to-orange-600 text-white flex items-center justify-center shadow-[0_4px_16px_rgba(254,131,1,0.25)] shrink-0">
                            <ChefHat size={20} strokeWidth={2.25} />
                        </div>
                    )}
                    <div className="min-w-0 hidden sm:block">
                        <h1 className="text-base font-bold text-gray-900 tracking-tight leading-none truncate">
                            Kitchen Display
                        </h1>
                        <p className="text-[11px] text-[#7D7380] font-medium mt-1 truncate">
                            {user?.name || 'Chef'}
                            {cafeName && <span className="text-gray-300"> · </span>}
                            {cafeName}
                            {user?.kitchenResponsibility && user.kitchenResponsibility !== 'both' && (
                                <span className={`ml-2 text-[10px] font-bold uppercase tracking-wider ${
                                    user.kitchenResponsibility === 'veg' ? 'text-emerald-600' : 'text-red-600'
                                }`}>
                                    {user.kitchenResponsibility === 'veg' ? '· veg only' : '· non-veg'}
                                </span>
                            )}
                        </p>
                    </div>
                </div>

                {/* ── Full status cluster (lg+) ───────────────────── */}
                <div className="hidden lg:flex items-center gap-5 xl:gap-7 ml-auto">
                    <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#7D7380] leading-none">{date}</div>
                        <div className="text-2xl xl:text-[26px] font-black text-gray-900 tabular-nums leading-none mt-1.5">{time}</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200" />
                    <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#7D7380] leading-none">Active</div>
                        <div className="flex items-center gap-1.5 justify-end mt-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FE8301] animate-pulse" />
                            <span className="text-2xl xl:text-[26px] font-black text-[#FE8301] tabular-nums leading-none">{activeCount}</span>
                        </div>
                    </div>
                    <div className="h-10 w-px bg-gray-200" />
                    <div className="text-right">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-[#7D7380] leading-none">Load</div>
                        <div className={`flex items-center gap-1.5 justify-end mt-1.5 ${load.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${load.dot}`} />
                            <span className="text-base xl:text-lg font-black uppercase tracking-tight leading-none">{kitchenLoad}</span>
                        </div>
                    </div>
                </div>

                {/* ── Compact status cluster (< lg) ───────────────── */}
                <div className="flex lg:hidden items-center gap-2.5 sm:gap-3 ml-auto shrink-0">
                    <div className="text-right leading-none">
                        <div className="text-sm sm:text-base font-black text-gray-900 tabular-nums">{timeShort}</div>
                        <div className={`text-[9px] sm:text-[10px] font-bold uppercase tracking-wider mt-0.5 ${load.text}`}>{kitchenLoad}</div>
                    </div>
                    <div className="h-8 w-px bg-gray-200" />
                    <div className="text-right leading-none">
                        <div className="flex items-center gap-1 justify-end">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#FE8301] animate-pulse" />
                            <span className="text-sm sm:text-base font-black text-[#FE8301] tabular-nums">{activeCount}</span>
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-[#7D7380] mt-0.5">Active</div>
                    </div>
                </div>

                {/* ── Actions (right) ─────────────────────────────── */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0 pl-1.5 sm:pl-3 border-l border-gray-200">
                    {/* Open / closed — big screens only */}
                    <span
                        className={`hidden xl:inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mr-1 ${
                            isCafeClosed ? 'text-red-600' : 'text-emerald-600'
                        }`}
                    >
                        <span className={`w-1.5 h-1.5 rounded-full ${isCafeClosed ? 'bg-red-500' : 'bg-emerald-500 animate-pulse'}`} />
                        {isCafeClosed ? 'Closed' : 'Open'}
                    </span>

                    {/* Network status — lg+ */}
                    <div
                        className={`hidden lg:flex w-11 h-11 rounded-xl items-center justify-center transition ${
                            isOnline
                                ? 'text-[#7D7380]'
                                : 'bg-red-50 text-red-600 ring-1 ring-red-200'
                        }`}
                        title={isOnline ? 'Connected' : 'Offline'}
                    >
                        {isOnline ? <Wifi size={18} /> : <WifiOff size={18} />}
                    </div>

                    {/* Nav links — inline from sm */}
                    {canRecipes && (
                        <NavIcon to="/chef/recipes" title="Manage recipes" className="hidden sm:flex">
                            <BookOpen size={18} />
                        </NavIcon>
                    )}
                    {canStock && (
                        <NavIcon to="/chef/stock" title="View & adjust stock" className="hidden sm:flex">
                            <Boxes size={18} />
                        </NavIcon>
                    )}

                    <IconButton
                        title={soundEnabled ? 'Mute alerts' : 'Enable alerts'}
                        onClick={toggleSound}
                        active={soundEnabled}
                    >
                        {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </IconButton>

                    <IconButton
                        title="Refresh orders"
                        onClick={() => fetchOrders?.(true)}
                        disabled={refreshing}
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                    </IconButton>

                    {/* Overflow menu — phones only, holds the nav links */}
                    {hasNav && (
                        <div className="relative sm:hidden" ref={menuRef}>
                            <IconButton
                                title="More"
                                onClick={() => setMenuOpen((v) => !v)}
                                active={menuOpen}
                            >
                                <MoreVertical size={18} />
                            </IconButton>
                            {menuOpen && (
                                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-gray-100 shadow-xl py-1.5 z-50">
                                    {canRecipes && (
                                        <MenuLink to="/chef/recipes" icon={<BookOpen size={16} />} onClick={() => setMenuOpen(false)}>
                                            Recipes
                                        </MenuLink>
                                    )}
                                    {canStock && (
                                        <MenuLink to="/chef/stock" icon={<Boxes size={16} />} onClick={() => setMenuOpen(false)}>
                                            Stock
                                        </MenuLink>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="h-10 sm:h-11 px-2.5 sm:px-4 bg-white hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-xl font-semibold text-sm flex items-center gap-2 border border-gray-200 hover:border-red-200 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301]"
                        title="Sign out"
                    >
                        <LogOut size={15} />
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                </div>
            </div>
        </header>
    );
};

// ─── NavIcon — icon link (44px touch target) ────────────────────────
const NavIcon = ({ to, title, children, className = '' }) => (
    <Link
        to={to}
        title={title}
        aria-label={title}
        className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl items-center justify-center text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] ${className}`}
    >
        {children}
    </Link>
);

// ─── MenuLink — overflow-menu row ───────────────────────────────────
const MenuLink = ({ to, icon, children, onClick }) => (
    <Link
        to={to}
        onClick={onClick}
        className="flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-orange-50 hover:text-[#FE8301] transition"
    >
        <span className="text-[#7D7380]">{icon}</span>
        {children}
    </Link>
);

// ─── IconButton — 40/44px touch target, light admin-theme surface ───
const IconButton = ({ children, onClick, title, disabled, active }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        aria-label={title}
        className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] disabled:opacity-50 disabled:cursor-not-allowed ${
            active
                ? 'bg-orange-50 text-[#FE8301] ring-1 ring-orange-200 hover:bg-orange-100'
                : 'text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50'
        }`}
    >
        {children}
    </button>
);

export default ChefHeader;
