import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { X, UserCircle, Utensils, Bell, History, CircleDollarSign, LogOut, ChevronRight, Home, ClipboardList, BellRing, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../../Context/AuthContext';

const Sidebar = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user, isCaptain, hasPermission, logout } = useAuth();

    const handleNavigate = (path) => {
        navigate(path);
        onClose();
    };

    const handleLogout = () => {
        logout();
        navigate('/staff-login');
    };

    // Close on Escape — standard accessible drawer behaviour. Without
    // this the only escape is the X button or the overlay tap, which
    // doesn't help users who navigated here by keyboard.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    // Build the nav list in one place so the active-route highlight
    // and the permission gates stay in sync. Items without
    // `requirePermission` are visible to everyone.
    const navItems = [
        { icon: Home,            label: 'Tables',         path: '/waiter/home' },
        // Captain-only floor command screen — workload, delayed orders,
        // table-to-waiter assignment, escalation. Hidden for plain waiters.
        ...(isCaptain ? [
            { icon: LayoutDashboard, label: 'Floor Overview', path: '/waiter/floor' },
        ] : []),
        { icon: ClipboardList,   label: 'Active Orders',  path: '/waiter/orders' },
        { icon: BellRing,        label: 'Requests',       path: '/waiter/requests' },
        { icon: UserCircle,      label: 'My Profile',     path: '/waiter/profile' },
        ...((isCaptain || hasPermission('editMenu')) ? [
            { icon: Utensils,    label: 'Menu Card',      path: '/waiter/menu' },
        ] : []),
        { icon: Bell,            label: 'Shift Status',   path: '/waiter/shift-status' },
        { icon: History,         label: 'Order History',  path: '/waiter/order-history' },
        { icon: CircleDollarSign,label: 'Tip History',    path: '/waiter/tips' },
    ];

    return (
        <>
            {/* Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity animate-in fade-in duration-200"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar Panel */}
            <aside
                role="dialog"
                aria-modal="true"
                aria-label="Waiter navigation"
                className={`fixed inset-y-0 left-0 w-[88vw] max-w-sm bg-white shadow-2xl transform transition-transform duration-300 ease-in-out z-50 flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
            >
                {/* Header — close + branding strip. Sticky-style top so
                    the close button stays reachable while the nav scrolls. */}
                <div className="flex items-center justify-between px-5 pt-6 pb-4">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[#FE8301]">Waiter</span>
                    <button
                        onClick={onClose}
                        aria-label="Close menu"
                        className="w-11 h-11 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-100 flex items-center justify-center transition"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Profile Section */}
                <button
                    type="button"
                    onClick={() => handleNavigate('/waiter/profile')}
                    className="mx-5 px-4 py-4 rounded-2xl bg-linear-to-br from-[#FFF4E8] to-[#FFE7C8] flex items-center gap-4 text-left active:scale-[0.98] transition"
                >
                    <div className="w-14 h-14 bg-white rounded-2xl shrink-0 flex items-center justify-center text-2xl font-extrabold text-[#FE8301]">
                        {(user?.name || 'S').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold text-[#1A181B] leading-tight capitalize truncate">{user?.name || 'Staff Member'}</h2>
                        <p className="text-xs text-[#8D848F] mt-0.5 font-medium capitalize">{user?.role || 'Waiter'}{user?.branch?.name ? ` · ${user.branch.name}` : ''}</p>
                    </div>
                    <ChevronRight size={18} className="text-[#FE8301] shrink-0" />
                </button>

                {/* Navigation Items */}
                <nav className="flex-1 overflow-y-auto px-3 py-2 custom-scrollbar">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path
                            || (item.path === '/waiter/home' && location.pathname === '/waiter')
                            || (item.path !== '/waiter/home' && location.pathname.startsWith(item.path));
                        return (
                            <button
                                key={item.path}
                                onClick={() => handleNavigate(item.path)}
                                className={`flex items-center gap-3 w-full min-h-12 px-3 rounded-xl transition-all duration-200 group ${
                                    isActive
                                        ? 'bg-[#FFF1E3] text-[#FE8301]'
                                        : 'text-[#1A181B] hover:bg-gray-50 active:bg-gray-100'
                                }`}
                            >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                    isActive ? 'bg-white text-[#FE8301]' : 'text-[#8D848F] group-hover:text-[#1A181B]'
                                }`}>
                                    <Icon size={18} strokeWidth={isActive ? 2.25 : 1.75} />
                                </div>
                                <span className={`text-sm font-semibold truncate flex-1 text-left ${isActive ? 'text-[#FE8301]' : ''}`}>
                                    {item.label}
                                </span>
                                <ChevronRight size={16} className={`shrink-0 ${isActive ? 'text-[#FE8301]' : 'text-gray-300'}`} />
                            </button>
                        );
                    })}
                </nav>

                {/* Logout Button — pinned to the bottom so it's always
                    findable, with a clear danger affordance. */}
                <div className="px-5 pt-3 pb-6 border-t border-gray-100 mt-auto">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-3 w-full min-h-12 px-3 rounded-xl text-[#FF3B30] hover:bg-red-50 active:bg-red-100 transition"
                    >
                        <div className="w-9 h-9 rounded-lg bg-red-50 text-[#FF3B30] flex items-center justify-center shrink-0">
                            <LogOut size={18} strokeWidth={2} />
                        </div>
                        <span className="font-semibold text-sm">Log out</span>
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
