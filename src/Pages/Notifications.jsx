import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../Context/NotificationContext';

const formatNotificationTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const diffDays = Math.floor(diffMins / 1440);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
};

const categoryConfig = {
    Order:   { icon: 'fi fi-rr-shopping-bag',     bg: 'bg-orange-50',  text: 'text-orange-500' },
    Payment: { icon: 'fi fi-rr-credit-card',      bg: 'bg-green-50',   text: 'text-green-600' },
    Points:  { icon: 'fi fi-rr-star',             bg: 'bg-yellow-50',  text: 'text-yellow-600' },
    Wallet:  { icon: 'fi fi-rr-wallet',           bg: 'bg-purple-50',  text: 'text-purple-600' },
    Offer:   { icon: 'fi fi-rr-gift',             bg: 'bg-pink-50',    text: 'text-pink-500' },
    Reward:  { icon: 'fi fi-rr-trophy',           bg: 'bg-amber-50',   text: 'text-amber-600' },
    Service: { icon: 'fi fi-rr-bell-concierge',   bg: 'bg-blue-50',    text: 'text-blue-500' },
    System:  { icon: 'fi fi-rr-bell',             bg: 'bg-gray-50',    text: 'text-gray-500' },
};

const categories = ['All', 'Order', 'Payment', 'Points', 'Wallet', 'Offer'];

