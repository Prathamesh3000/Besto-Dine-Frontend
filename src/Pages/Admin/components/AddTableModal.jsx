import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { validateTableName, validateCapacity, validateRequiredSelection } from '../utils/validation';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

const AddTableModal = ({ onClose, onSubmit, tableToEdit }) => {
    const [tableName, setTableName] = useState('');
    const [capacity, setCapacity] = useState('');
    const [area, setArea] = useState(''); // Stores area _id
    const [areaNameDisplay, setAreaNameDisplay] = useState('');
    const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
    // 'down' is the default; we flip to 'up' when the trigger sits too
    // close to the viewport bottom for the dropdown to fit (otherwise
    // the lower area options get clipped behind the screen edge).
    const [dropdownPlacement, setDropdownPlacement] = useState('down');
    const areaDropdownRef = useRef(null);
    const areaTriggerRef = useRef(null);

    const [areaOptions, setAreaOptions] = useState([]);
    // Phase 6 step 2 — optional branch assignment. `branchOptions`
    // stays an empty array for tenants without the multiBranch
    // feature, which hides the picker entirely.
    const [branchOptions, setBranchOptions] = useState([]);
    const [branch, setBranch] = useState('');
    const [submitError, setSubmitError] = useState('');

    useEffect(() => {
        if (tableToEdit) {
            setTableName(tableToEdit.name || tableToEdit.id || '');
            setCapacity(tableToEdit.capacity?.toString() || '');
            setArea(tableToEdit.area?._id || tableToEdit.area || '');
            setAreaNameDisplay(tableToEdit.area?.name || 'Select area');
            // Existing table may already be branch-scoped; preselect
            // it. populate('branch') on the backend returns a nested
            // object; raw id is also handled for robustness.
            setBranch(tableToEdit.branch?._id || tableToEdit.branch || '');
        }
    }, [tableToEdit]);

    useEffect(() => {
        const fetchAreas = async () => {
            try {
                const response = await api.get('/areas');
                const areas = response.data.areas || (Array.isArray(response.data) ? response.data : []);
                setAreaOptions(areas.filter(a => a.isActive));
            } catch (error) {
                console.error('Failed to fetch areas:', error);
            }
        };
        fetchAreas();
    }, []);

    // Phase 6 step 2 — fetch branches. _silent so a FEATURE_LOCKED
    // 403 doesn't flash a red toast on the single-location tenant
    // (which doesn't want to see branches at all). We just swallow
    // it and keep branchOptions empty.
    useEffect(() => {
        const fetchBranches = async () => {
            try {
                const response = await api.get('/branches', { _silent: true });
                setBranchOptions(response.data?.data || []);
            } catch {
                setBranchOptions([]);
            }
        };
        fetchBranches();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (areaDropdownRef.current && !areaDropdownRef.current.contains(event.target)) {
                setIsAreaDropdownOpen(false);
            }
        };

        if (isAreaDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        } else {
            document.removeEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isAreaDropdownOpen]);

    // Validation error states
    const [errors, setErrors] = useState({
        tableName: null,
        capacity: null,
        area: null
    });

    // Track if fields have been touched (for showing errors)
    const [touched, setTouched] = useState({
        tableName: false,
        capacity: false,
        area: false
    });

    const [isSubmitting, setIsSubmitting] = useState(false);

    // Validate a single field
    const validateField = (field, value) => {
        switch (field) {
            case 'tableName':
                return validateTableName(value);
            case 'capacity':
                return validateCapacity(value);
            case 'area':
                return validateRequiredSelection(value, 'Area');
            default:
                return { isValid: true, error: null };
        }
    };

    // Handle field blur - validate and mark as touched
    const handleBlur = (field) => {
        setTouched(prev => ({ ...prev, [field]: true }));

        const value = field === 'tableName' ? tableName : field === 'capacity' ? capacity : area;
        const validation = validateField(field, value);
        setErrors(prev => ({ ...prev, [field]: validation.error }));
    };

    // Handle field change - clear error if valid
    const handleChange = (field, value) => {
        switch (field) {
            case 'tableName':
                setTableName(value);
                break;
            case 'capacity':
                setCapacity(value);
                break;
            case 'area':
                setArea(value._id);
                setAreaNameDisplay(value.name);
                break;
        }

        // Clear error if field is touched and now valid
        if (touched[field]) {
            const validation = validateField(field, field === 'area' ? value._id : value);
            setErrors(prev => ({ ...prev, [field]: validation.error }));
        }
    };

    // Validate all fields
    const validateAll = () => {
        const tableNameValidation = validateTableName(tableName);
        const capacityValidation = validateCapacity(capacity);
        const areaValidation = validateRequiredSelection(area, 'Area');

        setErrors({
            tableName: tableNameValidation.error,
            capacity: capacityValidation.error,
            area: areaValidation.error
        });

        setTouched({
            tableName: true,
            capacity: true,
            area: true
        });

        return tableNameValidation.isValid && capacityValidation.isValid && areaValidation.isValid;
    };

    const handleSubmit = async () => {
        if (!validateAll()) {
            // Focus the first invalid field so the user lands on the problem.
            const firstBad = ['tableName', 'capacity', 'area'].find(k => {
                const value = k === 'tableName' ? tableName : k === 'capacity' ? capacity : area;
                return !validateField(k, value).isValid;
            });
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(firstBad);
                    if (el) { try { el.focus(); } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
                }, 0);
            }
            return;
        }

        setIsSubmitting(true);
        setSubmitError('');

        try {
            const tableData = {
                name: tableName.trim(),
                capacity: parseInt(capacity, 10),
                area: area,
                // Phase 6 step 2 — always include the branch field so
                // edits can move a table from branch A → B or clear it
                // back to tenant-level. Empty string = unassigned.
                branch: branch || '',
            };

            let response;
            // _silent so we don't double-toast — submitError banner below
            // already shows the server message inline. Without this, the
            // axios interceptor would fire its own toast on top.
            if (tableToEdit) {
                response = await api.put(`/tables/${tableToEdit._id || tableToEdit.id}`, tableData, { _silent: true });
                toast.success('Table updated successfully');
            } else {
                response = await api.post('/tables', tableData, { _silent: true });
                toast.success('Table created successfully');
            }

            if (onSubmit) {
                await onSubmit(response.data.table);
            }

            onClose();
        } catch (error) {
            console.error('Failed to add table:', error);
            const errorMsg = error.response?.data?.message || error.message || 'Failed to save table';
            setSubmitError(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Helper component for error message
    const ErrorMessage = ({ id, message }) => (
        message ? (
            <div id={id} role="alert" className="flex items-center gap-1 mt-1">
                <AlertCircle size={14} className="text-[#F04438]" />
                <span className="text-[12px] font-normal text-[#F04438] font-manrope">{message}</span>
            </div>
        ) : null
    );

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[16px] w-full max-w-[400px] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200 font-manrope mx-4">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#FFE8D6] bg-[#FFF9F5] rounded-t-[16px]">
                    <h2 className="text-[18px] font-[700] text-[#1D2939] font-manrope">{tableToEdit ? 'Update Table' : 'Add Table'}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close"
                        title={isSubmitting ? 'Wait for save to finish' : 'Close'}
                        className="p-1 hover:bg-white rounded-full text-[#98A2B3] hover:text-[#475467] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">

                    {/* Table Name Field */}
                    <div>
                        <label htmlFor="tableName" className="block text-[14px] font-[500] text-[#344054] mb-1.5 font-manrope">
                            Table name / number <span className="text-[#F04438]">*</span>
                        </label>
                        <input
                            id="tableName"
                            type="text"
                            placeholder="e.g. Table 15, Patio A2"
                            value={tableName}
                            onChange={(e) => handleChange('tableName', e.target.value)}
                            onBlur={() => handleBlur('tableName')}
                            aria-required="true"
                            aria-invalid={touched.tableName && errors.tableName ? 'true' : 'false'}
                            aria-describedby={touched.tableName && errors.tableName ? 'tableName-err' : undefined}
                            className={`w-full h-[44px] px-3.5 border rounded-[8px] focus:outline-none focus:ring-1 text-[14px] text-[#101828] placeholder:text-[#98A2B3] font-manrope transition-colors ${errors.tableName && touched.tableName
                                ? 'border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]'
                                : 'border-[#D0D5DD] focus:border-[#FE8301] focus:ring-[#FE8301]'
                                }`}
                        />
                        <ErrorMessage id="tableName-err" message={touched.tableName && errors.tableName} />
                    </div>

                    <div className="flex gap-4">
                        {/* Capacity Field */}
                        <div className="flex-1">
                            <label htmlFor="capacity" className="block text-[14px] font-[500] text-[#344054] mb-1.5 font-manrope">
                                Capacity <span className="text-[#F04438]">*</span>
                            </label>
                            <input
                                id="capacity"
                                type="text"
                                inputMode="numeric"
                                placeholder="e.g. 4"
                                value={capacity}
                                onChange={(e) => handleChange('capacity', e.target.value)}
                                onBlur={() => handleBlur('capacity')}
                                aria-required="true"
                                aria-invalid={touched.capacity && errors.capacity ? 'true' : 'false'}
                                aria-describedby={touched.capacity && errors.capacity ? 'capacity-err' : undefined}
                                className={`w-full h-[44px] px-3.5 border rounded-[8px] focus:outline-none focus:ring-1 text-[14px] text-[#101828] placeholder:text-[#98A2B3] font-manrope transition-colors ${errors.capacity && touched.capacity
                                    ? 'border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]'
                                    : 'border-[#D0D5DD] focus:border-[#FE8301] focus:ring-[#FE8301]'
                                    }`}
                            />
                            <ErrorMessage id="capacity-err" message={touched.capacity && errors.capacity} />
                        </div>

                        {/* Area Selection */}
                        <div className="flex-1">
                            <label htmlFor="area" className="block text-[14px] font-medium text-[#344054] mb-1.5 font-manrope">
                                Area / Section <span className="text-[#F04438]">*</span>
                            </label>
                            <div className="relative" ref={areaDropdownRef}>
                                <button
                                    id="area"
                                    ref={areaTriggerRef}
                                    type="button"
                                    aria-required="true"
                                    aria-haspopup="listbox"
                                    aria-expanded={isAreaDropdownOpen}
                                    aria-invalid={touched.area && errors.area ? 'true' : 'false'}
                                    aria-describedby={touched.area && errors.area ? 'area-err' : undefined}
                                    onClick={() => {
                                        // Decide placement BEFORE opening — measure space
                                        // beneath the trigger and flip upward if a 220px
                                        // dropdown wouldn't fit before the viewport edge.
                                        if (!isAreaDropdownOpen && areaTriggerRef.current) {
                                            const rect = areaTriggerRef.current.getBoundingClientRect();
                                            const spaceBelow = window.innerHeight - rect.bottom;
                                            const spaceAbove = rect.top;
                                            const dropdownHeight = 240; // 220 max-h + 8 gap + a bit of buffer
                                            setDropdownPlacement(
                                                spaceBelow < dropdownHeight && spaceAbove > spaceBelow
                                                    ? 'up'
                                                    : 'down'
                                            );
                                        }
                                        setIsAreaDropdownOpen(!isAreaDropdownOpen);
                                    }}
                                    onBlur={() => {
                                        // Slight delay to allow option click to register
                                        setTimeout(() => handleBlur('area'), 150);
                                    }}
                                    className={`w-full h-[44px] px-3.5 bg-white border rounded-[8px] flex items-center justify-between focus:outline-none focus:ring-1 text-[14px] font-manrope transition-colors hover:border-[#FE8301] ${!area ? 'text-[#98A2B3]' : 'text-[#101828]'} ${isAreaDropdownOpen
                                        ? 'border-[#FE8301] focus:ring-[#FE8301]'
                                        : errors.area && touched.area
                                            ? 'border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]'
                                            : 'border-[#D0D5DD] focus:border-[#FE8301] focus:ring-[#FE8301]'
                                        }`}
                                >
                                    <span>{areaNameDisplay || 'Select area'}</span>
                                    {isAreaDropdownOpen ? (
                                        <ChevronUp size={18} className="text-[#98A2B3] pointer-events-none" />
                                    ) : (
                                        <ChevronDown size={18} className="text-[#98A2B3] pointer-events-none" />
                                    )}
                                </button>

                                {isAreaDropdownOpen && (
                                    <div className={`absolute left-0 w-full z-[9999] bg-white border border-[#EAECF0] rounded-[12px] shadow-[0px_12px_16px_-4px_#10182814,0px_4px_6px_-2px_#10182808] overflow-y-auto overscroll-contain max-h-55 text-[14px] font-manrope font-[400] text-[#344054] ${
                                        dropdownPlacement === 'up'
                                            ? 'bottom-[calc(100%+8px)]'
                                            : 'top-[calc(100%+8px)]'
                                    }`}>
                                        <div className="flex flex-col">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setArea('');
                                                    setAreaNameDisplay('');
                                                    setIsAreaDropdownOpen(false);
                                                }}
                                                className={`px-4 py-3 text-left w-full transition-colors ${!area ? 'bg-[#ff8300] text-white font-[500]' : 'hover:bg-[#FFF3E6] hover:text-[#FE8301] border-b border-[#F2F4F7] text-[#475467]'
                                                    }`}
                                            >
                                                Select Area
                                            </button>
                                            {areaOptions.map((opt, index) => (
                                                <button
                                                    key={opt._id}
                                                    type="button"
                                                    onClick={() => {
                                                        handleChange('area', opt);
                                                        setIsAreaDropdownOpen(false);
                                                    }}
                                                    className={`px-4 py-3 text-left w-full transition-colors ${index !== areaOptions.length - 1 ? 'border-b border-[#F2F4F7]' : ''
                                                        } ${area === opt._id ? 'bg-[#ff8300] text-white font-[500]' : 'hover:bg-[#FFF3E6] hover:text-[#FE8301] text-[#475467]'
                                                        }`}
                                                >
                                                    {opt.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <ErrorMessage id="area-err" message={touched.area && errors.area} />
                        </div>
                    </div>

                    {/* Phase 6 step 2 — Branch picker. Hidden entirely
                        for tenants without any branches (single-location
                        installs and plans without the multiBranch feature).
                        Optional assignment: leave empty for a tenant-
                        level table. */}
                    {branchOptions.length > 0 && (
                        <div>
                            <label className="block text-[14px] font-[500] text-[#344054] mb-1.5 font-manrope">
                                Branch <span className="text-[#98A2B3] font-[400]">(optional)</span>
                            </label>
                            <select
                                value={branch}
                                onChange={(e) => setBranch(e.target.value)}
                                className="w-full h-[44px] px-3.5 border border-[#D0D5DD] rounded-[8px] focus:outline-none focus:ring-1 focus:border-[#FE8301] focus:ring-[#FE8301] text-[14px] text-[#101828] font-manrope bg-white transition-colors"
                            >
                                <option value="">— No branch (tenant-level) —</option>
                                {branchOptions.map(b => (
                                    <option key={b._id} value={b._id}>
                                        {b.name}{b.city ? ` · ${b.city}` : ''}
                                    </option>
                                ))}
                            </select>
                            <p className="text-[12px] text-[#8D848F] mt-1 font-manrope">
                                Assign this table to a specific location. Leave empty if your restaurant has only one site.
                            </p>
                        </div>
                    )}

                    {submitError && (
                        <div className="bg-[#FEF3F2] text-[#B42318] p-3 rounded-[8px] text-[13px] font-[500] flex items-start gap-2 border border-[#FEE4E2]">
                            <AlertCircle size={16} className="mt-0.5 shrink-0" />
                            <span>{submitError}</span>
                        </div>
                    )}

                </div>

                {/* Footer */}
                <div className="p-6 pt-2 flex gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 text-[14px] font-[600] text-[#FE8301] bg-white border border-[#FE8301] rounded-[10px] hover:bg-[#FFF3E6] transition-all font-manrope cursor-pointer disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="flex-1 py-2.5 text-[14px] font-[600] text-white bg-[#FE8301] rounded-[10px] hover:bg-[#DC6803] shadow-lg shadow-orange-500/20 transition-all font-manrope cursor-pointer disabled:opacity-50"
                    >
                        {isSubmitting ? (tableToEdit ? 'Updating...' : 'Creating...') : (tableToEdit ? 'Update Table' : 'Create Table')}
                    </button>
                </div>

            </div>
        </div>,
        document.body
    );
};

export default AddTableModal;
