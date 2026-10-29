import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'

// One-time secret panel: an API key or a webhook signing secret is shown
// exactly once, right after create / rotate. Closing it hides the value for good.
export default function DeveloperSecretReveal({ title, secret, hint, onClose, testId = 'dev-secret' }) {
    const [copied, setCopied] = useState(false)

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(secret)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch {
            /* clipboard blocked: the value is selectable below */
        }
    }

    return (
        <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4" role="alert" data-testid={testId}>
            <div className="text-[14px] font-bold text-amber-900">{title}</div>
            <p className="text-[13px] text-amber-800 mb-2">{hint || 'Copy it now. For security it is shown only once and cannot be retrieved later.'}</p>
            <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-lg bg-white border border-amber-200 px-3 py-2 text-[13px] select-all" data-testid={`${testId}-value`}>{secret}</code>
                <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-[13px] font-semibold text-amber-900">
                    {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}
                </button>
                <button type="button" onClick={onClose} className="rounded-lg bg-amber-900 px-3 py-2 text-[13px] font-semibold text-white" data-testid={`${testId}-done`}>
                    I have saved it
                </button>
            </div>
        </div>
    )
}
