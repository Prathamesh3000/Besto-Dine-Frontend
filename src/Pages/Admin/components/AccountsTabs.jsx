import React from 'react'
import { NavLink } from 'react-router-dom'

const TABS = [
    { to: '/admin/accounts/cash-closing', label: 'Cash Closing' },
    { to: '/admin/accounts/supplier-invoices', label: 'Supplier Bills' },
    { to: '/admin/accounts/ledger', label: 'Ledger & P&L' },
]

export default function AccountsTabs() {
    return (
        <nav className="flex gap-2 mb-5 border-b border-gray-200" aria-label="Accounts sections">
            {TABS.map(t => (
                <NavLink
                    key={t.to}
                    to={t.to}
                    className={({ isActive }) =>
                        `px-4 py-2 text-[14px] font-semibold -mb-px border-b-2 ${isActive ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                >
                    {t.label}
                </NavLink>
            ))}
        </nav>
    )
}
