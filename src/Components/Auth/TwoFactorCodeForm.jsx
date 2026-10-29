// Second sign-in step for accounts with TOTP two-factor enabled.
// Accepts the 6-digit authenticator code or, via the toggle, a recovery code.
import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

const TwoFactorCodeForm = ({ onSubmit, onCancel, loading = false }) => {
    const [useRecovery, setUseRecovery] = useState(false);
    const [value, setValue] = useState('');

    const submit = (e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        onSubmit(useRecovery ? { recoveryCode: v } : { code: v.replace(/\s+/g, '') });
    };

    return (
        <form onSubmit={submit} className="space-y-4" noValidate data-testid="two-factor-form">
            <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[#FE8301] shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-sm text-[#1A181B] font-medium">
                    {useRecovery
                        ? 'Enter one of your recovery codes. Each code works only once.'
                        : 'Enter the 6-digit code from your authenticator app.'}
                </p>
            </div>
            <div>
                <label htmlFor="two-factor-code" className="block text-[13px] font-semibold text-[#1A181B] mb-1.5">
                    {useRecovery ? 'Recovery code' : 'Authentication code'}
                </label>
                <input
                    id="two-factor-code"
                    type="text"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode={useRecovery ? 'text' : 'numeric'}
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={useRecovery ? 16 : 7}
                    placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-[#FE8301]/30 focus:border-[#FE8301]"
                />
            </div>
            <button
                type="submit"
                disabled={loading || !value.trim()}
                className="w-full bg-[#FE8301] hover:bg-[#E57501] text-white font-semibold py-3 px-6 rounded-xl disabled:opacity-60 text-[14px]"
            >
                {loading ? 'Verifying...' : 'Verify'}
            </button>
            <div className="flex items-center justify-between text-[13px]">
                <button
                    type="button"
                    onClick={() => { setUseRecovery((v) => !v); setValue(''); }}
                    className="text-[#FE8301] font-semibold underline underline-offset-4"
                >
                    {useRecovery ? 'Use authenticator code' : 'Use a recovery code'}
                </button>
                <button type="button" onClick={onCancel} className="text-[#7D7380] font-medium">
                    Back to sign in
                </button>
            </div>
        </form>
    );
};

export default TwoFactorCodeForm;
