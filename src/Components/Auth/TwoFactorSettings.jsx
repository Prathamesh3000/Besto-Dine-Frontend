// "Security" panel: set up / disable optional TOTP two-factor authentication
// and manage recovery codes. Used in Admin -> Settings -> Security and the
// Super Admin security page. Talks to /auth/2fa/* (Backend/docs/TWO_FACTOR_AUTH.md).
import React, { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-hot-toast';
import { ShieldCheck, ShieldOff, Copy } from 'lucide-react';
import api from '../../utils/api';

const INPUT = 'w-full px-3 py-2 border border-gray-200 rounded-[10px] text-[14px] text-[#1A181B] focus:outline-none focus:ring-1 focus:ring-[#702083]';
const BTN = 'px-4 py-2 rounded-[10px] text-[14px] font-[600] disabled:opacity-60';
const errMsg = (e) => e?.response?.data?.message || e?.message || 'Something went wrong';

function RecoveryCodes({ codes, onDone }) {
    const text = codes.join('\n');
    return (
        <div className="border border-amber-300 bg-amber-50 rounded-xl p-4 space-y-3" data-testid="recovery-codes">
            <p className="text-[14px] font-[600] text-[#1A181B]">
                Save these recovery codes now. They are shown only once, and each works a single time if you lose your authenticator.
            </p>
            <ul className="grid grid-cols-2 gap-2 font-mono text-[14px]">
                {codes.map((c) => <li key={c}>{c}</li>)}
            </ul>
            <div className="flex gap-2">
                <button
                    type="button"
                    className={`${BTN} border border-gray-300 flex items-center gap-1`}
                    onClick={() => { navigator.clipboard?.writeText(text).then(() => toast.success('Copied')).catch(() => {}); }}
                >
                    <Copy className="w-4 h-4" /> Copy
                </button>
                <button type="button" className={`${BTN} bg-[#702083] text-white`} onClick={onDone}>
                    I have saved them
                </button>
            </div>
        </div>
    );
}

export default function TwoFactorSettings() {
    const [status, setStatus] = useState(null); // { eligible, enabled, setupRequired, recoveryCodesRemaining }
    const [loadError, setLoadError] = useState('');
    const [setup, setSetup] = useState(null);   // { secret, otpauthUri }
    const [codes, setCodes] = useState(null);   // recovery codes, shown once
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [mode, setMode] = useState(null);     // 'disable' | 'regenerate' | null
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await api.get('/auth/2fa/status', { _silent: true });
            setStatus(res.data);
            setLoadError('');
        } catch (e) {
            setLoadError(errMsg(e));
        }
    }, []);
    useEffect(() => { load(); }, [load]);

    const run = async (fn) => {
        setBusy(true);
        try { await fn(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
    };

    const startSetup = () => run(async () => {
        const res = await api.post('/auth/2fa/setup', {}, { _silent: true });
        setSetup({ secret: res.data.secret, otpauthUri: res.data.otpauthUri });
        setCode('');
    });

    const enable = () => run(async () => {
        const res = await api.post('/auth/2fa/enable', { code }, { _silent: true });
        setSetup(null);
        setCode('');
        setCodes(res.data.recoveryCodes);
        await load();
    });

    const disable = () => run(async () => {
        const v = code.trim();
        const body = /^\d{3}\s?\d{3}$/.test(v) ? { password, code: v } : { password, recoveryCode: v };
        await api.post('/auth/2fa/disable', body, { _silent: true });
        setMode(null); setPassword(''); setCode('');
        toast.success('Two-factor authentication turned off');
        await load();
    });

    const regenerate = () => run(async () => {
        const res = await api.post('/auth/2fa/recovery/regenerate', { code }, { _silent: true });
        setMode(null); setCode('');
        setCodes(res.data.recoveryCodes);
        await load();
    });

    if (loadError) return <p role="alert" className="text-red-600 text-sm">{loadError}</p>;
    if (!status) return <p className="text-sm text-[#645E66]">Loading...</p>;
    if (!status.eligible) {
        return <p className="text-sm text-[#645E66]">Two-factor authentication is available for owner and admin accounts.</p>;
    }

    return (
        <section className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5 max-w-xl" aria-label="Two-factor authentication">
            <div className="flex items-center gap-3">
                {status.enabled
                    ? <ShieldCheck className="w-6 h-6 text-green-600" aria-hidden="true" />
                    : <ShieldOff className="w-6 h-6 text-[#7D7380]" aria-hidden="true" />}
                <div>
                    <h3 className="text-[16px] font-[700] text-[#1A181B]">Two-factor authentication</h3>
                    <p className="text-[13px] text-[#645E66]">
                        {status.enabled
                            ? `On. ${status.recoveryCodesRemaining} recovery code${status.recoveryCodesRemaining === 1 ? '' : 's'} left.`
                            : 'Off. Add a second step (authenticator app) when you sign in.'}
                    </p>
                </div>
            </div>

            {status.setupRequired && !status.enabled && (
                <p role="alert" className="text-[13px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Your organisation asks admins to turn on two-factor authentication.
                </p>
            )}

            {codes && <RecoveryCodes codes={codes} onDone={() => setCodes(null)} />}

            {!status.enabled && !setup && (
                <button type="button" disabled={busy} onClick={startSetup} className={`${BTN} bg-[#702083] text-white`}>
                    Set up authenticator
                </button>
            )}

            {setup && (
                <div className="space-y-3" data-testid="two-factor-setup">
                    <p className="text-[13px] text-[#1A181B]">
                        Scan this QR code with Google Authenticator, Authy or a similar app, then enter the 6-digit code.
                    </p>
                    <div className="inline-block p-3 bg-white border border-gray-200 rounded-xl">
                        <QRCodeSVG value={setup.otpauthUri} size={176} />
                    </div>
                    <p className="text-[12px] text-[#645E66] break-all">
                        Cannot scan? Enter this key manually: <span className="font-mono">{setup.secret}</span>
                    </p>
                    <input
                        aria-label="Authentication code"
                        className={INPUT}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={7}
                        placeholder="123456"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <button type="button" disabled={busy || code.trim().length < 6} onClick={enable} className={`${BTN} bg-[#702083] text-white`}>
                            Turn on
                        </button>
                        <button type="button" disabled={busy} onClick={() => { setSetup(null); setCode(''); }} className={`${BTN} border border-gray-300`}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {status.enabled && !mode && (
                <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setMode('regenerate'); setCode(''); }} className={`${BTN} border border-gray-300`}>
                        New recovery codes
                    </button>
                    <button type="button" onClick={() => { setMode('disable'); setCode(''); setPassword(''); }} className={`${BTN} border border-red-300 text-red-700`}>
                        Turn off
                    </button>
                </div>
            )}

            {status.enabled && mode && (
                <div className="space-y-3" data-testid={`two-factor-${mode}`}>
                    <p className="text-[13px] text-[#1A181B]">
                        {mode === 'disable'
                            ? 'Enter your password and a current code (or a recovery code) to turn off two-factor authentication.'
                            : 'Enter a current authenticator code to replace your recovery codes. The old ones stop working.'}
                    </p>
                    {mode === 'disable' && (
                        <input
                            type="password"
                            aria-label="Password"
                            autoComplete="current-password"
                            className={INPUT}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    )}
                    <input
                        aria-label="Authentication code"
                        className={INPUT}
                        autoComplete="one-time-code"
                        placeholder={mode === 'disable' ? '123456 or recovery code' : '123456'}
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                    />
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={busy || !code.trim() || (mode === 'disable' && !password)}
                            onClick={mode === 'disable' ? disable : regenerate}
                            className={`${BTN} ${mode === 'disable' ? 'bg-red-600 text-white' : 'bg-[#702083] text-white'}`}
                        >
                            {mode === 'disable' ? 'Turn off' : 'Generate new codes'}
                        </button>
                        <button type="button" disabled={busy} onClick={() => setMode(null)} className={`${BTN} border border-gray-300`}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
