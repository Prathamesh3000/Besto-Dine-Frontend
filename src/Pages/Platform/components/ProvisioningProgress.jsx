// "Setting up <name>…" — shown between a successful signup response (201)
// and the redirect to the dashboard, by /start-trial and
// /register-restaurant. Provisioning itself is synchronous on the server
// (tenant + owner + main branch are written in one request), so this is a
// short, honest progress list: the first step is done the moment the
// response arrives, the last one ticks when the session is applied.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useProvisioningSteps } from './useProvisioning';

/**
 * Purely presentational.
 *  name  — restaurant name shown in the title
 *  steps — array of labels (defaults to the three standard steps)
 *  done  — number of completed steps (0..steps.length); the next one spins
 */
export default function ProvisioningProgress({ name, steps, done = 0 }) {
    const { t } = useTranslation();
    const defaults = useProvisioningSteps();
    const list = Array.isArray(steps) && steps.length ? steps : defaults;
    const completed = Math.max(0, Math.min(Number(done) || 0, list.length));
    return (
        <div
            className="bg-white rounded-3xl border border-[#EAECF0] shadow-[0_12px_40px_rgba(16,24,40,0.08)] p-6 sm:p-8"
            role="status" aria-live="polite" aria-busy={completed < list.length ? 'true' : 'false'}
            data-testid="provisioning-progress"
        >
            <h1 className="text-[24px] sm:text-[26px] font-extrabold tracking-tight text-[#101828]">
                {name
                    ? t('platform.provisioning.title_named', 'Setting up {{name}}…', { name })
                    : t('platform.provisioning.title', 'Setting up your restaurant…')}
            </h1>
            <p className="mt-1 text-[14px] text-[#667085]">
                {t('platform.provisioning.subtitle', 'This only takes a moment.')}
            </p>
            <ol className="mt-6 space-y-3">
                {list.map((label, i) => {
                    const isDone = i < completed;
                    const isActive = i === completed;
                    return (
                        <li
                            key={label}
                            className={`flex items-center gap-3 text-[15px] ${isDone ? 'text-[#101828]' : isActive ? 'text-[#344054]' : 'text-[#98A2B3]'}`}
                            data-state={isDone ? 'done' : isActive ? 'active' : 'pending'}
                        >
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                                isDone ? 'bg-[#067647] text-white' : isActive ? 'bg-[#FFF3E6] text-[#FE8301]' : 'bg-[#F2F4F7] text-[#98A2B3]'
                            }`}>
                                {isDone
                                    ? <CheckCircle2 size={16} aria-hidden="true" />
                                    : isActive
                                        ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                                        : <span className="w-2 h-2 rounded-full bg-current" aria-hidden="true" />}
                            </span>
                            <span className={isDone || isActive ? 'font-semibold' : 'font-medium'}>{label}</span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
