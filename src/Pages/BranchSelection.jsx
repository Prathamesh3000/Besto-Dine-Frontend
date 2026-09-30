import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, useParams } from "react-router-dom";
import { ChevronLeft, MapPin, Phone, Search, Building2, X } from "lucide-react";
import { publicAPI } from "../utils/api";
import { getActiveTenant } from "../utils/tenant";
import { enterRestaurant, resolveBranchChoice } from "../utils/enterRestaurant";
const MapImage = "/map.jpg";

/**
 * BranchSelection — customer landing page where the visitor picks
 * which BestoDine restaurant they want to order from.
 *
 * Phase 1 SaaS: this is the moment we capture the active tenant slug
 * and persist it via setActiveTenant(). After this point every API
 * call from the customer's session carries `X-Restaurant-Slug` and the
 * backend returns scoped data.
 *
 * Single-tenant deployments (one Default Restaurant created by the
 * backfill) auto-select and skip the picker.
 *
 * Two modes, same component:
 *
 *  - GATE (default) — mounted at /branch-selection. ProtectedRoute
 *    bounces every slug-less customer here, so it must get out of the
 *    way fast: a lone tenant / lone branch auto-selects and the user
 *    never sees a picker.
 *
 *  - SWITCH (`switchMode`) — mounted at /switch-restaurant. The user
 *    came here *on purpose* to change restaurant, so the auto-skips
 *    are disabled (skipping would bounce them straight back to /home
 *    having chosen nothing) and a cancel path keeps their current pick.
 *
 *  - LINK — mounted at /r/:slug and /r/:slug/:branchSlug. A shareable
 *    restaurant link: resolves that one tenant by slug and never shows
 *    the platform-wide restaurant list. A branch slug in the link skips
 *    the branch picker; without one, the picker only appears when the
 *    tenant has 2+ active branches.
 *    NOTE: /r/... now redirects to the restaurant landing page
 *    (/:slug[/:branchSlug]), so App.jsx no longer mounts this mode; it is
 *    kept for any route that passes :slug params again.
 */

// clearTenantBoundSession() + the tenant/branch persistence now live in
// utils/enterRestaurant.js, shared with the restaurant landing page.

