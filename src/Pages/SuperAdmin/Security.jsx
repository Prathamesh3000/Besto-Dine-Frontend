import React from 'react';
import TwoFactorSettings from '../../Components/Auth/TwoFactorSettings';

// /superadmin/security — optional two-factor authentication for the platform account.
export default function SuperAdminSecurity() {
    return (
        <div className="p-6 space-y-4">
            <h1 className="text-[22px] font-[700] text-[#1A181B]">Security</h1>
            <TwoFactorSettings />
        </div>
    );
}
