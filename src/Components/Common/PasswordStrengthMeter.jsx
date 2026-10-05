import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import {
    scorePassword, passwordRuleFailures, STRENGTH_LABELS, STRENGTH_COLORS, MIN_LENGTH, MAX_LENGTH, STRONG_LENGTH,
} from '../../utils/passwordPolicy';

/* Labels for the live password-requirement checklist. Keys match
   passwordRuleFailures() so the two can't drift apart. */
const PASSWORD_RULES = [
    ['length', `At least ${MIN_LENGTH} characters`],
    ['case', 'Upper and lower case letters'],
    ['digit', 'A number'],
    ['special', 'A special character (!@#$…)'],
    // Only listed while it fails — almost nobody gets near the cap.
    ['maxLength', `At most ${MAX_LENGTH} characters`],
];

/**
 * Strength meter + live requirement checklist, shared by customer
 * registration (Pages/Loggedin/Login.jsx) and hotel self-signup
 * (Pages/Platform/RegisterRestaurant.jsx). The policy itself lives in
 * utils/passwordPolicy.js — this is only its presentation.
 *
 * `id` is the element the password input's aria-describedby points at.
 */
export default function PasswordStrengthMeter({ password = '', id = 'password-strength' }) {
    const strength = scorePassword(password);
    const failures = passwordRuleFailures(password);

    return (
        <>
            {/* Strength meter. Shown alongside errors, not instead of
                them — the user needs to see the bar move toward "Strong"
                while the requirement list below says what's missing. */}
            {password && (
                <div id={id} className="mt-2 flex items-center gap-2">
                    <div className="flex-1 flex gap-1">
                        {[1, 2, 3, 4].map(i => (
                            <div
                                key={i}
                                className={`h-1 flex-1 rounded-full transition-colors ${
                                    i <= strength ? STRENGTH_COLORS[strength] : 'bg-gray-200'
                                }`}
                            />
                        ))}
                    </div>
                    <span className="text-[11px] text-[#645E66] w-14 text-right">
                        {STRENGTH_LABELS[strength]}
                    </span>
                </div>
            )}
            {password && failures.length === 0 && (
                <p className="mt-2 text-[11px] text-green-600 flex items-center gap-1.5">
                    <CheckCircle2 size={11} className="shrink-0" />
                    {strength >= 4
                        ? 'Strong password — all requirements met'
                        : `Good password — you can continue (${STRONG_LENGTH}+ characters makes it Strong)`}
                </p>
            )}
            {failures.length > 0 && (
                <ul className="mt-2 space-y-1">
                    {PASSWORD_RULES.filter(([key]) => key !== 'maxLength' || failures.includes(key)).map(([key, label]) => {
                        const failed = failures.includes(key);
                        return (
                            <li
                                key={key}
                                className={`text-[11px] flex items-center gap-1.5 ${failed ? 'text-[#8D848F]' : 'text-green-600'}`}
                            >
                                {failed
                                    ? <span className="w-2.5 h-2.5 rounded-full border border-current inline-block shrink-0" />
                                    : <CheckCircle2 size={11} className="shrink-0" />}
                                {label}
                            </li>
                        );
                    })}
                </ul>
            )}
        </>
    );
}
