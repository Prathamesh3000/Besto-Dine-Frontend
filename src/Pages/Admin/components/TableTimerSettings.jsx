import React, { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { settingsAPI } from '../../../utils/api'
import { setTableTimerConfig } from '../../../hooks/useServerClock'
import { validateTableTimer, TIMER_MIN, TIMER_MAX } from '../../../utils/tableTimer'

const INPUT = 'w-full px-3 py-2 border rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:ring-1 focus:ring-[#702083]'

// Admin -> Settings: when a table card turns amber / red. Saved on its own
// through PUT /settings { tableTimer }.
export default function TableTimerSettings({ initial, onSaved }) {
    const init = initial || {}
    const [amber, setAmber] = useState(String(init.amberMinutes ?? 60))
    const [red, setRed] = useState(String(init.redMinutes ?? 90))
    const [errors, setErrors] = useState({})
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        setAmber(String(init.amberMinutes ?? 60))
        setRed(String(init.redMinutes ?? 90))
        setErrors({})
    }, [init.amberMinutes, init.redMinutes])

    const save = async () => {
        const errs = validateTableTimer(amber, red)
        setErrors(errs)
        if (errs.amber || errs.red) return
        setSaving(true)
        try {
            const tableTimer = { amberMinutes: Number(amber), redMinutes: Number(red) }
            await settingsAPI.updateSettings({ tableTimer })
            setTableTimerConfig(tableTimer)
            toast.success('Table timer updated')
            onSaved?.()
        } catch (err) {
            const msg = err?.response?.data?.errors?.[0]?.message || err?.response?.data?.message || 'Failed to save table timer'
            setErrors({ form: msg })
            toast.error(msg)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-4 md:p-6 shadow-sm" data-testid="table-timer-settings">
            <h2 className="text-[15px] font-[600] text-[#1A181B] mb-1">Table timer</h2>
            <p className="text-[12px] text-[#9CA3AF] mb-4">
                Occupied tables show how long guests have been seated. The timer turns amber and then red after these times.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                <div>
                    <label htmlFor="tt-amber" className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Amber after (minutes)</label>
                    <input id="tt-amber" type="number" min={TIMER_MIN} max={TIMER_MAX} step="1" value={amber}
                        onChange={(e) => setAmber(e.target.value)} aria-invalid={!!errors.amber}
                        className={`${INPUT} ${errors.amber ? 'border-red-400' : 'border-gray-200'}`} />
                    {errors.amber && <p role="alert" className="text-[11px] text-red-600 mt-1">{errors.amber}</p>}
                </div>
                <div>
                    <label htmlFor="tt-red" className="block text-[13px] font-[500] text-[#1A181B] mb-1.5">Red after (minutes)</label>
                    <input id="tt-red" type="number" min={TIMER_MIN} max={TIMER_MAX} step="1" value={red}
                        onChange={(e) => setRed(e.target.value)} aria-invalid={!!errors.red}
                        className={`${INPUT} ${errors.red ? 'border-red-400' : 'border-gray-200'}`} />
                    {errors.red && <p role="alert" className="text-[11px] text-red-600 mt-1">{errors.red}</p>}
                </div>
            </div>
            {errors.form && <p role="alert" className="text-[12px] text-red-600 mb-3">{errors.form}</p>}
            <div className="flex justify-end">
                <button type="button" disabled={saving} onClick={save}
                    className="flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-[10px] text-[14px] font-[600] hover:bg-orange-600 disabled:opacity-50">
                    <Save size={18} strokeWidth={2.5} />
                    {saving ? 'Saving...' : 'Save table timer'}
                </button>
            </div>
        </div>
    )
}
