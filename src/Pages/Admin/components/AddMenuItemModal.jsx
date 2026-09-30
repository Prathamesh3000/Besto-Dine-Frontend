import React, { useState, useEffect, useRef } from 'react'
import { X, Upload, Plus, Calendar, Clock, Edit2, Trash2, ChevronDown, Store, ChefHat, Search, AlertTriangle, Check } from 'lucide-react'
import api, { inventoryAPI } from '../../../utils/api'
import toast from 'react-hot-toast'
import { useMenu } from '../../../Context/MenuContext'
import { resolveImageUrl } from '../../../utils/image'
import BranchPricesModal from './BranchPricesModal'

// Recipe section — units accepted by the Recipe schema. Mirrors
// Backend/models/recipe.js. Kept in sync with RecipeModal so a recipe
// edited from either place can round-trip cleanly.
const RECIPE_UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'dozen', 'box', 'pack', 'bottle', 'can']

// Mirror of Backend UNIT_CONVERSIONS for the in-modal unit-mismatch
// warning. Don't expand without also updating the backend list.
const UNIT_CONVERSIONS = { kg_g: 1000, g_kg: 0.001, L_mL: 1000, mL_L: 0.001 }

// Health-Tag catalog rendered in the multi-select panel. Grouped so
// admins can scan by intent (macro profile / diet type / etc.) instead
// of an alphabet soup. Adding a new tag is a one-line append here —
// values are saved verbatim to MenuItem.healthTags so they need to
// stay stable across releases.
const HEALTH_TAG_GROUPS = [
    {
        label: 'Macronutrient Profile',
        tags: ['Low Calorie', 'High Protein', 'Low Carb', 'Low Fat', 'High Fibre', 'Low Sodium', 'Sugar Free', 'Low GI'],
    },
    {
        label: 'Diet Type',
        tags: ['Vegan', 'Plant Based', 'Gluten Free', 'Dairy Free', 'Keto Friendly', 'Diabetic Friendly', 'Jain Food', 'Sattvik'],
    },
    {
        label: 'Functional Benefit',
        tags: ['Heart Healthy', 'Antioxidant Rich', 'Probiotic', 'Detox', 'Immunity Booster', 'Hydrating', 'Whole Grain', 'Post Workout'],
    },
    {
        label: 'Nutrient Highlights',
        tags: ['Iron Rich', 'Calcium Rich', 'Vitamin C Rich', 'Omega-3 Rich'],
    },
    {
        label: 'Audience',
        tags: ['Kids Friendly', 'Senior Friendly', 'Pregnancy Safe'],
    },
]
const convertRecipeUnits = (qty, from, to) => {
    if (from === to) return qty
    const mult = UNIT_CONVERSIONS[`${from}_${to}`]
    return mult ? qty * mult : null
}

