import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Edit2, AlertCircle, Trash2, Loader2 } from 'lucide-react';
import { validateAreaName } from '../utils/validation'
import api from '../../../utils/api'
import toast from 'react-hot-toast';

const AddAreaModal = ({ onClose, onSubmit }) => {
    const [areaName, setAreaName] = useState('');
    const [note, setNote] = useState('');
    // Customer-facing description of this seating option (QA N12) —
    // shown on the table-booking Review step.
    const [description, setDescription] = useState('');
    const [existingAreas, setExistingAreas] = useState([]);
    const [editingAreaId, setEditingAreaId] = useState(null);

    // Confirmation Modals State
    const [areaToToggle, setAreaToToggle] = useState(null);
    // areaToDelete carries { id, name, tableCount, countLoading } so the
    // confirmation copy can warn the owner up front that N tables will
    // cascade. countLoading=true while we fetch /tables?areaId=...,
    // tableCount stays null until the request lands.
    const [areaToDelete, setAreaToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Validation state
    const [error, setError] = useState(null);
    const [touched, setTouched] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    // Fetch existing areas on mount
    useEffect(() => {
        fetchAreas();
    }, []);

    const fetchAreas = async () => {
        try {
            setIsLoading(true);
            const response = await api.get('/areas');
            setExistingAreas(response.data.areas || (Array.isArray(response.data) ? response.data : []));
        } catch (err) {
            console.error('Failed to fetch areas:', err);
            toast.error('Failed to load existing areas');
        } finally {
            setIsLoading(false);
        }
    };

    // Handle blur - validate and mark as touched
    const handleBlur = () => {
        setTouched(true);
        const validation = validateAreaName(areaName);
        setError(validation.error);
    };

    // Handle change - clear error if valid
    const handleChange = (value) => {
        setAreaName(value);
        if (touched) {
            const validation = validateAreaName(value);
            setError(validation.error);
        }
    };

    const handleSubmit = async () => {
        // Validate
        const validation = validateAreaName(areaName);
        setTouched(true);
        setError(validation.error);

        if (!validation.isValid) {
            // Land focus on the bad field so the user sees the problem.
            setTimeout(() => {
                const el = document.getElementById('areaName');
                if (el) { try { el.focus(); } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
            }, 0);
            return;
        }

        setIsSubmitting(true);

        try {
            const areaData = {
                name: areaName.trim(),
                note: note.trim(),
                description: description.trim()
            };

            // _silent so the axios interceptor doesn't fire its own toast
            // — the inline error below the field already shows it.
            if (editingAreaId) {
                await api.put(`/areas/${editingAreaId}`, areaData, { _silent: true });
                toast.success('Area updated successfully');
                setEditingAreaId(null);
                setAreaName('');
                setNote('');
                setDescription('');
                setTouched(false);
                fetchAreas();
            } else {
                const response = await api.post('/areas', areaData, { _silent: true });
                toast.success('Area created successfully');
                if (onSubmit) {
                    await onSubmit(response.data.area);
                }
                onClose();
            }
        } catch (err) {
            console.error('Failed to add area:', err);
            const errorMsg = err.response?.data?.message || err.message || 'Failed to save area';
            setError(errorMsg);
            setTouched(true);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditClick = (area) => {
        setAreaName(area.name);
        setNote(area.note || '');
        setDescription(area.description || '');
        setEditingAreaId(area._id);
        setError(null);
        setTouched(false);
    };

    const handleConfirmToggle = async () => {
        if (!areaToToggle) return;
        try {
            await api.put(`/areas/${areaToToggle.id}`, { isActive: !areaToToggle.currentStatus });
            setExistingAreas(prev => prev.map(area => 
                area._id === areaToToggle.id ? { ...area, isActive: !areaToToggle.currentStatus } : area
            ));
            toast.success(`Area ${!areaToToggle.currentStatus ? 'activated' : 'deactivated'} successfully!`);
            setAreaToToggle(null);
        } catch (err) {
            console.error('Failed to toggle status:', err);
            toast.error('Failed to toggle active status');
        }
    };

    // Open the delete-confirmation modal and kick off a background fetch
    // for the area's current table count, so the copy can say "this will
    // also delete N tables" before the owner commits. We deliberately
    // don't block the modal on the fetch — if the count load fails or is
    // slow, the owner can still proceed and the backend stays the source
    // of truth for what gets cascaded.
    const openDeleteConfirm = async (area) => {
        setAreaToDelete({ id: area._id, name: area.name, tableCount: null, countLoading: true });
        try {
            const res = await api.get(`/tables?areaId=${area._id}`, { _silent: true });
            const list = res.data?.tables || (Array.isArray(res.data) ? res.data : []);
            // Pin the count to the same area we opened — guards against a
            // stale response arriving after the owner already cancelled
            // this modal or opened a different area's delete dialog.
            setAreaToDelete(prev => (prev && prev.id === area._id
                ? { ...prev, tableCount: list.length, countLoading: false }
                : prev));
        } catch {
            setAreaToDelete(prev => (prev && prev.id === area._id
                ? { ...prev, tableCount: null, countLoading: false }
                : prev));
        }
    };

    const handleConfirmDelete = async () => {
        if (!areaToDelete || isDeleting) return;
        const target = areaToDelete;
        // Optimistic: pull the row out of the list and dismiss the confirm
        // dialog immediately so the action feels instant. Snapshot the prior
        // list so we can roll back if the request fails. We intentionally do
        // NOT call onSubmit() here — bubbling to the parent would unmount this
        // whole modal mid-task; the dashboard refresh happens on modal close.
        const snapshot = existingAreas;
        setExistingAreas(prev => prev.filter(area => area._id !== target.id));
        setAreaToDelete(null);
        setIsDeleting(true);
        try {
            const res = await api.delete(`/areas/${target.id}`, { _silent: true });
            const deletedTables = res.data?.deletedTables || 0;
            toast.success(
                deletedTables > 0
                    ? `Area deleted along with ${deletedTables} table${deletedTables === 1 ? '' : 's'}`
                    : 'Area deleted successfully'
            );
        } catch (err) {
            console.error('Failed to delete area:', err);
            toast.error(err.response?.data?.message || 'Failed to delete area');
            setExistingAreas(snapshot);
        } finally {
            setIsDeleting(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-[900px] flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">

                {/* Header Section */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-[#F2F4F7] bg-[#FFF8F6] rounded-t-2xl">
                    <h2 className="text-[20px] leading-[28px] font-[700] text-[#1D2939] font-manrope">{editingAreaId ? 'Update Area' : 'Add Area'}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close"
                        title={isSubmitting ? 'Wait for save to finish' : 'Close'}
                        className="p-2 hover:bg-white rounded-full text-[#98A2B3] hover:text-[#475467] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Modal Body - Split Layout */}
                <div className="flex-1 overflow-y-auto p-6 flex flex-col md:flex-row gap-8">

                    {/* Left Column: Form */}
                    <div className="flex-1 space-y-5">
                        {/* Area Name Field */}
                        <div>
                            <label htmlFor="areaName" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Area name <span className="text-[#F04438]">*</span>
                            </label>
                            <input
                                id="areaName"
                                type="text"
                                placeholder="e.g. Indoor seating, Garden patio, Rooftop"
                                value={areaName}
                                onChange={(e) => handleChange(e.target.value)}
                                onBlur={handleBlur}
                                aria-required="true"
                                aria-invalid={error && touched ? 'true' : 'false'}
                                aria-describedby={error && touched ? 'areaName-err' : undefined}
                                className={`w-full h-[46px] px-4 border rounded-[10px] focus:outline-none focus:ring-1 text-[14px] text-[#101828] placeholder:text-[#98A2B3] font-manrope transition-colors ${error && touched
                                    ? 'border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]'
                                    : 'border-[#D0D5DD] focus:border-orange-500 focus:ring-orange-500'
                                    }`}
                            />
                            {error && touched && (
                                <div id="areaName-err" role="alert" className="flex items-center gap-1 mt-1">
                                    <AlertCircle size={14} className="text-[#F04438]" />
                                    <span className="text-[12px] font-normal text-[#F04438] font-manrope">{error}</span>
                                </div>
                            )}
                        </div>

                        {/* Note Field */}
                        <div>
                            <label htmlFor="areaNote" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Note <span className="text-[#98A2B3] font-normal">(optional)</span>
                            </label>
                            <textarea
                                id="areaNote"
                                placeholder="Internal note — what makes this area distinct (capacity, ambience, smoking, etc.)"
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                className="w-full h-[110px] p-4 border border-[#D0D5DD] rounded-[10px] focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-[14px] text-[#101828] placeholder:text-[#98A2B3] font-manrope resize-none"
                            />
                        </div>

                        {/* Customer-facing description */}
                        <div>
                            <label htmlFor="areaDescription" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Description for customers <span className="text-[#98A2B3] font-normal">(optional)</span>
                            </label>
                            <textarea
                                id="areaDescription"
                                maxLength={300}
                                placeholder="Shown when a customer reviews a table booking — e.g. Air-conditioned seating by the windows, ideal for families."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full h-[90px] p-4 border border-[#D0D5DD] rounded-[10px] focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-[14px] text-[#101828] placeholder:text-[#98A2B3] font-manrope resize-none"
                            />
                            <p className="text-[12px] text-[#98A2B3] mt-1 text-right font-manrope">{description.length}/300</p>
                        </div>
                    </div>

                    {/* Vertical Divider (hidden on mobile) */}
                    <div className="hidden md:block w-[1px] bg-[#F2F4F7]"></div>

                    {/* Right Column: Existing Areas */}
                    <div className="flex-1 bg-[#F9FAFB] md:bg-transparent rounded-xl p-4 md:p-0">
                        <h3 className="text-[16px] leading-[24px] font-[600] text-[#101828] mb-4 font-manrope">Existing Areas</h3>

                        <div className="space-y-3">
                            {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 size={24} className="text-[#FE8301] animate-spin" />
                                </div>
                            ) : existingAreas.length === 0 ? (
                                <p className="text-[14px] text-[#98A2B3] text-center py-6 font-manrope">No areas created yet</p>
                            ) : null}
                            {existingAreas.map((area, index) => (
                                <div key={area._id} className="bg-white p-4 rounded-[12px] border border-[#F2F4F7] shadow-sm flex items-center justify-between">
                                    <div>
                                        <p className="text-[14px] font-[500] text-[#344054] font-manrope">
                                            {index + 1}. {area.name}
                                        </p>
                                        {area.note && (
                                            <p className="text-[12px] text-[#98A2B3] mt-0.5 flex items-center gap-1 font-manrope">
                                                <span className="w-1 h-1 rounded-full bg-[#98A2B3]"></span> {area.note.substring(0, 30)}{area.note.length > 30 ? '...' : ''}
                                            </p>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3">
                                        {/* Toggle Switch */}
                                        <button 
                                            onClick={() => setAreaToToggle({ id: area._id, currentStatus: area.isActive, name: area.name })}
                                            className="relative inline-flex items-center cursor-pointer"
                                        >
                                            <input type="checkbox" className="sr-only peer" checked={area.isActive} readOnly />
                                            <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#22C55E]"></div>
                                        </button>

                                        {/* Edit Button */}
                                        <button 
                                            type="button" 
                                            onClick={() => handleEditClick(area)}
                                            className={`transition-colors cursor-pointer ${editingAreaId === area._id ? 'text-orange-500' : 'text-[#98A2B3] hover:text-[#475467]'}`}
                                        >
                                            <Edit2 size={24} />
                                        </button>

                                        {/* Delete Button */}
                                        <button
                                            type="button"
                                            onClick={() => openDeleteConfirm(area)}
                                            className="text-[#98A2B3] hover:text-red-500 transition-colors cursor-pointer"
                                        >
                                            <Trash2 size={24} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

                {/* Footer Section */}
                <div className="p-6 border-t border-[#F2F4F7] bg-white rounded-b-2xl flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 py-3 text-[14px] font-[600] text-orange-500 bg-white border border-orange-500 rounded-[10px] hover:bg-orange-50 transition-all font-manrope cursor-pointer disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex-1 py-3 text-[14px] font-[600] text-white bg-orange-500 rounded-[10px] hover:bg-orange-600 shadow-lg shadow-orange-500/30 transition-all font-manrope cursor-pointer disabled:opacity-50"
                    >
                        {isSubmitting ? (editingAreaId ? 'Updating...' : 'Adding...') : (editingAreaId ? 'Update Area' : 'Add Area')}
                    </button>
                </div>
            </div>

            {/* Confirmation Modals */}
            {areaToToggle && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[16px] w-full max-w-[400px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                                <AlertCircle size={24} className="text-orange-600" />
                            </div>
                            <h3 className="text-[18px] font-[700] text-[#1D2939]">
                                Confirm {areaToToggle.currentStatus ? 'Deactivation' : 'Activation'}
                            </h3>
                        </div>
                        <p className="text-[#475467] text-[14px] leading-relaxed mb-6">
                            Are you sure you want to {areaToToggle.currentStatus ? 'deactivate' : 'activate'} the area "{areaToToggle.name}"?
                            {areaToToggle.currentStatus && " Tables associated with this area might be affected."}
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setAreaToToggle(null)}
                                className="flex-1 py-2.5 border border-[#D0D5DD] text-[#344054] rounded-[10px] font-[600] text-[14px] hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmToggle}
                                className="flex-1 py-2.5 bg-orange-500 text-white rounded-[10px] font-[600] text-[14px] hover:bg-orange-600 transition-colors"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {areaToDelete && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[16px] w-full max-w-[420px] p-6 shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-10 h-10 rounded-full bg-[#FEE4E2] flex items-center justify-center flex-shrink-0">
                                <Trash2 size={24} className="text-[#F04438]" />
                            </div>
                            <h3 className="text-[18px] font-[700] text-[#1D2939]">
                                Delete Area
                            </h3>
                        </div>
                        <p className="text-[#475467] text-[14px] leading-relaxed mb-3">
                            Are you sure you want to delete the area <span className="font-[600] text-[#1D2939]">&ldquo;{areaToDelete.name}&rdquo;</span>?
                        </p>
                        {/* Cascade warning — surfaces the table count so the
                            owner doesn't lose tables they forgot about. The
                            backend refuses tables with active orders /
                            reservations / merges; we just preview the count. */}
                        {areaToDelete.countLoading ? (
                            <p className="text-[#645E66] text-[13px] mb-6 italic">Checking how many tables this will delete…</p>
                        ) : areaToDelete.tableCount > 0 ? (
                            <div className="bg-[#FEF3F2] border border-[#FEE4E2] rounded-[10px] p-3 mb-6">
                                <p className="text-[#B42318] text-[13px] font-[500] leading-relaxed">
                                    This will also delete {areaToDelete.tableCount} table{areaToDelete.tableCount === 1 ? '' : 's'} inside this area. Their QR codes will stop working.
                                </p>
                            </div>
                        ) : (
                            <p className="text-[#645E66] text-[13px] mb-6">This area has no tables. This action cannot be undone.</p>
                        )}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setAreaToDelete(null)}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 border border-[#D0D5DD] text-[#344054] rounded-[10px] font-[600] text-[14px] hover:bg-gray-50 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 bg-[#F04438] text-white rounded-[10px] font-[600] text-[14px] hover:bg-[#D92D20] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? 'Deleting…' : (areaToDelete.tableCount > 0 ? `Delete area + ${areaToDelete.tableCount} table${areaToDelete.tableCount === 1 ? '' : 's'}` : 'Delete area')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
};

export default AddAreaModal;
