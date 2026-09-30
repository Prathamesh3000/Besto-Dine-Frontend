import { useMemo } from 'react';
import { useMenuBootstrap } from '../../hooks/queries/useMenuBootstrap';
import { computeBill, toTaxConfig } from '../../utils/billing';
import { KIOSK_KEYS } from './kioskState';

// KIOSK-FIX — Cart + PayOption were hardcoding GST 3% / Service 2%
// and ignoring additionalCharges entirely. The admin Tax & Services
// page is the source of truth (e.g. Hotel Tip Top: GST 18%, Service
// 15%, plus a flat ₹16 "Rohit Tax"). Bootstrap already returns the
// public-safe settings.taxes slice, so this hook is a thin read from
// the same React Query cache the menu uses — no extra network call.
//
// Returns the utils/billing toTaxConfig shape:
//   - gstPct        : percent number (0 when disabled)
//   - servicePct    : percent number (0 when disabled)
//   - additionalCharges : [{ name, value, type ('Flat' | 'Percentage'), enabled }]
//
// Hook is safe to call before bootstrap lands — returns a zeroed config
// so the UI shows clean ₹0 lines instead of crashing.
export function useKioskTaxConfig() {
    const { data } = useMenuBootstrap();
    return useMemo(() => toTaxConfig(data?.settings?.taxes), [data]);
}

/**
 * The backend order type a kiosk order is created with (PayOption's
 * buildOrderPayload): "Eat Here" → dine-in, "Take Away" → takeaway.
 * The server prices the order with that type, so the kiosk must too —
 * a takeaway kiosk order attracts no service charge.
 */
export function kioskBackendOrderType(kioskOrderType) {
    let t = kioskOrderType;
    if (t === undefined) {
        try { t = localStorage.getItem(KIOSK_KEYS.ORDER_TYPE); } catch { t = null; }
    }
    return (t || 'Eat Here') === 'Eat Here' ? 'dine-in' : 'takeaway';
}

// Compute the full kiosk bill breakdown from a subtotal + tax config.
// Delegates to utils/billing computeBill (the mirror of the server's
// Backend/utils/billing.js) so rounding, the empty-cart guard on flat
// charges and the dine-in-only service-charge rule match the server.
// Returned in the same shape Cart.jsx + PayOption.jsx push through
// router state so the page transitions stay consistent.
export function computeKioskTotals(subtotal, taxConfig, orderType = kioskBackendOrderType()) {
    const bill = computeBill({ subtotal, taxConfig, orderType });
    return {
        subtotal: bill.subtotal,
        gst: bill.gst,
        gstPct: bill.gstPct,
        serviceCharge: bill.serviceCharge,
        servicePct: bill.serviceChargePct,
        additionalChargesBreakdown: bill.additionalCharges.map(c => ({
            name: c.name || 'Other charge',
            type: c.type,
            value: c.value,
            amount: c.amount,
        })),
        additionalTotal: bill.additionalChargesTotal,
        totalPayment: bill.total,
    };
}
