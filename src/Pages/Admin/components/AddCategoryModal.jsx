import React, { useState, useRef, useEffect } from 'react'
import { X, Upload, CheckCircle, Edit2, Trash2, AlertTriangle, Loader2, Monitor } from 'lucide-react'
import api from '../../../utils/api'
import toast from 'react-hot-toast'
import { useMenu } from '../../../Context/MenuContext'
import { FALLBACK_IMAGE, resolveImageUrl } from '../../../utils/image'

const AddCategoryModal = ({ onClose, onRefresh }) => {
    const { categories: contextCategories, fetchCategories: refreshContextCategories } = useMenu();

    const [categoryName, setCategoryName] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedImage, setSelectedImage] = useState(null);
    const [editingCategory, setEditingCategory] = useState(null);
    // Per-form kiosk visibility flag. Default true — new categories
    // show on the kiosk unless admin explicitly unchecks. Legacy
    // categories (field absent on the doc) are treated as visible.
    const [showOnKiosk, setShowOnKiosk] = useState(true);
    const fileInputRef = useRef(null);

    // Per-field validation errors — inline below each input.
    // Replaces the previous toast-on-validation pattern.
    const [errors, setErrors] = useState({});
    const FieldError = ({ name }) =>
        errors[name] ? (
            <p id={`${name}-err`} role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                <span aria-hidden="true">⚠</span>{errors[name]}
            </p>
        ) : null;

    // ── Local categories state ────────────────────────────────────────────────
    // Fetched with ?withCount=true so each category has its itemCount.
    // Context categories don't include itemCount (fetched without withCount),
    // so this modal fetches its own copy.
    const [categories, setCategories] = useState([]);

    const fetchCategoriesWithCount = async () => {
        try {
            const res = await api.get('/categories?withCount=true');
            const data = res.data.data || res.data.categories || (Array.isArray(res.data) ? res.data : []);
            setCategories(data);
        } catch {
            // Fall back to context categories (without counts) if dedicated fetch fails
            if (contextCategories.length > 0) setCategories(contextCategories);
        }
    };

    useEffect(() => {
        fetchCategoriesWithCount();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Image Upload ──────────────────────────────────────────────────────────
    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error('Please upload a valid image file');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error('File size should be less than 5MB');
            return;
        }
        const formData = new FormData();
        formData.append('image', file);
        try {
            setIsUploading(true);
            const response = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success) {
                // /upload returns an absolute Cloudinary URL — resolve it
                // (don't blindly prepend the host, which corrupts the URL).
                setSelectedImage(resolveImageUrl(response.data.url) || response.data.url);
                if (errors.image) setErrors(prev => ({ ...prev, image: undefined }));
            }
        } catch {
            toast.error('Failed to upload image');
        } finally {
            setIsUploading(false);
        }
    };

    // ── Drag and Drop ─────────────────────────────────────────────────────────
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    const handleDragStart = (e, index) => {
        dragItem.current = index;
    };

    const handleDragEnter = (e, index) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = async () => {
        const from = dragItem.current;
        const to = dragOverItem.current;
        dragItem.current = null;
        dragOverItem.current = null;

        // No-op if refs were never set or item dropped onto itself
        if (from === null || to === null || from === to) return;

        // Compute reordered list once — used for both state update and API payload
        const next = [...categories];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const reordered = next.map((cat, idx) => ({ ...cat, displayOrder: idx + 1 }));

        setCategories(reordered);

        try {
            await api.put('/categories/reorder', {
                categories: reordered.map(c => ({ id: c._id, displayOrder: c.displayOrder }))
            });
            onRefresh?.();
        } catch {
            toast.error('Failed to save new order');
        }
    };

    // ── Status Toggle — optimistic with rollback ───────────────────────────────
    const toggleCategoryStatus = async (id, currentStatus) => {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

        // Apply optimistically
        setCategories(prev => prev.map(cat =>
            cat._id === id ? { ...cat, status: newStatus } : cat
        ));

        try {
            const res = await api.put(`/categories/${id}`, { status: newStatus });
            if (!res.data.success) throw new Error();
            onRefresh?.();
        } catch {
            // Roll back on failure
            setCategories(prev => prev.map(cat =>
                cat._id === id ? { ...cat, status: currentStatus } : cat
            ));
            toast.error('Failed to update status');
        }
    };

    // ── Start editing a category ────────────────────────────────────────────
    const startEditing = (cat) => {
        setEditingCategory(cat);
        setCategoryName(cat.name);
        setSelectedImage(cat.image || null);
        // Legacy categories may not have the field at all — treat as
        // visible (kiosk-on) so unchecking is the explicit hide action.
        setShowOnKiosk(cat.showOnKiosk !== false);
    };

    const cancelEditing = () => {
        setEditingCategory(null);
        setCategoryName('');
        setSelectedImage(null);
        setShowOnKiosk(true);
    };

    // ── Save New or Update Existing Category ─────────────────────────────────
    const handleSave = async () => {
        const trimmedName = categoryName.trim();
        const errs = {};
        if (!trimmedName)                                     errs.name = 'Category name is required';
        else if (trimmedName.length < 2)                      errs.name = 'Category name must be at least 2 characters';
        else if (categories.some(c =>
            c.name.toLowerCase() === trimmedName.toLowerCase() &&
            c._id !== editingCategory?._id
        ))                                                    errs.name = 'A category with this name already exists';
        if (!selectedImage)                                   errs.image = 'Please upload a category image';

        setErrors(errs);
        if (Object.keys(errs).length) {
            // Focus the first invalid input so the user lands on the
            // problem instead of scanning the form.
            if (errs.name) {
                setTimeout(() => {
                    const el = document.getElementById('categoryName');
                    if (el) { try { el.focus(); } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
                }, 0);
            } else if (errs.image && fileInputRef.current) {
                fileInputRef.current.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        setIsLoading(true);
        try {
            if (editingCategory) {
                // Update existing
                const res = await api.put(`/categories/${editingCategory._id}`, {
                    name: trimmedName,
                    image: selectedImage,
                    showOnKiosk,
                });
                if (res.data.success) {
                    toast.success('Category updated successfully!');
                    // Update local state immediately
                    setCategories(prev => prev.map(cat =>
                        cat._id === editingCategory._id ? { ...cat, name: trimmedName, image: selectedImage, showOnKiosk } : cat
                    ));
                    setEditingCategory(null);
                    setCategoryName('');
                    setSelectedImage(null);
                    setShowOnKiosk(true);
                    refreshContextCategories(true);
                    onRefresh?.();
                }
            } else {
                // Create new
                const res = await api.post('/categories', {
                    name: trimmedName,
                    displayOrder: categories.length + 1,
                    image: selectedImage,
                    showOnKiosk,
                });
                if (res.data.success) {
                    toast.success('Category created successfully!');
                    setCategoryName('');
                    setSelectedImage(null);
                    setShowOnKiosk(true);
                    await fetchCategoriesWithCount();
                    refreshContextCategories(true);
                    onRefresh?.();
                }
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save category');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Delete Category ────────────────────────────────────────────────────────
    const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name, itemCount }
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteClick = async (cat) => {
        try {
            // _silent suppresses the global interceptor toast — we handle errors locally
            const res = await api.delete(`/categories/${cat._id}`, { _silent: true });
            if (res.data.success) {
                setCategories(prev => prev.filter(c => c._id !== cat._id));
                toast.success('Category deleted');
                refreshContextCategories(true);
                onRefresh?.();
            }
        } catch (error) {
            const data = error.response?.data;
            if (error.response?.status === 409 && data?.itemCount) {
                // Has items — show confirmation popup with count
                setDeleteConfirm({ id: cat._id, name: cat.name, itemCount: data.itemCount });
            } else {
                toast.error(data?.message || 'Failed to delete category');
            }
        }
    };

    const confirmForceDelete = async () => {
        if (!deleteConfirm) return;
        setIsDeleting(true);
        try {
            const res = await api.delete(`/categories/${deleteConfirm.id}?force=true`);
            if (res.data.success) {
                setCategories(prev => prev.filter(c => c._id !== deleteConfirm.id));
                toast.success(res.data.message);
                refreshContextCategories(true);
                onRefresh?.();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to delete category');
        } finally {
            setIsDeleting(false);
            setDeleteConfirm(null);
        }
    };

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[24px] w-full max-w-[1000px] flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 overflow-hidden font-manrope no-scrollbar">

                {/* Header */}
                <div className="flex items-center justify-between px-8 py-5 bg-[#FFF8F1]">
                    <div>
                        <h2 className="text-[24px] font-bold text-[#1D2939] leading-tight">{editingCategory ? 'Edit Category' : 'Add New Category'}</h2>
                        <p className="text-[14px] text-[#667085] mt-1">{editingCategory ? `Editing "${editingCategory.name}"` : 'Create and organize your menu items under this category'}</p>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        aria-label="Close"
                        title={isLoading ? 'Wait for save to finish' : 'Close'}
                        className="p-2 hover:bg-black/5 rounded-full text-[#98A2B3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* Left Column: Basic Information */}
                    <div className="w-[50%] p-6 pb-4 overflow-y-auto no-scrollbar">
                        <h3 className="text-[18px] font-bold text-[#1D2939] mb-4">Basic Information</h3>

                        <div className="space-y-5">
                            <div>
                                <label htmlFor="categoryName" className="block text-[14px] font-semibold text-[#1D2939] mb-2">
                                    Category Name <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <input
                                    id="categoryName"
                                    type="text"
                                    placeholder="e.g. Starters, Beverages, Main Course"
                                    value={categoryName}
                                    onChange={(e) => {
                                        setCategoryName(e.target.value);
                                        if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                                    }}
                                    aria-required="true"
                                    aria-invalid={errors.name ? 'true' : 'false'}
                                    aria-describedby={errors.name ? 'name-err' : undefined}
                                    className={`w-full h-[52px] px-5 border rounded-[12px] focus:outline-none focus:ring-1 text-[15px] text-[#1D2939] placeholder:text-[#98A2B3] font-medium ${errors.name ? 'border-red-400 focus:border-red-500 focus:ring-red-200' : 'border-[#EAECF0] focus:border-orange-500 focus:ring-orange-500'}`}
                                />
                                <FieldError name="name" />
                            </div>

                            <div>
                                <label className="block text-[14px] font-semibold text-[#1D2939] mb-2">
                                    Category Image <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                                </label>
                                <div className="flex items-start gap-4">
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleImageUpload}
                                        className="hidden"
                                        accept="image/*"
                                    />
                                    <div
                                        onClick={() => fileInputRef.current.click()}
                                        aria-invalid={errors.image ? 'true' : 'false'}
                                        className={`flex-1 min-w-0 border-2 border-dashed rounded-[16px] flex flex-col items-center justify-center p-4 text-center bg-white cursor-pointer transition-colors h-[140px] ${errors.image ? 'border-red-400 hover:border-red-500' : 'border-[#EAECF0] hover:border-orange-400'}`}
                                    >
                                        <Upload size={28} className={`${isUploading ? 'animate-bounce text-orange-500' : 'text-[#98A2B3]'} mb-2`} />
                                        <p className="text-[13px] text-[#475467] font-semibold leading-snug">
                                            {isUploading ? 'Uploading...' : 'Click to upload'}
                                        </p>
                                        <p className="text-[11px] text-[#98A2B3] mt-1 font-medium">PNG, JPG up to 5MB</p>
                                    </div>
                                    <div className="w-[140px] h-[140px] flex-shrink-0 relative rounded-[16px] overflow-hidden group border border-[#EAECF0]">
                                        <img
                                            src={selectedImage || FALLBACK_IMAGE}
                                            className="w-full h-full object-cover"
                                            alt="preview"
                                            onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
                                        />
                                        {selectedImage && (
                                            <button
                                                onClick={() => {
                                                    setSelectedImage(null);
                                                    if (errors.image) setErrors(prev => ({ ...prev, image: undefined }));
                                                }}
                                                className="absolute top-2 right-2 bg-white text-[#1D2939] rounded-full p-1.5 shadow-md opacity-0 group-hover:opacity-100 transition-all hover:bg-orange-50"
                                            >
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <FieldError name="image" />
                            </div>

                            {/* Kiosk Visibility — checkbox inside the
                                category form. Off = category and its
                                items hidden from the self-serve kiosk
                                flow. Stays visible to dine-in /
                                takeaway / admin. Legacy categories
                                default to visible. */}
                            <div>
                                <label className="flex items-start gap-3 cursor-pointer select-none p-3 rounded-[12px] border border-[#EAECF0] bg-white hover:border-orange-300 transition-colors">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 h-[18px] w-[18px] rounded border-[#D0D5DD] text-orange-500 focus:ring-orange-400 cursor-pointer accent-orange-500 flex-shrink-0"
                                        checked={showOnKiosk}
                                        onChange={(e) => setShowOnKiosk(e.target.checked)}
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className="flex items-center gap-2 text-[14px] font-semibold text-[#1D2939]">
                                            <Monitor size={14} className="text-orange-500" />
                                            Show on Kiosk
                                        </span>
                                        <span className="block mt-0.5 text-[12px] text-[#667085] font-medium leading-snug">
                                            Hide this category from the self-serve kiosk only. Dine-in and takeaway are unaffected.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Existing Categories */}
                    <div className="w-[50%] bg-[#F9FAFB] border-l border-[#EAECF0] p-8 overflow-y-auto no-scrollbar">
                        <h3 className="text-[18px] font-bold text-[#1D2939] mb-6">
                            Existing Categories ({categories.length.toString().padStart(2, '0')})
                        </h3>

                        <div className="space-y-4">
                            {categories.length === 0 && (
                                <>
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i} className="h-[72px] bg-white rounded-[16px] border border-[#EAECF0] animate-pulse flex items-center px-4 gap-4">
                                            <div className="w-5 h-2 bg-gray-100 rounded" />
                                            <div className="w-12 h-12 bg-gray-100 rounded-[10px]" />
                                            <div className="flex-1 space-y-2">
                                                <div className="h-4 bg-gray-100 rounded w-2/3" />
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                            {categories.map((item, index) => (
                                <div
                                    key={item._id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="flex items-center gap-3 group"
                                >
                                    {/* Drag Handle */}
                                    <div className="text-[#98A2B3] cursor-grab active:cursor-grabbing p-1">
                                        <div className="flex flex-col gap-[3px]">
                                            <div className="w-5 h-[2px] bg-[#98A2B3]"></div>
                                            <div className="w-5 h-[2px] bg-[#98A2B3]"></div>
                                        </div>
                                    </div>

                                    {/* Category Card */}
                                    <div className="flex-1 bg-white p-3.5 pl-4 rounded-[16px] border border-[#EAECF0] shadow-sm flex items-center gap-4 transition-all hover:border-orange-300">
                                        <div className="w-[48px] h-[48px] rounded-[10px] overflow-hidden bg-gray-100 flex-shrink-0">
                                            <img
                                                src={item.image || FALLBACK_IMAGE}
                                                className="w-full h-full object-cover"
                                                alt={item.name}
                                                onError={(e) => { e.target.onerror = null; e.target.src = FALLBACK_IMAGE; }}
                                            />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[15px] text-[#1D2939] font-bold truncate">
                                                {index + 1}. {item.name} <span className="text-[#98A2B3] font-medium ml-0.5">({item.itemCount || 0})</span>
                                            </div>
                                            {item.showOnKiosk === false && (
                                                <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-[#98A2B3]">
                                                    <Monitor size={11} />
                                                    Hidden on Kiosk
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-3 pr-1">
                                            {/* Status Toggle Switch */}
                                            <label className="relative inline-flex items-center cursor-pointer" title="Active / Inactive">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={item.status === 'active'}
                                                    onChange={() => toggleCategoryStatus(item._id, item.status)}
                                                />
                                                <div className="w-[44px] h-[24px] bg-[#EAECF0] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-[20px] after:w-[20px] after:transition-all peer-checked:bg-[#22C55E]"></div>
                                            </label>

                                            <button
                                                onClick={() => startEditing(item)}
                                                className="text-[#98A2B3] hover:text-[#1D2939] p-1 transition-colors"
                                                aria-label={`Edit ${item.name}`}
                                            >
                                                <Edit2 size={18} />
                                            </button>

                                            <button
                                                onClick={() => handleDeleteClick(item)}
                                                className="text-[#98A2B3] hover:text-red-500 p-1 transition-all"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 py-4 border-t border-[#EAECF0] flex items-center justify-end gap-6 bg-white">
                    <button
                        onClick={editingCategory ? cancelEditing : onClose}
                        className="text-[15px] font-bold text-orange-500 hover:text-orange-600 transition-colors uppercase tracking-wide"
                    >
                        {editingCategory ? 'Cancel Edit' : 'Cancel'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="h-[52px] px-8 bg-orange-500 text-white rounded-[14px] font-bold hover:bg-orange-600 shadow-lg shadow-orange-500/20 transition-all flex items-center gap-2.5 disabled:bg-orange-300"
                    >
                        <CheckCircle size={20} />
                        {isLoading ? 'Saving...' : (editingCategory ? 'Update Category' : 'Save Category')}
                    </button>
                </div>

            </div>

            {/* ── Force-Delete Confirmation Modal ── */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-[420px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">
                        <div className="flex flex-col items-center text-center mb-5">
                            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-4">
                                <AlertTriangle size={28} className="text-red-500" />
                            </div>
                            <h3 className="text-[18px] font-[700] text-[#1D2939] mb-2">
                                Delete "{deleteConfirm.name}"?
                            </h3>
                            <p className="text-[14px] text-[#667085] leading-relaxed">
                                This category has <span className="font-[700] text-red-600">{deleteConfirm.itemCount} menu item{deleteConfirm.itemCount > 1 ? 's' : ''}</span>.
                                Deleting it will <span className="font-[700] text-red-600">permanently remove</span> the category and all its items. This cannot be undone.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                disabled={isDeleting}
                                className="flex-1 py-3 rounded-xl border border-[#D0D5DD] text-[#344054] font-[600] text-[14px] hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmForceDelete}
                                disabled={isDeleting}
                                className="flex-1 py-3 rounded-xl bg-red-500 hover:bg-red-600 text-white font-[600] text-[14px] transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                {isDeleting ? 'Deleting...' : `Delete All (${deleteConfirm.itemCount + 1})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AddCategoryModal
