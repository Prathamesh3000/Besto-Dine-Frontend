// Pure helpers for the customer Bill page: merge invoice rows and
// order-based rows into one newest-first list with no duplicates.

const idOf = (v) => (v == null ? '' : String(v));

// Every identifier an invoice's order reference may carry (populated
// {_id, orderId}, or a bare id string).
export function invoiceOrderKeys(inv) {
  const o = inv?.order;
  if (!o) return [];
  if (typeof o === 'string') return [o];
  return [o._id, o.id, o.orderId].map(idOf).filter(Boolean);
}

// Both the Mongo _id and the friendly ORD-* id (/orders/my-orders returns
// the latter as `id`, /orders/:id/detail as `orderId`).
export function orderKeys(order) {
  return [order?._id, order?.orderId, order?.id].map(idOf).filter(Boolean);
}

const stamp = (v) => {
  const t = new Date(v || 0).getTime();
  return Number.isNaN(t) ? 0 : t;
};

export function mapInvoiceBill(inv, fmt) {
  const when = inv.createdAt || inv.date;
  return {
    id: inv._id,
    ts: stamp(when),
    itemCount: inv.items?.length || 0,
    paymentMethod: inv.paymentMethod || 'Cash',
    status: inv.paymentStatus === 'paid' ? 'Paid' : 'Unpaid',
    amount: inv.total,
    date: fmt.date(when),
    time: fmt.time(when),
    items: inv.items || [],
  };
}

export function mapOrderBill(order, fmt, sessionBillPaid = false) {
  const when = order.createdAt || new Date().toISOString();
  const st = (order.status || '').toString().toLowerCase();
  const paid = String(order.paymentStatus || '').toLowerCase() === 'paid' || sessionBillPaid;
  return {
    id: order._id || order.orderId || order.id,
    ts: stamp(when),
    itemCount: order.items?.length || 0,
    paymentMethod: order.paymentMethod || 'Cash',
    status: paid ? 'Paid' : (st === 'served' || st === 'delivered' ? 'Unpaid' : 'Pending'),
    amount: order.total || 0,
    date: fmt.date(when),
    time: fmt.time(when),
    items: order.items || [],
  };
}

// invoices / orders: raw arrays (either may be empty or null when that
// source failed). An order already covered by an invoice, or listed twice
// (server list + device-local ids), appears once. Cancelled orders are
// dropped; invoices are always kept.
export function mergeBills({ invoices, orders, fmt, isCancelled = () => false, sessionBillPaid = false }) {
  const invs = Array.isArray(invoices) ? invoices : [];
  const ords = Array.isArray(orders) ? orders : [];
  const covered = new Set(invs.flatMap(invoiceOrderKeys));
  const seen = new Set();
  const orderRows = [];
  for (const order of ords) {
    if (!order || isCancelled(order)) continue;
    const keys = orderKeys(order);
    if (keys.some((k) => covered.has(k) || seen.has(k))) continue;
    keys.forEach((k) => seen.add(k));
    orderRows.push(mapOrderBill(order, fmt, sessionBillPaid));
  }
  const rows = [...invs.map((inv) => mapInvoiceBill(inv, fmt)), ...orderRows];
  return rows.sort((a, b) => b.ts - a.ts);
}

// True when a batch of settled requests had work to do and every one failed
// without the server answering (network down / timeout). A response of any
// status (e.g. a 404 for a stale order id) means the server was reachable.
export function allRequestsFailed(results) {
  const list = Array.isArray(results) ? results : [];
  return list.length > 0 && list.every((r) => r.status === 'rejected' && !r.reason?.response);
}
