import React, { useState, useEffect } from 'react'
import { ArrowLeft, Phone, Mail, MapPin, Calendar, Heart, Gift, User, Loader2 } from 'lucide-react'
import api from '../../../utils/api'
import CRMOrderDetailsModal from './CRMOrderDetailsModal'
import CRMBookingDetailsModal from './CRMBookingDetailsModal'

const CustomerDetailView = ({ customer, onBack }) => {
    const [activeTab, setActiveTab] = useState('Orders')
    const [selectedOrder, setSelectedOrder] = useState(null)
    const [selectedBooking, setSelectedBooking] = useState(null)
    const [loading, setLoading] = useState(true)

    const [customerData, setCustomerData] = useState(null)
    const [orders, setOrders] = useState([])
    const [bookings, setBookings] = useState([])
    const [visits, setVisits] = useState([])
    const [preferences, setPreferences] = useState(null)
    const [suggestions, setSuggestions] = useState([])

    const tabs = ['Orders', 'Bookings', 'Visit History', 'Preferences', 'Suggestion']

    useEffect(() => {
        const fetchCustomerDetail = async () => {
            try {
                setLoading(true)
                const { data } = await api.get(`/crm/customers/${customer.id}`)
                if (data.success) {
                    const c = data.customer
                    setCustomerData({
                        name: c.name || 'Unknown',
                        avatar: c.avatar || null,
                        tag: c.tag || 'New',
                        phone: c.phone || '-',
                        email: c.email || '-',
                        address: c.address || '-',
                        dob: c.dob || '-',
                        anniversary: c.anniversary || '-',
                        memberSince: c.memberSince || '-',
                        totalVisits: c.totalVisits || 0,
                        totalSpend: c.totalSpend || 0,
                        loyaltyPoints: c.loyaltyPoints || 0,
                        walletBalance: c.walletBalance || 0,
                        allergy: c.allergy || '-',
                    })
                    setOrders(data.orders || [])
                    setBookings(data.bookings || [])
                    setVisits(data.visits || [])
                    setPreferences(data.preferences || null)
                    setSuggestions(data.suggestions || [])
                }
            } catch (err) {
                console.error('Failed to fetch customer details:', err)
            } finally {
                setLoading(false)
            }
        }

        if (customer?.id) {
            fetchCustomerDetail()
        }
    }, [customer?.id])

    const bookingStatusStyles = {
        'Upcoming': 'bg-[#FFF3E6] text-[#FE8301]',
        'Completed': 'bg-[#E8FFF0] text-[#34C759]',
        'Cancelled': 'bg-[#FFE8E8] text-[#FF3B30]',
    }

    const visitTypeStyles = {
        'Dine-in': 'bg-[#E8F4FF] text-[#007AFF]',
        'Reservation': 'bg-[#E8FFF0] text-[#34C759]',
        'Event': 'bg-[#FFF3E6] text-[#FE8301]',
    }

    const tagStyles = {
        'VIP': 'bg-[#FFF3E6] text-[#FE8301]',
        'Regular': 'bg-[#E8F4FF] text-[#007AFF]',
        'New': 'bg-[#E8FFF0] text-[#34C759]',
    }

    const orderTypeStyles = {
        'Dine-in': 'bg-[#E8F4FF] text-[#007AFF]',
        'Reservation': 'bg-[#FFF3E6] text-[#FE8301]',
    }

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
        }).format(amount)
    }

    if (loading) {
        return (
            <div className="h-full flex flex-col">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 text-[14px] font-[500] text-[#1A181B] bg-white border border-gray-200 rounded-lg w-fit hover:bg-gray-50 transition-colors mb-6"
                >
                    <ArrowLeft size={16} />
                    Back to Customers
                </button>
                <div className="flex-1 flex items-center justify-center">
                    <Loader2 size={36} className="animate-spin text-[#702083]" />
                </div>
            </div>
        )
    }

    if (!customerData) {
        return (
            <div className="h-full flex flex-col">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 text-[14px] font-[500] text-[#1A181B] bg-white border border-gray-200 rounded-lg w-fit hover:bg-gray-50 transition-colors mb-6"
                >
                    <ArrowLeft size={16} />
                    Back to Customers
                </button>
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-gray-500 text-[14px]">Failed to load customer details.</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            {/* Back Button */}
            <button
                onClick={onBack}
                className="flex items-center gap-2 px-4 py-2 text-[14px] font-[500] text-[#1A181B] bg-white border border-gray-200 rounded-lg w-fit hover:bg-gray-50 transition-colors mb-6"
            >
                <ArrowLeft size={16} />
                Back to Customers
            </button>

            {/* Customer Profile Header */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
                <div className="flex items-start justify-between">
                    {/* Left: Profile Info */}
                    <div className="flex gap-8">
                        {/* Avatar and Name */}
                        <div className="flex items-start gap-4">
                            <div className="relative">
                                {customerData.avatar ? (
                                    <img
                                        src={customerData.avatar}
                                        alt={customerData.name}
                                        className="w-16 h-16 rounded-full object-cover"
                                    />
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center">
                                        <User size={28} className="text-gray-400" />
                                    </div>
                                )}
                                <span className="absolute bottom-0 right-0 w-4 h-4 bg-[#34C759] rounded-full border-2 border-white"></span>
                            </div>
                            <div>
                                <h2 className="text-[18px] font-[600] text-[#1A181B]">{customerData.name}</h2>
                                <span className={`inline-block mt-1 px-3 py-0.5 rounded-full text-[12px] font-[600] ${tagStyles[customerData.tag]}`}>
                                    {customerData.tag}
                                </span>
                            </div>
                        </div>

                        {/* Contact Information */}
                        <div>
                            <h3 className="text-[14px] font-[600] text-[#1A181B] mb-3">Contact Information</h3>
                            <div className="space-y-3">
                                <div className="flex items-start gap-2">
                                    <Phone size={18} className="text-gray-400 mt-0.5" />
                                    <div className="flex flex-col">
                                        <p className="text-[11px] text-gray-400 leading-[14px]">Phone Number</p>
                                        <p className="text-[14px] font-[500] text-[#1A181B] leading-[20px]">{customerData.phone}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Mail size={18} className="text-gray-400 mt-0.5" />
                                    <div className="flex flex-col">
                                        <p className="text-[11px] text-gray-400 leading-[14px]">Email ID</p>
                                        <p className="text-[14px] font-[500] text-[#1A181B] leading-[20px]">{customerData.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <MapPin size={18} className="text-gray-400 mt-0.5" />
                                    <div className="flex flex-col">
                                        <p className="text-[11px] text-gray-400 leading-[14px]">Address</p>
                                        <p className="text-[14px] font-[500] text-[#1A181B] leading-[20px]">{customerData.address}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Important Dates */}
                        <div>
                            <h3 className="text-[14px] font-[600] text-[#1A181B] mb-3">Important Dates</h3>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 text-[14px]">
                                    <Gift size={16} className="text-gray-400" />
                                    <div>
                                        <p className="text-[12px] text-gray-400">Date of Birth</p>
                                        <p className="font-[500] text-[#1A181B]">{customerData.dob}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[14px]">
                                    <Heart size={16} className="text-gray-400" />
                                    <div>
                                        <p className="text-[12px] text-gray-400">Anniversary</p>
                                        <p className="font-[500] text-[#1A181B]">{customerData.anniversary}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 text-[14px]">
                                    <Calendar size={16} className="text-gray-400" />
                                    <div>
                                        <p className="text-[12px] text-gray-400">Member Since</p>
                                        <p className="font-[500] text-[#1A181B]">{customerData.memberSince}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right: Stats */}
                    <div className="flex gap-4">
                        <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 min-w-[120px]">
                            <p className="text-[12px] text-gray-400">Total Visits</p>
                            <p className="text-[24px] font-[600] text-[#1A181B]">{customerData.totalVisits}</p>
                        </div>
                        <div className="bg-white border border-gray-200 rounded-xl px-6 py-4 min-w-[120px]">
                            <p className="text-[12px] text-gray-400">Total Spend</p>
                            <p className="text-[24px] font-[600] text-[#1A181B]">{formatCurrency(customerData.totalSpend)}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-4">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-2 rounded-full text-[14px] font-[500] transition-colors border ${activeTab === tab
                            ? 'bg-white border-[#702083] border-[1.5px] text-[#702083]'
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-auto">
                {activeTab === 'Orders' && (
                    <>
                        <h3 className="text-[16px] font-[600] text-[#1A181B] mb-4">Orders</h3>
                        {orders.length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                                <p className="text-gray-400 text-[14px]">No orders found.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                                {orders.map((order, index) => (
                                    <div
                                        key={index}
                                        className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all"
                                        onClick={() => setSelectedOrder(order)}
                                    >
                                        {/* Order Header */}
                                        <div className="flex justify-between items-start mb-3">
                                            <div>
                                                <p className="text-[14px] font-[600] text-[#1A181B]">{order.id}</p>
                                                <p className="text-[12px] text-gray-400">{order.date}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[12px] font-[500] ${orderTypeStyles[order.type] || 'bg-gray-100 text-gray-600'}`}>
                                                {order.type}
                                            </span>
                                        </div>

                                        {/* Order Items */}
                                        <div className="space-y-1.5 mb-3">
                                            {order.items.slice(0, 3).map((item, idx) => (
                                                <p key={idx} className="text-[13px] text-[#1A181B]">
                                                    <span className="text-gray-400 mr-2">•</span>
                                                    {item.name} x{item.qty}
                                                </p>
                                            ))}
                                            {order.moreItems > 0 && (
                                                <p className="text-[13px] text-[#FE8301] cursor-pointer hover:underline">
                                                    +{order.moreItems} more item{order.moreItems > 1 ? 's' : ''}
                                                </p>
                                            )}
                                        </div>

                                        {/* Order Total */}
                                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                            <p className="text-[14px] text-gray-500">Order Total</p>
                                            <p className="text-[16px] font-[600] text-[#1A181B]">{formatCurrency(order.total)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'Bookings' && (
                    <>
                        <h3 className="text-[16px] font-[600] text-[#1A181B] mb-4">Booking & Events History</h3>
                        {bookings.length === 0 ? (
                            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                                <p className="text-gray-400 text-[14px]">No bookings found.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
                                {bookings.map((booking, index) => (
                                    <div
                                        key={index}
                                        className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:border-orange-300 hover:shadow-sm transition-all"
                                        onClick={() => setSelectedBooking(booking)}
                                    >
                                        {/* Booking Header */}
                                        <div className="flex justify-between items-start mb-4">
                                            <div>
                                                <p className="text-[14px] font-[600] text-[#1A181B]">{booking.eventName}</p>
                                                <p className="text-[12px] text-gray-400">{booking.id} • {booking.date}</p>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[12px] font-[500] ${bookingStatusStyles[booking.status] || 'bg-gray-100 text-gray-600'}`}>
                                                {booking.status}
                                            </span>
                                        </div>

                                        {/* Booking Details */}
                                        <div className="flex gap-8 mb-4">
                                            <div>
                                                <p className="text-[12px] text-gray-400">Guests</p>
                                                <p className="text-[14px] font-[500] text-[#1A181B]">{booking.guests}</p>
                                            </div>
                                            <div>
                                                <p className="text-[12px] text-gray-400">Package</p>
                                                <p className="text-[14px] font-[500] text-[#1A181B]">{booking.package}</p>
                                            </div>
                                        </div>

                                        {/* Booking Total */}
                                        <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                                            <p className="text-[14px] text-gray-500">Booking Total</p>
                                            <p className="text-[16px] font-[600] text-[#1A181B]">{formatCurrency(booking.total)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'Visit History' && (
                    <>
                        <h3 className="text-[16px] font-[600] text-[#1A181B] mb-4">Visit & Table History</h3>
                        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                            {/* Recent Visits Header */}
                            <div className="px-4 py-3 border-b border-gray-100">
                                <p className="text-[14px] font-[600] text-[#1A181B]">Recent Visits</p>
                            </div>

                            {/* Visits List */}
                            {visits.length === 0 ? (
                                <div className="p-8 text-center">
                                    <p className="text-gray-400 text-[14px]">No visit history found.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-100">
                                    {visits.map((visit, index) => (
                                        <div key={index} className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div>
                                                    <p className="text-[14px] font-[600] text-[#1A181B]">{visit.date}</p>
                                                    <div className="flex items-center gap-2 text-[12px] text-gray-400">
                                                        <span>{visit.table}</span>
                                                        <span className="flex items-center gap-1">
                                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <circle cx="12" cy="12" r="10" />
                                                                <polyline points="12,6 12,12 16,14" />
                                                            </svg>
                                                            {visit.duration}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-[12px] font-[500] ${visitTypeStyles[visit.type] || 'bg-gray-100 text-gray-600'}`}>
                                                {visit.type}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'Preferences' && (
                    <>
                        <h3 className="text-[16px] font-[600] text-[#1A181B] mb-4">Preferences & Behavior</h3>
                        <div className="bg-white rounded-xl border border-gray-200 p-6">
                            {!preferences ? (
                                <p className="text-gray-400 text-[14px] text-center py-4">No preference data available.</p>
                            ) : (
                                <div className="space-y-6">
                                    {/* Favorite Items */}
                                    <div>
                                        <p className="text-[14px] font-[600] text-[#1A181B] mb-3">Favorite Items</p>
                                        {preferences.favoriteItems && preferences.favoriteItems.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {preferences.favoriteItems.map((item, idx) => (
                                                    <span key={idx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-[13px] text-gray-600">
                                                        <span className="text-yellow-500">&#9733;</span>
                                                        {item.name}
                                                        {item.orderCount != null && (
                                                            <span className="text-[11px] text-gray-400 ml-1">({item.orderCount}x)</span>
                                                        )}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-[13px] text-gray-400">No favorite items yet.</p>
                                        )}
                                    </div>

                                    {/* Dietary / Allergy */}
                                    <div>
                                        <p className="text-[14px] font-[600] text-[#1A181B] mb-2">Dietary</p>
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-[13px] text-red-600">
                                                {preferences.allergy || customerData.allergy || 'None reported'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Preferred Payment Method */}
                                    <div>
                                        <p className="text-[14px] font-[600] text-[#1A181B] mb-2">Preferred Payment Method</p>
                                        <p className="text-[14px] text-[#1A181B] font-[500]">{preferences.preferredPayment || '-'}</p>
                                    </div>

                                    {/* Preferred Order Type */}
                                    <div>
                                        <p className="text-[14px] font-[600] text-[#1A181B] mb-2">Preferred Order Type</p>
                                        <p className="text-[14px] text-[#1A181B] font-[500]">{preferences.preferredOrderType || '-'}</p>
                                    </div>

                                    {/* Average Order Value */}
                                    <div>
                                        <p className="text-[14px] font-[600] text-[#1A181B] mb-2">Average Order Value</p>
                                        <p className="text-[14px] text-[#1A181B] font-[500]">
                                            {preferences.avgOrderValue != null ? formatCurrency(preferences.avgOrderValue) : '-'}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'Suggestion' && (
                    <>
                        <h3 className="text-[16px] font-[600] text-[#1A181B] mb-4">Suggestion History</h3>
                        <div className="bg-white rounded-xl border border-gray-200">
                            <div className="px-6 py-2">
                                {suggestions.length === 0 ? (
                                    <div className="py-6 text-center">
                                        <p className="text-gray-400 text-[14px]">No suggestions found.</p>
                                    </div>
                                ) : (
                                    suggestions.map((suggestion, index) => (
                                        <div key={index} className="flex min-h-[70px]">
                                            {/* Left Side */}
                                            <div className="w-[80px] shrink-0 flex flex-col justify-center py-5">
                                                <p className="text-[13px] font-[600] text-[#1A181B]">{suggestion.id}</p>
                                                <p className="text-[11px] text-[#9CA3AF] mt-0.5">{suggestion.date}</p>
                                            </div>

                                            {/* Timeline Column */}
                                            <div className="relative flex flex-col items-center w-[60px] shrink-0">
                                                <div className={`absolute w-px bg-gray-200 ${index === 0 ? 'top-1/2 bottom-0' :
                                                    index === suggestions.length - 1 ? 'top-0 h-1/2' :
                                                        'top-0 bottom-0'
                                                    }`}></div>
                                                <div className="w-[12px] h-[12px] rounded-full bg-gray-200 ring-[4px] ring-white absolute top-1/2 -translate-y-1/2 z-10 box-content"></div>
                                            </div>

                                            {/* Right Side */}
                                            <div className="flex-1 py-5 flex items-center justify-between gap-8">
                                                <p className="text-[13px] font-[500] text-[#1A181B] leading-relaxed flex-1">
                                                    {suggestion.text}
                                                </p>
                                                <span className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-[600] ${suggestion.type === 'Event' ? 'bg-[#FDF4FF] text-[#D946EF]' : 'bg-[#E8F4FF] text-[#007AFF]'
                                                    }`}>
                                                    {suggestion.type}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Order Details Modal */}
            {
                selectedOrder && (
                    <CRMOrderDetailsModal
                        order={selectedOrder}
                        onClose={() => setSelectedOrder(null)}
                    />
                )
            }

            {/* Booking Details Modal */}
            {
                selectedBooking && (
                    <CRMBookingDetailsModal
                        booking={selectedBooking}
                        onClose={() => setSelectedBooking(null)}
                    />
                )
            }
        </div >
    )
}

export default CustomerDetailView
