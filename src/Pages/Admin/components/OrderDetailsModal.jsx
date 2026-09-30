import React, { useState, useEffect } from 'react'
import { X, User, Clock, AlertCircle, Phone, ChevronDown, ChevronUp, Check, Utensils, Info, Link } from 'lucide-react'
import api, { settingsAPI } from '../../../utils/api'
import toast from 'react-hot-toast'
import { billFromOrder, toTaxConfig } from '../../../utils/billing'

const PAYMENT_METHODS = ['Cash', 'UPI', 'Card', 'Net Banking']

const formatTime = (date) => {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
};

const OrderDetailsModal = ({ order, onClose, onRefresh }) => {
  const [activeTab, setActiveTab] = useState('items')
  const [selectedTimelineItem, setSelectedTimelineItem] = useState(0)
  // isBillExpanded state removed — was unused
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
  const [paymentDone, setPaymentDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [taxConfig, setTaxConfig] = useState(() => toTaxConfig(null))
  const [deliveryPartnerName, setDeliveryPartnerName] = useState(order?.delivery?.partnerName || '')
  const [deliveryLoading, setDeliveryLoading] = useState(false)

  // Advance the home-delivery lifecycle (assign person / out-for-delivery
  // / delivered). Mirrors the backend PATCH /orders/:id/delivery flow.
  const handleDeliveryUpdate = async (nextStatus) => {
    try {
      setDeliveryLoading(true)
      const orderId = order._id || order.id
      const res = await api.patch(`/orders/${orderId}/delivery`, {
        ...(nextStatus ? { status: nextStatus } : {}),
        partnerName: deliveryPartnerName.trim(),
      })
      if (res.data.success) {
        toast.success(nextStatus === 'delivered' ? 'Marked delivered' : 'Delivery updated')
        if (onRefresh) onRefresh()
      }
    } catch (error) {
      toast.error('Failed to update delivery: ' + (error.response?.data?.message || error.message))
    } finally {
      setDeliveryLoading(false)
    }
  }

  useEffect(() => {
    settingsAPI.getSettings().then(res => {
      if (res.data) {
        const taxes = res.data.taxesAndCharges || res.data.taxes;
        if (taxes) setTaxConfig(toTaxConfig(taxes));
      }
    }).catch(() => {});
  }, []);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose]);

  const handleCompletePayment = async () => {
    if (!selectedPaymentMethod) return;
    try {
      setLoading(true);
      const orderId = order._id || order.id;
      const res = await api.patch(`/orders/${orderId}/status`, {
        paymentStatus: 'Paid',
        paymentMethod: selectedPaymentMethod,
        amountPaid: order.total
      });
      if (res.data.success) {
         setPaymentDone(true);
         if (onRefresh) onRefresh();
      }
    } catch (error) {
      console.error('Failed to update payment status:', error);
      toast.error('Failed to update payment: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  if (!order) return null

  // Bill breakdown of a placed order. billFromOrder (utils/billing)
  // shows the breakdown the server stamped on the order when it
  // reconciles with the stored total, and otherwise (legacy orders,
  // items appended after placement) recomputes it through computeBill —
  // server rounding, dine-in-only service charge — from the current
  // Taxes & Charges.
  //
  // Any remaining gap to the persisted total is surfaced as an explicit
  // "Adjustments" line so Subtotal + lines + Tip − Discounts always
  // equals the persisted Total — no math mismatches.
  const bill = billFromOrder(order, taxConfig)
  const subtotal = bill.subtotal;
  const tipAmount = bill.tipAmount;
  const couponDiscount = bill.couponDiscount;
  const pointsRedeemed = bill.pointsRedeemed;
  const gstAmount = bill.gst;
  const serviceAmount = bill.serviceCharge;
  const additionalChargesBreakdown = bill.additionalCharges;
  const linesTotal = bill.computedTotal;
  const orderTotal = bill.storedTotal;
  const adjustment = orderTotal != null
    ? Math.round((orderTotal - linesTotal) * 100) / 100
    : 0;

  const computedTotal = orderTotal ?? linesTotal;

  // Status Badge Logic
  const statusStyles = {
    new: 'bg-blue-50 text-blue-600 border-blue-200',
    preparing: 'bg-orange-50 text-orange-600 border-orange-200',
    ready: 'bg-green-50 text-green-600 border-green-200',
    served: 'bg-gray-100 text-gray-600 border-gray-200',
    cancelled: 'bg-red-50 text-red-600 border-red-200',
  }

  const headerStyles = {
    new: 'bg-[#E5F2FF] border-blue-100',
    preparing: 'bg-[#FFF7ED] border-orange-100',
    ready: 'bg-[#F0FDF4] border-green-100',
    served: 'bg-[#F9FAFB] border-gray-100',
    cancelled: 'bg-[#FEF2F2] border-red-100',
  }

  const tableStr = typeof order.table === 'string' ? order.table : (order.tableId || order.table?.name || 'Takeaway');
  const isMerged = tableStr.includes('🌿');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden">

        {/* Header */}
        <div className={`${headerStyles[order.status] || 'bg-white'} px-6 py-4 flex items-center justify-between border-b shadow-[0px_2px_6px_0px_#0000001F]`}>
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-[18px] leading-[24px] tracking-normal font-[800] font-manrope text-gray-900">
                Order Details ({tableStr.replace(/🌿/g, '-').replace(/\s+/g, '')})
              </h2>
              {isMerged && (
                <span className="flex items-center gap-1 px-2.5 py-0.5 bg-[#F3E8FF] text-[#9333EA] text-[12px] font-[700] font-manrope rounded-full border border-[#E9D5FF]">
                  <Link size={12} className="stroke-[2.5px]" />
                  Merged
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-3 py-1 text-xs leading-[16px] tracking-normal font-[700] font-manrope rounded-full border ${statusStyles[order.status] || 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {order.status?.charAt(0).toUpperCase() + order.status?.slice(1)}
              </span>
              <span className={`px-2.5 py-0.5 text-[11px] font-[600] font-manrope rounded-full ${order.delivery?.requested ? 'bg-green-50 text-green-700 border border-green-200' : order.type === 'takeaway' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-blue-50 text-blue-600 border border-blue-200'}`}>
                {order.delivery?.requested ? '🛵 Delivery' : order.type === 'takeaway' ? 'Takeaway' : 'Dine-in'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-black/5 rounded-full transition-colors text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── Home-delivery management panel ──────────────────────────
            Shows for delivery orders: the address, distance/fee, a
            delivery-person name field, and the dispatch lifecycle
            buttons (Out for delivery → Delivered). */}
        {order.delivery?.requested && (
          <div className="mx-6 mt-4 p-4 rounded-xl border border-green-200 bg-green-50/60">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[14px] font-[700] font-manrope text-green-800">🛵 Home Delivery</span>
              <span className="px-2.5 py-0.5 text-[11px] font-[700] font-manrope rounded-full bg-white border border-green-200 text-green-700 capitalize">
                {(order.delivery.status || 'pending').replace(/-/g, ' ')}
              </span>
            </div>
            <div className="space-y-1 mb-3">
              <p className="text-[13px] font-manrope text-gray-700">
                <span className="text-gray-400">Address:</span>{' '}
                <span className="font-[600] whitespace-pre-line">{order.delivery.address || '—'}</span>
              </p>
              <p className="text-[13px] font-manrope text-gray-700">
                <span className="text-gray-400">Distance / Fee:</span>{' '}
                <span className="font-[600]">
                  {order.delivery.slab ? `${order.delivery.slab.fromKm}–${order.delivery.slab.toKm} km` : '—'} · ₹{Number(order.delivery.fee || 0).toFixed(2)}
                </span>
              </p>
            </div>
            {order.status !== 'cancelled' && order.delivery.status !== 'delivered' && (
              <>
                <div className="flex flex-col sm:flex-row gap-2 mb-2">
                  <input
                    type="text"
                    value={deliveryPartnerName}
                    onChange={(e) => setDeliveryPartnerName(e.target.value.slice(0, 80))}
                    placeholder="Delivery person name"
                    className="flex-1 px-3 py-2 bg-white border border-gray-200 rounded-lg text-[13px] font-manrope focus:outline-none focus:border-green-500"
                  />
                  <button
                    onClick={() => handleDeliveryUpdate(null)}
                    disabled={deliveryLoading || !deliveryPartnerName.trim()}
                    className="px-4 py-2 bg-white border border-green-300 text-green-700 rounded-lg text-[13px] font-[600] font-manrope hover:bg-green-100 transition-colors disabled:opacity-50"
                  >
                    Assign
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDeliveryUpdate('out-for-delivery')}
                    disabled={deliveryLoading}
                    className="px-4 py-2 bg-[#FE8301] text-white rounded-lg text-[13px] font-[600] font-manrope hover:bg-orange-600 transition-colors disabled:opacity-50"
                  >
                    Out for delivery
                  </button>
                  <button
                    onClick={() => handleDeliveryUpdate('delivered')}
                    disabled={deliveryLoading}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg text-[13px] font-[600] font-manrope hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    Mark delivered
                  </button>
                </div>
              </>
            )}
            {order.delivery.status === 'delivered' && (
              <p className="text-[13px] font-manrope text-green-700 font-[600]">
                ✓ Delivered{order.delivery.partnerName ? ` by ${order.delivery.partnerName}` : ''}
              </p>
            )}
          </div>
        )}

        {(order.status === 'served' || order.status === 'cancelled') ? (
          // Past Order View (Receipt Layout)
          <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200">
            {/* Info Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* Customer Details */}
              <div className="bg-[#F8F9FA] p-4 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-3 text-gray-900 font-[700] text-[14px] leading-[20px] tracking-normal font-manrope">
                  <User size={16} className="text-gray-400" />
                  Customer Details
                </div>
                <div className="space-y-1 pl-6">
                  <p className="text-[14px] leading-[20px] tracking-normal font-[500] font-manrope text-gray-500">
                    Name: <span className="text-gray-900 font-[600]">{order.user || order.customerName || 'Guest'}</span>
                    {order.isRegistered && <span className="inline-block ml-1 text-orange-400">★</span>}
                  </p>
                  <p className="text-[14px] leading-[20px] tracking-normal font-[500] font-manrope text-gray-500">
                    Phone: {order.phone ? (
                      <a href={`tel:${order.phone}`} className="text-orange-600 font-[600] underline underline-offset-2" title="Call customer">{order.phone}</a>
                    ) : (
                      <span className="text-gray-900 font-[600]">N/A</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Order Info */}
              <div className="bg-[#F8F9FA] p-4 rounded-xl border border-gray-200">
                <div className="flex items-center gap-2 mb-3 text-gray-900 font-[700] text-[14px] leading-[20px] tracking-normal font-manrope">
                  <Clock size={16} className="text-gray-400" />
                  Order Info
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pl-6">
                  <div className="flex flex-col">
                    <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Order ID</span>
                    <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900 truncate">{order.id || order.orderId}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Table No.</span>
                    <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900 truncate">{tableStr.split('🌿')[0].trim()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Order Date</span>
                    <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900">{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Today'}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Order Time</span>
                    <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900">{formatTime(order.createdAt)}</span>
                  </div>
                  {order.type === 'takeaway' && order.pickupTime && (
                    <div className="flex flex-col">
                      <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Pickup Time</span>
                      <span className="text-[13px] leading-[18px] font-[600] font-manrope text-[#FE8301]">{order.pickupTime}</span>
                    </div>
                  )}
                  {order.type === 'takeaway' && (order.pickupLocation || order.branch?.name) && (
                    <div className="flex flex-col">
                      <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Branch</span>
                      <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900 truncate">{order.branch?.name || order.pickupLocation}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Order Timeline Summary */}
            <div className="mb-6">
              <h3 className="text-[16px] leading-[22px] tracking-normal font-[700] font-manrope text-gray-900 mb-3">
                Timeline
              </h3>
              <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-[0px_2px_8px_0px_#00000014]">
                <div className="flex items-center gap-6 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-[13px] font-[500] font-manrope text-gray-500">Placed: <span className="text-gray-900 font-[600]">{formatTime(order.createdAt)}</span></span>
                  </div>
                  {order.preparationStartedAt && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-orange-500" />
                      <span className="text-[13px] font-[500] font-manrope text-gray-500">Prep Started: <span className="text-gray-900 font-[600]">{formatTime(order.preparationStartedAt)}</span></span>
                    </div>
                  )}
                  {order.preparationCompletedAt && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <span className="text-[13px] font-[500] font-manrope text-gray-500">Ready: <span className="text-gray-900 font-[600]">{formatTime(order.preparationCompletedAt)}</span></span>
                    </div>
                  )}
                  {order.status === 'served' && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-600" />
                      <span className="text-[13px] font-[500] font-manrope text-gray-500">Served: <span className="text-gray-900 font-[600]">{formatTime(order.updatedAt)}</span></span>
                    </div>
                  )}
                  {order.status === 'cancelled' && (
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      <span className="text-[13px] font-[500] font-manrope text-gray-500">Cancelled: <span className="text-red-600 font-[600]">{formatTime(order.updatedAt)}</span></span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bill Summary */}
            <div className="mb-6">
              <h3 className="text-[16px] leading-[22px] tracking-normal font-[700] font-manrope text-gray-900 mb-3">
                Bill Summary
              </h3>
              <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-[0px_2px_8px_0px_#00000014]">
                {/* Items List */}
                <div className="space-y-4 mb-4">
                  {order.items?.map((item, idx) => (
                    <div key={idx} className="border-b border-dashed border-gray-100 last:border-0 pb-4 last:pb-0">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-[14px] font-[600] font-manrope text-gray-900">
                            {item.name} <span className="text-gray-500 font-[500]">x{item.quantity || 1}</span>
                          </p>
                          {item.instructions && (
                            <p className="text-xs text-gray-400 font-[500] font-manrope mt-0.5">{item.instructions}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-[14px] font-[600] font-manrope text-gray-900">₹{(item.price * (item.quantity || 1)).toFixed(0)}</p>
                          {(item.quantity || 1) > 1 && (
                            <p className="text-xs text-gray-400 font-[500] font-manrope">₹{item.price} each</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Financials */}
                <div className="bg-[#F9FAFB] -mx-6 -mb-6 p-6 mt-6 rounded-b-xl space-y-3">
                  <div className="flex justify-between text-gray-500 font-[500] text-[14px]">
                    <span>Subtotal</span>
                    <span className="text-gray-900 font-[600]">₹{subtotal.toFixed(2)}</span>
                  </div>
                  {bill.serviceChargePct > 0 && (
                    <div className="flex justify-between text-gray-500 font-[500] text-[14px]">
                      <span>Service Charge ({bill.serviceChargePct}%)</span>
                      <span className="text-gray-900 font-[600]">+₹{serviceAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {bill.gstPct > 0 && (
                    <div className="flex justify-between text-gray-500 font-[500] text-[14px]">
                      <span>GST ({bill.gstPct}%)</span>
                      <span className="text-gray-900 font-[600]">+₹{gstAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {additionalChargesBreakdown.map((c, i) => (
                    <div key={c.name || i} className="flex justify-between text-gray-500 font-[500] text-[14px]">
                      <span>{c.name}{c.type === 'Percentage' ? ` (${c.value}%)` : ''}</span>
                      <span className="text-gray-900 font-[600]">+₹{c.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-green-600 font-[500] text-[14px]">
                      <span>Coupon{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                      <span className="font-[600]">-₹{couponDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {pointsRedeemed > 0 && (
                    <div className="flex justify-between text-blue-600 font-[500] text-[14px]">
                      <span>Wallet Points</span>
                      <span className="font-[600]">-₹{pointsRedeemed.toFixed(2)}</span>
                    </div>
                  )}
                  {tipAmount > 0 && (
                    <div className="flex justify-between text-gray-500 font-[500] text-[14px]">
                      <span>Tip</span>
                      <span className="text-gray-900 font-[600]">+₹{tipAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {bill.deliveryFee > 0 && (
                    <div className="flex justify-between text-gray-500 font-[500] text-[14px]">
                      <span>Delivery</span>
                      <span className="text-gray-900 font-[600]">+₹{bill.deliveryFee.toFixed(2)}</span>
                    </div>
                  )}
                  {Math.abs(adjustment) >= 0.01 && (
                    <div className="flex justify-between text-gray-500 font-[500] text-[14px]" title="Reconciliation: settings have drifted since this order was placed">
                      <span>Adjustments</span>
                      <span className="text-gray-900 font-[600]">{adjustment >= 0 ? '+' : '-'}₹{Math.abs(adjustment).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-gray-900 font-[700] pt-3 border-t border-gray-200 text-[16px] mt-2">
                    <span>Total</span>
                    <span>₹{computedTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Footer */}
            <div className="bg-[#F9FAFB] border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between text-[14px] font-manrope">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-[500]">Payment Status:</span>
                    <span className={`px-2 py-0.5 text-xs font-[600] rounded-full ${order.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' :
                      order.paymentStatus === 'Refunded' ? 'bg-red-100 text-red-700' :
                        'bg-[#FEF9C3] text-[#854D0E]'
                      }`}>{order.paymentStatus || 'Pending'}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 font-[500]">Amount Paid:</span>
                    <span className="text-gray-900 font-[600]">₹{order.amountPaid || order.total}</span>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-gray-500 font-[500]">Payment Method:</span>
                    <span className="text-gray-900 font-[600]">{order.paymentMethod || 'UPI'}</span>
                  </div>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-gray-500 font-[500]">Balance:</span>
                    <span className="text-gray-900 font-[600]">₹{Math.max(0, (order.total || 0) - (order.amountPaid || 0)).toFixed(0)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="bg-white px-6 border-b border-gray-100 flex pt-2">
              {['Items', 'Timeline', 'Payment'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab.toLowerCase())}
                  className={`px-6 pb-3 text-[14px] leading-[20px] tracking-normal font-[600] font-manrope transition-all relative group ${activeTab === tab.toLowerCase()
                    ? 'text-[#FE8301]'
                    : 'text-gray-500 hover:text-[#FE8301]'
                    }`}
                >
                  {tab}
                  {activeTab === tab.toLowerCase() && (
                    <div className="absolute bottom-0 left-0 w-full h-[3px] bg-[#FE8301]" />
                  )}
                  {activeTab !== tab.toLowerCase() && (
                    <div className="absolute bottom-0 left-0 w-full h-[3px] bg-transparent group-hover:bg-orange-400 transition-colors" />
                  )}
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200">


              {/* Info Cards Grid - Common */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Customer Details */}
                <div className="bg-[#F8F9FA] p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 mb-3 text-gray-900 font-[700] text-[14px] leading-[20px] tracking-normal font-manrope">
                    <User size={16} className="text-gray-400" />
                    Customer Details
                  </div>
                  <div className="space-y-1 pl-6">
                    <p className="text-[14px] leading-[20px] tracking-normal font-[500] font-manrope text-gray-500">
                      Name: <span className="text-gray-900 font-[600]">{order.user || order.customerName || 'Guest'}</span>
                      {order.isRegistered && <span className="inline-block ml-1 text-orange-400">★</span>}
                    </p>
                    <p className="text-[14px] leading-[20px] tracking-normal font-[500] font-manrope text-gray-500">
                      Phone: {order.phone ? (
                      <a href={`tel:${order.phone}`} className="text-orange-600 font-[600] underline underline-offset-2" title="Call customer">{order.phone}</a>
                    ) : (
                      <span className="text-gray-900 font-[600]">N/A</span>
                    )}
                    </p>
                  </div>
                </div>

                {/* Order Info */}
                <div className="bg-[#F8F9FA] p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 mb-3 text-gray-900 font-[700] text-[14px] leading-[20px] tracking-normal font-manrope">
                    <Clock size={16} className="text-gray-400" />
                    Order Info
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 pl-6">
                    <div className="flex flex-col">
                      <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Order ID</span>
                      <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900 truncate">{order.id || order.orderId}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Table No.</span>
                      <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900 truncate">{tableStr.split('🌿')[0].trim()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Order Time</span>
                      <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900">{formatTime(order.createdAt)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Elapsed</span>
                      <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900">{order.time || '-'}</span>
                    </div>
                    {order.type === 'takeaway' && order.pickupTime && (
                      <div className="flex flex-col">
                        <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Pickup Time</span>
                        <span className="text-[13px] leading-[18px] font-[600] font-manrope text-[#FE8301]">{order.pickupTime}</span>
                      </div>
                    )}
                    {order.type === 'takeaway' && (order.pickupLocation || order.branch?.name) && (
                      <div className="flex flex-col">
                        <span className="text-[11px] leading-[16px] font-[500] font-manrope text-gray-400 uppercase tracking-wide">Branch</span>
                        <span className="text-[13px] leading-[18px] font-[600] font-manrope text-gray-900 truncate">{order.branch?.name || order.pickupLocation}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {activeTab === 'items' && (
                <div className="space-y-6">
                  {/* Order Items */}
                  <div>
                    <h3 className="text-[16px] leading-[22px] tracking-normal font-[700] font-manrope text-gray-900 mb-3">
                      Order Items ({order.items?.length.toString().padStart(2, '0')})
                    </h3>
                    <div className="space-y-3">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="bg-[#F8F9FA] p-4 rounded-xl border border-gray-200 flex justify-between items-start">
                          <div>
                            <p className="font-[700] font-manrope text-gray-900 text-[15px] leading-[22px] tracking-normal">{item.name}</p>
                            <p className="text-xs text-gray-400 font-[500] font-manrope mt-0.5">
                              Qty: {item.quantity || 1}
                              {item.instructions ? ` · ${item.instructions}` : ''}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-[700] font-manrope text-gray-900 text-[14px] leading-[20px] tracking-normal">₹{(item.price * (item.quantity || 1)).toFixed(0)}</p>
                            {(item.quantity || 1) > 1 && (
                              <p className="text-xs text-gray-400 font-[500] font-manrope">₹{item.price} each</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Special Instructions */}
                  {order.note && (
                    <div className="bg-[#FEFCE8] border border-[#FEF08A] rounded-xl p-3 flex gap-3">
                      <AlertCircle size={18} className="text-[#EAB308] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-[600] font-manrope text-[#854D0E] mb-1">Special instruction:</p>
                        <ul className="text-xs text-[#854D0E]/80 font-[500] font-manrope list-disc list-inside">
                          <li>{order.note}</li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Bill Summary */}
                  <div>
                    <h3 className="text-[16px] leading-[22px] tracking-normal font-[700] font-manrope text-gray-900 mb-3">
                      Bill Summary
                    </h3>
                    <div className="bg-[#FFF4ED] border border-[#FFEDD5] rounded-xl p-4">
                      <div className="space-y-3 text-[14px] leading-[20px] tracking-normal font-manrope">
                        <div className="flex justify-between text-gray-500 font-[500]">
                          <span>Subtotal</span>
                          <span>₹{subtotal.toFixed(2)}</span>
                        </div>
                        {bill.serviceChargePct > 0 && (
                          <div className="flex justify-between text-gray-500 font-[500]">
                            <span>Service Charge ({bill.serviceChargePct}%)</span>
                            <span>+₹{serviceAmount.toFixed(2)}</span>
                          </div>
                        )}
                        {bill.gstPct > 0 && (
                          <div className="flex justify-between text-gray-500 font-[500]">
                            <span>GST ({bill.gstPct}%)</span>
                            <span>+₹{gstAmount.toFixed(2)}</span>
                          </div>
                        )}
                        {additionalChargesBreakdown.map((c, i) => (
                          <div key={c.name || i} className="flex justify-between text-gray-500 font-[500]">
                            <span>{c.name}{c.type === 'Percentage' ? ` (${c.value}%)` : ''}</span>
                            <span>+₹{c.amount.toFixed(2)}</span>
                          </div>
                        ))}
                        {couponDiscount > 0 && (
                          <div className="flex justify-between text-green-600 font-[500]">
                            <span>Coupon{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                            <span>-₹{couponDiscount.toFixed(2)}</span>
                          </div>
                        )}
                        {pointsRedeemed > 0 && (
                          <div className="flex justify-between text-blue-600 font-[500]">
                            <span>Wallet Points</span>
                            <span>-₹{pointsRedeemed.toFixed(2)}</span>
                          </div>
                        )}
                        {tipAmount > 0 && (
                          <div className="flex justify-between text-gray-500 font-[500]">
                            <span>Tip</span>
                            <span>+₹{tipAmount.toFixed(2)}</span>
                          </div>
                        )}
                        {bill.deliveryFee > 0 && (
                          <div className="flex justify-between text-gray-500 font-[500]">
                            <span>Delivery</span>
                            <span>+₹{bill.deliveryFee.toFixed(2)}</span>
                          </div>
                        )}
                        {Math.abs(adjustment) >= 0.01 && (
                          <div className="flex justify-between text-gray-500 font-[500]" title="Reconciliation: settings have drifted since this order was placed">
                            <span>Adjustments</span>
                            <span>{adjustment >= 0 ? '+' : '-'}₹{Math.abs(adjustment).toFixed(2)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-gray-900 font-[700] pt-3 border-t border-[#FFEDD5] text-[16px] leading-[22px] tracking-normal">
                          <span>Total</span>
                          <span>₹{computedTotal.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'timeline' && (
                <div className="space-y-6">
                  <h3 className="text-[16px] leading-[22px] tracking-normal font-[700] font-manrope text-gray-900">
                    Order Timeline
                  </h3>

                  {/* Item Chips */}
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none -mx-2 px-2">
                    {order.items?.map((item, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedTimelineItem(idx)}
                        className={`whitespace-nowrap px-4 py-1.5 rounded-full border text-[14px] font-[600] font-manrope transition-colors ${selectedTimelineItem === idx
                          ? 'border-[#7C3AED] text-[#7C3AED] shadow-[0px_2px_8px_0px_#00000029]'
                          : 'border-gray-200 text-gray-500'
                          }`}
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>

                  {/* Timeline Steps */}
                  <div className="relative pl-1">
                    {(() => {
                      const getStepStatus = (stepName) => {
                        const status = order.status?.toLowerCase();
                        // Simple progress logic
                        const flow = ['new', 'preparing', 'ready', 'served'];
                        const stepsMap = {
                          'Order placed': 'new',
                          'Preparation started': 'preparing',
                          'Order ready': 'ready',
                          'Order served': 'served'
                        };

                        if (status === 'cancelled') return 'pending';

                        const stepStage = stepsMap[stepName];
                        const currentStageIndex = flow.indexOf(status);
                        const stepStageIndex = flow.indexOf(stepStage);

                        if (currentStageIndex > stepStageIndex) return 'done';
                        if (currentStageIndex === stepStageIndex) {
                          if (status === 'new' && stepName === 'Order placed') return 'done';
                          return 'current';
                        }
                        return 'pending';
                      };

                      return [
                        { title: 'Order placed', time: formatTime(order.createdAt), Icon: Check },
                        { title: 'Preparation started', time: formatTime(order.preparationStartedAt), Icon: Check },
                        { title: 'Order ready', time: formatTime(order.preparationCompletedAt), Icon: Clock },
                        { title: 'Order served', time: order.status === 'served' ? formatTime(order.updatedAt) : '-', Icon: Utensils },
                      ].map((step, idx, arr) => {
                        const status = getStepStatus(step.title);

                        return (
                          <div key={idx} className="relative flex gap-4 pb-8 last:pb-0">
                            {/* Connecting Line */}
                            {idx !== arr.length - 1 && (
                              <div className={`absolute left-[20px] top-10 bottom-0 w-[1.5px] border-l-2 border-dashed ${status === 'done' ? 'border-[#22C55E]' : 'border-gray-200'
                                }`} />
                            )}

                            {/* Icon */}
                            <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center shrink-0 border-2 ${status === 'done' ? 'bg-[#22C55E] border-[#22C55E] text-white' :
                              status === 'current' ? 'bg-[#FFF7ED] border-[#FFF7ED] text-[#F97316]' :
                                'bg-[#F3F4F6] border-[#F3F4F6] text-[#9CA3AF]'
                              }`}>
                              <step.Icon size={20} className={status === 'done' ? 'stroke-[3px]' : ''} />
                            </div>

                            {/* Content */}
                            <div className="pt-1">
                              <p className={`text-[14px] leading-[20px] tracking-normal font-[700] font-manrope ${status === 'pending' ? 'text-gray-400' : 'text-gray-900'
                                }`}>
                                {step.title}
                              </p>
                              <p className="text-[12px] leading-[18px] tracking-normal font-[500] font-manrope text-gray-500">
                                {step.time}
                              </p>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {activeTab === 'payment' && (order.type === 'takeaway' ? (() => {
                // Determine effective status/method after user marks Done
                const effectiveMethod = paymentDone ? (selectedPaymentMethod || 'Cash') : (order.paymentMethod || 'Not selected')
                const effectiveStatus = paymentDone ? 'Paid' : (order.paymentStatus || 'Pending')
                const isPending = !paymentDone && (order.paymentStatus === 'Pending' || !order.paymentStatus)
                const balance = isPending ? order.total : 0

                return (
                  <div className="space-y-4">
                    {/* ── Payment Details heading ── */}
                    <h3 className="text-[16px] leading-[22px] font-[700] font-manrope text-[#1A181B]">
                      Payment Details
                    </h3>

                    {/* The method picker + Done button only make sense for
                        orders the admin still has to settle. Showing them on
                        an already-paid takeaway (customer paid online via
                        Razorpay) lets the cashier accidentally double-charge
                        and contradicts the "Paid" badge below. */}
                    {effectiveStatus !== 'Paid' && (
                      <>
                        {/* ── Select Payment Method ── */}
                        <div>
                          <p className="text-[14px] font-[600] font-manrope text-[#1A181B] mb-3">
                            Select Payment Method
                          </p>
                          <div className="flex flex-col gap-3">
                            {PAYMENT_METHODS.map((method) => (
                              <label
                                key={method}
                                className="flex items-center gap-3 cursor-pointer"
                              >
                                {/* Custom radio */}
                                <span
                                  onClick={() => { setSelectedPaymentMethod(method); setPaymentDone(false) }}
                                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selectedPaymentMethod === method
                                    ? 'border-[#FE8301]'
                                    : 'border-gray-300'
                                    }`}
                                >
                                  {selectedPaymentMethod === method && (
                                    <span className="w-2.5 h-2.5 rounded-full bg-[#FE8301]" />
                                  )}
                                </span>
                                <span
                                  onClick={() => { setSelectedPaymentMethod(method); setPaymentDone(false) }}
                                  className="text-[14px] font-[500] font-manrope text-[#1A181B]"
                                >
                                  {method}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>

                        {/* ── Done Button ── */}
                        <button
                          onClick={handleCompletePayment}
                          disabled={!selectedPaymentMethod || loading}
                          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#FE8301] hover:bg-[#e07400] disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed text-white text-[15px] font-[700] font-manrope transition-colors"
                        >
                          {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                              <circle cx="10" cy="10" r="9" stroke="white" strokeWidth="1.5" opacity="0.7" />
                              <path d="M6 10.5L8.5 13L14 7.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                          {loading ? 'Processing...' : 'Done'}
                        </button>
                      </>
                    )}

                    {/* ── Status summary card ── */}
                    <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-4">
                      <div className="grid grid-cols-2 gap-y-3 text-[14px] font-manrope">
                        {/* Payment Status */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-gray-500 font-[500]">Payment Status:</span>
                          <span className={`px-2.5 py-0.5 text-xs font-[600] rounded-full ${effectiveStatus === 'Paid' ? 'bg-green-100 text-green-700' :
                            effectiveStatus === 'Refunded' ? 'bg-red-100 text-red-700' :
                              'bg-[#FEF9C3] text-[#854D0E]'
                            }`}>
                            {effectiveStatus}
                          </span>
                        </div>

                        {/* Payment Method */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-gray-500 font-[500]">Payment Method:</span>
                          <span className="text-gray-900 font-[700]">{effectiveMethod}</span>
                        </div>

                        {/* Amount Paid — show the actual figure whenever the
                            order is settled, whether the admin marked it via
                            this modal (paymentDone) or the customer paid
                            online before opening it. Falling back to '-' only
                            when the order is genuinely unpaid. */}
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 font-[500]">Amount Paid:</span>
                          <span className="text-gray-900 font-[600]">
                            {effectiveStatus === 'Paid'
                              ? `₹${Number(order.amountPaid ?? order.total ?? 0).toFixed(2)}`
                              : '-'}
                          </span>
                        </div>

                        {/* Balance */}
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500 font-[500]">Balance:</span>
                          <span className="text-gray-900 font-[700]">₹{balance}</span>
                        </div>
                      </div>
                    </div>

                    {/* ── Pending info banner ── */}
                    {isPending && (
                      <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl px-4 py-3 flex items-start gap-3">
                        <Info size={18} className="text-[#3B82F6] shrink-0 mt-0.5" />
                        <div>
                          <span className="text-[14px] font-[600] font-manrope text-[#1E40AF]">Payment Pending: </span>
                          <span className="text-[14px] font-[500] font-manrope text-[#3B82F6]">
                            Customer hasn't completed payment yet. Total amount: ₹{order.total}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })() : (
                /* ── Original payment card for Live / Past orders ── */
                <div className="space-y-6">
                  <h3 className="text-[16px] leading-[22px] tracking-normal font-[700] font-manrope text-gray-900">
                    Payment Details
                  </h3>
                  <div className="bg-[#F8F9FA] border border-gray-200 rounded-xl p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[14px] font-[500] font-manrope text-gray-500">Payment Status:</p>
                          <span className={`px-3 py-1 text-xs font-[600] font-manrope rounded-full ${order.paymentStatus === 'Paid' ? 'bg-green-100 text-green-700' :
                              order.paymentStatus === 'Refunded' ? 'bg-red-100 text-red-700' :
                                'bg-[#FEF9C3] text-[#854D0E]'
                            }`}>{order.paymentStatus || 'Pending'}</span>
                        </div>
                        <p className="text-[14px] font-[500] font-manrope text-gray-500 mt-3">
                          Amount Paid: <span className="text-gray-900 font-[600]">{order.amountPaid !== undefined ? `₹${order.amountPaid}` : '-'}</span>
                        </p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-[14px] font-[500] font-manrope text-gray-500">Payment Method:</p>
                          <span className="text-[14px] font-[600] font-manrope text-gray-900">{order.paymentMethod || 'Not selected'}</span>
                        </div>
                        <p className="text-[14px] font-[500] font-manrope text-gray-500 mt-3">
                          Balance: <span className="text-gray-900 font-[600]">₹{order.total - (order.amountPaid || 0)}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                  {(order.paymentStatus === 'Pending' || !order.paymentStatus) && (
                    <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl p-4 flex gap-3">
                      <Info size={20} className="text-[#3B82F6] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[14px] font-[600] font-manrope text-[#1E40AF] mb-1">Payment Pending:</p>
                        <p className="text-[14px] font-[500] font-manrope text-[#3B82F6]">
                          Customer hasn't completed payment yet. Total amount: ₹{order.total}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}



            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default OrderDetailsModal
