import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, Check, ShoppingBag, Wallet, Star, Gift, CreditCard, BellRing, Clock, Trash2, Bell } from 'lucide-react'
import { useNotifications } from '../../../Context/NotificationContext'
import ConfirmModal from './ConfirmModal'

const categoryStyles = {
    Order:   { color: 'text-orange-500 bg-orange-50',  icon: <ShoppingBag size={18} className="text-orange-500" />, iconBg: 'bg-orange-50' },
    Wallet:  { color: 'text-purple-600 bg-purple-50',  icon: <Wallet      size={18} className="text-purple-600" />, iconBg: 'bg-purple-50' },
    Points:  { color: 'text-yellow-600 bg-yellow-50',  icon: <Star        size={18} className="text-yellow-600" />, iconBg: 'bg-yellow-50' },
    Offer:   { color: 'text-pink-500 bg-pink-50',      icon: <Gift        size={18} className="text-pink-500" />,   iconBg: 'bg-pink-50' },
    Reward:  { color: 'text-pink-500 bg-pink-50',      icon: <Gift        size={18} className="text-pink-500" />,   iconBg: 'bg-pink-50' },
    Payment: { color: 'text-green-600 bg-green-50',    icon: <CreditCard  size={18} className="text-green-600" />,  iconBg: 'bg-green-50' },
    Service: { color: 'text-sky-600 bg-sky-50',        icon: <Bell        size={18} className="text-sky-600" />,    iconBg: 'bg-sky-50' },
    System:  { color: 'text-blue-500 bg-blue-50',      icon: <BellRing    size={18} className="text-blue-500" />,   iconBg: 'bg-blue-50' },
    Default: { color: 'text-gray-500 bg-gray-50',      icon: <BellRing    size={18} className="text-gray-500" />,   iconBg: 'bg-gray-50' }
};

