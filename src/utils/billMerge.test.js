import { describe, it, expect } from 'vitest';
import { mergeBills } from './billMerge';

const fmt = { date: (d) => `D:${d}`, time: (d) => `T:${d}` };
const inv = (id, orderRef, at, extra = {}) => ({ _id: id, order: orderRef, createdAt: at, total: 100, items: [{ name: 'A' }], paymentStatus: 'paid', ...extra });
const ord = (id, orderId, at, extra = {}) => ({ _id: id, orderId, createdAt: at, total: 50, items: [{ name: 'B' }], paymentStatus: 'Pending', status: 'preparing', ...extra });

describe('mergeBills', () => {
  it('invoices only', () => {
    const r = mergeBills({ invoices: [inv('i1', { _id: 'o1', orderId: 'ORD-1' }, '2026-11-01')], orders: [], fmt });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'i1', status: 'Paid', amount: 100 });
  });

  it('orders only (invoice list empty) shows unpaid orders', () => {
    const r = mergeBills({ invoices: [], orders: [ord('o1', 'ORD-1', '2026-11-01')], fmt });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'o1', status: 'Pending' });
  });

  it('served unpaid order is Unpaid; Paid order is Paid', () => {
    const r = mergeBills({ invoices: null, orders: [
      ord('o1', 'ORD-1', '2026-11-02', { status: 'served' }),
      ord('o2', 'ORD-2', '2026-11-01', { paymentStatus: 'Paid' }),
    ], fmt });
    expect(r.map((b) => b.status)).toEqual(['Unpaid', 'Paid']);
  });

  it('overlapping order is not duplicated (populated ref, bare id, friendly id)', () => {
    const r = mergeBills({
      invoices: [inv('i1', { _id: 'o1', orderId: 'ORD-1' }, '2026-11-03'), inv('i2', 'o2', '2026-11-02'), inv('i3', { orderId: 'ORD-3' }, '2026-11-01')],
      orders: [ord('o1', 'ORD-1', '2026-11-03'), ord('o2', 'ORD-2', '2026-11-02'), { ...ord('x3', 'ORD-3', '2026-11-01'), _id: undefined, id: 'ORD-3' }, ord('o4', 'ORD-4', '2026-11-04')],
      fmt,
    });
    expect(r.map((b) => b.id)).toEqual(['o4', 'i1', 'i2', 'i3']);
  });

  it('same order listed twice (server + local) appears once', () => {
    const r = mergeBills({ invoices: [], orders: [ord('o1', 'ORD-1', '2026-11-01'), { ...ord('o1', 'ORD-1', '2026-11-01'), _id: undefined, id: 'ORD-1' }], fmt });
    expect(r).toHaveLength(1);
  });

  it('cancelled orders excluded, cancelled predicate honoured', () => {
    const r = mergeBills({
      invoices: [], fmt,
      orders: [ord('o1', 'ORD-1', '2026-11-01', { status: 'Cancelled' }), ord('o2', 'ORD-2', '2026-11-02')],
      isCancelled: (o) => o.status.toLowerCase() === 'cancelled',
    });
    expect(r.map((b) => b.id)).toEqual(['o2']);
  });

  it('sorts newest first across invoices and orders', () => {
    const r = mergeBills({
      invoices: [inv('i1', 'oa', '2026-11-02T10:00:00Z')],
      orders: [ord('o1', 'ORD-1', '2026-11-03T10:00:00Z'), ord('o2', 'ORD-2', '2026-11-01T10:00:00Z')],
      fmt,
    });
    expect(r.map((b) => b.id)).toEqual(['o1', 'i1', 'o2']);
  });

  it('guest path: local orders only, session-paid marks all Paid', () => {
    const r = mergeBills({ invoices: undefined, orders: [ord('o1', 'ORD-1', '2026-11-01')], fmt, sessionBillPaid: true });
    expect(r[0].status).toBe('Paid');
  });
});
