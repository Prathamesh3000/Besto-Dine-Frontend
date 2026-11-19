import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../Context/AuthContext';
import { canOpen, firstAllowedPath } from '../Pages/SuperAdmin/portalAccess';

/**
 * RequireModule — guard for a /superadmin page.
 *
 *   <RequireModule module="payments">…</RequireModule>
 *   <RequireModule anyOf={['signupLeads', 'leads']}>…</RequireModule>
 *   <RequireModule fullOnly>…</RequireModule>    (real super admins, not platform staff)
 *   <RequireModule fullLevel>…</RequireModule>   (only the `full` super admin)
 *
 * Not allowed → redirect to the first page the user CAN open. If there is
 * none (a brand-new platform staff account with no modules) show a message
 * instead of redirecting, so there is never a redirect loop. The redirect
 * target is always allowed by construction, so it cannot bounce back here.
 */
const RequireModule = ({ module, anyOf, fullOnly, fullLevel, children }) => {
    const { user } = useAuth();
    if (canOpen(user, { module, anyOf, fullOnly, fullLevel })) return children;

    const home = firstAllowedPath(user);
    if (home) return <Navigate to={home} replace />;

    return (
        <div className="max-w-xl mx-auto px-6 py-20 text-center" role="alert">
            <h2 className="text-lg font-bold text-gray-900">No sections available yet</h2>
            <p className="mt-2 text-sm text-gray-600">
                You don&apos;t have access to any section yet. Ask the owner.
            </p>
        </div>
    );
};

export default RequireModule;
