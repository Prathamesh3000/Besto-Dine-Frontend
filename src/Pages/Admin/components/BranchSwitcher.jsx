import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, ChevronDown, Search, Check } from 'lucide-react';
import { useAdminBranch } from '../../../Context/AdminBranchContext';
import { useAuth } from '../../../Context/AuthContext';

/**
 * BranchSwitcher — header dropdown for selecting which branch to view.
 *
 * - Tenant owner (unpinned admin/manager): dropdown with each active
 *   branch — Main is included as a first-class option. Tenant owner
 *   defaults to Main on first load (set by AdminBranchContext) and runs
 *   the dashboard as Main's admin. There is intentionally NO
 *   "All Branches" / "Aggregated view" option — every screen always
 *   shows ONE branch's data so cross-branch leaks are impossible
 *   regardless of which page someone visits.
 * - Branch Admin (admin/manager with branch pin): static badge showing
 *   the locked branch name. No dropdown — JWT pin is authoritative.
 * - Hidden when the plan has no multiBranch feature or there are no
 *   branches.
 */
const BranchSwitcher = () => {
    const { hasFeature } = useAuth();
    const { branches, selectedBranchId, setSelectedBranchId, isLocked } = useAdminBranch();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef(null);
    const searchRef = useRef(null);

    // Don't show if multiBranch feature is not available
    if (!hasFeature('multiBranch')) return null;

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Focus search when dropdown opens
    useEffect(() => {
        if (open && searchRef.current) {
            searchRef.current.focus();
        }
    }, [open]);

    // Branch-pinned admin (FC Road, Baner, etc.) — hide the switcher
    // entirely. Per the user's "dropdown is Main-only" rule on
    // 2026-05-20: branch admins manage exactly ONE branch and don't
    // need any cross-branch affordance. The branch name is already
    // shown in the page title ("Hotel Tip Top — FC Road 2"), so a
    // separate locked badge in this slot would be redundant noise.
    if (isLocked) return null;

    // Tenant owner: show dropdown (only if branches exist)
    if (branches.length === 0) return null;

    const selectedBranch = branches.find(b => b._id === selectedBranchId);
    // No "All Branches" fallback — tenant owner is always viewing
    // exactly one branch. AdminBranchContext defaults to Main on first
    // load and persists the pick, so this label always has a value.
    const displayName = selectedBranch?.name || (branches[0]?.name || 'Branch');

    const filteredBranches = branches.filter(b =>
        !search.trim() || b.name?.toLowerCase().includes(search.toLowerCase())
    );

    const handleSelect = (branchId) => {
        setSelectedBranchId(branchId);
        setOpen(false);
        setSearch('');
        // Always land the user on the Dashboard after a branch switch
        // — the picker is a "show me this branch" action, not a way to
        // poke around the current tab with someone else's data. From
        // the Dashboard the user can navigate to any tab; every page
        // honors the new branch via the global axios interceptor.
        navigate('/admin/dashboard');
    };

    return (
        <div className="relative" ref={containerRef}>
            {/* Trigger button */}
            <button
                onClick={() => setOpen(!open)}
                className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-semibold transition-all cursor-pointer min-w-[130px] max-w-[200px] ${
                    open
                        ? 'bg-orange-50 border-[#FE8301]/30 text-[#FE8301] ring-2 ring-[#FE8301]/10'
                        : selectedBranchId
                            ? 'bg-orange-50 border-orange-200 text-[#FE8301] hover:bg-orange-100'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
            >
                <MapPin size={13} className="shrink-0" />
                <span className="truncate flex-1 text-left">{displayName}</span>
                <ChevronDown
                    size={13}
                    className={`shrink-0 text-current opacity-50 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {/* Dropdown */}
            {open && (
                <div className="absolute top-full left-0 mt-2 w-[240px] bg-white rounded-2xl shadow-[0px_4px_20px_0px_rgba(0,0,0,0.1)] border border-slate-100 z-50 overflow-hidden">
                    {/* Search (show only if 4+ branches) */}
                    {branches.length >= 4 && (
                        <div className="px-3 pt-3 pb-1">
                            <div className="relative">
                                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search branches…"
                                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-[#FE8301] focus:ring-1 focus:ring-[#FE8301]/20 transition placeholder:text-slate-300"
                                />
                            </div>
                        </div>
                    )}

                    <div className="max-h-[240px] overflow-y-auto py-1.5">
                        {/* Branch list — Main + every sub-branch.
                            No "All Branches" option by design: every
                            screen must always render exactly one
                            branch's data so cross-branch leaks become
                            structurally impossible. */}
                        {filteredBranches.length === 0 ? (
                            <div className="px-4 py-3 text-xs text-slate-400 text-center">
                                No branches match "{search}"
                            </div>
                        ) : (
                            filteredBranches.map(b => (
                                <button
                                    key={b._id}
                                    onClick={() => handleSelect(b._id)}
                                    className={`w-full text-left px-4 py-2.5 text-xs font-medium flex items-center gap-2.5 transition-colors ${
                                        selectedBranchId === b._id
                                            ? 'bg-[#FE8301] text-white'
                                            : 'text-slate-600 hover:bg-orange-50 hover:text-[#FE8301]'
                                    }`}
                                >
                                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                        selectedBranchId === b._id
                                            ? 'bg-white/20 text-white'
                                            : 'bg-orange-50 text-[#FE8301]'
                                    }`}>
                                        {b.name?.[0]?.toUpperCase() || 'B'}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="truncate">{b.name}</div>
                                        {b.city && (
                                            <div className={`text-[10px] truncate ${
                                                selectedBranchId === b._id ? 'text-white/60' : 'text-slate-400'
                                            }`}>
                                                {b.city}
                                            </div>
                                        )}
                                    </div>
                                    {selectedBranchId === b._id && <Check size={13} className="shrink-0" />}
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer with count */}
                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/50">
                        <span className="text-[10px] text-slate-400 font-medium">
                            {branches.length} branch{branches.length !== 1 ? 'es' : ''}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BranchSwitcher;
