import React, { useState, useEffect } from 'react'
import { X, User, Phone, Copy, Check, Printer, CheckCircle2, Clock, Undo2, Receipt, Hash } from 'lucide-react'
import { razorpayAPI } from '../../../utils/api'
import { toast } from 'react-hot-toast'
import RefundModal from './RefundModal'

// ─── Status tokens ────────────────────────────────────────────────────────────
const statusPill = {
    successful: 'bg-[#E8FFF0] text-[#1F8C43] border-[#34C759]/40',
    pending: 'bg-[#FFF8E8] text-[#B45309] border-[#FE8301]/40',
    failed: 'bg-[#FFE8E8] text-[#B91C1C] border-[#FF3B30]/40',
    refunded: 'bg-[#FFE8E8] text-[#B91C1C] border-[#FF3B30]/40',
}

const heroAccent = {
    successful: 'from-[#E8FFF0] to-white',
    pending: 'from-[#FFF8E8] to-white',
    failed: 'from-[#FFEBEB] to-white',
    refunded: 'from-[#FFEBEB] to-white',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const money = (n) => `₹${Number(n || 0).toFixed(2)}`

const fmtDateTime = (value) => {
    if (!value) return '-'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '-'
    return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}`
}

// ─── Tiny presentational primitives ───────────────────────────────────────────
const Section = ({ title, icon: Icon, children, className = '' }) => (
    <section className={`bg-white border border-gray-200 rounded-xl ${className}`}>
        {title && (
            <header className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-gray-100">
                {Icon && <Icon size={14} className="text-gray-400" />}
                <h3 className="text-[13px] font-[700] font-manrope text-[#1A181B] uppercase tracking-wide">{title}</h3>
            </header>
        )}
        <div className="p-4">{children}</div>
    </section>
)

const InfoRow = ({ label, value, mono }) => (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
        <span className="text-gray-500 font-[500]">{label}</span>
        <span className={`text-[#1A181B] font-[600] text-right ${mono ? 'font-mono text-[12px]' : ''}`}>{value}</span>
    </div>
)

const CopyRow = ({ label, value }) => {
    const [copied, setCopied] = useState(false)
    if (!value) return null
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            toast.success(`${label} copied`)
            setTimeout(() => setCopied(false), 1500)
        } catch {
            toast.error('Copy failed')
        }
    }
    return (
        <div className="flex items-center justify-between gap-3 py-1.5 text-[13px] group">
            <span className="text-gray-500 font-[500] shrink-0">{label}</span>
            <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[12px] text-[#1A181B] truncate max-w-[200px]" title={value}>{value}</span>
                <button
                    onClick={handleCopy}
                    className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-[#FE8301] transition-colors shrink-0"
                    title={`Copy ${label}`}
                >
                    {copied ? <Check size={14} className="text-[#34C759]" /> : <Copy size={14} />}
                </button>
            </div>
        </div>
    )
}

const TimelineEvent = ({ icon: Icon, tone, title, meta, detail, last }) => {
    const toneBg = {
        gray: 'bg-gray-300',
        green: 'bg-[#34C759]',
        orange: 'bg-[#FE8301]',
        red: 'bg-[#FF3B30]',
    }[tone] || 'bg-gray-300'
    return (
        <div className="relative flex gap-3">
            <div className="flex flex-col items-center">
                <div className={`w-7 h-7 rounded-full shadow-sm flex items-center justify-center shrink-0 ${toneBg}`}>
                    <Icon size={13} className="text-white" strokeWidth={2.5} />
                </div>
                {!last && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
            </div>
            <div className="flex-1 pb-4 min-w-0">
                <div className="flex items-start justify-between gap-2">
                    <p className="text-[13px] font-[600] text-[#1A181B] leading-tight">{title}</p>
                    {meta && <span className="text-[11px] text-gray-400 shrink-0 whitespace-nowrap mt-0.5">{meta}</span>}
                </div>
                {detail && <p className="text-[12px] text-gray-500 mt-1 leading-snug">{detail}</p>}
            </div>
        </div>
    )
}

// ─── Receipt HTML (opened in a new window for print / save-as-PDF) ────────────
const buildReceiptHTML = (payment) => {
    const {
        table, id, customer, phone, method, status, date, time,
        items = [], subtotal = 0, serviceCharge = 0, gst = 0, discount = 0,
        taxesAndCharges = 0, tipAmount = 0, couponCode = '', couponDiscount = 0,
        pointsRedeemed = 0, total = 0,
        amountPaid = 0, refundedAmount = 0, refunds = [],
        razorpayOrderId, razorpayPaymentId,
    } = payment
    const escape = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    const r = (n) => `₹${Number(n || 0).toFixed(2)}`
    const isOnlinePayment = String(method || '').toLowerCase() === 'online'

    const itemsRows = items.map(it => `
        <tr>
            <td>${escape(it.name)}</td>
            <td class="right">${r(it.price)}</td>
        </tr>
    `).join('')

    const refundsRows = (refunds || []).map(rf => `
        <tr>
            <td>${escape(rf.reason || 'Refund')}${rf.razorpayRefundId ? ` <span class="muted">(${escape(rf.razorpayRefundId)})</span>` : ''}</td>
            <td class="right">-${r(rf.amount)}</td>
        </tr>
    `).join('')

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt — ${escape(id)}</title>
<style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #1A181B; margin: 0; padding: 32px; max-width: 560px; margin-left: auto; margin-right: auto; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .muted { color: #888; font-size: 12px; }
    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; margin-top: 6px; }
    .pill.successful { background: #E8FFF0; color: #1F8C43; }
    .pill.pending { background: #FFF8E8; color: #B45309; }
    .pill.failed, .pill.refunded { background: #FFE8E8; color: #B91C1C; }
    .row { display: flex; justify-content: space-between; gap: 16px; font-size: 13px; margin: 4px 0; }
    hr { border: 0; border-top: 1px dashed #ddd; margin: 16px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    td { padding: 4px 0; vertical-align: top; }
    .right { text-align: right; }
    .total { font-size: 16px; font-weight: 700; border-top: 1px solid #1A181B; padding-top: 8px; margin-top: 8px; }
    .footer { margin-top: 24px; text-align: center; color: #888; font-size: 11px; }
    @media print { body { padding: 0; } @page { margin: 12mm; } }
</style>
</head>
<body>
    <h1>Payment Receipt</h1>
    <div class="muted">BestoDine · ${escape(date)} ${escape(time)}</div>
    <span class="pill ${escape(status)}">${escape(status)}</span>

    <hr />

    <div class="row"><span class="muted">Order</span><span><strong>${escape(table)}</strong> · ${escape(id)}</span></div>
    <div class="row"><span class="muted">Customer</span><span>${escape(customer || 'Guest')}${phone ? ` · ${escape(phone)}` : ''}</span></div>
    <div class="row"><span class="muted">Payment mode</span><span>${escape(method)}</span></div>
    ${isOnlinePayment && razorpayOrderId ? `<div class="row"><span class="muted">Razorpay order</span><span style="font-family: monospace; font-size: 11px;">${escape(razorpayOrderId)}</span></div>` : ''}
    ${isOnlinePayment && razorpayPaymentId ? `<div class="row"><span class="muted">Razorpay payment</span><span style="font-family: monospace; font-size: 11px;">${escape(razorpayPaymentId)}</span></div>` : ''}

    ${items.length ? `<hr /><table>${itemsRows}</table>` : ''}

    <hr />
    <div class="row"><span>Subtotal</span><span>${r(subtotal)}</span></div>
    ${serviceCharge > 0 ? `<div class="row"><span>Service charge</span><span>+${r(serviceCharge)}</span></div>` : ''}
    ${gst > 0 ? `<div class="row"><span>GST</span><span>+${r(gst)}</span></div>` : ''}
    ${serviceCharge === 0 && gst === 0 && taxesAndCharges > 0 ? `<div class="row"><span>Taxes &amp; charges</span><span>+${r(taxesAndCharges)}</span></div>` : ''}
    ${couponDiscount > 0 ? `<div class="row"><span>${couponCode ? `Coupon (${escape(couponCode)})` : 'Coupon discount'}</span><span>-${r(couponDiscount)}</span></div>` : ''}
    ${pointsRedeemed > 0 ? `<div class="row"><span>Loyalty points</span><span>-${r(pointsRedeemed)}</span></div>` : ''}
    ${discount > 0 ? `<div class="row"><span>Discount</span><span>-${r(discount)}</span></div>` : ''}
    ${tipAmount > 0 ? `<div class="row"><span>Tip</span><span>+${r(tipAmount)}</span></div>` : ''}
    <div class="row total"><span>Total</span><span>${r(total)}</span></div>
    <div class="row"><span class="muted">Amount paid</span><span>${r(amountPaid)}</span></div>

    ${refundedAmount > 0 ? `
        <hr />
        <div class="row"><strong>Refund history</strong><span>${r(refundedAmount)}</span></div>
        <table>${refundsRows}</table>
    ` : ''}

    <div class="footer">Generated ${new Date().toLocaleString()}</div>

    <script>
        window.onload = function () {
            window.focus();
            window.print();
        };
    </script>
</body>
</html>`
}

// ─── Main component ───────────────────────────────────────────────────────────
const PaymentDetailsModal = ({ payment, onClose, onRefundComplete }) => {
    const [showRefundModal, setShowRefundModal] = useState(false)
    const [refundLoading, setRefundLoading] = useState(false)

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !showRefundModal) onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [onClose, showRefundModal])

    useEffect(() => {
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = '' }
    }, [])

    if (!payment) return null

    const isFailed = payment.status === 'failed'
    const isRefunded = payment.status === 'refunded'
    const refundedAmount = payment.refundedAmount || 0
    const refundableBalance = payment.refundableBalance ?? Math.max(0, (payment.total || 0) - refundedAmount)
    const refunds = payment.refunds || []

    const handleRefund = async (refundData) => {
        try {
            setRefundLoading(true)
            const { data } = await razorpayAPI.refund({
                orderId: payment._orderId || payment.id,
                amount: refundData.amount,
                reason: refundData.reason === 'Other' ? refundData.specifyReason : refundData.reason,
            })
            if (data.success) {
                toast.success(data.message || 'Refund processed successfully')
                setShowRefundModal(false)
                onRefundComplete?.()
                onClose()
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Refund failed. Please try again.')
        } finally {
            setRefundLoading(false)
        }
    }

    const handlePrint = () => {
        const html = buildReceiptHTML(payment)
        const w = window.open('', '_blank', 'width=640,height=800')
        if (!w) {
            toast.error('Popup blocked — allow popups to download receipt')
            return
        }
        w.document.open()
        w.document.write(html)
        w.document.close()
    }

    // Build timeline events once
    const timeline = []
    timeline.push({
        key: 'placed',
        icon: Clock,
        tone: 'gray',
        title: 'Order placed',
        meta: fmtDateTime(payment.createdAt),
        detail: `${payment.table} · ${payment.id}`,
    })
    if (payment.paidAt || payment.status === 'successful' || payment.status === 'refunded') {
        timeline.push({
            key: 'paid',
            icon: CheckCircle2,
            tone: 'green',
            title: 'Payment received',
            meta: payment.paidAt ? fmtDateTime(payment.paidAt) : '—',
            detail: `${payment.method} · ${money(payment.amountPaid || payment.total)}`,
        })
    }
    if (isFailed) {
        timeline.push({
            key: 'failed',
            icon: X,
            tone: 'red',
            title: 'Payment failed / cancelled',
            meta: null,
            detail: 'Order was cancelled before payment was captured.',
        })
    }
    refunds.forEach((r, idx) => {
        timeline.push({
            key: `refund-${idx}`,
            icon: Undo2,
            tone: 'red',
            title: `Refund · ${money(r.amount)}`,
            meta: fmtDateTime(r.createdAt),
            detail: [
                r.reason,
                r.actorName && `by ${r.actorName}`,
                r.source === 'webhook' && '(Razorpay webhook)',
            ].filter(Boolean).join(' · ') || undefined,
        })
    })
    timeline.forEach((e, i) => { e.last = i === timeline.length - 1 })

    // Only show Razorpay refs for orders that actually settled online —
    // Cash / Wallet orders can carry stale Razorpay IDs if the customer
    // attempted checkout, bailed, and then paid at the counter.
    const isOnlinePayment = String(payment.method || '').toLowerCase() === 'online'
    const hasRazorpayRefs = isOnlinePayment && Boolean(payment.razorpayOrderId || payment.razorpayPaymentId)

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-[#F8F9FA] rounded-2xl w-full max-w-[820px] max-h-[92vh] flex flex-col shadow-xl overflow-hidden">
                {/* ── Hero strip ───────────────────────────────────────────── */}
                <div className={`bg-gradient-to-b ${heroAccent[payment.status] || 'from-white to-white'} px-6 pt-5 pb-5 border-b border-gray-200`}>
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <Receipt size={16} className="text-[#FE8301]" />
                                <span className="text-[12px] font-[600] text-gray-500 uppercase tracking-wide">Payment Details</span>
                            </div>
                            <h2 className="text-[22px] leading-tight font-[700] font-manrope text-[#1A181B] truncate">
                                {payment.table} <span className="text-gray-400 font-[500]">·</span> {payment.id}
                            </h2>
                            <div className="mt-2 flex items-center gap-2 flex-wrap">
                                <span className={`inline-flex items-center px-2.5 py-1 text-[11px] font-[700] uppercase tracking-wider rounded-full border ${statusPill[payment.status]}`}>
                                    {payment.status}
                                </span>
                                <span className="text-[12px] text-gray-500">
                                    {payment.date} · {payment.time}
                                </span>
                            </div>
                        </div>
                        <div className="flex items-start gap-3 shrink-0">
                            <div className="text-right">
                                <p className="text-[11px] font-[600] text-gray-500 uppercase tracking-wide">Amount</p>
                                <p className="text-[24px] leading-none font-[700] font-manrope text-[#1A181B] mt-1">
                                    {money(payment.total)}
                                </p>
                                {refundedAmount > 0 && (
                                    <p className="text-[11px] font-[600] text-[#FF3B30] mt-1">
                                        -{money(refundedAmount)} refunded
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                                aria-label="Close"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Scrollable body: 2-col grid on md+ ───────────────────── */}
                <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Left column ──────────────────────────────────── */}
                        <div className="space-y-4">
                            <Section title="Customer" icon={User}>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-[14px]">
                                        <User size={14} className="text-gray-400" />
                                        <span className="font-[600] text-[#1A181B]">{payment.customer || 'Guest'}</span>
                                    </div>
                                    {payment.phone && (
                                        <div className="flex items-center gap-2 text-[13px] text-gray-500">
                                            <Phone size={13} className="text-gray-400" />
                                            <span>{payment.phone}</span>
                                        </div>
                                    )}
                                    <div className="pt-2 mt-2 border-t border-gray-100 space-y-0.5">
                                        <InfoRow label="Payment mode" value={payment.method} />
                                        <InfoRow label="Table / Order" value={`${payment.table} · ${payment.id}`} />
                                    </div>
                                </div>
                            </Section>

                            {payment.items?.length > 0 && (
                                <Section title="Order Summary" icon={Receipt}>
                                    <div className="space-y-2.5 max-h-[240px] overflow-y-auto no-scrollbar pr-1">
                                        {payment.items.map((item, i) => (
                                            <div key={i} className="flex justify-between items-start gap-3">
                                                <div className="min-w-0">
                                                    <p className="text-[13px] font-[600] text-[#1A181B] truncate">{item.name}</p>
                                                    {item.unitPrice && (
                                                        <p className="text-[11px] text-gray-400">{money(item.unitPrice)} each</p>
                                                    )}
                                                </div>
                                                <p className="text-[13px] font-[600] text-[#1A181B] shrink-0">{money(item.price)}</p>
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            )}

                            <Section title="Transaction References" icon={Hash}>
                                <div className="divide-y divide-gray-100">
                                    <CopyRow label="Order ID" value={payment.id} />
                                    {hasRazorpayRefs && (
                                        <>
                                            <CopyRow label="Razorpay Order" value={payment.razorpayOrderId} />
                                            <CopyRow label="Razorpay Payment" value={payment.razorpayPaymentId} />
                                        </>
                                    )}
                                </div>
                            </Section>
                        </div>

                        {/* Right column ─────────────────────────────────── */}
                        <div className="space-y-4">
                            <Section title="Payment Timeline" icon={Clock}>
                                <div>
                                    {timeline.map(ev => (
                                        <TimelineEvent
                                            key={ev.key}
                                            icon={ev.icon}
                                            tone={ev.tone}
                                            title={ev.title}
                                            meta={ev.meta}
                                            detail={ev.detail}
                                            last={ev.last}
                                        />
                                    ))}
                                </div>
                            </Section>

                            <Section title="Bill Summary" icon={Receipt}>
                                <div className="space-y-1.5">
                                    <InfoRow label="Subtotal" value={money(payment.subtotal)} />
                                    {(payment.serviceCharge ?? 0) > 0 && (
                                        <InfoRow label="Service charge" value={`+${money(payment.serviceCharge)}`} />
                                    )}
                                    {(payment.gst ?? 0) > 0 && (
                                        <InfoRow label="GST" value={`+${money(payment.gst)}`} />
                                    )}
                                    {/* Fallback for orders whose component breakdown isn't
                                        persisted — keeps subtotal → total reconciled. */}
                                    {(payment.serviceCharge ?? 0) === 0 &&
                                     (payment.gst ?? 0) === 0 &&
                                     (payment.taxesAndCharges ?? 0) > 0 && (
                                        <InfoRow label="Taxes & charges" value={`+${money(payment.taxesAndCharges)}`} />
                                    )}
                                    {(payment.couponDiscount ?? 0) > 0 && (
                                        <InfoRow
                                            label={payment.couponCode ? `Coupon (${payment.couponCode})` : 'Coupon discount'}
                                            value={`-${money(payment.couponDiscount)}`}
                                        />
                                    )}
                                    {(payment.pointsRedeemed ?? 0) > 0 && (
                                        <InfoRow label="Loyalty points" value={`-${money(payment.pointsRedeemed)}`} />
                                    )}
                                    {(payment.discount ?? 0) > 0 && (
                                        <InfoRow label="Discount" value={`-${money(payment.discount)}`} />
                                    )}
                                    {(payment.tipAmount ?? 0) > 0 && (
                                        <InfoRow label="Tip" value={`+${money(payment.tipAmount)}`} />
                                    )}
                                    <div className="flex items-center justify-between pt-2 mt-1 border-t border-gray-200">
                                        <span className="text-[14px] font-[700] text-[#1A181B]">Total</span>
                                        <span className="text-[16px] font-[700] text-[#1A181B]">{money(payment.total)}</span>
                                    </div>
                                    {payment.amountPaid > 0 && (
                                        <div className="flex items-center justify-between pt-1">
                                            <span className="text-[12px] text-gray-500">Amount received</span>
                                            <span className="text-[12px] font-[600] text-[#34C759]">{money(payment.amountPaid)}</span>
                                        </div>
                                    )}
                                </div>

                                {(isRefunded || refundedAmount > 0) && (
                                    <div className="mt-4 pt-3 border-t border-dashed border-gray-200 grid grid-cols-3 gap-2 text-center">
                                        <div>
                                            <p className="text-[10px] text-gray-400 uppercase tracking-wide">Paid</p>
                                            <p className="text-[13px] font-[700] text-[#1A181B] mt-0.5">{money(payment.amountPaid)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-[#FF3B30] uppercase tracking-wide">Refunded</p>
                                            <p className="text-[13px] font-[700] text-[#FF3B30] mt-0.5">{money(refundedAmount)}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-[#FE8301] uppercase tracking-wide">Refundable</p>
                                            <p className="text-[13px] font-[700] text-[#FE8301] mt-0.5">{money(refundableBalance)}</p>
                                        </div>
                                    </div>
                                )}
                            </Section>
                        </div>
                    </div>
                </div>

                {/* ── Sticky footer ────────────────────────────────────────── */}
                <div className="bg-white px-6 py-3 border-t border-gray-200 flex items-center gap-3">
                    <button
                        onClick={handlePrint}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 text-gray-700 rounded-xl text-[13px] font-[600] hover:bg-gray-50 hover:border-gray-300 transition-colors"
                        title="Print or save as PDF"
                    >
                        <Printer size={15} />
                        Receipt
                    </button>
                    <div className="flex-1" />
                    <button
                        onClick={onClose}
                        className="px-5 py-2.5 border border-[#FE8301] text-[#FE8301] rounded-xl text-[13px] font-[600] hover:bg-orange-50 transition-colors"
                    >
                        Close
                    </button>
                    {!isFailed && refundableBalance > 0 && (
                        <button
                            onClick={() => setShowRefundModal(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-[13px] font-[600] hover:bg-orange-600 transition-colors"
                        >
                            <Undo2 size={15} />
                            Refund
                        </button>
                    )}
                </div>
            </div>

            {showRefundModal && (
                <RefundModal
                    payment={payment}
                    onClose={() => setShowRefundModal(false)}
                    onRefund={handleRefund}
                    loading={refundLoading}
                />
            )}
        </div>
    )
}

export default PaymentDetailsModal
