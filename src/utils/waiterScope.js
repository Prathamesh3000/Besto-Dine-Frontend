// CAP-010 — waiter / captain floor-scope helpers.
//
// A waiter or captain can be pinned to specific areas (`assignedAreas`)
// and/or specific tables (`assignedTables`) on their user record. Empty
// arrays mean "no restriction" — a catch-all floor staffer who covers the
// whole branch (legacy default). The backend ships these refs on the auth
// payload (authController buildAuthResponse), either as raw ObjectId
// strings or populated `{ _id, ... }` objects, so we normalise both.
//
// These helpers keep the Orders tab, the Requests tab, and the BottomNav
// badge counts scoped the SAME way the Home tab grid is — so a waiter only
// ever sees (and is counted for) the tables they actually own. Used by
// WaiterOrders, CustomerRequests, and BottomNav.

// Roles that always see takeaway (floor supervisors / owners) regardless of
// any area pin — oversight of counter orders is part of the job.
const SUPERVISOR_ROLES = new Set(['captain', 'admin', 'manager']);

// Build a stable scope descriptor from the logged-in user.
export function getWaiterScope(user) {
    const assignedAreaIds = new Set((user?.assignedAreas || []).map(a => String(a?._id || a)));
    const assignedTableIds = new Set((user?.assignedTables || []).map(t => String(t?._id || t)));
    return {
        assignedAreaIds,
        assignedTableIds,
        hasAreaScope: assignedAreaIds.size > 0,
        hasTableScope: assignedTableIds.size > 0,
        // Takeaway is assignable per-staff (the "Takeaway" pseudo-area in the
        // admin picker). Supervisors always handle it.
        handlesTakeaway: user?.handlesTakeaway === true,
        isSupervisor: SUPERVISOR_ROLES.has(user?.role),
        userId: String(user?._id || user?.id || ''),
    };
}

// Does an order/request fall inside the waiter's scope?
//
// AND-of-active-gates, matching the Home tab: an area-pinned waiter only
// sees their areas; a table-pinned waiter only sees their tables; both
// gates apply when both are set. An entity with no table (takeaway order)
// has no area/table → nobody is "assigned" to it, so it stays visible to
// every waiter (mirrors the backend, which broadcasts takeaway order:new
// to the whole branch room). `entity.table.area` may arrive as a raw
// ObjectId string or a populated `{ _id }` object depending on the
// endpoint — normalise before comparing.
export function inWaiterScope(scope, entity) {
    const table = entity?.table;

    // ── Takeaway / counter orders (no table → no area) ──────────────────
    // Visible to: explicit takeaway handlers, supervisors, and true
    // catch-all staff (no pin of ANY kind). An area/table-pinned waiter
    // who is NOT a takeaway handler does NOT see takeaway — it's the
    // assigned counter person's job.
    if (!table) {
        if (scope.handlesTakeaway || scope.isSupervisor) return true;
        if (!scope.hasAreaScope && !scope.hasTableScope) return true; // legacy catch-all
        return false;
    }

    // ── Captain-assigned table ──────────────────────────────────────────
    // A captain can hand ANY table to a waiter (PUT /tables/:id/assign →
    // table.assignedWaiter). That assignment lives on the table, not in
    // the waiter's area/table pins, so without this an Indoor-pinned
    // waiter given an Outdoor table never saw its orders or requests —
    // the assignment silently did nothing.
    if (isAssignedToMe(scope, table)) return true;

    // ── Dine-in orders ──────────────────────────────────────────────────
    // No dine-in pin at all: a pure takeaway handler (handlesTakeaway with
    // no areas/tables) gets NO dine-in; a true catch-all gets everything.
    if (!scope.hasAreaScope && !scope.hasTableScope) {
        return !scope.handlesTakeaway;
    }
    const areaId = typeof table.area === 'object' ? table.area?._id : table.area;
    if (scope.hasAreaScope && !scope.assignedAreaIds.has(String(areaId || ''))) return false;
    if (scope.hasTableScope && !scope.assignedTableIds.has(String(table._id || ''))) return false;
    return true;
}

// Is this table explicitly assigned to the scoped user (table.assignedWaiter,
// raw id or populated { _id })?
export function isAssignedToMe(scope, table) {
    const aw = table?.assignedWaiter;
    if (!aw || !scope?.userId) return false;
    return String(aw?._id || aw) === scope.userId;
}
