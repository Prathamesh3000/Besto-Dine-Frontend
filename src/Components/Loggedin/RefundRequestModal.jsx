import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { refundRequestAPI } from '../../utils/api';
import { REFUND_REASONS, refundableBalance } from '../../utils/refund';

/**
 * Customer "Request refund" sheet for a paid order. Creates a RefundRequest
 * (POST /refund-requests) that an admin approves or declines; nothing moves
 * until then. Full balance by default, with an optional partial amount.
 */
export default function RefundRequestModal({ order, onClose, onSubmitted }) {
  const balance = refundableBalance(order);
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [partial, setPartial] = useState(false);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const needsDetails = reason === 'Other';
  const finalReason = needsDetails ? details.trim() : [reason, details.trim()].filter(Boolean).join(' - ');
  const amountNum = Number(amount);
  const amountOk = !partial || (Number.isFinite(amountNum) && amountNum > 0 && amountNum <= balance);
  const canSubmit = !busy && !!reason && !!finalReason && amountOk;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const body = { orderId: order.orderId || order.id, reason: finalReason };
      if (partial) body.amount = Math.round(amountNum * 100) / 100;
      const res = await refundRequestAPI.create(body);
      toast.success(`Refund of ₹${Number(res.data?.refundRequest?.amount ?? balance).toFixed(0)} requested — pending admin approval.`, { id: 'refund-request-ok', duration: 6000 });
      onSubmitted && onSubmitted(res.data?.refundRequest);
      onClose();
    } catch (err) {
      // 409 = already pending; the list refresh will show the pending pill.
      if (err?.response?.status === 409) onSubmitted && onSubmitted(err.response.data?.refundRequest);
      toast.error(err?.response?.data?.message || 'Could not send your refund request. Please try again.', { id: 'refund-request-err' });
      if (err?.response?.status === 409) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center md:p-4 overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="refund-modal-title">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-white rounded-t-[32px] md:rounded-[32px] w-full max-w-[420px] relative z-10 p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] md:pb-6 shadow-2xl max-h-[90vh] overflow-y-auto overscroll-contain">
        <h2 id="refund-modal-title" className="text-[18px] font-nunito font-semibold text-center text-[#1A181B] leading-[22px] mb-1">
          Request a refund
        </h2>
        <p className="text-[12px] font-varela text-[#8D848F] text-center mb-4">
          Order #{String(order.orderId || order.id).split('-').pop()} · up to ₹{balance.toFixed(2)} can be refunded. The restaurant reviews every request.
        </p>

        <div className="space-y-0.5 mb-3">
          {REFUND_REASONS.map((r) => (
            <div key={r} role="radio" aria-checked={reason === r} tabIndex={0}
              onClick={() => setReason(r)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setReason(r); } }}
              className="flex items-center justify-between py-3 cursor-pointer border-b border-[#F7F7F7] last:border-0">
              <span className={`text-[14px] font-varela ${reason === r ? 'text-[#FE8301]' : 'text-[#645E66]'}`}>{r}</span>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${reason === r ? 'border-[#34C759] bg-[#34C759]' : 'border-[#B6AEB8]'}`}>
                {reason === r && <Check size={20} className="text-white" />}
              </div>
            </div>
          ))}
        </div>

        <textarea value={details} onChange={(e) => setDetails(e.target.value.slice(0, 500))}
          aria-label={needsDetails ? 'Tell us what went wrong' : 'Extra details (optional)'}
          placeholder={needsDetails ? 'Tell us what went wrong…' : 'Extra details (optional)'}
          className="w-full h-[72px] p-4 bg-[#F8F7FA] rounded-[16px] text-[14px] font-varela focus:outline-none mb-3" />

        <label className="flex items-center gap-2 text-[13px] font-varela text-[#645E66] mb-2 cursor-pointer">
          <input type="checkbox" checked={partial} onChange={(e) => setPartial(e.target.checked)} />
          Refund only part of the bill
        </label>
        {partial && (
          <div className="mb-3">
            <input type="number" inputMode="decimal" min="0" max={balance} step="0.01" value={amount}
              onChange={(e) => setAmount(e.target.value)} aria-label="Refund amount in rupees"
              placeholder={`Amount (max ₹${balance.toFixed(2)})`}
              className="w-full p-3 bg-[#F8F7FA] rounded-[12px] text-[14px] font-varela focus:outline-none" />
            {amount !== '' && !amountOk && (
              <p className="text-[12px] text-[#EF4F5F] mt-1">Enter an amount between ₹0.01 and ₹{balance.toFixed(2)}.</p>
            )}
          </div>
        )}

        <button onClick={submit} disabled={!canSubmit}
          className={`w-full py-3 rounded-2xl font-nunito font-semibold text-[16px] transition-all flex items-center justify-center gap-2 ${canSubmit ? 'bg-[#FE8301] text-white' : 'bg-[#F5F5F5] text-[#B6AEB8]'}`}>
          {busy && <Loader2 size={18} className="animate-spin" />}
          Send request
        </button>
        <button onClick={onClose} className="w-full py-2 mt-2 text-[14px] font-nunito text-[#8D848F]">Not now</button>
      </div>
    </div>
  );
}
