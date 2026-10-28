/**
 * Admin → Settings → Payment QR (UPI). The admin enters their OWN UPI ID;
 * the printed bill carries a QR with the exact amount so customers can pay
 * at the table. Saved through PATCH /settings/payments (admin / manager
 * only). The full UPI ID is only ever shown inside this input — the rest of
 * the app uses `upiIdMasked`.
 */
import React, { useContext, useEffect, useState } from 'react'
import { Save, Trash2 } from 'lucide-react'
import { QueryClientContext } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { settingsAPI } from '../../../utils/api'
import { useAuth, ADMIN_ROLES } from '../../../Context/AuthContext'
import { adminKeys } from '../../../hooks/queries/queryKeys'

// Identical to the backend rule.
export const UPI_ID_RE = /^[\w.-]{2,}@[\w]{2,}$/
export const UPI_ID_MAX = 100
export const UPI_PAYEE_MAX = 60

const INPUT = 'w-full px-3 py-2 border rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:ring-1 focus:ring-[#702083]'

export default function PaymentQrSettings({ initial, onSaved }) {
    const { user } = useAuth()
    const queryClient = useContext(QueryClientContext)
    const [upiId, setUpiId] = useState('')
    const [payee, setPayee] = useState('')
    const [errors, setErrors] = useState({})
    const [saving, setSaving] = useState(false)

    const init = initial || {}
    useEffect(() => {
        setUpiId(init.upiId || '')
        setPayee(init.upiPayeeName || '')
        setErrors({})
    }, [init.upiId, init.upiPayeeName])

    if (!ADMIN_ROLES.includes(user?.role)) return null

    const dirty = upiId !== (init.upiId || '') || payee !== (init.upiPayeeName || '')

    const validate = () => {
        const e = {}
        const id = upiId.trim().toLowerCase()
        if (id && (id.length > UPI_ID_MAX || !UPI_ID_RE.test(id))) {
            e.upiId = 'Enter a valid UPI ID like yourshop@okaxis'
        }
        if (payee.trim().length > UPI_PAYEE_MAX) e.upiPayeeName = `Payee name can be at most ${UPI_PAYEE_MAX} characters`
        return e
    }

    const send = async (body) => {
        setSaving(true)
        setErrors({})
        try {
            await settingsAPI.updateSection('payments', body)
            toast.success('Payment QR settings saved')
            if (queryClient) {
                queryClient.invalidateQueries({ queryKey: adminKeys.settings })
                queryClient.invalidateQueries({ queryKey: adminKeys.bootstrap })
            }
            onSaved?.()
        } catch (err) {
            const data = err?.response?.data || {}
            const errs = data.errors && typeof data.errors === 'object' && !Array.isArray(data.errors) ? data.errors : {}
            const next = {}
            const idMsg = errs.upiId || errs['payments.upiId']
            const nameMsg = errs.upiPayeeName || errs['payments.upiPayeeName']
            if (idMsg) next.upiId = String(idMsg?.message || idMsg)
            if (nameMsg) next.upiPayeeName = String(nameMsg?.message || nameMsg)
            if (!next.upiId && !next.upiPayeeName) {
                toast.error(data.message || 'Failed to save payment settings')
            } else {
                setErrors(next)
            }
        } finally {
            setSaving(false)
        }
    }

    const handleSave = () => {
        const e = validate()
        if (Object.keys(e).length) { setErrors(e); return }
        const id = upiId.trim().toLowerCase()
        setUpiId(id)
        return send({ upiId: id, upiPayeeName: payee.trim() })
    }

    const handleClear = () => send({ upiId: '', upiPayeeName: '' })

    const on = !!init.upiConfigured

    return (
        <div className="space-y-4 pb-10 max-w-xl" data-testid="payment-qr-settings">
            <div className="flex items-center gap-3">
                <h2 className="text-[16px] font-[600] text-[#1A181B]">Payment QR (UPI)</h2>
                <span
                    data-testid="qr-status"
                    className={`px-2.5 py-0.5 rounded-full text-[12px] font-[600] ${on ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                >
                    QR on bills: {on ? 'On' : 'Off'}
                </span>
            </div>

            {init.upiInherited && (
                <p className="text-[13px] text-[#645E66] bg-[#F9F5FA] border border-[#E5E7EB] rounded-[10px] px-3 py-2">
                    Using the main restaurant UPI ID. Save here to use a different one for this branch.
                </p>
            )}

            <div>
                <label htmlFor="upi-id" className="block text-[14px] font-[600] text-[#1A181B] mb-1">UPI ID</label>
                <input
                    id="upi-id"
                    type="text"
                    value={upiId}
                    maxLength={UPI_ID_MAX}
                    placeholder="yourshop@okaxis"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    onChange={(e) => setUpiId(e.target.value)}
                    onBlur={() => setUpiId((v) => v.trim().toLowerCase())}
                    aria-invalid={!!errors.upiId}
                    aria-describedby="upi-id-help"
                    className={`${INPUT} ${errors.upiId ? 'border-red-400' : 'border-[#E5E7EB]'}`}
                />
                {errors.upiId && <p role="alert" className="text-xs text-red-600 mt-1">{errors.upiId}</p>}
                <p id="upi-id-help" className="text-[12px] text-[#645E66] mt-1">
                    Customers scan the QR printed on the bill and pay this account directly. The app cannot see these payments; your captain confirms them with the UPI payment received button.
                </p>
            </div>

            <div>
                <label htmlFor="upi-payee" className="block text-[14px] font-[600] text-[#1A181B] mb-1">Payee name</label>
                <input
                    id="upi-payee"
                    type="text"
                    value={payee}
                    maxLength={UPI_PAYEE_MAX}
                    onChange={(e) => setPayee(e.target.value)}
                    aria-invalid={!!errors.upiPayeeName}
                    aria-describedby="upi-payee-help"
                    className={`${INPUT} ${errors.upiPayeeName ? 'border-red-400' : 'border-[#E5E7EB]'}`}
                />
                {errors.upiPayeeName && <p role="alert" className="text-xs text-red-600 mt-1">{errors.upiPayeeName}</p>}
                <p id="upi-payee-help" className="text-[12px] text-[#645E66] mt-1">
                    Shown on the bill under the QR; defaults to your cafe name
                </p>
            </div>

            <div className="flex flex-wrap gap-3">
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || !dirty}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Save size={18} strokeWidth={2.5} />
                    {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                    type="button"
                    onClick={handleClear}
                    disabled={saving || (!init.upiId && !init.upiPayeeName && !upiId && !payee)}
                    className="flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-[#4B5563] rounded-[10px] text-[14px] font-[600] hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Trash2 size={16} />
                    Clear
                </button>
            </div>
        </div>
    )
}
