// Offers page: the badge on a coupon card.
//
// The Active / Scheduled / Expired tabs are derived from dates alone (the
// on/off toggle is separate), so a coupon the admin switched off still has a
// date status of "Active". The badge must say so — otherwise the card reads
// "Active" while the Active-offers stat has already dropped it.
export function couponBadgeLabel(coupon, dateStatus) {
    return dateStatus === 'Active' && coupon?.isActive === false ? 'Disabled' : dateStatus;
}