const NotificationCard = ({ title, description, createdAt, status, _id, category, meta, onMarkRead, onNavigate }) => {
    const config = categoryConfig[category] || categoryConfig.System;

    const handleClick = () => {
        onNavigate && onNavigate(category, meta, _id);
    };

    return (
        <div
            onClick={handleClick}
            className={`bg-[#FFFFFF] rounded-[14px] p-4 mb-2.5 shadow-[0px_2px_8px_0px_rgba(0,0,0,0.04)] border ${status === 'unread' ? 'border-orange-100' : 'border-[#F0F0F0]'} relative cursor-pointer active:scale-[0.99] transition-all`}
        >
            <div className="flex gap-3">
                {/* Category Icon */}
                <div className={`w-[40px] h-[40px] rounded-[10px] ${config.bg} flex items-center justify-center shrink-0`}>
                    <i className={`${config.icon} ${config.text} text-[16px] flex`}></i>
                </div>

                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`text-[15px] font-semibold varela-rounded text-[#1A181B] leading-snug ${status === 'read' ? 'opacity-60' : ''}`}>
                            {title}
                        </h3>
                        {status === 'unread' && (
                            <div className="w-2 h-2 bg-[#FE8301] rounded-full shrink-0 mt-1.5" />
                        )}
                    </div>
                    <p className={`text-[13px] text-[#8D848F] varela-rounded leading-snug ${status === 'read' ? 'opacity-60' : ''}`}>
                        {description}
                    </p>

                    {/* Meta info */}
                    {meta?.orderId && (
                        <div className="flex items-center gap-3 mt-1.5">
                            <span className="text-[11px] text-[#B6AEB8] varela-rounded bg-gray-50 px-2 py-0.5 rounded-full">{meta.orderId}</span>
                            {meta.amount > 0 && (
                                <span className="text-[11px] text-[#B6AEB8] varela-rounded">₹{meta.amount}</span>
                            )}
                        </div>
                    )}

                    <div className="flex justify-between items-center mt-1.5">
                        {status === 'unread' ? (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkRead && onMarkRead(_id);
                                }}
                                className="text-[11px] text-[#FE8301] font-semibold varela-rounded hover:bg-orange-50 px-2 py-0.5 rounded-md transition-colors active:scale-95"
                            >
                                <i className="fi fi-rr-check text-[10px] mr-1"></i>
                                Mark as read
                            </button>
                        ) : (
                            <span />
                        )}
                        <span className="text-[11px] text-[#B6AEB8] varela-rounded">
                            {formatNotificationTime(createdAt)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const Notifications = () => {
    const navigate = useNavigate();
    const { notifications, unreadCount, markAsRead, deleteNotification, clearAll, soundEnabled, toggleSound } = useNotifications();
    const [activeCategory, setActiveCategory] = useState('All');

    const handleNotificationNavigate = (category, meta, notifId) => {
        // Remove notification from list
        deleteNotification(notifId);
        const orderId = meta?.orderId;
        switch (category) {
            case 'Order':
                if (orderId) navigate(`/customer/order-tracking/${orderId}`);
                else navigate('/customer/orders');
                break;
            case 'Payment':
                navigate('/customer/orders');
                break;
            case 'Points':
            case 'Wallet':
                navigate('/customer/wallet');
                break;
            case 'Offer':
            case 'Reward':
                navigate('/customer/menu');
                break;
            default:
                break;
        }
    };

    const filtered = useMemo(() => {
        if (activeCategory === 'All') return notifications;
        return notifications.filter(n => n.category === activeCategory);
    }, [notifications, activeCategory]);

    const sections = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayList = [];
        const olderList = [];

        filtered.forEach(notif => {
            const notifDate = new Date(notif.createdAt);
            if (notifDate >= today) {
                todayList.push(notif);
            } else {
                olderList.push(notif);
            }
        });

        return { today: todayList, older: olderList };
    }, [filtered]);

    return (
        <div className="min-h-screen bg-[#FFFFFF] pb-5">
            {/* Header */}
            <header className="sticky top-0 z-40 bg-[#FFFFFF] px-4 py-3 flex items-center justify-between border-b border-gray-100">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-1 -ml-1 flex items-center justify-center active:scale-95 transition-transform"
                    >
                        <i className="fi fi-br-angle-left text-[18px] text-[#666666] flex"></i>
                    </button>
                    <div>
                        <h1 className="text-[18px] font-bold nunito text-[#1A181B]">
                            Notifications
                        </h1>
                        {unreadCount > 0 && (
                            <p className="text-[12px] text-[#FE8301] font-semibold nunito">{unreadCount} unread</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Sound Toggle */}
                    <button
                        onClick={toggleSound}
                        className={`p-2 rounded-full transition-colors ${soundEnabled ? 'bg-green-50 text-green-600' : 'text-gray-400 hover:bg-gray-50'}`}
                    >
                        <i className={`fi ${soundEnabled ? 'fi-rr-volume' : 'fi-rr-volume-mute'} text-[18px] flex`}></i>
                    </button>
                    {/* Clear All */}
                    {notifications.length > 0 && (
                        <button
                            onClick={clearAll}
                            className="p-2 rounded-full text-gray-400 hover:bg-gray-50 transition-colors"
                        >
                            <i className="fi fi-rr-trash text-[16px] flex"></i>
                        </button>
                    )}
                </div>
            </header>

            {/* Category Tabs */}
            <div className="px-4 pt-3 pb-1 flex gap-2 overflow-x-auto no-scrollbar">
                {categories.map(cat => {
                    const count = cat === 'All' ? notifications.length : notifications.filter(n => n.category === cat).length;
                    if (cat !== 'All' && count === 0) return null;
                    return (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat)}
                            className={`px-3.5 py-1.5 rounded-full text-[13px] font-semibold whitespace-nowrap transition-all ${
                                activeCategory === cat
                                    ? 'bg-[#FE8301] text-white'
                                    : 'bg-gray-100 text-[#666] hover:bg-gray-200'
                            }`}
                        >
                            {cat} {count > 0 && `(${count})`}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <main className="px-4 mt-3">
                {/* Today Section */}
                {sections.today.length > 0 && (
                    <section className="mb-6">
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-[16px] font-semibold text-[#34353B] nunito">Today</h2>
                            {unreadCount > 0 && (
                                <button
                                    onClick={() => markAsRead('all')}
                                    className="text-[#FE8301] text-[13px] font-semibold nunito hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors"
                                >
                                    Mark all read
                                </button>
                            )}
                        </div>
                        <div>
                            {sections.today.map(item => (
                                <NotificationCard
                                    key={item._id}
                                    {...item}
                                    onMarkRead={markAsRead}
                                    onNavigate={handleNotificationNavigate}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {/* Older Section */}
                {sections.older.length > 0 && (
                    <section>
                        <div className="mb-3">
                            <h2 className="text-[16px] font-semibold text-[#34353B] nunito">Earlier</h2>
                        </div>
                        <div>
                            {sections.older.map(item => (
                                <NotificationCard
                                    key={item._id}
                                    {...item}
                                    onMarkRead={markAsRead}
                                    onNavigate={handleNotificationNavigate}
                                />
                            ))}
                        </div>
                    </section>
                )}

                {filtered.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                        <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-4">
                            <i className="fi fi-rr-bell text-[24px] text-orange-300 flex"></i>
                        </div>
                        <p className="text-gray-400 font-medium nunito text-[15px]">No notifications yet</p>
                        <p className="text-gray-300 text-[13px] mt-1 nunito">We'll notify you about order updates and offers</p>
                    </div>
                )}
            </main>
        </div>
    );
};

export default Notifications;