const BranchSelection = ({ switchMode = false }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { slug: linkSlug, branchSlug: linkBranchSlug } = useParams();
  const linkMode = Boolean(linkSlug);
  // Snapshot at mount — finalize() overwrites the active tenant, so
  // reading this later would compare a value against itself. Link mode
  // needs it too: the visitor may still hold another restaurant's cart.
  const [currentTenant] = useState(() => (switchMode || linkMode ? getActiveTenant() : null));
  const [selectedId, setSelectedId] = useState(null);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  // Phase 6 step 5 — intra-tenant branch picker
  const [tenantInProgress, setTenantInProgress] = useState(null);
  const [tenantBranches, setTenantBranches] = useState([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [branchSearch, setBranchSearch] = useState('');

  // Persist the picked tenant + (optional) branch and route the user onward
  const finalize = (restaurant, branch = null) => {
    // Moving to a different tenant wipes the old tenant's session state;
    // same-tenant re-picks (branch only) keep the cart. See enterRestaurant.
    enterRestaurant(restaurant, branch, currentTenant);

    // A switch lands on a clean home screen rather than resuming the
    // caller's page — "back where you came from" is the right answer for
    // the gate flow, but here that page (a cart, an order tracker) was
    // showing the *old* tenant's data and would read as broken.
    if (switchMode) {
      navigate('/home', { replace: true });
      return;
    }

    const bookingNext = location.state?.bookingNext;
    const nextParam = new URLSearchParams(location.search).get('next');
    // `from` is set by ProtectedRoute when it bounces a slug-less customer
    // here — send them back to where they were headed once a branch is set.
    const fromPath = location.state?.from;
    if (bookingNext) {
      navigate(bookingNext, { state: { bookingType: location.state?.bookingType } });
    } else if (nextParam && nextParam.startsWith('/')) {
      navigate(nextParam, { replace: true });
    } else if (fromPath && fromPath.startsWith('/') && fromPath !== '/branch-selection') {
      navigate(fromPath, { replace: true });
    } else {
      // Link mode replaces history so Back doesn't reopen the link and
      // bounce straight forward again.
      navigate("/home", { replace: linkMode });
    }
  };

  // After the customer picks a restaurant, see if it has multiple branches.
  // `preferredBranchSlug` comes from a /r/:slug/:branchSlug link — a match
  // skips the picker; an unknown or disabled one falls back to the rules below.
  const continueWith = (restaurant, preferredBranchSlug = null) => {
    // Clear the top-level "Finding restaurants" spinner — we're past
    // that phase. Without this, a tenant with 2+ branches is stuck
    // rendering the spinner instead of falling through to the branch
    // picker below, because the `loading` guard short-circuits first.
    setLoading(false);
    setBranchLoading(true);
    setTenantInProgress(restaurant);
    publicAPI.getRestaurantBranches(restaurant.slug)
      .then(res => {
        const list = res.data?.data || [];
        // Switching to a tenant that has exactly one branch still
        // auto-finalizes — there's no choice to present. Zero branches
        // likewise. Only the *tenant* auto-skip is unsafe in switch mode.
        const choice = resolveBranchChoice(list, preferredBranchSlug);
        if (!choice.needsPick) {
          finalize(restaurant, choice.branch);
        } else {
          setTenantBranches(list);
          setBranchLoading(false);
        }
      })
      .catch(() => {
        finalize(restaurant, null);
      });
  };

  // Load restaurants from the public endpoint — or, in link mode, only
  // the one restaurant the link names.
  useEffect(() => {
    let cancelled = false;
    if (linkMode) {
      publicAPI.getRestaurantBySlug(String(linkSlug).toLowerCase(), { _silent: true })
        .then(res => {
          if (cancelled) return;
          const restaurant = res.data?.data;
          if (!restaurant?.slug) throw new Error('Restaurant not found');
          continueWith(restaurant, linkBranchSlug || null);
        })
        .catch(() => {
          if (cancelled) return;
          setError('This link is invalid, or the restaurant is not taking orders right now.');
          setLoading(false);
        });
      return () => { cancelled = true; };
    }
    publicAPI.listRestaurants()
      .then(res => {
        if (cancelled) return;
        const list = res.data?.data || [];

        if (list.length === 0) {
          setError('No restaurants are available right now.');
          setLoading(false);
          return;
        }

        // Gate flow: a lone tenant means there is nothing to choose, so
        // skip straight through. Switch flow must NOT do this — the user
        // asked to change restaurant, and auto-finalizing would re-pick
        // what they already had and bounce them to /home having seen no
        // picker at all. Show the list and let them decide (or cancel).
        if (list.length === 1 && !switchMode) {
          continueWith(list[0]);
          return;
        }

        setRestaurants(list);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load restaurants. Please try again.');
        setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelect = (restaurant) => {
    setSelectedId(restaurant._id);
  };

  const handleGetStarted = () => {
    const restaurant = restaurants.find((r) => r._id === selectedId);
    if (restaurant) {
      continueWith(restaurant);
    }
  };

  // Phase 6 step 5 — branch picker actions
  const handleSelectBranch = (branchId) => setSelectedBranchId(branchId);
  const handleConfirmBranch = () => {
    const branch = tenantBranches.find(b => b._id === selectedBranchId);
    if (branch && tenantInProgress) {
      finalize(tenantInProgress, branch);
    }
  };
  const handleBackFromBranches = () => {
    setTenantInProgress(null);
    setTenantBranches([]);
    setSelectedBranchId(null);
    setBranchLoading(false);
    setBranchSearch('');
  };

  // Filtered lists
  const filteredRestaurants = restaurants.filter(r => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return r.name?.toLowerCase().includes(q) || r.city?.toLowerCase().includes(q);
  });

  const filteredBranches = tenantBranches.filter(b => {
    if (!branchSearch.trim()) return true;
    const q = branchSearch.toLowerCase();
    return b.name?.toLowerCase().includes(q) || b.city?.toLowerCase().includes(q) || b.addressLine1?.toLowerCase().includes(q);
  });

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 flex items-center justify-center">
            <div className="w-7 h-7 border-3 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-[#101828] text-[15px] font-semibold font-nunito">{linkMode ? 'Opening restaurant' : 'Finding restaurants'}</p>
            <p className="text-[#64748B] text-[13px] font-varela mt-0.5">Just a moment…</p>
          </div>
        </div>
      </div>
    );
  }

  // Error / empty state — only when we're NOT in the middle of the
  // single-tenant branch-picker flow. Single-tenant deployments never
  // populate `restaurants`, so the length-0 check would otherwise
  // short-circuit the branch picker render below.
  if ((error || restaurants.length === 0) && !tenantInProgress) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-4">
            <Building2 size={32} className="text-slate-300" />
          </div>
          <h2 className="text-[20px] font-semibold text-[#101828] font-nunito mb-2">
            {linkMode ? 'Restaurant Not Found' : 'No Restaurants Available'}
          </h2>
          <p className="text-[#64748B] text-[14px] font-varela mb-6 max-w-xs mx-auto">{error || 'Please try again later.'}</p>
          {/* A dead link opened fresh has no history to go back to —
              offer the restaurant list instead. */}
          <button
            onClick={() => (linkMode ? navigate('/branch-selection', { replace: true }) : navigate(-1))}
            className="bg-[#FE8301] text-white px-8 py-3 rounded-[16px] font-semibold text-[14px] font-nunito active:scale-[0.97] transition-all"
          >
            {linkMode ? 'Browse Restaurants' : 'Go Back'}
          </button>
        </div>
      </div>
    );
  }

  // Phase 6 step 5 — branch picker view
  if (tenantInProgress && (branchLoading || tenantBranches.length > 0)) {
    return (
      <div className="min-h-screen bg-[#FFFFFF] flex flex-col font-nunito relative overflow-hidden">
        <div className="w-full relative shrink-0 overflow-hidden bg-[#FFFFFF] aspect-[4/3.5] md:aspect-[21/9]">
          <img src={MapImage} alt="Location Map" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />
          <div className="absolute top-0 left-0 right-0 p-5 flex items-center gap-4">
            {/* Link mode has no restaurant list to return to — the link
                itself named the restaurant. */}
            {!linkMode && (
              <button
                onClick={handleBackFromBranches}
                className="p-2.5 bg-white/90 backdrop-blur-sm rounded-xl shadow-sm active:scale-90 transition-all text-[#666666]"
              >
                <ChevronLeft size={20} />
              </button>
            )}
            <div className="flex-1">
              <p className="text-white text-[13px] font-medium drop-shadow-sm">{tenantInProgress.name}</p>
            </div>
          </div>
        </div>

        <div className="flex-1 -mt-12 bg-white rounded-t-[36px] relative z-20 flex flex-col px-6 pt-8">
          <div className="mb-5 space-y-1">
            <h1 className="text-[18px] leading-[24px] font-semibold text-[#101828] font-nunito tracking-tight">
              Choose a Branch
            </h1>
            <p className="text-[#64748B] text-[14px] font-varela leading-[18px]">
              {tenantInProgress.name} has {tenantBranches.length} locations — pick the one you're ordering from.
            </p>
          </div>

          {/* Search (show if 3+ branches) */}
          {!branchLoading && tenantBranches.length >= 3 && (
            <div className="relative mb-4">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#C4C4C4]" />
              <input
                type="text"
                placeholder="Search by name or area…"
                value={branchSearch}
                onChange={e => setBranchSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#F9FAFB] border border-[#F2F4F7] rounded-2xl text-[14px] font-varela focus:outline-none focus:border-[#FE8301] focus:ring-2 focus:ring-[#FE8301]/10 transition-all placeholder:text-[#C4C4C4]"
              />
            </div>
          )}

          {branchLoading ? (
            <div className="flex-1 flex items-center justify-center py-10">
              <div className="w-8 h-8 border-3 border-[#FE8301] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredBranches.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10">
              <Search size={28} className="text-[#E5E7EB] mb-2" />
              <p className="text-[14px] text-[#9CA3AF] font-varela">No branches match your search</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-3 pb-32 scrollbar-hide">
              {filteredBranches.map((b) => (
                <button
                  key={b._id}
                  onClick={() => handleSelectBranch(b._id)}
                  className={`w-full text-left p-4 cursor-pointer rounded-2xl border-2 transition-all duration-200 relative ${
                    selectedBranchId === b._id
                      ? 'border-[#FE8301] bg-[#FFF8F0] shadow-sm shadow-orange-100'
                      : 'border-[#F2F4F7] bg-white hover:border-[#FDDCB5] hover:bg-[#FFFCF9]'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-[18px] font-bold transition-colors ${
                      selectedBranchId === b._id
                        ? 'bg-[#FE8301] text-white'
                        : 'bg-[#FFF9F2] text-[#FE8301]'
                    }`}>
                      {b.name?.[0]?.toUpperCase() || 'B'}
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Title = "<Brand> - <Location>". If the admin already
                          typed the brand inline, leave the name as-is to
                          avoid duplicate stacking. Wraps instead of
                          truncating so the customer can read the full
                          location identifier. */}
                      <h3 className="text-[16px] font-semibold text-[#101828] font-nunito leading-[22px] break-words">
                        {(() => {
                          const brand = String(tenantInProgress?.name || '').trim();
                          const name = String(b.name || '').trim();
                          if (!brand) return name;
                          if (name.toLowerCase().startsWith(brand.toLowerCase())) return name;
                          return `${brand} - ${name}`;
                        })()}
                      </h3>
                      {/* Full address — no truncate, wraps onto multiple
                          lines so customers can pick by proximity. */}
                      {(() => {
                          const parts = [b.addressLine1, b.addressLine2, b.city, b.state, b.postalCode]
                              .map(p => String(p || '').trim())
                              .filter(Boolean);
                          if (!parts.length) return null;
                          return (
                              <div className="flex items-start gap-1.5 mt-1">
                                  <MapPin size={12} className="text-[#C4C4C4] shrink-0 mt-[3px]" />
                                  <span className="text-[#645E66] text-[12px] leading-[16px] font-varela break-words">
                                      {parts.join(', ')}
                                  </span>
                              </div>
                          );
                      })()}
                      {b.contactPhone && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Phone size={11} className="text-[#C4C4C4] shrink-0" />
                          <span className="text-[#9CA3AF] text-[11px] font-varela">{b.contactPhone}</span>
                        </div>
                      )}
                    </div>
                    {/* Selection indicator */}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-all ${
                      selectedBranchId === b._id
                        ? 'border-[#FE8301] bg-[#FE8301]'
                        : 'border-[#D1D5DB] bg-white'
                    }`}>
                      {selectedBranchId === b._id && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm z-30 flex justify-center items-center max-w-[430px] min-[431px]:max-w-full md:max-w-[768px] mx-auto border-t border-[#F2F4F7]">
          <button
            onClick={handleConfirmBranch}
            disabled={!selectedBranchId}
            className="w-full bg-[#FE8301] text-white py-[16px] rounded-2xl font-semibold text-[14px] leading-[16px] active:scale-[0.98] transition-all disabled:opacity-40 disabled:grayscale shadow-lg shadow-orange-200/30"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFFFF] flex flex-col font-nunito relative overflow-hidden">
      {/* Map Background Area */}
      <div className="w-full relative shrink-0 overflow-hidden bg-[#FFFFFF] aspect-[4/3.5] md:aspect-[21/9]">
        <img
          src={MapImage}
          alt="Location Map"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-transparent" />

        {/* Header Navigation */}
        <div className="absolute top-0 left-0 right-0 p-5 flex items-center gap-4">
          {/* In switch mode this is a cancel, not a back — the user keeps
              whatever tenant they already had, since nothing is committed
              until finalize() runs. */}
          <button
            onClick={() => navigate(-1)}
            aria-label={switchMode ? 'Cancel and keep current restaurant' : 'Go back'}
            className="p-2.5 bg-white/90 backdrop-blur-sm rounded-xl shadow-sm active:scale-90 transition-all text-[#666666]"
          >
            {switchMode ? <X size={20} /> : <ChevronLeft size={20} />}
          </button>
        </div>
      </div>

      {/* Interactive Bottom Sheet */}
      <div className="flex-1 -mt-12 bg-white rounded-t-[36px] relative z-20 flex flex-col px-6 pt-8">
        {/* Title Section */}
        <div className="mb-5 space-y-1">
          <h1 className="text-[18px] leading-[24px] font-semibold text-[#101828] font-nunito tracking-tight">
            {switchMode ? 'Switch Restaurant' : 'Choose a Restaurant'}
          </h1>
          <p className="text-[#64748B] text-[14px] font-varela leading-[18px]">
            {switchMode
              ? (currentTenant?.name
                  ? `You're ordering from ${currentTenant.name}. Pick another to switch.`
                  : 'Pick where you\'d like to order from.')
              : "Pick where you'd like to order from today."}
          </p>
        </div>

        {/* Switching away empties the cart — say so before they commit,
            not with a toast afterwards. */}
        {switchMode && (
          <div className="mb-4 flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-[#FFF8F0] border border-[#FDDCB5]">
            <Building2 size={14} className="text-[#FE8301] shrink-0 mt-[2px]" />
            <p className="text-[#8A5A20] text-[12px] leading-[16px] font-varela">
              Switching to a different restaurant clears your current cart and any table session.
            </p>
          </div>
        )}

        {/* Search (show if 3+ restaurants) */}
        {restaurants.length >= 3 && (
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#C4C4C4]" />
            <input
              type="text"
              placeholder="Search restaurants…"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[#F9FAFB] border border-[#F2F4F7] rounded-2xl text-[14px] font-varela focus:outline-none focus:border-[#FE8301] focus:ring-2 focus:ring-[#FE8301]/10 transition-all placeholder:text-[#C4C4C4]"
            />
          </div>
        )}

        {/* Restaurant Cards List */}
        {filteredRestaurants.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-10">
            <Search size={28} className="text-[#E5E7EB] mb-2" />
            <p className="text-[14px] text-[#9CA3AF] font-varela">No restaurants match your search</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pb-32 scrollbar-hide">
            {filteredRestaurants.map((r) => (
              <button
                key={r._id}
                onClick={() => handleSelect(r)}
                className={`w-full text-left p-4 cursor-pointer rounded-2xl border-2 transition-all duration-200 relative ${
                  selectedId === r._id
                    ? "border-[#FE8301] bg-[#FFF8F0] shadow-sm shadow-orange-100"
                    : "border-[#F2F4F7] bg-white hover:border-[#FDDCB5] hover:bg-[#FFFCF9]"
                }`}
              >
                <div className="flex items-start gap-3.5">
                  {r.logo ? (
                    <img
                      src={r.logo}
                      alt={r.name}
                      className="w-12 h-12 rounded-xl object-cover border border-[#F2F4F7] shrink-0"
                    />
                  ) : (
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 text-[18px] font-bold transition-colors ${
                      selectedId === r._id
                        ? 'bg-[#FE8301] text-white'
                        : 'bg-[#FFF9F2] text-[#FE8301]'
                    }`}>
                      {r.name?.[0]?.toUpperCase() || 'R'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[16px] font-semibold text-[#101828] font-nunito leading-[22px] truncate">
                        {r.name}
                      </h3>
                      {switchMode && currentTenant?.slug === r.slug && (
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#FFF9F2] border border-[#FDDCB5] text-[#FE8301] text-[10px] font-semibold font-nunito">
                          Current
                        </span>
                      )}
                    </div>
                    {(r.city || r.phone) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {r.city && (
                          <>
                            <MapPin size={12} className="text-[#C4C4C4] shrink-0" />
                            <span className="text-[#645E66] text-[12px] font-varela">{r.city}</span>
                          </>
                        )}
                        {r.city && r.phone && <span className="text-[#E5E7EB] mx-0.5">·</span>}
                        {r.phone && (
                          <>
                            <Phone size={11} className="text-[#C4C4C4] shrink-0" />
                            <span className="text-[#9CA3AF] text-[11px] font-varela">{r.phone}</span>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Selection indicator */}
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-1 transition-all ${
                    selectedId === r._id
                      ? 'border-[#FE8301] bg-[#FE8301]'
                      : 'border-[#D1D5DB] bg-white'
                  }`}>
                    {selectedId === r._id && (
                      <div className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Sticky Bottom Actions */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-sm z-30 flex justify-center items-center max-w-[430px] min-[431px]:max-w-full md:max-w-[768px] mx-auto border-t border-[#F2F4F7]">
        <button
          onClick={handleGetStarted}
          disabled={!selectedId}
          className="w-full bg-[#FE8301] text-white py-[16px] rounded-2xl font-semibold text-[14px] leading-[16px] active:scale-[0.98] transition-all disabled:opacity-40 disabled:grayscale shadow-lg shadow-orange-200/30"
        >
          {switchMode
            ? (selectedId && currentTenant?._id === selectedId ? 'Stay Here' : 'Switch Restaurant')
            : "Let's Get Started"}
        </button>
      </div>
    </div>
  );
};

export default BranchSelection;
