import React from 'react'
import { X, Calendar, Users, Briefcase, IndianRupee, Clock } from 'lucide-react'

const CRMBookingDetailsModal = ({ booking, onClose }) => {
    if (!booking) return null

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 2,
        }).format(amount)
    }

    const statusStyles = {
        'Upcoming': 'bg-orange-50 text-orange-600 border-orange-100',
        'Completed': 'bg-green-50 text-green-600 border-green-100',
        'Cancelled': 'bg-red-50 text-red-600 border-red-100',
    }

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[24px] w-full max-w-[500px] max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-[#FAF7F2] border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-[18px] font-[700] text-[#1A181B]">{booking.eventName}</h2>
                        <p className="text-[12px] text-gray-500">{booking.id} • {booking.date}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-400">
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Status Badge */}
                    <div className="flex justify-between items-center bg-[#F9FAFB] p-4 rounded-xl border border-gray-100">
                        <span className="text-[14px] font-[600] text-gray-500 uppercase tracking-wider">Status</span>
                        <span className={`px-4 py-1.5 rounded-full text-[12px] font-[700] border ${statusStyles[booking.status] || 'bg-gray-100'}`}>
                            {booking.status}
                        </span>
                    </div>

                    {/* Booking Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center gap-3 shadow-sm">
                            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                <Users size={20} />
                            </div>
                            <div>
                                <p className="text-[11px] text-gray-400">Guests</p>
                                <p className="text-[14px] font-[700] text-gray-900">{booking.guests}</p>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-gray-100 flex items-center gap-3 shadow-sm">
                            <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                                <Briefcase size={20} />
                            </div>
                            <div>
                                <p className="text-[11px] text-gray-400">Package</p>
                                <p className="text-[14px] font-[700] text-gray-900">{booking.package}</p>
                            </div>
                        </div>
                    </div>

                    {/* Financials */}
                    <div>
                        <h3 className="text-[14px] font-[700] text-[#1A181B] mb-3 flex items-center gap-2">
                            <IndianRupee size={16} className="text-[#FE8301]" />
                            Payment Summary
                        </h3>
                        <div className="bg-[#FFF5EB] rounded-xl p-5 border border-[#FED7AA] space-y-3">
                            <div className="flex justify-between text-[14px]">
                                <span className="text-gray-500 font-[500]">Booking Total</span>
                                <span className="text-gray-900 font-[700]">{formatCurrency(booking.total)}</span>
                            </div>
                            <div className="flex justify-between text-[14px]">
                                <span className="text-gray-500 font-[500]">Advance Paid</span>
                                <span className="text-green-600 font-[700]">{formatCurrency(booking.advancePaid ?? booking.total * 0.4)}</span>
                            </div>
                            <div className="flex justify-between items-center pt-3 border-t border-[#FED7AA] text-[15px]">
                                <span className="text-gray-900 font-[700]">Remaining Balance</span>
                                <span className="text-red-500 font-[800]">{formatCurrency(booking.total - (booking.advancePaid ?? booking.total * 0.4))}</span>
                            </div>
                        </div>
                    </div>

                    {/* Timing */}
                    <div className="flex items-center gap-2 text-[14px] bg-gray-50 p-4 rounded-xl border border-dashed border-gray-200">
                        <Clock size={16} className="text-gray-400" />
                        <span className="text-gray-500">Scheduled for </span>
                        <span className="font-[700] text-gray-900">{booking.bookingTime || '07:00 PM'} onwards</span>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 pt-0">
                    <button
                        onClick={onClose}
                        className="w-full py-3 bg-[#FE8301] text-white rounded-xl font-[600] text-[14px] hover:bg-orange-600 transition-colors shadow-sm"
                    >
                        Close Details
                    </button>
                </div>
            </div>
        </div>
    )
}

export default CRMBookingDetailsModal
