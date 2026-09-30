import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ChevronLeft, Bell, CheckCheck, Loader2, Trash2, Volume2, VolumeX,
    BellRing, UtensilsCrossed, Wallet, IndianRupee, Info, MapPin, ChevronRight,
} from 'lucide-react';
import { useNotifications } from '../../Context/NotificationContext';
import WaiterEmptyState from '../../Components/Waiter/WaiterEmptyState';
import toast from 'react-hot-toast';

const WaiterNotifications = () => {
    const navigate = useNavigate();
    // Pull live data straight from NotificationContext — that's where the
    // socket listener (`notification:new` / `order:new` / etc.) and the
    // 15 s polling already live, so the page stays in sync without us
    // needing to remount it (the previous local-state version only
    // refreshed on mount, which is why the unread count looked frozen
    // until the user tab-switched away and back).
    const {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        clearAll,
        soundEnabled,
        toggleSound,
        testSound,
    } = useNotifications();

    // ── Section (floor) filter ──────────────────────────────────────
    // The Requests screen has had Indoor/Outdoor floor pills for a
    // while; this list had none, so a waiter working Outdoor had to
    // read every Indoor alert to find their own. Notifications now
    // carry meta.area, so the same grouping is possible here.
    const [activeSection, setActiveSection] = React.useState('all');

    // Clock for the relative "5m ago" labels — ticks each minute so the
    // labels stay current without calling Date.now() during render.
    const [now, setNow] = React.useState(() => Date.now());
    React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(id);
    }, []);

    // Sections present in the CURRENT notifications, not the tenant's
    // full area list — a pill for a floor with nothing on it is noise.
    const sections = React.useMemo(() => {
        const seen = new Map();
        for (const n of notifications) {
            const area = n.meta?.area;
            if (area && !seen.has(area)) seen.set(area, 0);
            if (area) seen.set(area, seen.get(area) + (n.status === 'unread' ? 1 : 0));
        }
        return [...seen.entries()].map(([name, unread]) => ({ name, unread }));
    }, [notifications]);

    const visibleNotifications = React.useMemo(() => {
        if (activeSection === 'all') return notifications;
        // 'general' collects anything with no floor — wallet, system,
        // tip settlements. Without it those would vanish the moment a
        // waiter picked a section, which would hide real alerts.
        if (activeSection === 'general') return notifications.filter((n) => !n.meta?.area);
        return notifications.filter((n) => n.meta?.area === activeSection);
    }, [notifications, activeSection]);

    const handleMarkRead = (id) => markAsRead(id);

    // Click a notification → mark read AND open the exact place it's
    // about. Previously every Service alert dumped the waiter on the
    // Requests screen at whatever floor it defaulted to (often the wrong
    // one), and counter-payment alerts went to the Tips page. Now the
    // floor (meta.area) and table travel along in router state so the
    // destination opens on the right section (Indoor / Outdoor / …).
    const handleNotifClick = (notif) => {
        if (notif.status === 'unread') handleMarkRead(notif._id);
        const meta = notif.meta || {};
        const navState = { area: meta.area || null, table: meta.table || null };
        switch (notif.category) {
            case 'Order':                    // new / ready / served order alerts
                navigate('/waiter/orders', { state: navState });
                break;
            case 'Service':                  // table requests, captain escalations
                navigate('/waiter/requests', { state: navState });
                break;
            case 'Payment':
                // Counter-payment request → straight to the settle screen
                // with cash preselected (same target as the live toast).
                if (meta.orderId && meta.amount != null) {
                    navigate('/waiter/payment', {
                        state: {
                            orderId: meta.orderId,
                            orderDisplayId: meta.orderId,
                            amount: meta.amount,
                            tableName: meta.table || '',
                            fromCounterRequest: true,
                        },
                    });
                } else {
                    navigate('/waiter/tips');
                }
                break;
            case 'Wallet':                   // tip settled → wallet
                navigate('/waiter/tips');
                break;
            default:
                break;                       // System/Offer/etc. — stay here
        }
    };

    const handleMarkAllRead = () => {
        markAllAsRead();
        toast.success('All marked as read');
    };

    const handleClearAll = () => {
        clearAll();
        toast.success('Notifications cleared');
    };

    // Category drives the icon + label so a water call, a ready order
    // and a cash request no longer all look like the same grey bell.
    const CATEGORY_META = {
        Service: { Icon: BellRing,        label: 'Request', tone: 'bg-[#F3E8F9] text-[#702083]' },
        Order:   { Icon: UtensilsCrossed, label: 'Order',   tone: 'bg-[#FFF3E0] text-[#FE8301]' },
        Payment: { Icon: IndianRupee,     label: 'Payment', tone: 'bg-[#E8F5E9] text-[#2E7D32]' },
        Wallet:  { Icon: Wallet,          label: 'Wallet',  tone: 'bg-[#E3F2FD] text-[#1565C0]' },
    };
    const categoryMeta = (c) => CATEGORY_META[c] || { Icon: Info, label: c || 'System', tone: 'bg-gray-100 text-[#645E66]' };

    const priorityBadge = (priority) => {
        if (priority === 'urgent') return { text: 'Urgent', cls: 'bg-[#FFEBEE] text-[#FF3B30]' };
        if (priority === 'high') return { text: 'High', cls: 'bg-[#FFEBEE] text-[#FF3B30]' };
        return null;
    };

    // Split into Today / Earlier so a long shift's backlog doesn't bury
    // what just came in.
    const isToday = (d) => {
        const x = new Date(d);
        const today = new Date(now);
        return x.getFullYear() === today.getFullYear() && x.getMonth() === today.getMonth() && x.getDate() === today.getDate();
    };

    // meta.table is a table NAME on request alerts but a raw ObjectId on
    // some legacy payment rows — never print the latter.
    const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v || ''));

    const timeAgo = (date) => {
        const diff = now - new Date(date).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FBFBFF] pb-10">
            <div className="max-w-screen-md mx-auto">
                {/* Header */}
                <header className="px-4 sm:px-6 pt-6 pb-4 flex items-center justify-between bg-white/95 backdrop-blur sticky top-0 z-10 shadow-sm">
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            onClick={() => navigate(-1)}
                            aria-label="Back"
                            className="w-11 h-11 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-50 flex items-center justify-center transition shrink-0"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        <h1 className="text-xl sm:text-2xl font-bold text-[#1A181B] tracking-tight truncate">
                            Notifications {unreadCount > 0 && <span className="text-base text-[#FE8301]">({unreadCount})</span>}
                        </h1>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => { toggleSound(); testSound(); }}
                            className={`w-11 h-11 rounded-xl flex items-center justify-center transition-colors ${soundEnabled ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'hover:bg-gray-100 text-[#8D848F]'}`}
                            title={soundEnabled ? 'Sound ON — click to mute' : 'Sound OFF — click to unmute'}
                        >
                            {soundEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
                        </button>
                        {unreadCount > 0 && (
                            <button onClick={handleMarkAllRead} className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-gray-100" title="Mark all read">
                                <CheckCheck size={20} className="text-[#702083]" />
                            </button>
                        )}
                        {notifications.length > 0 && (
                            <button onClick={handleClearAll} className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-gray-100" title="Clear all">
                                <Trash2 size={20} className="text-[#8D848F]" />
                            </button>
                        )}
                    </div>
                </header>

                <main className="px-4 sm:px-6 py-4">
                    {notifications.length === 0 ? (
                        <WaiterEmptyState
                            icon={Bell}
                            title="No notifications yet"
                            hint="Order updates and customer requests will appear here in real time."
                        />
                    ) : (
                        <>
                        {/* Floor pills. Only rendered when notifications
                            actually span more than one section — a single
                            pill would be a control with nothing to choose. */}
                        {sections.length > 1 && (
                            <div className="flex gap-2 overflow-x-auto pb-3 -mx-1 px-1">
                                {[
                                    { key: 'all', label: 'All', unread: unreadCount },
                                    ...sections.map((s) => ({ key: s.name, label: s.name, unread: s.unread })),
                                    ...(notifications.some((n) => !n.meta?.area)
                                        ? [{
                                            key: 'general',
                                            label: 'General',
                                            unread: notifications.filter((n) => !n.meta?.area && n.status === 'unread').length,
                                        }]
                                        : []),
                                ].map((pill) => (
                                    <button
                                        key={pill.key}
                                        onClick={() => setActiveSection(pill.key)}
                                        aria-pressed={activeSection === pill.key}
                                        className={`shrink-0 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors flex items-center gap-1.5 ${
                                            activeSection === pill.key
                                                ? 'bg-[#702083] text-white'
                                                : 'bg-white border border-gray-200 text-[#645E66] hover:bg-gray-50'
                                        }`}
                                    >
                                        {pill.label}
                                        {pill.unread > 0 && (
                                            <span className={`text-[11px] tabular-nums px-1.5 rounded-full ${
                                                activeSection === pill.key ? 'bg-white/25' : 'bg-[#FFF3E0] text-[#FE8301]'
                                            }`}>
                                                {pill.unread}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {visibleNotifications.length === 0 ? (
                            <WaiterEmptyState
                                icon={Bell}
                                title="Nothing on this floor"
                                hint="Switch to another section, or tap All to see everything."
                            />
                        ) : (
                        <div className="space-y-5">
                            {[
                                { key: 'today', label: 'Today', items: visibleNotifications.filter((n) => isToday(n.createdAt)) },
                                { key: 'earlier', label: 'Earlier', items: visibleNotifications.filter((n) => !isToday(n.createdAt)) },
                            ].filter((g) => g.items.length > 0).map((group) => (
                                <section key={group.key}>
                                    <h2 className="text-[11px] font-bold uppercase tracking-widest text-[#8D848F] mb-2 px-1">
                                        {group.label}
                                    </h2>
                                    <ul className="space-y-2.5">
                                        {group.items.map((notif) => {
                                            const cm = categoryMeta(notif.category);
                                            const CatIcon = cm.Icon;
                                            const unread = notif.status === 'unread';
                                            const pb = priorityBadge(notif.priority);
                                            const actionable = ['Service', 'Order', 'Payment', 'Wallet'].includes(notif.category);
                                            return (
                                                <li key={notif._id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleNotifClick(notif)}
                                                        className={`w-full text-left bg-white rounded-2xl p-3.5 sm:p-4 border transition-all flex items-start gap-3 hover:shadow-md active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#702083]/40 ${
                                                            unread ? 'border-[#702083]/25 shadow-sm' : 'border-gray-100'
                                                        }`}
                                                    >
                                                        <div className={`relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${cm.tone}`}>
                                                            <CatIcon size={18} />
                                                            {unread && (
                                                                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#FE8301] ring-2 ring-white" />
                                                            )}
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-start justify-between gap-2">
                                                                <h3 className={`text-[14px] leading-snug text-[#1A181B] ${unread ? 'font-bold' : 'font-semibold opacity-75'}`}>
                                                                    {notif.title}
                                                                </h3>
                                                                <span className="text-[11px] text-[#8D848F] shrink-0 mt-0.5 tabular-nums">{timeAgo(notif.createdAt)}</span>
                                                            </div>
                                                            <p className={`text-[13px] mt-0.5 line-clamp-2 leading-relaxed ${unread ? 'text-[#645E66]' : 'text-gray-400'}`}>
                                                                {notif.description}
                                                            </p>
                                                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${cm.tone}`}>
                                                                    {cm.label}
                                                                </span>
                                                                {notif.meta?.area && (
                                                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#702083] bg-[#F9F1FB] px-1.5 py-0.5 rounded-md">
                                                                        <MapPin size={10} />
                                                                        {notif.meta.area}
                                                                    </span>
                                                                )}
                                                                {notif.meta?.table && !isObjectId(notif.meta.table) && (
                                                                    <span className="text-[11px] font-semibold text-[#645E66] bg-gray-100 px-1.5 py-0.5 rounded-md">
                                                                        Table {notif.meta.table}
                                                                    </span>
                                                                )}
                                                                {pb && (
                                                                    <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md ${pb.cls}`}>
                                                                        {pb.text}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        {actionable && (
                                                            <ChevronRight size={18} className="text-[#C9C3CB] shrink-0 self-center" />
                                                        )}
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </div>
                        )}
                        </>
                    )}
                </main>
            </div>
        </div>
    );
};

export default WaiterNotifications;
