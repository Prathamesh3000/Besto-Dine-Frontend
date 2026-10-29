import React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { TENDER_OPTIONS, summarizeLines, round2 } from '../../../utils/tenderLines'

// Split-payment entry for the counter: one line per method, lines must add
// up to the amount due (cash may exceed it, the excess is the change).
// Controlled: parent owns `lines` and passes `due`.
export default function SplitTenderEditor({ due, lines, onChange, disabled = false }) {
  const s = summarizeLines(lines, due)
  const update = (i, patch) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const remove = (i) => onChange(lines.filter((_, j) => j !== i))
  const add = () => onChange([
    ...lines,
    { method: lines.length === 0 ? 'cash' : 'upi', amount: s.remaining > 0 ? String(s.remaining) : '', reference: '' },
  ])

  return (
    <div data-testid="split-tender-editor" className="space-y-2">
      {lines.map((l, i) => (
        <div key={i} className="flex items-center gap-2">
          <select
            aria-label={`Payment method ${i + 1}`}
            value={l.method}
            disabled={disabled}
            onChange={(e) => update(i, { method: e.target.value })}
            className="border border-[#D0D5DD] rounded-[8px] px-2 py-2 text-[13px] font-manrope bg-white"
          >
            {TENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input
            aria-label={`Payment amount ${i + 1}`}
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={l.amount}
            disabled={disabled}
            onChange={(e) => update(i, { amount: e.target.value })}
            className="w-28 border border-[#D0D5DD] rounded-[8px] px-2 py-2 text-[13px] font-manrope"
          />
          {l.method === 'upi' && (
            <input
              aria-label={`Payment reference ${i + 1}`}
              type="text"
              maxLength={40}
              placeholder="UTR (optional)"
              value={l.reference || ''}
              disabled={disabled}
              onChange={(e) => update(i, { reference: e.target.value })}
              className="flex-1 min-w-0 border border-[#D0D5DD] rounded-[8px] px-2 py-2 text-[13px] font-manrope"
            />
          )}
          <button
            type="button"
            aria-label={`Remove payment line ${i + 1}`}
            disabled={disabled}
            onClick={() => remove(i)}
            className="p-2 text-[#98A2B3] hover:text-[#D92D20]"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={add}
        className="flex items-center gap-1 text-[13px] font-[600] text-[#FE8301] font-manrope"
      >
        <Plus size={14} /> Add payment line
      </button>
      <div className="text-[13px] font-manrope" data-testid="split-tender-summary">
        <span className="text-[#667085]">Entered ₹{s.paid.toFixed(2)} of ₹{round2(due).toFixed(2)}</span>
        {s.remaining > 0 && <span className="ml-2 font-[600] text-[#B54708]">Remaining ₹{s.remaining.toFixed(2)}</span>}
        {s.change > 0 && (
          <span className={`ml-2 font-[600] ${s.change <= s.cash + 0.005 ? 'text-[#067647]' : 'text-[#D92D20]'}`}>
            {s.change <= s.cash + 0.005 ? `Change ₹${s.change.toFixed(2)}` : 'Only cash can be over the amount due'}
          </span>
        )}
      </div>
    </div>
  )
}
