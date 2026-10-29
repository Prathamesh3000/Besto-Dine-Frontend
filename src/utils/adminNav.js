// Pure admin top-nav filtering, kept out of AdminLayout so it can be tested.
//   permission     : staff permission flag (admins always pass hasPermission)
//   feature        : plan module; a locked one keeps the tab visible with a
//                    PRO badge ...
//   hideWhenLocked : ... unless the item sets this, then it is hidden
//   ownerOnly      : tenant owner only
export function buildAdminNavItems(items, { isTenantOwner, hasPermission, hasFeature, isCrossBranchReadOnly, role }) {
    return items
        .filter(item => !item.ownerOnly || isTenantOwner)
        .filter(item => !item.roles || item.roles.includes(role))
        .filter(item => !item.permission || hasPermission(item.permission))
        .filter(item => !(item.hideWhenLocked && item.feature && !hasFeature(item.feature)))
        // Cross-branch peek: only the Dashboard tab is reachable.
        .filter(item => !isCrossBranchReadOnly || item.path === '/admin/dashboard')
        .map(item => ({ ...item, locked: item.feature ? !hasFeature(item.feature) : false }));
}
