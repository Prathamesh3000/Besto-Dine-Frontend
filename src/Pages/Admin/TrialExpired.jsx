// Full-page lock screen for an owner whose free trial ended unpaid. All data
// is kept; the only routes still open are billing (/admin/subscription) and
// the data export. Reached via ProtectedRoute (trial-locked owner) or by
// visiting /trial-expired directly. See utils/trialLock.js.
import React, { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { ShieldCheck, Download, LogOut, Loader2 } from 'lucide-react'
import api from '../../utils/api'
import { useAuth } from '../../Context/AuthContext'
import { isTrialLocked } from '../../utils/trialLock'

export default function TrialExpired() {
  const { user, logout } = useAuth()
  const [exporting, setExporting] = useState(false)

  // Not locked (e.g. just paid, or bookmarked URL) - nothing to show here.
  if (user && !isTrialLocked(user)) return <Navigate to="/admin/dashboard" replace />

  const endDate = user?.tenant?.trialEndDate
    ? new Date(user.tenant.trialEndDate).toLocaleDateString()
    : ''

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const res = await api.get('/tenant/export', { responseType: 'blob', _silent: true })
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/zip' }))
      const a = document.createElement('a')
      a.href = url
      const disp = res.headers?.['content-disposition'] || ''
      a.download = disp.match(/filename="?(.+?)"?$/)?.[1] || 'data-export.zip'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Export downloaded')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to export data')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#FAF5F0] flex items-center justify-center px-4 py-10 font-manrope">
      <div
        role="alert"
        data-testid="trial-expired-screen"
        className="w-full max-w-md rounded-3xl bg-white border border-[#EAECF0] shadow-[0_12px_40px_rgba(16,24,40,0.08)] p-6 sm:p-8 text-center"
      >
        <div className="mx-auto w-14 h-14 rounded-2xl bg-[#FFF3E6] text-[#FE8301] flex items-center justify-center">
          <ShieldCheck size={28} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-[24px] font-extrabold tracking-tight text-[#101828]">
          Your free trial has ended
        </h1>
        <p className="mt-2 text-[15px] text-[#475467] leading-relaxed">
          All your data is safe and kept{endDate ? ` (trial ended ${endDate})` : ''}. Choose a plan to pick up
          exactly where you left off - your menu, tables, orders and staff are waiting.
        </p>
        <div className="mt-7 flex flex-col gap-3">
          <Link
            to="/admin/subscription"
            className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-[15px] font-bold text-white bg-[#FE8301] hover:bg-[#E57501] transition-colors"
          >
            Choose a plan
          </Link>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[15px] font-bold text-[#1A181B] border border-[#EAECF0] hover:bg-[#F9FAFB] transition-colors disabled:opacity-60"
          >
            {exporting ? <Loader2 size={17} className="animate-spin" /> : <Download size={17} />}
            Download my data
          </button>
          <button
            type="button"
            onClick={logout}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2 text-[14px] font-semibold text-[#667085] hover:text-[#101828] transition-colors"
          >
            <LogOut size={16} /> Log out
          </button>
        </div>
      </div>
    </div>
  )
}
