// Human-readable labels for feature keys. Mirrors the FEATURE_LABELS
// map in Backend/middlewares/featureGate.js — kept in sync by hand
// because dragging JSON across the backend/frontend boundary isn't
// worth the complexity for a couple of dozen strings.
export const FEATURE_LABELS = {
    dineIn:              'Dine-In Ordering',
    takeaway:            'Takeaway Ordering',
    kitchenDisplay:      'Kitchen Display',
    waiterDashboard:     'Waiter Dashboard',
    advanceBookingTable: 'Advance Table Bookings',
    advanceBookingHall:  'Hall / Event Bookings',
    walletLoyalty:       'Wallet & Loyalty Points',
    couponPromotions:    'Coupons & Promotions',
    campaigns:           'Marketing Campaigns',
    inventory:           'Inventory Management',
    crm:                 'Customer Management',
    tipManagement:       'Tip Management',
    multiBranch:         'Multi-Branch Support',
    staffPerformance:    'Staff Performance Tracking',
    paymentGateway:      'Online Payment Gateway',
    dataExport:          'Data Export',
    accountingExport:    'Tally / Accounting Export',
    aggregatorOrders:    'Zomato / Swiggy Orders',
    eInvoice:            'GST e-Invoice',
    webhooks:            'Webhook Integrations',
    whiteLabelBranding:  'Own Branding',
    kiosk:               'Self-Order Kiosk',
    revenueAnalytics:    'Revenue Analytics',
};

// Levels of the tiered revenueAnalytics module.
export const TIER_LABELS = {
    none:     'Not included',
    basic:    'Basic',
    standard: 'Standard',
    advanced: 'Advanced',
};
export const TIER_RANK = { none: 0, basic: 1, standard: 2, advanced: 3 };

// Basic-tier reports cover at most this many days (mirrors
// BASIC_REPORT_MAX_DAYS in Backend/controllers/telemetryController.js).
export const BASIC_REPORT_MAX_DAYS = 31;
