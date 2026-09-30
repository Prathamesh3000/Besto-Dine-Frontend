import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import {
    ChefHat,
    Plus,
    Search,
    ArrowLeft,
    LogOut,
    Lock,
    CheckCircle2,
    CircleDashed,
    Pencil,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

import { useAuth } from '../../Context/AuthContext';
import api, { inventoryAPI } from '../../utils/api';
import RecipeModal from '../Admin/components/RecipeModal';

/**
 * ChefRecipes — recipe-building surface for chefs.
 *
 * Chefs know the dish; this lets them link a menu item to its inventory
 * ingredients (for auto-deduction + food cost) without exposing the rest
 * of the Admin inventory tools. Reuses RecipeModal verbatim so the two
 * surfaces never drift.
 *
 * UX intent: matches the Admin > Inventory > Recipes tab — a clean,
 * paginated table (no dish images) so it reads the same as the rest of
 * the back-office. A search box + status filter + coverage bar make it
 * easy for a chef to spot which dishes still need a recipe; dishes with
 * no recipe float to the top so the gaps are the first thing they see.
 *
 * Reachable from the KDS header only when the chef has the granular
 * `manageRecipe` permission. The backend enforces it too — this screen
 * just fails closed with a friendly message if the flag is missing.
 */

const PER_PAGE = 12;

const FILTERS = [
    { key: 'all',     label: 'All dishes' },
    { key: 'missing', label: 'Needs recipe' },
    { key: 'linked',  label: 'Recipe set' },
];

const ChefRecipes = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const canManage = user?.permissions?.manageRecipe === true;

    const [recipes, setRecipes] = useState([]);
    const [menuItems, setMenuItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recipeMenuItem, setRecipeMenuItem] = useState(null); // opens RecipeModal
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [page, setPage] = useState(1);

    const fetchRecipes = useCallback(async () => {
        setLoading(true);
        try {
            const [recipesRes, menuRes] = await Promise.all([
                inventoryAPI.getRecipes(),
                api.get('/menu', { params: { limit: 500 } }),
            ]);
            if (recipesRes.data.success) setRecipes(recipesRes.data.recipes || []);
            if (menuRes.data.success) setMenuItems(menuRes.data.data || []);
        } catch {
            toast.error('Failed to load recipes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (canManage) fetchRecipes();
        else setLoading(false);
    }, [canManage, fetchRecipes]);

    const handleLogout = () => {
        logout();
        navigate('/staff-login');
    };

    // ── Merge every menu item with its recipe (if any) ─────────────────
    const dishes = useMemo(() => {
        const byMenuId = new Map(recipes.map((r) => [r.menuItem?._id, r]));
        return menuItems.map((m) => ({ menuItem: m, recipe: byMenuId.get(m._id) || null }));
    }, [menuItems, recipes]);

    const linkedCount = useMemo(() => dishes.filter((d) => d.recipe).length, [dishes]);

    const filtered = useMemo(() => {
        const term = search.trim().toLowerCase();
        return dishes
            .filter((d) => {
                if (filter === 'linked') return !!d.recipe;
                if (filter === 'missing') return !d.recipe;
                return true;
            })
            .filter((d) => !term || d.menuItem.name.toLowerCase().includes(term))
            // Dishes without a recipe float to the top — that's the work
            // that still needs doing.
            .sort((a, b) => {
                if (!!a.recipe === !!b.recipe) return a.menuItem.name.localeCompare(b.menuItem.name);
                return a.recipe ? 1 : -1;
            });
    }, [dishes, search, filter]);

    useEffect(() => { setPage(1); }, [search, filter]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const pageSafe = Math.min(page, totalPages);
    const paged = filtered.slice((pageSafe - 1) * PER_PAGE, pageSafe * PER_PAGE);

    // ── Permission-blocked fallback ────────────────────────────────────
    if (!canManage) {
        return (
            <div className="min-h-screen bg-[#FAF5F0] font-manrope flex flex-col items-center justify-center p-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center mb-4 text-gray-400">
                    <Lock size={28} />
                </div>
                <h2 className="text-lg font-bold text-gray-900">Recipes not enabled</h2>
                <p className="text-sm text-[#7D7380] mt-1.5 max-w-sm">
                    Your account doesn&apos;t have recipe management turned on. Ask your manager to
                    enable the &quot;Manage Recipes&quot; permission.
                </p>
                <button
                    onClick={() => navigate('/chef/dashboard')}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#FE8301] text-white rounded-xl text-sm font-semibold hover:bg-orange-600 transition"
                >
                    <ArrowLeft size={16} />
                    Back to Kitchen
                </button>
            </div>
        );
    }

    const missingCount = dishes.length - linkedCount;
    const pct = dishes.length ? Math.round((linkedCount / dishes.length) * 100) : 0;

    return (
        <div className="min-h-screen bg-[#FAF5F0] text-gray-800 font-manrope">
            {/* ── Header ─────────────────────────────────────────── */}
            <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-[0px_2px_8px_0px_#00000014]">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-20 flex items-center gap-4">
                    <button
                        onClick={() => navigate('/chef/dashboard')}
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50 transition shrink-0"
                        title="Back to Kitchen Display"
                        aria-label="Back to Kitchen Display"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-linear-to-br from-[#FE8301] to-orange-600 text-white flex items-center justify-center shadow-[0_4px_16px_rgba(254,131,1,0.25)] shrink-0">
                        <ChefHat size={20} strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-base font-bold text-gray-900 tracking-tight leading-none">
                            Recipes
                        </h1>
                        <p className="text-[11px] text-[#7D7380] font-medium mt-1 truncate">
                            {user?.name || 'Chef'} · Link dishes to ingredients
                        </p>
                    </div>

                    <div className="flex-1" />

                    <button
                        type="button"
                        onClick={handleLogout}
                        className="h-11 px-3 sm:px-4 bg-white hover:bg-red-50 text-gray-700 hover:text-red-600 rounded-xl font-semibold text-sm flex items-center gap-2 border border-gray-200 hover:border-red-200 transition"
                        title="Sign out"
                    >
                        <LogOut size={15} />
                        <span className="hidden sm:inline">Sign out</span>
                    </button>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {/* ── Coverage banner ─────────────────────────────── */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-[0px_2px_8px_0px_#00000010] p-5 sm:p-6 mb-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg font-bold text-gray-900">Recipe coverage</h2>
                            <p className="text-sm text-[#7D7380] mt-0.5">
                                <span className="font-semibold text-gray-700">{linkedCount}</span> of{' '}
                                <span className="font-semibold text-gray-700">{dishes.length}</span> dishes have a recipe.
                                {missingCount > 0 && (
                                    <span className="text-amber-600 font-semibold"> {missingCount} still need one.</span>
                                )}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <StatPill icon={<CheckCircle2 size={16} />} value={linkedCount} label="Recipe set" tone="emerald" />
                            <StatPill icon={<CircleDashed size={16} />} value={missingCount} label="Needs recipe" tone="amber" />
                        </div>
                    </div>
                    <div className="mt-4 h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-linear-to-r from-[#FE8301] to-emerald-500 transition-all"
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>

                {/* ── Search + filter toolbar ─────────────────────── */}
                <div className="flex flex-col sm:flex-row gap-3 mb-5">
                    <div className="relative flex-1">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7D7380]" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search dishes by name…"
                            className="w-full h-12 bg-white border border-gray-200 hover:border-gray-300 focus:border-[#FE8301] rounded-xl pl-10 pr-3 text-sm font-medium text-gray-800 placeholder:text-[#7D7380] focus:outline-none focus:ring-2 focus:ring-[#FE8301]/20 transition shadow-[0px_1px_3px_0px_#0000000F]"
                        />
                    </div>
                    <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 shadow-[0px_1px_3px_0px_#0000000F]">
                        {FILTERS.map((f) => {
                            const active = filter === f.key;
                            const count = f.key === 'all' ? dishes.length : f.key === 'linked' ? linkedCount : missingCount;
                            return (
                                <button
                                    key={f.key}
                                    type="button"
                                    onClick={() => setFilter(f.key)}
                                    aria-pressed={active}
                                    className={`h-10 px-3 sm:px-4 rounded-lg text-xs font-bold tracking-wide inline-flex items-center gap-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FE8301] ${
                                        active
                                            ? 'bg-[#FE8301] text-white shadow-sm'
                                            : 'text-[#7D7380] hover:text-[#FE8301] hover:bg-orange-50'
                                    }`}
                                >
                                    {f.label}
                                    <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-black flex items-center justify-center tabular-nums ${
                                        active ? 'bg-white/25 text-white' : 'bg-gray-100 text-[#7D7380]'
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Table ───────────────────────────────────────── */}
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-gray-200 py-20 text-center">
                        <ChefHat size={40} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-[15px] font-semibold text-gray-500">
                            {search.trim() ? 'No dishes match your search' : 'No dishes found'}
                        </p>
                        <p className="text-[13px] text-gray-400 mt-1">
                            {search.trim() ? 'Try a different name.' : 'Menu items will appear here once added.'}
                        </p>
                    </div>
                ) : (
                    <>
                        {/* Mobile (< md): stacked cards — a table would force
                            horizontal scrolling on a phone. */}
                        <div className="md:hidden space-y-3">
                            {paged.map((d) => (
                                <RecipeMobileCard key={d.menuItem._id} dish={d} onOpen={() => setRecipeMenuItem(d.menuItem)} />
                            ))}
                            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                <TablePager page={pageSafe} totalPages={totalPages} totalItems={filtered.length} perPage={PER_PAGE} onChange={setPage} />
                            </div>
                        </div>

                        {/* md+ : data table */}
                        <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-[#F8F9FA] text-xs text-gray-500 font-semibold border-b border-gray-200">
                                        <tr>
                                            <th className="px-5 py-3 w-12">Sr.</th>
                                            <th className="px-5 py-3">Menu Item</th>
                                            <th className="px-5 py-3">Ingredients</th>
                                            <th className="px-5 py-3 text-center w-20">Yield</th>
                                            <th className="px-5 py-3 text-center w-32">Status</th>
                                            <th className="px-5 py-3 text-center w-36">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm text-gray-700">
                                        {paged.map((d, idx) => {
                                            const m = d.menuItem;
                                            const r = d.recipe;
                                            const hasRecipe = !!r;
                                            const ingredients = r?.ingredients || [];
                                            return (
                                                <tr key={m._id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                                                    <td className="px-5 py-3.5 text-gray-400 font-medium">
                                                        {(pageSafe - 1) * PER_PAGE + idx + 1}
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        <p className="font-semibold text-gray-800">{m.name}</p>
                                                        <p className="text-[11px] text-gray-400">₹{m.finalPrice || m.basePrice || 0}</p>
                                                    </td>
                                                    <td className="px-5 py-3.5">
                                                        {hasRecipe ? (
                                                            <div className="flex flex-wrap gap-1">
                                                                {ingredients.slice(0, 4).map((ing, i) => (
                                                                    <span key={i} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                                                        {ing.inventoryItem?.name || '?'}
                                                                    </span>
                                                                ))}
                                                                {ingredients.length > 4 && (
                                                                    <span className="text-[11px] text-gray-400">+{ingredients.length - 4} more</span>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-[12px] text-amber-600 font-medium">Not linked yet</span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-center text-gray-500">{hasRecipe ? r.yield : '—'}</td>
                                                    <td className="px-5 py-3.5 text-center">
                                                        {hasRecipe ? (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
                                                                <CheckCircle2 size={12} /> Recipe set
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">
                                                                <CircleDashed size={12} /> Needs recipe
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-3.5 text-center">
                                                        <button
                                                            onClick={() => setRecipeMenuItem(m)}
                                                            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                                                                hasRecipe
                                                                    ? 'bg-[#FE8301]/10 text-[#FE8301] hover:bg-[#FE8301]/20'
                                                                    : 'bg-[#FE8301] text-white hover:bg-orange-600'
                                                            }`}
                                                        >
                                                            {hasRecipe ? <Pencil size={13} /> : <Plus size={14} />}
                                                            {hasRecipe ? 'Edit recipe' : 'Add recipe'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <TablePager
                                page={pageSafe}
                                totalPages={totalPages}
                                totalItems={filtered.length}
                                perPage={PER_PAGE}
                                onChange={setPage}
                            />
                        </div>
                    </>
                )}
            </main>

            {recipeMenuItem && (
                <RecipeModal
                    menuItem={recipeMenuItem}
                    onClose={() => setRecipeMenuItem(null)}
                    onSaved={() => fetchRecipes()}
                />
            )}
        </div>
    );
};

// ─── Recipe mobile card (< md) ──────────────────────────────────────
const RecipeMobileCard = ({ dish, onOpen }) => {
    const { menuItem: m, recipe: r } = dish;
    const hasRecipe = !!r;
    const ingredients = r?.ingredients || [];
    return (
        <div className={`rounded-2xl bg-white border p-4 shadow-[0px_2px_8px_0px_#00000010] ${hasRecipe ? 'border-gray-200' : 'border-amber-200'}`}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="font-bold text-gray-900 leading-snug truncate">{m.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                        ₹{m.finalPrice || m.basePrice || 0}
                        {hasRecipe && ` · ${ingredients.length} ingredient${ingredients.length === 1 ? '' : 's'} · yield ${r.yield}`}
                    </p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    hasRecipe ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                }`}>
                    {hasRecipe ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}
                    {hasRecipe ? 'Set' : 'Needed'}
                </span>
            </div>

            <div className="mt-3 mb-3 min-h-5">
                {hasRecipe ? (
                    <div className="flex flex-wrap gap-1">
                        {ingredients.slice(0, 4).map((ing, i) => (
                            <span key={i} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                {ing.inventoryItem?.name || '?'}
                            </span>
                        ))}
                        {ingredients.length > 4 && (
                            <span className="text-[11px] text-gray-400 px-1">+{ingredients.length - 4}</span>
                        )}
                    </div>
                ) : (
                    <p className="text-[12px] text-amber-600 font-medium">Not linked to ingredients yet.</p>
                )}
            </div>

            <button
                onClick={onOpen}
                className={`w-full inline-flex items-center justify-center gap-1.5 h-10 rounded-xl text-sm font-bold transition ${
                    hasRecipe
                        ? 'bg-[#FE8301]/10 text-[#FE8301] hover:bg-[#FE8301]/20'
                        : 'bg-[#FE8301] text-white hover:bg-orange-600'
                }`}
            >
                {hasRecipe ? <Pencil size={14} /> : <Plus size={15} />}
                {hasRecipe ? 'Edit recipe' : 'Add recipe'}
            </button>
        </div>
    );
};

// ─── Stat pill (header summary) ──────────────────────────────────────
const StatPill = ({ icon, value, label, tone }) => {
    const tones = {
        emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
        amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    };
    return (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ring-1 ${tones[tone]}`}>
            {icon}
            <div className="leading-none">
                <div className="text-base font-black tabular-nums">{value}</div>
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-80 mt-0.5">{label}</div>
            </div>
        </div>
    );
};

// ─── Numbered pager (Prev · 1 … 5 [6] 7 … 20 · Next) ─────────────────
// Mirrors the Admin > Inventory pager so back-office pagination reads the
// same everywhere.
const buildPageList = (current, total) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
    if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    return [1, '…', current - 1, current, current + 1, '…', total];
};

const TablePager = ({ page, totalPages, totalItems, perPage, onChange }) => {
    if (totalItems === 0) return null;
    const from = (page - 1) * perPage + 1;
    const to = Math.min(totalItems, page * perPage);
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Showing {from}–{to} of {totalItems}</span>
            {totalPages > 1 && (
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => onChange(Math.max(1, page - 1))}
                        disabled={page === 1}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        aria-label="Previous page"
                    >
                        <ChevronLeft size={16} />
                    </button>
                    {buildPageList(page, totalPages).map((p, i) => (
                        p === '…' ? (
                            <span key={`e${i}`} className="px-2 text-xs text-gray-400 select-none">…</span>
                        ) : (
                            <button
                                key={p}
                                onClick={() => onChange(p)}
                                aria-current={p === page ? 'page' : undefined}
                                className={`min-w-8 h-8 px-2 rounded-lg text-xs font-semibold transition ${
                                    p === page ? 'bg-[#FE8301] text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                            >
                                {p}
                            </button>
                        )
                    ))}
                    <button
                        onClick={() => onChange(Math.min(totalPages, page + 1))}
                        disabled={page >= totalPages}
                        className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        aria-label="Next page"
                    >
                        <ChevronRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default ChefRecipes;
