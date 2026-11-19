// Delivery switched on with zero distance ranges: the server accepts it, but
// the customer cart then silently hides Home Delivery. Admin Settings shows
// this warning (inline + toast on save); it never blocks the save.
export const DELIVERY_NO_RANGES_WARNING =
  'Delivery is on but no distance ranges are set: customers will not see Home Delivery'

export function hasDeliveryNoRanges(config) {
  return !!config?.enabled && (config.slabs || []).length === 0
}
