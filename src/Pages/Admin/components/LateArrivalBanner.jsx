import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Clock, AlertTriangle } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'

/**
 * LateArrivalBanner — Shows a countdown timer for reserved tables.
 *
 * Props:
 *   reservation  — the activeReservation object (must have _id, time, date, bookingType, lateArrival, payment)
 *   settings     — reservation settings from /api/settings ({ enableLateArrival, gracePeriod, deductionType, priceDeduction })
 *   onDeducted   — callback after deduction is applied (to refresh parent data)
 */
const LateArrivalBanner = ({ reservation, settings, onDeducted }) => {
    const [remainingMs, setRemainingMs] = useState(null)
    const [deducting, setDeducting] = useState(false)
    const deductedRef = useRef(false)

    // Determine if feature is active (must be computed before hooks, but used in effects)
    const isEnabled = !!(reservation && settings?.enableLateArrival && reservation.bookingType !== 'hall')
    const alreadyDeducted = reservation?.lateArrival?.deductedAt

    // ── Calculate grace expiry time ──────────────────────────────────────
    const getGraceExpiryMs = useCallback(() => {
        if (!isEnabled) return null

        if (reservation.lateArrival?.graceExpiresAt) {
            return new Date(reservation.lateArrival.graceExpiresAt).getTime()
        }

        const resTime = reservation.time
        const resDate = reservation.date
        if (!resTime) return null

        const [hours, minutes] = resTime.split(':').map(Number)
        const dateObj = resDate ? new Date(resDate) : new Date()
        dateObj.setHours(hours, minutes, 0, 0)

        const graceMinutes = parseInt(settings.gracePeriod) || 10
        return dateObj.getTime() + graceMinutes * 60 * 1000
    }, [isEnabled, reservation, settings?.gracePeriod])

    // ── Calculate deduction amount ───────────────────────────────────────
    const getDeductionAmount = useCallback(() => {
        if (!isEnabled) return 0
        const advance = reservation.payment?.advancePaid || 0
        if (advance <= 0) return 0

        if (settings.deductionType === 'percentage') {
            return Math.round((advance * (settings.priceDeduction || 0)) / 100 * 100) / 100
        }
        return Math.min(settings.priceDeduction || 0, advance)
    }, [isEnabled, reservation?.payment?.advancePaid, settings?.deductionType, settings?.priceDeduction])

    const deductionAmount = getDeductionAmount()

    // ── Countdown tick ───────────────────────────────────────────────────
    useEffect(() => {
        if (!isEnabled || alreadyDeducted) return

        const expiryMs = getGraceExpiryMs()
        if (!expiryMs) return

        const tick = () => setRemainingMs(expiryMs - Date.now())

        tick()
        const interval = setInterval(tick, 1000)
        return () => clearInterval(interval)
    }, [isEnabled, getGraceExpiryMs, alreadyDeducted])

    // ── Auto-deduct when timer expires ───────────────────────────────────
    useEffect(() => {
        if (!isEnabled || alreadyDeducted || deductedRef.current) return
        if (remainingMs === null || remainingMs > 0) return
        if (deductionAmount <= 0) return

        deductedRef.current = true
        const applyDeduction = async () => {
            setDeducting(true)
            try {
                const res = await api.patch(`/reservations/${reservation._id}/late-deduction`, {
                    deductionAmount
                })
                if (res.data.success) {
                    toast.error(`₹${deductionAmount.toFixed(2)} deducted from advance — guest arrived late`, { duration: 5000 })
                    onDeducted?.()
                }
            } catch (err) {
                console.error('Late deduction failed:', err)
                toast.error(err.response?.data?.message || 'Failed to apply late deduction')
                deductedRef.current = false
            } finally {
                setDeducting(false)
            }
        }
        applyDeduction()
    }, [isEnabled, remainingMs, deductionAmount, alreadyDeducted, reservation?._id, onDeducted])

    // ── Early exit after all hooks ───────────────────────────────────────
    if (!isEnabled) return null

    // ── Format time display ──────────────────────────────────────────────
    const formatCountdown = (ms) => {
        if (ms <= 0) return '00:00'
        const totalSec = Math.floor(ms / 1000)
        const m = Math.floor(totalSec / 60)
        const s = totalSec % 60
        return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    }

    const isExpired = remainingMs !== null && remainingMs <= 0
    const isUrgent = remainingMs !== null && remainingMs > 0 && remainingMs < 2 * 60 * 1000

    // ── Already deducted: static result banner ───────────────────────────
    if (alreadyDeducted) {
        const deducted = reservation.lateArrival.deductionAmount || 0
        return (
            <div className="bg-[#FFF0F0] border border-[#FECACA] rounded-[12px] px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                        <AlertTriangle size={14} className="text-[#EF4444]" />
                        <span className="text-[13px] font-[700] text-[#EF4444] font-manrope">Late Arrival</span>
                    </div>
                    <span className="text-[13px] font-[700] text-[#EF4444] font-manrope">
                        -₹{deducted.toFixed(2)} Deducted
                    </span>
                </div>
                <p className="text-[11px] text-[#991B1B] font-[400] font-manrope">
                    ₹{deducted.toFixed(2)} was deducted from the advance payment due to late arrival.
                </p>
            </div>
        )
    }

    // No advance paid — nothing to deduct
    if (deductionAmount <= 0) return null

    // Waiting for reservation time
    if (remainingMs === null) return null

    // ── Grace period running or just expired ─────────────────────────────
    return (
        <div className={`rounded-[12px] px-4 py-3 transition-colors ${
            isExpired ? 'bg-[#FFF0F0] border border-[#FECACA]'
            : isUrgent ? 'bg-[#FFFBEB] border border-[#FDE68A] animate-pulse'
            : 'bg-[#FFFBEB] border border-[#FDE68A]'
        }`}>
            {/* Top row: timer + deduction amount */}
            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                    <Clock size={14} className={isExpired ? 'text-[#EF4444]' : 'text-[#D97706]'} />
                    <span className={`text-[15px] font-[800] font-manrope tabular-nums ${isExpired ? 'text-[#EF4444]' : 'text-[#D97706]'}`}>
                        {isExpired ? formatCountdown(Math.abs(remainingMs)) : formatCountdown(remainingMs)}
                    </span>
                    <span className={`text-[11px] font-[500] font-manrope ${isExpired ? 'text-[#EF4444]' : 'text-[#92400E]'}`}>
                        {isExpired ? 'late' : 'left'}
                    </span>
                </div>
                <span className={`text-[13px] font-[700] font-manrope ${isExpired ? 'text-[#EF4444]' : 'text-[#D97706]'}`}>
                    -₹{deductionAmount.toFixed(2)} {isExpired ? 'Deducted' : 'Deduction'}
                </span>
            </div>

            {/* Title + description */}
            <div className="flex items-start gap-1.5">
                <AlertTriangle size={13} className={`mt-0.5 flex-shrink-0 ${isExpired ? 'text-[#EF4444]' : 'text-[#F59E0B]'}`} />
                <div>
                    <p className={`text-[13px] font-[700] font-manrope ${isExpired ? 'text-[#991B1B]' : 'text-[#92400E]'}`}>
                        {isExpired ? 'Guests Arriving Late' : 'Grace Period Active'}
                    </p>
                    <p className={`text-[11px] font-[400] font-manrope mt-0.5 ${isExpired ? 'text-[#991B1B]' : 'text-[#78350F]'}`}>
                        {isExpired
                            ? deducting
                                ? 'Applying deduction to advance payment...'
                                : `The reservation is overdue by ${formatCountdown(Math.abs(remainingMs))}. Advance payment has been adjusted.`
                            : 'Advance payment may be adjusted if guests are not seated soon.'
                        }
                    </p>
                </div>
            </div>
        </div>
    )
}

export default LateArrivalBanner