const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins/60)} hours ago`;
    return date.toLocaleDateString();
};

const categories = ['All', 'Order', 'Wallet', 'Points', 'Offer', 'Reward', 'Payment', 'Service', 'System']

const NotificationModal = ({ isOpen, onClose }) => {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState('All')
    const [showUnreadOnly, setShowUnreadOnly] = useState(false)
    const [confirmClear, setConfirmClear] = useState(false)
    const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } = useNotifications();

    // Map a notification → target route. Branches on category AND meta/title
    // because `Service` covers three very different sources (table requests,
    // reservations, advance bookings) and their meta shapes differ.
    const resolveRoute = (notif) => {
        const meta = notif.meta || {};
        const orderId = meta.orderId;
        const title = (notif.title || '').toLowerCase();

        switch (notif.category) {
            case 'Order':
                return { path: '/admin/orders', state: orderId ? { openOrderId: orderId, fromNotification: true } : undefined };
            case 'Payment':
                return { path: '/admin/payments', state: orderId ? { openOrderId: orderId, fromNotification: true } : undefined };
            case 'Wallet':
            case 'Points':
                return { path: '/admin/wallet' };
            case 'Offer':
            case 'Reward':
                return { path: '/admin/offers' };
            case 'Service': {
                // Advance bookings ship meta.bookingId; reservations say so in
                // the title. Everything else (waiter calls / bill requests /
                // generic table pings) belongs on the tables page.
                const isBooking = !!meta.bookingId || title.includes('booking') || title.includes('reservation');
                if (isBooking) {
                    return { path: '/admin/bookings', state: meta.bookingId ? { openBookingId: meta.bookingId } : undefined };
                }
                return { path: '/admin/tables', state: meta.table ? { highlightTable: meta.table } : undefined };
            }
            case 'System':
            default:
                // Fallback on meta — a System notification that happens to
                // carry an orderId still deserves a jump to that order.
                if (orderId) return { path: '/admin/orders', state: { openOrderId: orderId, fromNotification: true } };
                return null;
        }
    };

    const handleNotificationClick = (notif) => {
        if (notif.status === 'unread') markAsRead(notif._id);

        const target = resolveRoute(notif);
        if (target) {
            // react-router assigns a fresh `location.key` on every navigate
            // call — the consumer effects on Orders/Bookings key off that,
            // so clicking the same notification twice re-runs them without
            // any extra timestamp plumbing on our side.
            navigate(target.path, { state: target.state });
        }
        onClose();
    };

    // Click-handler wrapper for inner action buttons — keeps the click from
    // bubbling up to the card and triggering the navigation.
    const stopAnd = (fn) => (e) => {
        e.stopPropagation();
        e.preventDefault();
        fn();
    };

    if (!isOpen) return null

    // Compute dynamic tabs — only show categories that have notifications
    const tabs = categories
        .filter(cat => cat === 'All' || notifications.some(n => n.category === cat))
        .map(cat => {
            const count = cat === 'All' ? notifications.length : notifications.filter(n => n.category === cat).length
            return {
                id: cat,
                label: `${cat} (${count.toString().padStart(2, '0')})`
            }
        })

    // Filter Notifications mapping logic
    const filteredNotifications = notifications.filter(n => {
        if (showUnreadOnly && n.status !== 'unread') return false
        if (activeTab === 'All') return true
        return activeTab === n.category
    })

    return (
        <div className="fixed inset-0 z-[100] flex justify-end bg-black/20 backdrop-blur-sm transition-opacity">
            <div className="w-full max-w-[569px] h-full bg-white shadow-xl flex flex-col slide-in-from-right animate-in duration-300">
                {/* Header */}
                <div className="bg-[#FFF8F3] px-6 py-4 flex items-center justify-between border-b border-orange-100 shrink-0">
                    <div>
                        <h2 className="text-[18px] font-[600] text-[#1A181B] leading-tight mb-0.5">Notification</h2>
                        <p className="text-[13px] text-[#71717A]">{unreadCount} Unread</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={markAllAsRead}
                            disabled={unreadCount === 0}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#F97316] text-[#F97316] hover:bg-orange-50 transition-colors text-[13px] font-[500] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Check size={16} />
                            Mark All Read
                        </button>
                        <button
                            onClick={() => setConfirmClear(true)}
                            disabled={notifications.length === 0}
                            className="px-4 py-2 rounded-lg border border-[#F97316] text-[#F97316] hover:bg-orange-50 transition-colors text-[13px] font-[500] disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Clear All
                        </button>
                        <button onClick={onClose} className="p-2 text-gray-500 hover:text-gray-800 transition-colors ml-1">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto w-full px-6 py-4 no-scrollbar">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-200 gap-6 overflow-x-auto no-scrollbar mb-4 shrink-0">
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`pb-3 text-[14px] font-[500] transition-colors whitespace-nowrap relative ${activeTab === tab.id ? 'text-purple-600' : 'text-[#71717A] hover:text-gray-800'
                                    }`}
                            >
                                {tab.label}
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-purple-600 rounded-t-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Filters */}
                    <div className="flex items-center gap-2 mb-6">
                        <input
                            type="checkbox"
                            checked={showUnreadOnly}
                            onChange={(e) => setShowUnreadOnly(e.target.checked)}
                            className="w-4 h-4 rounded-[4px] border-gray-300 text-purple-600 focus:ring-purple-600"
                        />
                        <span className="text-[14px] text-gray-600">Show unread only</span>
                    </div>

                    {/* List */}
                    <div className="flex flex-col gap-3 pb-8">
                        {filteredNotifications.length > 0 ? filteredNotifications.map((notif) => {
                            const style = categoryStyles[notif.category] || categoryStyles.Default;
                            return (
                                <div key={notif._id} onClick={() => handleNotificationClick(notif)} className={`bg-white rounded-[16px] border ${notif.status === 'unread' ? 'border-orange-200 shadow-sm' : 'border-gray-200'} p-4 flex gap-4 relative group cursor-pointer hover:bg-gray-50 transition-colors`}>
                                    {/* Dot Indicator + delete */}
                                    {notif.status === 'unread' && (
                                        <div className="absolute top-4 right-10 w-2 h-2 rounded-full bg-orange-500" />
                                    )}
                                    <button
                                        onClick={stopAnd(() => deleteNotification(notif._id))}
                                        title="Dismiss"
                                        className="absolute top-3 right-3 p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>

                                    {/* Icon Left */}
                                    <div className={`w-[40px] h-[40px] rounded-[12px] flex items-center justify-center shrink-0 ${style.iconBg}`}>
                                        {style.icon}
                                    </div>

                                    {/* Content Right */}
                                    <div className="flex flex-col flex-1 min-w-0 pr-6">
                                        <div className="flex items-center flex-wrap gap-2 mb-1.5">
                                            <h3 className="text-[14px] font-[600] text-[#1A181B] leading-snug">{notif.title}</h3>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-[500] ${style.color} flex items-center`}>
                                                {notif.category}
                                            </span>
                                            {notif.status === 'unread' && (
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-[500] bg-blue-50 text-blue-500 border border-blue-200">
                                                    New
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[13px] text-gray-600 mb-2 leading-relaxed whitespace-pre-wrap">{notif.description}</div>

                                        {(notif.meta?.orderId) && (
                                            <div className="flex items-center flex-wrap gap-3 mb-1">
                                                <div className="flex items-center gap-1.5 text-[12px] text-gray-500 font-[500]">
                                                    <ShoppingBag size={12} className="text-gray-400" />
                                                    <span>{notif.meta.orderId}</span>
                                                </div>
                                                {notif.meta.amount && (
                                                    <div className="flex items-center gap-1.5 text-[12px] text-gray-500 font-[500]">
                                                        <CreditCard size={12} className="text-gray-400" />
                                                        <span>₹{notif.meta.amount}</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div className="flex items-center gap-1.5 text-[12px] text-gray-400 mb-2 sm:mb-0 mt-0.5">
                                            <Clock size={12} />
                                            {formatTime(notif.createdAt)}
                                        </div>

                                        {/* Actions Container */}
                                        <div className="sm:absolute sm:bottom-4 sm:right-4 flex flex-wrap items-center gap-3 mt-3 sm:mt-0">
                                            {notif.status === 'unread' && (
                                                <button
                                                    onClick={stopAnd(() => markAsRead(notif._id))}
                                                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-[8px] bg-white border border-[#F97316] text-[#F97316] text-[13px] font-[500] hover:bg-orange-50 transition-colors"
                                                >
                                                    <Check size={14} />
                                                    Mark Read
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        }) : (
                            <div className="text-center py-20 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                                <p className="text-gray-400 text-[14px]">No notifications found in this category</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={confirmClear}
                title="Clear All Notifications"
                message={`This will permanently delete all ${notifications.length} notifications. This action cannot be undone.`}
                confirmLabel="Clear All"
                onConfirm={() => { clearAll(); setConfirmClear(false); }}
                onClose={() => setConfirmClear(false)}
            />
        </div>
    )
}

export default NotificationModal
