// Human-readable labels for feature keys. Mirrors the FEATURE_LABELS
// map in Backend/middlewares/featureGate.js — kept in sync by hand
// because dragging JSON across the backend/frontend boundary isn't
// worth the complexity for 18 strings.
export const FEATURE_LABELS = {
    dineIn:              'Dine-In Ordering',
    takeaway:            'Takeaway Ordering',
    kitchenDisplay:      'Kitchen Display',
    waiterDashboard:     'Waiter Dashboard',
    advanceBookingTable: 'Advance Table Bookings',
    advanceBookingHall:  'Hall / Event Bookings',
    walletLoyalty:       'Wallet & Loyalty Points',
    couponPromotions:    'Coupons & Promotions',
    inventory:           'Inventory Management',
    crm:                 'Customer Management',
    tipManagement:       'Tip Management',
    multiBranch:         'Multi-Branch Support',
    staffPerformance:    'Staff Performance Tracking',
    paymentGateway:      'Online Payment Gateway',
    dataExport:          'Data Export',
    webhooks:            'Webhook Integrations',
    kiosk:               'Self-Order Kiosk',
    revenueAnalytics:    'Revenue Analytics',
};
