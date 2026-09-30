import React, { useEffect, useState } from 'react'
import { X, AlertTriangle, Loader2 } from 'lucide-react'

/**
 * ConfirmModal — shared confirmation dialog for the Admin Dashboard.
 *
 * All variants use the same single visual design (orange theme):
 *   - Yellow/orange warning triangle icon
 *   - Orange "Confirm" button
 *   - White "Cancel" button with orange border
 *
 * Props
 * ─────────────────────────────────────────────────────────────────
 * isOpen        boolean           Whether the modal is visible
 * onClose       () => void        Called when user dismisses / clicks Cancel
 * onConfirm     () => void        Called when user clicks the confirm button
 * title         string            Modal heading  (e.g. "Delete Offer")
 * message       string | ReactNode Body text / description
 * confirmLabel  string            Confirm button label  (default: "Confirm")
 * cancelLabel   string            Cancel button label   (default: "Cancel")
 *
 * Usage example
 * ─────────────────────────────────────────────────────────────────
 * <ConfirmModal
 *   isOpen={!!deleteTarget}
 *   title="Delete Offer"
 *   message={`Are you sure you want to delete "${deleteTarget?.title}"?`}
 *   confirmLabel="Delete"
 *   onConfirm={handleDelete}
 *   onClose={() => setDeleteTarget(null)}
 * />
 */

const ConfirmModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = 'Are you sure?',
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
}) => {
    const [loading, setLoading] = useState(false)

    // Escape key handler
    useEffect(() => {
        if (!isOpen) return
        const onKey = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
    }, [isOpen, onClose])

    if (!isOpen) return null

    const handleConfirm = async () => {
        setLoading(true)
        try {
            await onConfirm()
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-manrope">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Card */}
            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 flex flex-col items-center gap-4">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                >
                    <X size={20} />
                </button>

                {/* Icon */}
                <div className="size-14 rounded-full bg-orange-50 flex items-center justify-center">
                    <AlertTriangle size={28} className="text-orange-400" strokeWidth={2} />
                </div>

                {/* Text */}
                <div className="text-center px-2">
                    <h3 className="text-lg font-bold text-gray-900 mb-1.5">{title}</h3>
                    {message && (
                        <p className="text-sm text-gray-500 font-normal leading-relaxed">
                            {message}
                        </p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 w-full mt-1">
                    <button
                        onClick={onClose}
                        className="flex-1 h-11 rounded-xl border border-orange-400 text-orange-500 font-semibold text-sm hover:bg-orange-50 transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading}
                        className="flex-1 h-11 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors shadow-sm flex items-center justify-center gap-2"
                    >
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {loading ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmModal
