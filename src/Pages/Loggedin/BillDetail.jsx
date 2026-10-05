import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, Loader2, Utensils, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api, { settingsAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import { resolveImageUrl } from '../../utils/image';
import { getActiveTenant } from '../../utils/tenant';
import { useMenu } from '../../Context/MenuContext';
import useSocketEvent from '../../hooks/useSocketEvent';
import { joinRoom } from '../../utils/socket';
import { billFromOrder, toTaxConfig } from '../../utils/billing';

function BillDetail() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { menuItems } = useMenu();
  const tableNumber = (() => { try { const t = JSON.parse(localStorage.getItem('dineInTable') || '{}'); return t.name || localStorage.getItem('tableNumber') || null; } catch { return localStorage.getItem('tableNumber') || null; } })();

  const [bill, setBill] = useState(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState(null);
  // Start at 0 so the initial paint never shows a fake "5%/10%" default
  // before /settings lands. The real values are populated in the
  // useEffect below and the bill ledger reacts via useMemo.
  const [taxConfig, setTaxConfig] = useState(() => toTaxConfig(null));

  // Seed identity from tenant branding (Phase 7.4) so logo/name paint
  // on first render without waiting for /settings.
  const [cafeIdentity, setCafeIdentity] = useState(() => {
    const t = getActiveTenant();
    return {
      name: t?.name || '',
      logoUrl: t?.branding?.logoUrl || '',
    };
  });

  useEffect(() => {
    settingsAPI.getSettings().then(res => {
      if (res.data) {
        setSettings(res.data);
        const t = res.data.taxes;
        if (t) setTaxConfig(toTaxConfig(t));
        const g = res.data.general;
        if (g) {
          setCafeIdentity((prev) => ({
            name: g.cafeName || prev.name,
            logoUrl: g.logoUrl || prev.logoUrl,
          }));
        }
      }
    }).catch(() => {});
    fetchBillDetail();
  }, [orderId]);

  // Join the per-order room so the customer receives `order:updated`
  // and `order:appended` events when the admin / waiter adds items to
  // the bill mid-meal. canJoin on the server rejects unless either
  // (a) the logged-in user owns this order, or (b) the guest scan
  // session matches — so this is safe to call unconditionally.
  useEffect(() => {
    if (!bill?.orderId || bill.orderId === '—') return;
    joinRoom(`order:${bill.orderId}`);
  }, [bill?.orderId]);

  // Real-time: refresh the bill the moment items are appended, and
  // toast the customer with the delta so they're not wondering why the
  // total just moved.
  useSocketEvent('order:appended', (payload) => {
    if (!payload?.orderId || !bill?.orderId) return;
    if (String(payload.orderId) !== String(bill.orderId)) return;
    const names = (payload.addedItems || []).map(i => i?.name).filter(Boolean);
    const preview = names.slice(0, 2).join(', ');
    const extra = names.length > 2 ? ` +${names.length - 2} more` : '';
    toast.success(
      `Waiter added ${names.length === 1 ? 'an item' : `${names.length} items`} to your bill${preview ? `: ${preview}${extra}` : ''}`,
      { icon: '🍽️', duration: 5000 }
    );
    fetchBillDetail();
  });
  useSocketEvent('order:updated', (payload) => {
    if (!payload?.orderId || !bill?.orderId) return;
    if (String(payload.orderId) !== String(bill.orderId)) return;
    // order:appended above already refetches; this covers payment /
    // status transitions that arrive without an append payload.
    fetchBillDetail();
  });

  const resolveMenuImage = (item) => {
    if (item?.image) return item.image;
    if (!Array.isArray(menuItems) || menuItems.length === 0) return '';
    const match = menuItems.find((m) =>
      (item?.menuItem && (m._id === item.menuItem || m.id === item.menuItem)) ||
      (item?.name && m.name === item.name) ||
      (item?.title && m.name === item.title),
    );
    return match?.image || '';
  };

  const mapBillData = (source) => {
    const rawItems = source.items || [];
    const createdAt = source.createdAt || source.order?.createdAt || null;
    const items = rawItems.map((i) => ({
      name: i.name || i.title,
      quantity: i.quantity || 1,
      price: Number(i.price || i.unitPrice || 0),
      image: resolveMenuImage(i),
      description: i.description || i.desc || i.instructions || '',
      // Preserve the per-item timestamp so the bill view can split
      // "Added later" vs "Original order" when the waiter / admin
      // appends items mid-meal.
      addedAt: i.addedAt || null,
    }));
    const subtotal =
      Number(source.subtotal) ||
      items.reduce((sum, it) => sum + it.price * it.quantity, 0);
    const paymentStatus = (source.paymentStatus || '').toLowerCase();
    return {
      id: source._id || source.id,
      // Friendly order ID (ORD-*). Never surface the raw Mongo _id to the customer.
      orderId:
        source.order?.orderId ||
        source.orderId ||
        source.invoiceNumber ||
        (typeof source.id === 'string' && source.id.startsWith('ORD-') ? source.id : '') ||
        '—',
      createdAt,
      itemCount: items.length,
      paymentMethod: source.paymentMethod || 'Cash',
      status: paymentStatus === 'paid' ? 'Paid' : 'Pending',
      items,
      subtotal,
      // Server-stamped breakdown + adjustments — billFromOrder (see the
      // `derivedBill` memo below) displays these when they reconcile
      // with the stored total.
      stored: {
        total: source.total,
        gst: source.gst,
        gstPercentage: source.gstPercentage,
        serviceCharge: source.serviceCharge,
        serviceChargePercentage: source.serviceChargePercentage,
        additionalCharges: source.additionalCharges || [],
        additionalChargesTotal: source.additionalChargesTotal,
        couponCode: source.couponCode || '',
        couponDiscount: source.couponDiscount,
        manualDiscount: source.manualDiscount,
        pointsRedeemed: source.pointsRedeemed,
        tipAmount: source.tipAmount,
        deliveryFee: source.deliveryFee,
      },
      // Needed by computeBill — a takeaway bill must not levy a
      // service charge just because the tenant has one configured.
      orderType: source.type || 'dine-in',
    };
  };

  const fetchBillDetail = async () => {
    setLoading(true);
    let loaded = null;

    // 1. Order lookup is the source of truth for unpaid bills (which is
    //    the common case for guests — no Invoice doc exists until the
    //    bill is settled). The /orders/:id/detail endpoint accepts both
    //    the Mongo _id and the friendly ORD-* orderId, so this handles
    //    any format the caller might pass.
    try {
      const res = await api.get(`/orders/${orderId}/detail`, { _silent: true });
      if (res.data?.success && res.data.order) {
        loaded = mapBillData(res.data.order);
      }
    } catch { /* fall through */ }

    // 2. Invoice lookup — only relevant for paid orders (Invoice docs are
    //    generated on settlement). Used as a fallback for legacy receipts
    //    where the order may have been swept but the invoice persists.
    if (!loaded) {
      try {
        const res = await api.get(`/invoices/${orderId}`, { _silent: true });
        if (res.data?.success && res.data.invoice) {
          loaded = mapBillData(res.data.invoice);
        }
      } catch { /* fall through */ }
    }

    // (#22) No localStorage fallback — the device no longer stores order
    // objects; bills always come from the server.

    if (loaded) {
      setBill(loaded);
    } else {
      toast.error('Bill not found', { id: 'bill-fetch-error' });
    }
    setLoading(false);
  };

  const cafeName = cafeIdentity.name || settings?.general?.cafeName || 'Cafe';
  const logoUrl = resolveImageUrl(cafeIdentity.logoUrl || settings?.general?.logoUrl);

  // Bill ledger. The amount shown (and paid) is ALWAYS the order's
  // stored total — what the server charged at placement (re-stamped on
  // append). The breakdown rows are the server-stamped ones when the
  // order carries them and they reconcile; for orders without a stamp
  // (legacy, or an API response that omits the stamped fields) the rows
  // are recomputed via computeBill from the current Taxes & Charges.
  const derivedBill = useMemo(() => {
    if (!bill) return null;
    const computed = billFromOrder(
      { ...bill.stored, type: bill.orderType, items: bill.items },
      taxConfig,
      // bill.subtotal is the invoice's subtotal or the item sum.
      [{ price: Number(bill.subtotal) || 0, quantity: 1 }],
    );
    return {
      ...bill,
      ...computed,
      // storedTotal when the order has one, else the computed total.
      total: computed.total,
    };
  }, [bill, taxConfig]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!bill) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 text-lg">Bill not found</p>
        <button onClick={() => navigate(-1)} className="text-orange-500 font-semibold">Go Back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white font-sans flex flex-col relative">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white px-4 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft size={24} className="text-[#666666]" />
          </button>
          <h1 className="text-[16px] font-normal nunito text-[#1A181B]">
            Order ID: #{bill.orderId}
          </h1>
        </div>
        <span className="text-[#666666] font-regular varela-rounded text-[14px]">
          Table no.{tableNumber || '—'}
        </span>
      </header>

      <main className="px-4 flex-1 overflow-y-auto pb-28 flex flex-col items-center">
        {/* Logo Section */}
        <div className="flex flex-col items-center mb-6 mt-2 text-center">
          {logoUrl ? (
            <div className="w-[88px] h-[88px] bg-white border border-gray-200 rounded-2xl mb-3 shadow-sm overflow-hidden p-2 flex items-center justify-center">
              <img
                src={logoUrl}
                alt={cafeName}
                // object-contain + white backing so the uploaded logo
                // shows in full instead of being cropped inside an
                // orange circle with arbitrary aspect ratio.
                className="max-w-full max-h-full object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          ) : (
            <div className="w-[72px] h-[72px] bg-[#FF9B0B] rounded-full mb-3 flex items-center justify-center">
              <span className="text-white font-nunito font-bold text-[26px] select-none">
                {(cafeName || 'C').charAt(0).toUpperCase()}
              </span>
            </div>
          )}
          <span className="text-[20px] font-bold nunito text-[#101828]">
            {cafeName}
          </span>
          {bill.status === 'Paid' && (
            <span className="mt-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#E5FFEB] text-[#00C22B] text-[12px] font-semibold">
              <i className="fi fi-sr-check-circle text-[12px]" /> Paid
            </span>
          )}
        </div>

        {/* Bill Summary Card */}
        <div className="bg-[#FFFFFF] rounded-[16px] w-full p-4 border border-[#F7F7F7] shadow-sm">
          {/* Bill Summary Heading */}
          <h2 className="text-[16px] nunito font-semibold text-[#101828] mb-4">
            Bill Summary
          </h2>

          {/* Items — split by `addedAt` so the customer sees what was
              added mid-meal as a distinct "Added later" group. */}
          <div className="space-y-4 mb-5">
            {(() => {
              // Baseline = min(items.addedAt), not bill.createdAt, so a
              // legacy order whose items got retroactively stamped by a
              // Mongoose default still shows the original round correctly
              // instead of being dumped entirely into "Added later".
              const GRACE_MS = 60_000;
              const rawItems = bill.items || [];
              const addedTimes = rawItems
                .map(i => i?.addedAt ? new Date(i.addedAt).getTime() : null)
                .filter(Number.isFinite);
              const baselineMs = addedTimes.length
                ? Math.min(...addedTimes)
                : (bill.createdAt ? new Date(bill.createdAt).getTime() : 0);
              const original = [];
              const appended = [];
              rawItems.forEach((item, idx) => {
                const addedMs = item?.addedAt ? new Date(item.addedAt).getTime() : baselineMs;
                const isLate = Number.isFinite(addedMs) && addedMs - baselineMs > GRACE_MS;
                (isLate ? appended : original).push({ item, idx, isLate });
              });
              const renderRow = ({ item, idx, isLate }) => {
                const qty = item.quantity || 1;
                const unitPrice = Number(item.price || 0);
                const lineTotal = unitPrice * qty;
                const resolvedImg = resolveImageUrl(item.image) || item.image;
                return (
                  <div key={idx} className={`flex items-center gap-3 ${isLate ? 'bg-[#FFF4E8] -mx-2 px-2 py-2 rounded-xl ring-1 ring-[#FE8301]/25' : ''}`}>
                    <div className="w-[56px] h-[56px] rounded-[10px] overflow-hidden flex-shrink-0 bg-[#F7F7F7] flex items-center justify-center">
                      {resolvedImg ? (
                        <img
                          src={resolvedImg}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      ) : (
                        <Utensils size={22} className="text-[#B6AEB8]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-[14px] font-semibold nunito text-[#101828] truncate">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="text-[12px] text-[#8D848F] varela-rounded truncate">
                          {item.description}
                        </p>
                      )}
                      <div className="mt-1 inline-flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] varela-rounded ${isLate ? 'bg-[#FFE4CC] text-[#FE8301] font-bold' : 'bg-[#F5F5F5] text-[#645E66]'}`}>
                          Qty:{qty}
                        </span>
                        <span className="text-[11px] text-[#8D848F] varela-rounded">
                          × ₹{unitPrice.toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <span className="text-[14px] font-semibold nunito text-[#101828] flex-shrink-0 tabular-nums">
                      ₹{lineTotal.toFixed(2)}
                    </span>
                  </div>
                );
              };
              return (
                <>
                  {original.length > 0 && (
                    <>
                      {appended.length > 0 && (
                        <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#8D848F]">
                          Original order · {original.length}
                        </div>
                      )}
                      {original.map(renderRow)}
                    </>
                  )}
                  {appended.length > 0 && (
                    <>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#FE8301] flex items-center gap-1.5 pt-2 border-t border-dashed border-[#FE8301]/30">
                        <Sparkles size={11} strokeWidth={3} />
                        Added later · {appended.length}
                      </div>
                      {appended.map(renderRow)}
                    </>
                  )}
                </>
              );
            })()}
          </div>

          {/* Totals — Subtotal → GST → Service → Additional charges → Total */}
          <div className="space-y-2 pt-3 border-t border-dashed border-[#EEEEEE]">
            <div className="flex justify-between items-center text-[13px]">
              <span className="text-[#645E66] varela-rounded">Subtotal</span>
              <span className="text-[#645E66] varela-rounded font-medium tabular-nums">
                ₹{derivedBill.subtotal.toFixed(2)}
              </span>
            </div>
            {derivedBill.gst > 0 && (
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-[#645E66] varela-rounded">
                  GST ({derivedBill.gstPct}%)
                </span>
                <span className="text-[#645E66] varela-rounded font-medium tabular-nums">
                  ₹{derivedBill.gst.toFixed(2)}
                </span>
              </div>
            )}
            {derivedBill.serviceCharge > 0 && (
              <div className="flex justify-between items-center text-[13px]">
                <span className="text-[#645E66] varela-rounded">
                  Service Charge ({derivedBill.serviceChargePct}%)
                </span>
                <span className="text-[#645E66] varela-rounded font-medium tabular-nums">
                  ₹{derivedBill.serviceCharge.toFixed(2)}
                </span>
              </div>
            )}
            {derivedBill.additionalCharges.map((c, i) => (
              <div key={c.name || i} className="flex justify-between items-center text-[13px]">
                <span className="text-[#645E66] varela-rounded">
                  {c.name}{c.type === 'Percentage' ? ` (${c.value}%)` : ''}
                </span>
                <span className="text-[#645E66] varela-rounded font-medium tabular-nums">
                  ₹{c.amount.toFixed(2)}
                </span>
              </div>
            ))}
            {/* Adjustments already inside the stored total — listed so the
                rows add up to it. */}
            {[
              derivedBill.couponDiscount > 0 && { key: 'coupon', label: `Coupon${bill.stored?.couponCode ? ` (${bill.stored.couponCode})` : ''}`, amount: -derivedBill.couponDiscount },
              derivedBill.pointsRedeemed > 0 && { key: 'points', label: 'Wallet points', amount: -derivedBill.pointsRedeemed },
              derivedBill.tipAmount > 0 && { key: 'tip', label: 'Tip', amount: derivedBill.tipAmount },
              derivedBill.deliveryFee > 0 && { key: 'delivery', label: 'Delivery fee', amount: derivedBill.deliveryFee },
            ].filter(Boolean).map((row) => (
              <div key={row.key} className="flex justify-between items-center text-[13px]">
                <span className={`varela-rounded ${row.amount < 0 ? 'text-[#00A63E]' : 'text-[#645E66]'}`}>{row.label}</span>
                <span className={`varela-rounded font-medium tabular-nums ${row.amount < 0 ? 'text-[#00A63E]' : 'text-[#645E66]'}`}>
                  {row.amount < 0 ? `-₹${(-row.amount).toFixed(2)}` : `₹${row.amount.toFixed(2)}`}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-3 mt-1 border-t border-[#F2F2F2]">
              <span className="text-[15px] nunito font-semibold text-[#101828]">
                Total Payment
              </span>
              <span className="text-[15px] nunito font-semibold text-[#101828] tabular-nums">
                ₹{derivedBill.total.toFixed(2)}
              </span>
            </div>
            {/* Staff (manual) discount: NOT part of the order total — the
                server takes it off when the bill is settled at the counter. */}
            {derivedBill.manualDiscount > 0 && (
              <>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#00A63E] varela-rounded">Staff discount</span>
                  <span className="text-[#00A63E] varela-rounded font-medium tabular-nums">
                    -₹{derivedBill.manualDiscount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[13px]">
                  <span className="text-[#645E66] varela-rounded">After discount</span>
                  <span className="text-[#645E66] varela-rounded font-medium tabular-nums">
                    ₹{Math.max(0, derivedBill.total - derivedBill.manualDiscount).toFixed(2)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Green Dashed Divider */}
          <div className="w-full my-6">
            <div className="border-t-2 border-dashed border-[#34C759] w-full"></div>
          </div>

          {/* QR code (replaces the old tec-it barcode which was erroring
              on ORD-* order IDs). Staff can scan to look up the order. */}
          <div className="flex flex-col items-center justify-center mb-2">
            <div className="p-2 bg-white rounded-lg mb-2">
              <QRCodeSVG
                value={bill.orderId || '—'}
                size={110}
                level="M"
                bgColor="#FFFFFF"
                fgColor="#101828"
              />
            </div>
            <span className="text-[11px] text-[#101828] tracking-wider font-semibold mt-1">
              {bill.orderId}
            </span>
          </div>
        </div>
      </main>

      {/* Bottom CTA — Pay Bill when pending, Paid badge + Back to orders when paid */}
      <div className="sticky bottom-6 left-0 right-0 z-20 px-5">
        {bill.status === 'Paid' ? (
          <button
            onClick={() => navigate('/customer/orders')}
            className="w-full bg-white border border-[#FE8301] text-[#FE8301] font-bold nunito py-4 rounded-[20px] shadow-md text-[16px] flex items-center justify-center gap-2"
          >
            <i className="fi fi-sr-check-circle text-[#00C22B]" />
            Paid — Back to Orders
          </button>
        ) : (
          <button
            onClick={() =>
              navigate('/customer/payment', {
                state: {
                  orderId: bill.orderId,
                  total: derivedBill.total,
                  tableNumber: tableNumber || '—',
                },
              })
            }
            className="w-full bg-[#FE8301] hover:bg-[#E57500] text-white font-bold nunito py-4 rounded-[20px] shadow-lg shadow-orange-500/30 transition-colors text-[16px]"
          >
            Pay Bill ₹{derivedBill.total.toFixed(2)}
          </button>
        )}
      </div>
    </div>
  );
}

export default BillDetail;
