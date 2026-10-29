// Shared constants / helpers for the admin Developers page (API keys + webhooks).

export const SCOPE_LABELS = {
    'read:orders': 'Orders',
    'read:menu': 'Menu',
    'read:sales': 'Sales summary',
    'read:inventory': 'Inventory (low stock)',
    'read:bookings': 'Bookings',
}

export const EVENT_LABELS = {
    'order.created': 'Order created',
    'order.paid': 'Order paid',
    'order.cancelled': 'Order cancelled',
    'refund.created': 'Refund created',
    'booking.created': 'Booking created',
    'stock.low': 'Stock low',
}

export const apiError = (err, fallback) => err?.response?.data?.message || fallback
export const isLocked = (err) => ['FEATURE_LOCKED', 'FEATURE_REVOKED'].includes(err?.response?.data?.code)