const AddMenuItemModal = ({ onClose, editItem, onRefresh }) => {
    const { categories: contextCategories, fetchCategories: refreshCategories } = useMenu()
    const [isLoading, setIsLoading] = useState(false)
    const [isUploading, setIsUploading] = useState(false)
    const [showBranchPrices, setShowBranchPrices] = useState(false)
    const fileInputRef = useRef(null)

    // ── Size input state (replaces document.getElementById) ──────────────────
    const [newSizeName, setNewSizeName] = useState('')
    const [newSizePrice, setNewSizePrice] = useState('')
    const [newSizeQty, setNewSizeQty] = useState('')

    // ── Topping input state (replaces document.getElementById) ───────────────
    const [newToppingName, setNewToppingName] = useState('')
    const [newToppingType, setNewToppingType] = useState('veg')
    const [newToppingPrice, setNewToppingPrice] = useState('')

    const [formData, setFormData] = useState({
        name: editItem?.name || '',
        category: editItem?.category?._id || editItem?.category || '',
        // Phase 6 step 3 — optional branch assignment. '' means
        // tenant-level (shared across all branches, the default).
        // Only shown in the UI when the tenant actually has branches.
        branch: editItem?.branch?._id || editItem?.branch || '',
        description: editItem?.description || '',
        cookingTime: editItem?.cookingTime || '12-15min',
        // Numeric prep estimate used by the takeaway chef queue to
        // decide when a scheduled order flips to "Prepare Now".
        // Defaults to 15 — same as the schema default — so unedited
        // items still get reasonable queue math.
        prepTimeMinutes: editItem?.prepTimeMinutes != null ? editItem.prepTimeMinutes : 15,
        serveUpto: editItem?.serveUpto || '2-3 person',
        basePrice: editItem?.basePrice || '',
        offerPercentage: editItem?.offerPercentage || 0,
        offerExpiryDate: editItem?.offerExpiryDate ? new Date(editItem.offerExpiryDate).toISOString().split('T')[0] : '',
        startTime: editItem?.startTime || '',
        endTime: editItem?.endTime || '',
        isHealthy: editItem?.isHealthy ?? true,
        healthLevel: editItem?.healthLevel || '',
        vegType: editItem?.vegType || 'veg',
        prepStation: editItem?.prepStation || 'kitchen',
        unit: editItem?.unit || 'pieces',
        isFeatured: editItem?.isFeatured || false,
        healthTags: editItem?.healthTags || [],
        images: editItem?.images || [],
        nutritionalInfo: {
            calories: editItem?.nutritionalInfo?.calories || 0,
            protein: editItem?.nutritionalInfo?.protein || 0,
            fat: editItem?.nutritionalInfo?.fat || 0,
            carbs: editItem?.nutritionalInfo?.carbs || 0,
            fibre: editItem?.nutritionalInfo?.fibre || 0,
            iron: editItem?.nutritionalInfo?.iron || 0
        }
    })

    const [selectedDays, setSelectedDays] = useState(editItem?.availableDays || ['Mon', 'Tue', 'Sat', 'Sun'])
    const [ingredients, setIngredients] = useState(editItem?.ingredients || [])
    const [newIngredient, setNewIngredient] = useState('')
    const [sizes, setSizes] = useState(editItem?.sizes || [])
    const [toppings, setToppings] = useState(editItem?.toppings || [])
    const [healthyIngredients, setHealthyIngredients] = useState(editItem?.healthyIngredients || [])
    const [newHealthyIngredient, setNewHealthyIngredient] = useState('')

    // Health Tags multi-select panel — replaces the old single-pick
    // dropdown so users can tick several tags at once. Click-outside
    // closes it; the panel is internally scrollable so a long list
    // doesn't push the modal layout.
    const [healthTagsOpen, setHealthTagsOpen] = useState(false)
    const healthTagsRef = useRef(null)

    useEffect(() => {
        if (!healthTagsOpen) return
        const handleClickOutside = (e) => {
            if (healthTagsRef.current && !healthTagsRef.current.contains(e.target)) {
                setHealthTagsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [healthTagsOpen])

    // ── Recipe (optional) — links the menu item to inventory ingredients
    // so that auto-deduction kicks in on "Start Preparing". Hidden behind
    // a collapsed accordion so the modal stays compact for users who
    // don't track inventory; expand it to set up the recipe inline.
    const [recipeOpen, setRecipeOpen] = useState(false)
    const [recipeIngredients, setRecipeIngredients] = useState([])
    const [recipeYield, setRecipeYield] = useState(1)
    const [recipeNotes, setRecipeNotes] = useState('')
    const [recipeInvList, setRecipeInvList] = useState([])
    const [recipeSearchTerm, setRecipeSearchTerm] = useState('')
    const [recipeLoading, setRecipeLoading] = useState(false)
    // Tracks whether a recipe already exists on the server for this menu
    // item — drives whether we POST/UPDATE or DELETE on save.
    const [recipeExists, setRecipeExists] = useState(false)

    // Load inventory list + existing recipe (if editing).
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            setRecipeLoading(true)
            try {
                const reqs = [inventoryAPI.getAll({ limit: 500 })]
                if (editItem?._id) reqs.push(inventoryAPI.getRecipe(editItem._id))
                const results = await Promise.allSettled(reqs)

                if (!cancelled && results[0]?.status === 'fulfilled' && results[0].value.data?.success) {
                    setRecipeInvList(results[0].value.data.items || [])
                }

                if (!cancelled && results[1]?.status === 'fulfilled' && results[1].value.data?.success) {
                    const r = results[1].value.data.recipe
                    setRecipeExists(true)
                    setRecipeOpen(true) // auto-expand if a recipe exists, so the user can see it
                    setRecipeYield(r.yield || 1)
                    setRecipeNotes(r.notes || '')
                    setRecipeIngredients((r.ingredients || []).map(ing => ({
                        inventoryItem: ing.inventoryItem?._id || ing.inventoryItem,
                        name: ing.inventoryItem?.name || '',
                        quantity: ing.quantity,
                        unit: ing.unit,
                        costPerUnit: ing.inventoryItem?.costPerUnit || 0,
                        currentStock: ing.inventoryItem?.currentStock || 0,
                        invUnit: ing.inventoryItem?.unit || ing.unit,
                    })))
                }
            } finally {
                if (!cancelled) setRecipeLoading(false)
            }
        })()
        return () => { cancelled = true }
    }, [editItem?._id])

    // Recipe ingredient helpers (mirror RecipeModal so the two stay in
    // sync; if you edit one, edit the other too).
    const addRecipeIngredient = (item) => {
        if (recipeIngredients.some(i => i.inventoryItem === item._id)) {
            toast.error('This ingredient is already in the recipe')
            return
        }
        setRecipeIngredients(prev => [...prev, {
            inventoryItem: item._id,
            name: item.name,
            quantity: 0,
            unit: item.unit,
            costPerUnit: item.costPerUnit,
            currentStock: item.currentStock,
            invUnit: item.unit,
        }])
        setRecipeSearchTerm('')
    }

    const updateRecipeIngredient = (idx, field, value) => {
        setRecipeIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing))
    }

    const removeRecipeIngredient = (idx) => {
        setRecipeIngredients(prev => prev.filter((_, i) => i !== idx))
    }

    // Live unit-mismatch detection — surfaces a warning if the recipe's
    // unit can't be converted to the inventory's unit (e.g. recipe in
    // pcs, inventory in kg). Auto-deduction would skip such ingredients.
    const recipeUnitMismatches = recipeIngredients
        .filter(ing => ing.quantity > 0 && convertRecipeUnits(ing.quantity, ing.unit, ing.invUnit) === null)
        .map(ing => ing.name)

    const filteredRecipeInv = recipeSearchTerm.trim()
        ? recipeInvList.filter(i =>
            i.name?.toLowerCase().includes(recipeSearchTerm.toLowerCase()) ||
            i.itemId?.toLowerCase().includes(recipeSearchTerm.toLowerCase())
        )
        : []

    // Phase 6 step 3 — fetch branches. _silent so FEATURE_LOCKED on
    // tenants without the multiBranch feature doesn't flash a toast;
    // empty result just hides the picker.
    const [branchOptions, setBranchOptions] = useState([])
    useEffect(() => {
        let cancelled = false
        ;(async () => {
            try {
                const { default: api } = await import('../../../utils/api')
                const res = await api.get('/branches', { _silent: true })
                if (!cancelled) setBranchOptions(res.data?.data || [])
            } catch {
                if (!cancelled) setBranchOptions([])
            }
        })()
        return () => { cancelled = true }
    }, [])

    // Use categories from context instead of separate fetch
    useEffect(() => {
        if (contextCategories.length === 0) {
            refreshCategories()
        }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Set first category as default if creating new item
    useEffect(() => {
        if (!editItem && contextCategories.length > 0 && !formData.category) {
            setFormData(prev => ({ ...prev, category: contextCategories[0]._id }));
        }
    }, [contextCategories, editItem, formData.category]);

    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    // Per-field validation errors. Renders inline below each input —
    // replaces the old toast-on-validation pattern. Keys match field
    // names (so we can look up the input via document.getElementById).
    const [errors, setErrors] = useState({});

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        const val = type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? 0 : Number(value)) : value);

        if (name.includes('.')) {
            const [parent, child] = name.split('.');
            setFormData(prev => ({
                ...prev,
                [parent]: { ...prev[parent], [child]: val }
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                [name]: val
            }));
        }
        // Clear this field's error the moment the user edits it.
        // Without this, the red border lingers until the next save attempt.
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: undefined }));
    };

    // Render the inline error message under a field. Returns null if no error.
    const FieldError = ({ name }) =>
        errors[name] ? (
            <p
                id={`${name}-err`}
                role="alert"
                className="text-xs text-red-600 mt-1.5 flex items-center gap-1 font-manrope"
            >
                <span aria-hidden="true">⚠</span>{errors[name]}
            </p>
        ) : null;

    const handleImageUpload = async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Check if adding these would exceed limit (5 images)
        if (formData.images.length + files.length > 5) {
            toast.error('Maximum 5 images allowed');
            return;
        }

        // Validate file types and sizes before uploading
        const validFiles = files.filter(file => {
            if (!file.type.startsWith('image/')) {
                toast.error(`"${file.name}" is not a valid image file`);
                return false;
            }
            if (file.size > 5 * 1024 * 1024) {
                toast.error(`"${file.name}" is too large (max 5MB)`);
                return false;
            }
            return true;
        });

        if (validFiles.length === 0) return;

        setIsUploading(true);
        try {
            // Upload in parallel for performance
            const uploadPromises = validFiles.map(file => {
                const uploadFormData = new FormData();
                uploadFormData.append('image', file);
                return api.post('/upload', uploadFormData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
            });

            const results = await Promise.all(uploadPromises);
            const uploadedUrls = results
                .filter(res => res.data.success)
                // /upload returns absolute Cloudinary URLs — resolve (don't
                // blindly prepend the host, which corrupts the URL).
                .map(res => resolveImageUrl(res.data.url) || res.data.url);

            setFormData(prev => ({
                ...prev,
                images: [...prev.images, ...uploadedUrls]
            }));
        } catch (error) {
            console.error('Error uploading images:', error);
            toast.error('Failed to upload one or more images');
        } finally {
            setIsUploading(false);
            // Reset the file input so re-selecting the same file works
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const removeImage = (indexToRemove) => {
        setFormData(prev => ({
            ...prev,
            images: prev.images.filter((_, index) => index !== indexToRemove)
        }));
    };

    const handleSave = async (status = 'active') => {
        // Validate every required field up-front so the user sees ALL
        // problems at once (instead of one-toast-at-a-time). Errors land
        // inline below each field; the first invalid one gets focused.
        const errs = {};
        if (!formData.name.trim())                                  errs.name        = 'Item name is required';
        if (!formData.category)                                     errs.category    = 'Please select a category';
        if (!formData.description || !formData.description.trim())  errs.description = 'Description is required';
        const parsedPrice = Number(formData.basePrice);
        if (!formData.basePrice || isNaN(parsedPrice) || parsedPrice <= 0)
            errs.basePrice = 'Base price must be greater than 0';

        setErrors(errs);
        if (Object.keys(errs).length) {
            const firstInvalid = ['name', 'category', 'description', 'basePrice']
                .find(k => errs[k]);
            if (firstInvalid) {
                setTimeout(() => {
                    const el = document.getElementById(firstInvalid);
                    if (el) {
                        try { el.focus({ preventScroll: true }); } catch { /* noop */ }
                        el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
                    }
                }, 0);
            }
            return;
        }

        try {
            setIsLoading(true);
            const dataToSubmit = {
                ...formData,
                basePrice: Number(formData.basePrice) || 0,
                offerPercentage: Number(formData.offerPercentage) || 0,
                prepTimeMinutes: Math.max(0, Math.min(240, Number(formData.prepTimeMinutes) || 15)),
                availableDays: selectedDays,
                ingredients: ingredients || [],
                sizes: (sizes || []).map(s => ({ ...s, price: Number(s.price) || 0 })),
                toppings: (toppings || []).map(t => ({ ...t, price: Number(t.price) || 0 })),
                healthyIngredients: healthyIngredients || [],
                status
            };

            // Capture the saved doc so we can attach a recipe to a brand
            // new item right after creation (the recipe save needs the
            // menu item's _id, which the POST response carries).
            let savedMenuItemId = editItem?._id || null;
            if (editItem?._id) {
                await api.put(`/menu/${editItem._id}`, dataToSubmit);
            } else {
                const createRes = await api.post('/menu', dataToSubmit);
                savedMenuItemId =
                    createRes.data?.menuItem?._id ||
                    createRes.data?.data?._id ||
                    createRes.data?._id ||
                    null;
            }

            // ── Recipe save (optional, best-effort) ──────────────────
            // Three cases handled:
            //   1. Ingredients added + valid → POST /inventory/recipes
            //      (the upsert endpoint creates or replaces).
            //   2. Existing recipe and the user cleared all ingredients
            //      → DELETE /inventory/recipes/:menuItemId, matches the
            //      "remove recipe" intent. Without this the modal would
            //      look empty but auto-deduction would still fire.
            //   3. No ingredients and no existing recipe → no-op.
            //
            // A recipe failure does NOT roll back the menu item save —
            // we toast the user and let them fix it from the Recipes tab
            // rather than confusing them by silently undoing the item.
            if (savedMenuItemId) {
                try {
                    if (recipeIngredients.length > 0) {
                        const invalidQty = recipeIngredients.find(i => !i.quantity || i.quantity <= 0);
                        if (invalidQty) {
                            toast.error(`Menu item saved. Recipe skipped: enter a valid quantity for ${invalidQty.name}.`);
                        } else if (recipeUnitMismatches.length > 0) {
                            toast.error(`Menu item saved. Recipe skipped: unit mismatch on ${recipeUnitMismatches[0]}.`);
                        } else {
                            await inventoryAPI.saveRecipe({
                                menuItemId: savedMenuItemId,
                                ingredients: recipeIngredients.map(i => ({
                                    inventoryItem: i.inventoryItem,
                                    quantity: Number(i.quantity),
                                    unit: i.unit,
                                })),
                                yield: Number(recipeYield) || 1,
                                notes: recipeNotes,
                            });
                        }
                    } else if (recipeExists) {
                        await inventoryAPI.deleteRecipe(savedMenuItemId);
                    }
                } catch (recErr) {
                    console.error('Recipe save failed:', recErr);
                    toast.error(recErr.response?.data?.message || 'Menu item saved, but recipe failed. Try again from the Recipes tab.');
                }
            }

            toast.success(`Menu item ${editItem ? 'updated' : 'created'} successfully!`);
            onRefresh?.();
            onClose();
        } catch (error) {
            console.error('Error saving menu item:', error);
            toast.error(error.response?.data?.message || 'Failed to save menu item');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        if (!editItem?._id) return;

        if (window.confirm('Are you sure you want to delete this item? This action cannot be undone.')) {
            try {
                setIsLoading(true);
                const response = await api.delete(`/menu/${editItem._id}`);
                if (response.data.success || response.status === 200) {
                    toast.success('Menu item deleted successfully!');
                    // The server auto-archives combos that bundled this
                    // item so they don't keep selling a missing component.
                    // Surface which bundles were pulled.
                    const disabledCombos = response.data?.disabledCombos || [];
                    if (disabledCombos.length > 0) {
                        toast(
                            `${disabledCombos.length} combo${disabledCombos.length > 1 ? 's were' : ' was'} also disabled — they used this item: ${disabledCombos.map(c => c.name).join(', ')}`,
                            { icon: '⚠️', duration: 8000 }
                        );
                    }
                    onRefresh?.();
                    onClose();
                }
            } catch (error) {
                console.error('Error deleting menu item:', error);
                toast.error(error.response?.data?.message || 'Failed to delete menu item');
            } finally {
                setIsLoading(false);
            }
        }
    };

    // ── Size helpers ─────────────────────────────────────────────────────────
    const addSize = () => {
        if (newSizeName.trim() && newSizePrice) {
            setSizes([...sizes, {
                name: newSizeName.trim(),
                price: Number(newSizePrice),
                ...(newSizeQty ? { quantity: newSizeQty.trim() } : {}),
            }]);
            setNewSizeName('');
            setNewSizePrice('');
            setNewSizeQty('');
        }
    };

    // ── Topping helpers ──────────────────────────────────────────────────────
    const addTopping = () => {
        if (newToppingName.trim() && newToppingPrice) {
            setToppings([...toppings, { name: newToppingName.trim(), type: newToppingType, price: Number(newToppingPrice) }]);
            setNewToppingName('');
            setNewToppingPrice('');
        }
    };

    // ── Ingredient helpers ───────────────────────────────────────────────────
    const addIngredient = () => {
        if (newIngredient.trim()) {
            setIngredients([...ingredients, newIngredient.trim()]);
            setNewIngredient('');
        }
    };

    const addHealthyIngredient = () => {
        if (newHealthyIngredient.trim()) {
            setHealthyIngredients([...healthyIngredients, newHealthyIngredient.trim()]);
            setNewHealthyIngredient('');
        }
    };

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-menu-item-title"
        >
            <div className="bg-white rounded-2xl w-full max-w-4xl flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">

                {/* Header */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-[#F2F4F7] bg-[#FFF8F6] rounded-t-2xl">
                    <div>
                        <h2 id="add-menu-item-title" className="text-xl font-bold text-[#1D2939] font-manrope">{editItem ? 'Edit Menu Item' : 'Add Menu Item'}</h2>
                        <p className="text-sm text-[#667085] mt-1 font-manrope">Fill in the details for your menu item</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {editItem && (
                            <button
                                onClick={handleDelete}
                                className="p-2.5 bg-red-50 text-red-600 rounded-full hover:bg-red-100 transition-colors"
                                title="Delete Item"
                                aria-label="Delete item"
                            >
                                <Trash2 size={20} />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            disabled={isLoading}
                            className="p-2 hover:bg-white rounded-full text-[#98A2B3] hover:text-[#475467] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label="Close"
                            title={isLoading ? 'Wait for save to finish' : 'Close'}
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">

                    {/* Basic Information */}
                    <section className="bg-[#FFF8F6]/50 p-6 rounded-2xl border border-[#FFE4DC]">
                        <h3 className="text-base font-bold text-[#101828] mb-6 font-manrope">Basic Information</h3>

                        <div className="flex flex-col lg:flex-row gap-8">
                            {/* Left Column */}
                            <div className="flex-1 space-y-5">
                                {/* Category & Name */}
                                <div>
                                    <label htmlFor="category" className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">
                                        Select Category <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                    </label>
                                    <div className="relative">
                                            <select
                                                id="category"
                                                name="category"
                                                value={formData.category}
                                                onChange={handleChange}
                                                aria-required="true"
                                                aria-invalid={errors.category ? 'true' : 'false'}
                                                aria-describedby={errors.category ? 'category-err' : undefined}
                                                className={`w-full h-[46px] px-4 bg-white border rounded-[10px] appearance-none focus:outline-none focus:ring-1 text-sm text-[#101828] font-manrope ${errors.category ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-[#D0D5DD] focus:border-orange-500 focus:ring-orange-500'}`}
                                            >
                                                <option value="">— Select a category —</option>
                                                {contextCategories.length > 0 ? (
                                                    contextCategories.map(cat => (
                                                        <option key={cat._id} value={cat._id}>{cat.name}</option>
                                                    ))
                                                ) : (
                                                    <option value="" disabled>Loading categories…</option>
                                                )}
                                            </select>
                                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#98A2B3] pointer-events-none" />
                                    </div>
                                    <FieldError name="category" />
                                </div>

                                {/* Phase 6 step 3 — optional branch assignment.
                                    Hidden for tenants without branches (so single-
                                    location / non-multiBranch plans see no change). */}
                                {branchOptions.length > 0 && (
                                    <div>
                                        <label className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">
                                            Branch <span className="text-[#98A2B3] font-normal">(optional)</span>
                                        </label>
                                        <div className="relative">
                                            <select
                                                name="branch"
                                                value={formData.branch}
                                                onChange={handleChange}
                                                className="w-full h-[46px] px-4 bg-white border border-[#D0D5DD] rounded-[10px] appearance-none focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-sm text-[#101828] font-manrope"
                                            >
                                                <option value="">— Shared across all branches —</option>
                                                {branchOptions.map(b => (
                                                    <option key={b._id} value={b._id}>
                                                        {b.name}{b.city ? ` · ${b.city}` : ''}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#98A2B3] pointer-events-none" />
                                        </div>
                                        <p className="text-[12px] text-[#8D848F] mt-1 font-manrope">
                                            Leave empty to show this item at every branch. Pick a branch to show it only there.
                                        </p>
                                    </div>
                                )}

                                <div>
                                    <label htmlFor="name" className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">
                                        Item Name <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                    </label>
                                    <input
                                        id="name"
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleChange}
                                        placeholder="e.g. Margherita Pizza, Cold Brew Coffee"
                                        aria-required="true"
                                        aria-invalid={errors.name ? 'true' : 'false'}
                                        aria-describedby={errors.name ? 'name-err' : undefined}
                                        className={`w-full h-[46px] px-4 border rounded-[10px] focus:outline-none focus:ring-1 text-sm text-[#101828] placeholder:text-[#98A2B3] font-manrope ${errors.name ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-[#D0D5DD] focus:border-orange-500 focus:ring-orange-500'}`}
                                    />
                                    <FieldError name="name" />
                                </div>

                                {/* Description */}
                                <div>
                                    <label htmlFor="description" className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">
                                        Description <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                    </label>
                                    <textarea
                                        id="description"
                                        name="description"
                                        value={formData.description}
                                        onChange={handleChange}
                                        placeholder="Short description shown to customers on the menu"
                                        aria-required="true"
                                        aria-invalid={errors.description ? 'true' : 'false'}
                                        aria-describedby={errors.description ? 'description-err' : undefined}
                                        className={`w-full h-[100px] p-4 border rounded-[10px] focus:outline-none focus:ring-1 text-sm text-[#101828] placeholder:text-[#98A2B3] font-manrope resize-none ${errors.description ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-[#D0D5DD] focus:border-orange-500 focus:ring-orange-500'}`}
                                    ></textarea>
                                    <FieldError name="description" />
                                </div>

                            </div>

                            {/* Right Column (Image) */}
                            <div className="w-full lg:w-[320px]">
                                <label className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">Menu Item Image <span className="text-[#98A2B3] font-normal">(Max 5 images)</span></label>
                                <div className="flex gap-4">
                                    <input
                                        type="file"
                                        multiple
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                        className="hidden"
                                        accept="image/png,image/jpeg,image/jpg,image/webp"
                                    />
                                    <div
                                        onClick={() => fileInputRef.current.click()}
                                        className="flex-1 border-2 border-dashed border-[#D0D5DD] rounded-[10px] flex flex-col items-center justify-center p-6 text-center bg-white cursor-pointer hover:border-orange-400 transition-colors h-[120px]"
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current.click()}
                                        aria-label="Upload images"
                                    >
                                        <Upload size={24} className={`${isUploading ? 'animate-bounce text-orange-500' : 'text-[#98A2B3]'} mb-2`} />
                                        <p className="text-xs text-[#475467] font-semibold">{isUploading ? 'Uploading...' : 'Click to upload'}</p>
                                        <p className="text-[10px] leading-[14px] text-[#98A2B3] mt-1">PNG, JPG up to 5MB</p>
                                    </div>
                                    <div className="w-[120px] grid grid-cols-2 gap-2">
                                        {formData.images.map((img, i) => (
                                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden group border border-gray-100">
                                                <img src={img} className="w-full h-full object-cover" alt={`Upload ${i + 1}`} />
                                                <button
                                                    onClick={() => removeImage(i)}
                                                    className="absolute top-0.5 right-0.5 bg-black/50 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    aria-label={`Remove image ${i + 1}`}
                                                >
                                                    <X size={10} />
                                                </button>
                                            </div>
                                        ))}
                                        {formData.images.length === 0 && (
                                            <div className="aspect-square rounded-lg bg-gray-50 border border-dashed border-gray-200 flex items-center justify-center">
                                                <p className="text-[8px] text-gray-400 text-center px-1">No images selected</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Cooking Time & Serve Upto — typeable inputs with a
                                    suggestion datalist so the old dropdown options are still
                                    one click away, but the chef can enter exact values like
                                    "8 min" or "3-4 person" without being boxed in. */}
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                                    <div>
                                        <label className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">Cooking Time</label>
                                        <input
                                            type="text"
                                            name="cookingTime"
                                            value={formData.cookingTime}
                                            onChange={handleChange}
                                            list="cookingTimeOptions"
                                            placeholder="e.g. 12-15 min"
                                            maxLength={32}
                                            className="w-full h-[46px] px-3 bg-white border border-[#D0D5DD] rounded-[10px] focus:outline-none focus:border-orange-500 text-sm text-[#101828] font-manrope"
                                        />
                                        <datalist id="cookingTimeOptions">
                                            <option value="5-10 min" />
                                            <option value="12-15 min" />
                                            <option value="20-25 min" />
                                            <option value="30+ min" />
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">Prep Time (min)</label>
                                        <input
                                            type="number"
                                            name="prepTimeMinutes"
                                            value={formData.prepTimeMinutes}
                                            onChange={handleChange}
                                            min={0}
                                            max={240}
                                            placeholder="15"
                                            className="w-full h-[46px] px-3 bg-white border border-[#D0D5DD] rounded-[10px] focus:outline-none focus:border-orange-500 text-sm text-[#101828] font-manrope"
                                        />
                                        <p className="text-[11px] text-[#8D848F] mt-1 font-manrope">Used by the chef queue to time takeaway orders.</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-[#344054] mb-1.5 font-manrope">Serve upto</label>
                                        <input
                                            type="text"
                                            name="serveUpto"
                                            value={formData.serveUpto}
                                            onChange={handleChange}
                                            list="serveUptoOptions"
                                            placeholder="e.g. 2-3 person"
                                            maxLength={32}
                                            className="w-full h-[46px] px-3 bg-white border border-[#D0D5DD] rounded-[10px] focus:outline-none focus:border-orange-500 text-sm text-[#101828] font-manrope"
                                        />
                                        <datalist id="serveUptoOptions">
                                            <option value="1 person" />
                                            <option value="2-3 person" />
                                            <option value="4+ person" />
                                            <option value="Family" />
                                        </datalist>
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* Ingredients */}
                        <div className="mt-5">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Ingredients / Allergy</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newIngredient}
                                    onChange={(e) => setNewIngredient(e.target.value)}
                                    placeholder="Enter ingredient"
                                    className="flex-1 h-[46px] px-4 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addIngredient(); } }}
                                />
                                <button
                                    type="button"
                                    onClick={addIngredient}
                                    className="h-[46px] w-[46px] flex items-center justify-center bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-sm shadow-orange-500/20"
                                    aria-label="Add ingredient"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {ingredients.map((tag, idx) => (
                                    <div key={idx} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 flex items-center gap-1.5">
                                        {tag}
                                        <button onClick={() => setIngredients(ingredients.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-gray-600" aria-label={`Remove ${tag}`}><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>


                        {/* Veg/Non-Veg & Featured */}
                        <div className="flex flex-wrap items-center justify-between gap-4 mt-6">
                            <div className="flex items-center gap-6">
                                <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setFormData(p => ({...p, vegType: 'veg'}))}>
                                    <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-all ${formData.vegType === 'veg' ? 'border-[#FE8301]' : 'border-[#D0D5DD] group-hover:border-[#FE8301]/50'}`}>
                                        {formData.vegType === 'veg' && <div className="w-2.5 h-2.5 bg-[#FE8301] rounded-full" />}
                                    </div>
                                    <div className="w-4 h-4 border-2 border-green-600 flex items-center justify-center p-[1px] rounded-[2px]"><div className="w-full h-full bg-green-600 rounded-full"></div></div>
                                    <span className="text-sm font-medium text-[#344054] font-manrope">Veg</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer group" onClick={() => setFormData(p => ({...p, vegType: 'non-veg'}))}>
                                    <div className={`w-5 h-5 border-2 rounded-full flex items-center justify-center transition-all ${formData.vegType === 'non-veg' ? 'border-[#FE8301]' : 'border-[#D0D5DD] group-hover:border-[#FE8301]/50'}`}>
                                        {formData.vegType === 'non-veg' && <div className="w-2.5 h-2.5 bg-[#FE8301] rounded-full" />}
                                    </div>
                                    <div className="w-4 h-4 border-2 border-red-600 flex items-center justify-center p-[1px] rounded-[2px]"><div className="w-full h-full bg-red-600 rounded-full"></div></div>
                                    <span className="text-sm font-medium text-[#344054] font-manrope">Non-veg</span>
                                </label>
                            </div>

                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="isFeatured"
                                    checked={formData.isFeatured}
                                    onChange={handleChange}
                                    className="w-4 h-4 rounded border-[#D0D5DD] text-orange-500 focus:ring-orange-500"
                                />
                                <span className="text-sm font-medium text-[#344054] font-manrope">Mark as Special/Featured Item</span>
                            </label>
                        </div>

                        {/* Prep Station — drives the kitchen-bypass flow.
                            'counter' items skip the chef KDS entirely
                            and orders containing only counter items
                            land directly in the waiter pickup queue. */}
                        <div className="mt-6">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Preparation Station
                            </label>
                            <p className="text-xs text-gray-500 mb-3 font-manrope">
                                Where does this item come from? Counter items (water, packaged ice cream, bottled drinks) skip the chef and go straight to the pickup queue.
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { value: 'kitchen', label: 'Kitchen', desc: 'Chef cooks it' },
                                    { value: 'bar', label: 'Bar', desc: 'Bartender makes it' },
                                    { value: 'counter', label: 'Counter / Ready-to-serve', desc: 'No prep needed' },
                                ].map(opt => {
                                    const selected = formData.prepStation === opt.value;
                                    return (
                                        <button
                                            type="button"
                                            key={opt.value}
                                            onClick={() => setFormData(p => ({ ...p, prepStation: opt.value }))}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all border ${
                                                selected
                                                    ? 'bg-orange-500 text-white border-orange-500 shadow-sm shadow-orange-500/20'
                                                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                                            }`}
                                            aria-pressed={selected}
                                            title={opt.desc}
                                        >
                                            {opt.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>


                        {/* Available Days */}
                        <div className="mt-6">
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Available Days</label>
                            <div className="flex flex-wrap gap-2">
                                {days.map(day => {
                                    const isSelected = selectedDays.includes(day)
                                    return (
                                        <button
                                            key={day}
                                            onClick={() => setSelectedDays(prev => isSelected ? prev.filter(d => d !== day) : [...prev, day])}
                                            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${isSelected
                                                ? 'bg-orange-500 text-white shadow-sm shadow-orange-500/20'
                                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                                }`}
                                            aria-pressed={isSelected}
                                        >
                                            {day}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Timers & Prices */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time</label>
                                <div className="relative">
                                    <input
                                        type="time"
                                        name="startTime"
                                        value={formData.startTime}
                                        onChange={handleChange}
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time</label>
                                <div className="relative">
                                    <input
                                        type="time"
                                        name="endTime"
                                        value={formData.endTime}
                                        onChange={handleChange}
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="basePrice" className="block text-sm font-semibold text-gray-700 mb-1.5">
                                    Base Price <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <div className="relative">
                                    <input
                                        id="basePrice"
                                        type="number"
                                        name="basePrice"
                                        value={formData.basePrice}
                                        onChange={handleChange}
                                        placeholder="0.00"
                                        min="0"
                                        inputMode="decimal"
                                        aria-required="true"
                                        aria-invalid={errors.basePrice ? 'true' : 'false'}
                                        aria-describedby={errors.basePrice ? 'basePrice-err' : undefined}
                                        className={`w-full h-[42px] px-3 border rounded-xl focus:outline-none text-sm ${errors.basePrice ? 'border-red-400 focus:border-red-500 ring-1 ring-red-200' : 'border-gray-200 focus:border-orange-500'}`}
                                    />
                                </div>
                                <FieldError name="basePrice" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Unit</label>
                                <select
                                    name="unit"
                                    value={formData.unit}
                                    onChange={handleChange}
                                    className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm bg-white"
                                >
                                    {['pieces', 'plate', 'bowl', 'glass', 'bottle', 'kg', 'gm', 'liter', 'ml', 'serving', 'slice', 'cup', 'portion'].map(u => (
                                        <option key={u} value={u}>{u.charAt(0).toUpperCase() + u.slice(1)}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Add Offer (%)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        name="offerPercentage"
                                        value={formData.offerPercentage}
                                        onChange={handleChange}
                                        min="0"
                                        max="100"
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Final Price</label>
                                <input
                                    type="text"
                                    value={formData.basePrice ? (formData.basePrice - (formData.basePrice * (formData.offerPercentage / 100))).toFixed(2) : '0.00'}
                                    className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm bg-gray-50"
                                    readOnly
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Offer Expiry Date</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        name="offerExpiryDate"
                                        value={formData.offerExpiryDate}
                                        onChange={handleChange}
                                        min={new Date().toISOString().split('T')[0]}
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Branch-specific price overrides. Only shown when editing an
                            existing item (needs an _id for the PUT endpoint) AND the
                            tenant has at least one branch. The default price above
                            applies to every other branch. */}
                        {editItem?._id && branchOptions.length > 0 && (
                            <div className="mt-3 p-3 border border-dashed border-orange-200 bg-orange-50/40 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                        <Store size={14} className="text-orange-500" />
                                        Per-Branch Price Overrides
                                    </p>
                                    <p className="text-[12px] text-gray-500 mt-0.5">
                                        Charge a different price at specific branches. Others keep the default price above.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowBranchPrices(true)}
                                    className="h-9 px-4 rounded-lg bg-white border border-orange-400 text-orange-600 text-sm font-semibold hover:bg-orange-50 shrink-0"
                                >
                                    Manage Branch Pricing
                                </button>
                            </div>
                        )}

                    </section>

                    {/* Sizes & Toppings */}
                    <section className="bg-[#FFF9FA]/50 p-6 rounded-2xl border border-[#FAEFFA]">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-base font-bold text-[#101828] font-manrope">Sizes & Toppings</h3>
                                <p className="text-xs text-[#667085] mt-1 font-manrope">Add different sizes and toppings for this item</p>
                            </div>
                        </div>

                        {/* Add New Size — React controlled state */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-[1fr_auto_1fr_46px] gap-3 items-end">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Size Name</label>
                                    <input
                                        type="text"
                                        value={newSizeName}
                                        onChange={(e) => setNewSizeName(e.target.value)}
                                        placeholder="e.g. Small, Medium, Large"
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(); } }}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Qty ({formData.unit})</label>
                                    <input
                                        type="text"
                                        value={newSizeQty}
                                        onChange={(e) => setNewSizeQty(e.target.value)}
                                        placeholder={formData.unit === 'kg' ? '0.5' : formData.unit === 'ml' ? '250' : '1'}
                                        className="w-[80px] h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(); } }}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Price (₹)</label>
                                    <input
                                        type="number"
                                        value={newSizePrice}
                                        onChange={(e) => setNewSizePrice(e.target.value)}
                                        placeholder="00"
                                        min="0"
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(); } }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={addSize}
                                    className="h-[42px] w-[46px] flex items-center justify-center bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-sm shadow-orange-500/20"
                                    aria-label="Add size"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>

                            <p className="text-xs font-semibold text-gray-500">Added Sizes ({sizes.length})</p>

                            <div className="space-y-2">
                                {sizes.map((size, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                                        <div>
                                            <p className="text-sm font-bold text-gray-900">
                                                {size.name}
                                                {size.quantity && <span className="text-gray-400 font-normal ml-1">({size.quantity} {formData.unit})</span>}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-0.5">Price: ₹{size.price}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setSizes(sizes.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${size.name} size`}><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>


                            {/* Add Topping — React controlled state */}
                            <div className="my-6 border-t border-gray-100 pt-6"></div>

                             <div className="grid grid-cols-[1fr_1fr_1fr_46px] gap-4 items-end">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Add Topping</label>
                                    <input
                                        type="text"
                                        value={newToppingName}
                                        onChange={(e) => setNewToppingName(e.target.value)}
                                        placeholder="e.g. Extra Cheese"
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopping(); } }}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Select Type</label>
                                    <select
                                        value={newToppingType}
                                        onChange={(e) => setNewToppingType(e.target.value)}
                                        className="w-full h-[42px] px-3 bg-white border border-gray-200 rounded-xl appearance-none focus:outline-none focus:border-orange-500 text-sm text-gray-700"
                                    >
                                        <option value="veg">Veg</option>
                                        <option value="non-veg">Non-veg</option>
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-gray-700">Price</label>
                                    <input
                                        type="number"
                                        value={newToppingPrice}
                                        onChange={(e) => setNewToppingPrice(e.target.value)}
                                        placeholder="00"
                                        min="0"
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm"
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTopping(); } }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={addTopping}
                                    className="h-[42px] w-[46px] flex items-center justify-center bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-sm shadow-orange-500/20"
                                    aria-label="Add topping"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>

                            <p className="text-xs font-semibold text-gray-500 mt-4">Added Toppings ({toppings.length})</p>

                            <div className="space-y-2">
                                {toppings.map((topping, index) => (
                                    <div key={index} className="flex items-center justify-between p-3 bg-white border border-gray-100 rounded-xl shadow-sm">
                                        <div className="flex items-start gap-3">
                                            <div className={`w-4 h-4 border-2 ${topping.type === 'veg' ? 'border-green-600' : 'border-red-600'} flex items-center justify-center p-[1px] rounded-[2px] mt-0.5`}>
                                                <div className={`w-full h-full ${topping.type === 'veg' ? 'bg-green-600' : 'bg-red-600'} rounded-full`}></div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">{topping.name}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">Price: ₹{topping.price}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => setToppings(toppings.filter((_, i) => i !== index))} className="text-gray-400 hover:text-red-500" aria-label={`Remove ${topping.name} topping`}><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                        </div>
                    </section>

                    {/* Health Information */}
                    <section className={`p-6 rounded-2xl border border-[#F2F0FF] transition-colors ${formData.isHealthy ? 'bg-[#FAF5F0]' : 'bg-[#FAF9FF]/50'}`}>
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-base font-bold text-[#101828] font-manrope">Health Information</h3>
                                <p className="text-xs text-[#667085] mt-1 font-manrope">Add health tags and reasons for this item</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-[#344054] font-manrope">Is Healthy</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="isHealthy"
                                        className="sr-only peer"
                                        checked={formData.isHealthy}
                                        onChange={handleChange}
                                        aria-label="Mark as healthy"
                                    />
                                    <div className="w-11 h-6 bg-[#EAECF0] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                </label>
                            </div>
                        </div>


                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Health Level</label>
                                <div className="relative">
                                    <select
                                        name="healthLevel"
                                        value={formData.healthLevel}
                                        onChange={handleChange}
                                        className="w-full h-[42px] px-3 bg-white border border-gray-200 rounded-xl appearance-none focus:outline-none focus:border-orange-500 text-sm text-gray-700"
                                    >
                                        <option value="">Select Level</option>
                                        <option value="Low">Low</option>
                                        <option value="Medium">Medium</option>
                                        <option value="High">High</option>
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <ChevronDown size={14} />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Tags</label>
                                <div className="relative" ref={healthTagsRef}>
                                    <button
                                        type="button"
                                        onClick={() => setHealthTagsOpen(o => !o)}
                                        className={`w-full h-[42px] px-3 bg-white border rounded-xl flex items-center justify-between text-sm font-manrope transition-colors hover:border-orange-500 ${
                                            healthTagsOpen ? 'border-orange-500' : 'border-gray-200'
                                        } ${(formData.healthTags?.length || 0) === 0 ? 'text-gray-400' : 'text-gray-700'}`}
                                    >
                                        <span className="truncate">
                                            {(formData.healthTags?.length || 0) === 0
                                                ? 'Select Tags'
                                                : `${formData.healthTags.length} selected`}
                                        </span>
                                        <ChevronDown size={14} className={`text-gray-400 transition-transform ${healthTagsOpen ? 'rotate-180' : ''}`} />
                                    </button>

                                    {healthTagsOpen && (
                                        <div className="absolute top-[calc(100%+6px)] left-0 right-0 z-30 bg-white border border-gray-200 rounded-xl shadow-[0px_12px_24px_-8px_rgba(16,24,40,0.18)] overflow-y-auto overscroll-contain max-h-72">
                                            {HEALTH_TAG_GROUPS.map((group, gIdx) => (
                                                <div key={group.label} className={gIdx !== 0 ? 'border-t border-gray-100' : ''}>
                                                    <div className="px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                                                        {group.label}
                                                    </div>
                                                    {group.tags.map(tag => {
                                                        const checked = formData.healthTags?.includes(tag)
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={tag}
                                                                onClick={() => {
                                                                    setFormData(p => {
                                                                        const current = p.healthTags || []
                                                                        return {
                                                                            ...p,
                                                                            healthTags: checked
                                                                                ? current.filter(t => t !== tag)
                                                                                : [...current, tag],
                                                                        }
                                                                    })
                                                                }}
                                                                className="w-full px-3 py-2 flex items-center gap-2.5 text-left text-sm text-gray-700 hover:bg-orange-50 transition-colors"
                                                            >
                                                                <span className={`w-4 h-4 rounded-[4px] border flex items-center justify-center shrink-0 ${
                                                                    checked
                                                                        ? 'bg-orange-500 border-orange-500 text-white'
                                                                        : 'border-gray-300 bg-white'
                                                                }`}>
                                                                    {checked && <Check size={12} strokeWidth={3} />}
                                                                </span>
                                                                <span className="truncate">{tag}</span>
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {formData.healthTags?.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {formData.healthTags.map((tag, idx) => (
                                            <div key={idx} className="px-2 py-1 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700 flex items-center gap-1">
                                                {tag}
                                                <button onClick={() => setFormData(p => ({ ...p, healthTags: p.healthTags.filter((_, i) => i !== idx) }))} className="text-green-400 hover:text-green-600" aria-label={`Remove ${tag} tag`}><X size={10} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                            {[
                                { label: 'Calories (kcal)', key: 'calories' },
                                { label: 'Protein (gm)', key: 'protein' },
                                { label: 'Fat (gm)', key: 'fat' },
                                { label: 'Carbs (gm)', key: 'carbs' },
                                { label: 'Fibre (gm)', key: 'fibre' },
                                { label: 'Iron (mg)', key: 'iron' }
                            ].map((item) => (
                                <div key={item.key}>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">{item.label}</label>
                                    <input
                                        type="number"
                                        name={`nutritionalInfo.${item.key}`}
                                        value={formData.nutritionalInfo?.[item.key]}
                                        onChange={handleChange}
                                        placeholder="0"
                                        min="0"
                                        className="w-full h-[42px] px-3 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm bg-white"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="mt-4">
                            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Healthy ingredients</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newHealthyIngredient}
                                    onChange={(e) => setNewHealthyIngredient(e.target.value)}
                                    placeholder="Enter healthy ingredient"
                                    className="flex-1 h-[46px] px-4 border border-gray-200 rounded-xl focus:outline-none focus:border-orange-500 text-sm bg-white"
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addHealthyIngredient(); } }}
                                />
                                <button
                                    type="button"
                                    onClick={addHealthyIngredient}
                                    className="h-[46px] w-[46px] flex items-center justify-center bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-sm shadow-orange-500/20"
                                    aria-label="Add healthy ingredient"
                                >
                                    <Plus size={20} />
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                                {healthyIngredients.map((tag, idx) => (
                                    <div key={idx} className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600 flex items-center gap-1.5">
                                        {tag}
                                        <button onClick={() => setHealthyIngredients(healthyIngredients.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-gray-600" aria-label={`Remove ${tag}`}><X size={12} /></button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ── Recipe (Optional) — links menu item to inventory ── */}
                        <div className="mt-6 border-t border-[#F2F4F7] pt-5">
                            <button
                                type="button"
                                onClick={() => setRecipeOpen(v => !v)}
                                className="w-full flex items-center justify-between text-left"
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center">
                                        <ChefHat size={17} className="text-[#FE8301]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">
                                            Recipe <span className="text-gray-400 font-normal">(Optional)</span>
                                        </p>
                                        <p className="text-[11px] text-gray-500">
                                            {recipeExists
                                                ? `Linked to ${recipeIngredients.length} ingredient${recipeIngredients.length === 1 ? '' : 's'} — auto-deduction is on.`
                                                : 'Link inventory ingredients so stock auto-deducts when the chef starts preparing.'}
                                        </p>
                                    </div>
                                </div>
                                <ChevronDown
                                    size={18}
                                    className={`text-gray-400 transition-transform ${recipeOpen ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {recipeOpen && (
                                <div className="mt-4 space-y-4">
                                    {recipeLoading ? (
                                        <div className="flex items-center justify-center py-6">
                                            <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                        </div>
                                    ) : (
                                        <>
                                            {/* Yield */}
                                            <div className="flex items-center gap-3">
                                                <label className="text-sm font-semibold text-gray-700 whitespace-nowrap">Servings per batch</label>
                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    value={recipeYield}
                                                    onChange={(e) => setRecipeYield(e.target.value)}
                                                    className="w-24 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301]"
                                                />
                                                <span className="text-[11px] text-gray-400">
                                                    Quantities below are divided by this when an order deducts stock.
                                                </span>
                                            </div>

                                            {/* Search & add */}
                                            <div>
                                                <label className="text-sm font-semibold text-gray-700 block mb-2">Add Ingredient</label>
                                                <div className="relative">
                                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                                    <input
                                                        type="text"
                                                        value={recipeSearchTerm}
                                                        onChange={(e) => setRecipeSearchTerm(e.target.value)}
                                                        placeholder={recipeInvList.length === 0 ? 'No inventory items yet — add some from the Inventory tab first' : 'Search inventory items to add...'}
                                                        disabled={recipeInvList.length === 0}
                                                        className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FE8301] placeholder:text-gray-300 disabled:bg-gray-50"
                                                    />
                                                    {filteredRecipeInv.length > 0 && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-100 shadow-lg z-10 max-h-48 overflow-y-auto">
                                                            {filteredRecipeInv.slice(0, 10).map(item => (
                                                                <button
                                                                    type="button"
                                                                    key={item._id}
                                                                    onClick={() => addRecipeIngredient(item)}
                                                                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-orange-50 transition flex items-center justify-between"
                                                                >
                                                                    <div>
                                                                        <span className="font-medium text-gray-800">{item.name}</span>
                                                                        <span className="text-xs text-gray-400 ml-2">{item.category}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xs text-gray-500">{item.currentStock} {item.unit}</span>
                                                                        <Plus size={14} className="text-[#FE8301]" />
                                                                    </div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Ingredient list */}
                                            {recipeIngredients.length === 0 ? (
                                                <div className="text-center py-6 text-gray-400 text-xs border border-dashed border-gray-200 rounded-xl">
                                                    Search above to add ingredients. Leave empty to skip recipe — auto-deduction will be off for this item.
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="grid grid-cols-[1fr_100px_90px_40px] gap-2 text-[10px] font-semibold text-gray-400 uppercase px-1">
                                                        <span>Ingredient</span>
                                                        <span>Quantity</span>
                                                        <span>Unit</span>
                                                        <span></span>
                                                    </div>
                                                    {recipeIngredients.map((ing, idx) => (
                                                        <div key={ing.inventoryItem} className="grid grid-cols-[1fr_100px_90px_40px] gap-2 items-center bg-gray-50 rounded-xl px-3 py-2.5">
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium text-gray-800 truncate">{ing.name}</p>
                                                                <p className="text-[11px] text-gray-400 truncate">
                                                                    Stock: {ing.currentStock} {ing.invUnit}
                                                                </p>
                                                            </div>
                                                            <input
                                                                type="number"
                                                                min="0.001"
                                                                step="0.001"
                                                                value={ing.quantity || ''}
                                                                onChange={(e) => updateRecipeIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)}
                                                                placeholder="0"
                                                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:border-[#FE8301]"
                                                            />
                                                            <select
                                                                value={ing.unit}
                                                                onChange={(e) => updateRecipeIngredient(idx, 'unit', e.target.value)}
                                                                className="w-full px-1 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#FE8301] bg-white"
                                                            >
                                                                {RECIPE_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                                            </select>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeRecipeIngredient(idx)}
                                                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Notes */}
                                            <div>
                                                <label className="text-sm font-semibold text-gray-700 block mb-1">Recipe Notes (optional)</label>
                                                <textarea
                                                    value={recipeNotes}
                                                    onChange={(e) => setRecipeNotes(e.target.value)}
                                                    maxLength={500}
                                                    rows={2}
                                                    placeholder="Preparation notes, special instructions..."
                                                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FE8301] resize-none placeholder:text-gray-300"
                                                />
                                            </div>

                                            {recipeUnitMismatches.length > 0 && (
                                                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                                    <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                                    <p className="text-xs text-amber-800">
                                                        Unit mismatch on {recipeUnitMismatches.join(', ')}. Pick a recipe unit convertible to the inventory unit (kg↔g, L↔mL, or identical) — otherwise auto-deduction will skip this ingredient.
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            )}
                        </div>

                    </section>

                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[#F2F4F7] flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-b-2xl">
                    <p className="text-sm font-medium text-[#667085] font-manrope">
                        <span className="font-bold text-[#101828]">{sizes.length}</span> sizes & <span className="font-bold text-[#101828]">{toppings.length}</span> toppings will be added
                    </p>
                    <div className="flex items-center gap-3">
                        <button disabled={isLoading} onClick={onClose} className="px-6 py-2.5 text-sm font-semibold text-orange-500 hover:bg-orange-50 rounded-[10px] transition-colors font-manrope disabled:opacity-50">
                            Cancel
                        </button>
                        <button disabled={isLoading} onClick={() => handleSave('draft')} className="px-6 py-2.5 text-sm font-semibold text-orange-500 border border-orange-500 rounded-[10px] hover:bg-orange-50 transition-colors flex items-center gap-2 font-manrope disabled:opacity-50">
                            <Edit2 size={16} /> {isLoading ? 'Saving...' : 'Save as Draft'}
                        </button>
                        <button disabled={isLoading} onClick={() => handleSave('active')} className="px-6 py-2.5 text-sm font-semibold text-white bg-orange-500 rounded-[10px] hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all flex items-center gap-2 font-manrope disabled:opacity-50">
                            <span className="bg-white/20 p-0.5 rounded-full"><Plus size={14} /></span> {isLoading ? 'Processing...' : (editItem ? 'Update Menu Item' : 'Save Menu Item')}
                        </button>
                    </div>
                </div>


            </div>

            {showBranchPrices && editItem?._id && (
                <BranchPricesModal
                    item={{ _id: editItem._id, name: editItem.name }}
                    onClose={() => setShowBranchPrices(false)}
                    onSaved={() => { onRefresh?.() }}
                />
            )}
        </div>
    )
}

export default AddMenuItemModal
