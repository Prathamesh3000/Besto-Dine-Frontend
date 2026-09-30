import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown, ChevronUp, AlertCircle, Link } from 'lucide-react';
import {
    validateGuestName,
    validatePhoneNumber,
    validateTime,
    validateGuestCount,
    validateRequiredSelection,
} from '../utils/validation';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

const AddReservationModal = ({ onClose, onSubmit }) => {
    const [guestName, setGuestName] = useState('');
    const [contactNo, setContactNo] = useState('');
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [time, setTime] = useState('');
    const [guestCount, setGuestCount] = useState(0);
    const [selectedArea, setSelectedArea] = useState('');
    const [selectedTable, setSelectedTable] = useState('');
    const [selectedTables, setSelectedTables] = useState([]); // merge mode: multiple table IDs
    const [notes, setNotes] = useState('');

    const [isAreaDropdownOpen, setIsAreaDropdownOpen] = useState(false);
    const [isTableDropdownOpen, setIsTableDropdownOpen] = useState(false);

    const areaDropdownRef = useRef(null);
    const tableDropdownRef = useRef(null);

    const [areaOptions, setAreaOptions] = useState([]);
    const [allTables, setAllTables] = useState([]);
    const [tableOptions, setTableOptions] = useState([]);

    useEffect(() => {
        const fetchDropdownData = async () => {
            try {
                const [areasRes, tablesRes] = await Promise.all([
                    api.get('/areas'),
                    api.get('/tables')
                ]);
                const areas = areasRes.data.areas || (Array.isArray(areasRes.data) ? areasRes.data : []);
                const tables = tablesRes.data.tables || (Array.isArray(tablesRes.data) ? tablesRes.data : []);
                setAreaOptions(areas.filter(a => a.isActive));
                setAllTables(tables);
            } catch (error) {
                console.error('Error fetching dropdown data:', error);
            }
        };
        fetchDropdownData();
    }, []);

    // Update table options when area changes
    useEffect(() => {
        if (selectedArea) {
            const available = allTables.filter(t =>
                (t.area === selectedArea || t.area?._id === selectedArea || t.area?.name === selectedArea) &&
                t.status === 'free'
            ).sort((a, b) => b.capacity - a.capacity); // Largest first for merge suggestions
            setTableOptions(available);
        } else {
            setTableOptions([]);
        }
    }, [selectedArea, allTables]);

    // ── Merge mode detection ─────────────────────────────────────────────
    const maxSingleCapacity = tableOptions.length > 0
        ? Math.max(...tableOptions.map(t => t.capacity))
        : 0;
    const needsMerge = guestCount > 0 && selectedArea && maxSingleCapacity > 0 && guestCount > maxSingleCapacity;
    const totalCombinedCapacity = tableOptions.reduce((sum, t) => sum + t.capacity, 0);
    const canFitWithMerge = totalCombinedCapacity >= guestCount;

    // Selected merge tables info
    const selectedMergeTables = tableOptions.filter(t => selectedTables.includes(t._id));
    const mergedCapacity = selectedMergeTables.reduce((sum, t) => sum + t.capacity, 0);
    const mergeCapacitySufficient = mergedCapacity >= guestCount;

    // Reset table selection when switching modes or changing area
    useEffect(() => {
        setSelectedTable('');
        setSelectedTables([]);
    }, [selectedArea, needsMerge]);

    // ── Time validation ──────────────────────────────────────────────────
    const isPastTime = (selectedTime) => {
        const today = new Date().toISOString().split('T')[0];
        if (date !== today) return false;
        const [hours, minutes] = selectedTime.split(':').map(Number);
        const now = new Date();
        if (hours < now.getHours()) return true;
        if (hours === now.getHours() && minutes <= now.getMinutes()) return true;
        return false;
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (areaDropdownRef.current && !areaDropdownRef.current.contains(event.target)) {
                setIsAreaDropdownOpen(false);
            }
            if (tableDropdownRef.current && !tableDropdownRef.current.contains(event.target)) {
                setIsTableDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // ── Validation ───────────────────────────────────────────────────────
    const [errors, setErrors] = useState({});
    const [touched, setTouched] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleIncrementGuests = () => {
        const newCount = guestCount + 1;
        setGuestCount(newCount);
        if (touched.guestCount) {
            const validation = validateGuestCount(newCount);
            setErrors(prev => ({ ...prev, guestCount: validation.error }));
        }
    };

    const handleDecrementGuests = () => {
        const newCount = guestCount > 0 ? guestCount - 1 : 0;
        setGuestCount(newCount);
        if (touched.guestCount) {
            const validation = validateGuestCount(newCount);
            setErrors(prev => ({ ...prev, guestCount: validation.error }));
        }
    };

    const toggleMergeTable = (tableId) => {
        setSelectedTables(prev =>
            prev.includes(tableId)
                ? prev.filter(id => id !== tableId)
                : [...prev, tableId]
        );
    };

    const validateField = (field, value) => {
        switch (field) {
            case 'guestName':
                return validateGuestName(value);
            case 'contactNo':
                return validatePhoneNumber(value);
            case 'time':
                const baseVal = validateTime(value);
                if (baseVal.isValid && isPastTime(value)) {
                    return { isValid: false, error: 'Cannot book for a past time today' };
                }
                return baseVal;
            case 'guestCount':
                return validateGuestCount(value);
            case 'selectedArea':
                return validateRequiredSelection(value, 'Area');
            case 'selectedTable':
                if (needsMerge) {
                    // In merge mode, validate selectedTables array instead
                    if (selectedTables.length < 2) {
                        return { isValid: false, error: 'Select at least 2 tables to merge' };
                    }
                    if (!mergeCapacitySufficient) {
                        return { isValid: false, error: `Combined capacity (${mergedCapacity}) is not enough for ${guestCount} guests` };
                    }
                    return { isValid: true, error: null };
                }
                const selectionVal = validateRequiredSelection(value, 'Table');
                if (selectionVal.isValid) {
                    const tableObj = tableOptions.find(t => t._id === value);
                    if (tableObj && tableObj.capacity < guestCount) {
                        return { isValid: false, error: `Table capacity (${tableObj.capacity}) is too small for ${guestCount} guests` };
                    }
                }
                return selectionVal;
            default:
                return { isValid: true, error: null };
        }
    };

    const handleBlur = (field, value) => {
        setTouched(prev => ({ ...prev, [field]: true }));
        const validation = validateField(field, value);
        setErrors(prev => ({ ...prev, [field]: validation.error }));
    };

    const handleChange = (field, value, setter) => {
        setter(value);
        if (touched[field]) {
            const validation = validateField(field, value);
            setErrors(prev => ({ ...prev, [field]: validation.error }));
        }
    };

    const validateAll = () => {
        const tableValue = needsMerge ? (selectedTables.length >= 2 ? 'merge' : '') : selectedTable;

        const validations = {
            guestName: validateGuestName(guestName),
            contactNo: validatePhoneNumber(contactNo),
            time: (() => {
                const base = validateTime(time);
                if (base.isValid && isPastTime(time)) return { isValid: false, error: 'Cannot book for a past time today' };
                return base;
            })(),
            guestCount: validateGuestCount(guestCount),
            selectedArea: validateRequiredSelection(selectedArea, 'Area'),
            selectedTable: validateField('selectedTable', tableValue)
        };

        const newErrors = {};
        const newTouched = {};
        let isValid = true;

        for (const [field, validation] of Object.entries(validations)) {
            newErrors[field] = validation.error;
            newTouched[field] = true;
            if (!validation.isValid) isValid = false;
        }

        setErrors(newErrors);
        setTouched(newTouched);
        return isValid;
    };

    // ── Submit ───────────────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!validateAll()) {
            // Focus the first invalid field — every error already renders
            // inline under its field, so we don't also fire a toast.
            const order = ['guestName', 'contactNo', 'time', 'guestCount', 'selectedArea', 'selectedTable'];
            const firstBad = order.find(k => errors[k] || (k === 'selectedTable' && needsMerge && selectedTables.length < 2));
            if (firstBad) {
                setTimeout(() => {
                    const el = document.getElementById(firstBad);
                    if (el) { try { el.focus(); } catch { /* noop */ } el.scrollIntoView?.({ behavior: 'smooth', block: 'center' }); }
                }, 0);
            }
            return;
        }

        setIsSubmitting(true);

        try {
            let primaryTableId = selectedTable;

            // If merge mode, merge tables first
            if (needsMerge && selectedTables.length >= 2) {
                try {
                    await api.post('/tables/merge', { tableIds: selectedTables });
                    toast.success('Tables merged successfully!');
                    // Use the largest-capacity table as the primary for the reservation
                    const sorted = [...selectedMergeTables].sort((a, b) => b.capacity - a.capacity);
                    primaryTableId = sorted[0]._id;
                } catch (mergeErr) {
                    toast.error(mergeErr.response?.data?.message || 'Failed to merge tables');
                    setIsSubmitting(false);
                    return;
                }
            }

            const reservationData = {
                guestName: guestName.trim(),
                contactNo: contactNo.trim(),
                date,
                time: time.trim(),
                guestCount,
                selectedArea,
                selectedTable: primaryTableId,
                notes: notes.trim()
            };

            if (onSubmit) {
                try {
                    // _silent so we own the error toast — keeps it
                    // contextual ("Failed to create reservation") instead
                    // of the generic interceptor message.
                    await api.post('/reservations', reservationData, { _silent: true });
                    toast.success('Reservation created successfully');
                    await onSubmit(reservationData);
                    return;
                } catch (apiError) {
                    toast.error(apiError.response?.data?.message || 'Failed to create reservation');
                    setIsSubmitting(false);
                    return;
                }
            }

            toast.success('Reservation created successfully');
            onClose();
        } catch (error) {
            console.error('Unexpected reservation error:', error);
            toast.error('An unexpected error occurred. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ── UI Helpers ───────────────────────────────────────────────────────
    const ErrorMessage = ({ field }) => {
        const error = touched[field] && errors[field];
        return error ? (
            <div id={`${field}-err`} role="alert" className="flex items-center gap-1 mt-1">
                <AlertCircle size={14} className="text-[#F04438]" />
                <span className="text-[12px] font-normal text-[#F04438] font-manrope">{error}</span>
            </div>
        ) : null;
    };

    const getInputClass = (field) => {
        const hasError = touched[field] && errors[field];
        return `w-full h-[46px] px-4 border rounded-[10px] focus:outline-none focus:ring-1 text-[14px] text-[#101828] placeholder:text-[#98A2B3] font-manrope transition-colors ${hasError
            ? 'border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]'
            : 'border-[#D0D5DD] focus:border-orange-500 focus:ring-orange-500'
            }`;
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl flex flex-col max-h-[90vh] shadow-2xl animate-in zoom-in-95 duration-200 font-manrope">

                {/* Header */}
                <div className="flex items-start justify-between p-6 pb-4 border-b border-[#F2F4F7] bg-[#FFF8F6] rounded-t-2xl shadow-[0px_2px_6px_0px_#0000001F] relative z-10">
                    <h2 className="text-[20px] leading-[28px] font-[700] text-[#1D2939] font-manrope">Add Reservation</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        aria-label="Close"
                        title={isSubmitting ? 'Wait for save to finish' : 'Close'}
                        className="p-2 hover:bg-white rounded-full text-[#98A2B3] hover:text-[#475467] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Scrollable Form Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5 no-scrollbar">

                    {/* Guest Name */}
                    <div>
                        <label htmlFor="guestName" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                            Guest name <span className="text-[#F04438]">*</span>
                        </label>
                        <input
                            id="guestName"
                            type="text"
                            autoComplete="name"
                            placeholder="Full name of the guest"
                            value={guestName}
                            onChange={(e) => handleChange('guestName', e.target.value, setGuestName)}
                            onBlur={() => handleBlur('guestName', guestName)}
                            aria-required="true"
                            aria-invalid={touched.guestName && errors.guestName ? 'true' : 'false'}
                            aria-describedby={touched.guestName && errors.guestName ? 'guestName-err' : undefined}
                            className={getInputClass('guestName')}
                        />
                        <ErrorMessage field="guestName" />
                    </div>

                    {/* Row: Contact No., Date & Time */}
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label htmlFor="contactNo" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Contact no. <span className="text-[#F04438]">*</span>
                            </label>
                            <input
                                id="contactNo"
                                type="tel"
                                inputMode="numeric"
                                autoComplete="tel"
                                placeholder="10-digit number"
                                maxLength={10}
                                value={contactNo}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    if (val.length <= 10) handleChange('contactNo', val, setContactNo);
                                }}
                                onBlur={() => handleBlur('contactNo', contactNo)}
                                aria-required="true"
                                aria-invalid={touched.contactNo && errors.contactNo ? 'true' : 'false'}
                                aria-describedby={touched.contactNo && errors.contactNo ? 'contactNo-err' : undefined}
                                className={getInputClass('contactNo')}
                            />
                            <ErrorMessage field="contactNo" />
                        </div>

                        <div>
                            <label htmlFor="date" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Date <span className="text-[#F04438]">*</span>
                            </label>
                            <input
                                id="date"
                                type="date"
                                value={date}
                                min={new Date().toISOString().split('T')[0]}
                                aria-required="true"
                                onChange={(e) => {
                                    setDate(e.target.value);
                                    if (touched.time && time) {
                                        const baseV = validateTime(time);
                                        if (baseV.isValid && e.target.value === new Date().toISOString().split('T')[0] && isPastTime(time)) {
                                            setErrors(prev => ({ ...prev, time: 'Cannot book for a past time today' }));
                                        } else {
                                            setErrors(prev => ({ ...prev, time: baseV.error }));
                                        }
                                    }
                                }}
                                className={getInputClass('date')}
                            />
                        </div>

                        <div>
                            <label htmlFor="time" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Time <span className="text-[#F04438]">*</span>
                            </label>
                            <input
                                id="time"
                                type="time"
                                value={time}
                                onChange={(e) => handleChange('time', e.target.value, setTime)}
                                onBlur={() => handleBlur('time', time)}
                                aria-required="true"
                                aria-invalid={touched.time && errors.time ? 'true' : 'false'}
                                aria-describedby={touched.time && errors.time ? 'time-err' : undefined}
                                className={getInputClass('time')}
                            />
                            <ErrorMessage field="time" />
                        </div>
                    </div>

                    {/* Row: Guest Count & Select Area */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="guestCount" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Guest count <span className="text-[#F04438]">*</span>
                            </label>
                            <div className="relative flex">
                                <input
                                    id="guestCount"
                                    type="number"
                                    inputMode="numeric"
                                    min="1"
                                    placeholder="0"
                                    value={guestCount || ''}
                                    onChange={(e) => handleChange('guestCount', parseInt(e.target.value) || 0, setGuestCount)}
                                    onBlur={() => handleBlur('guestCount', guestCount)}
                                    aria-required="true"
                                    aria-invalid={touched.guestCount && errors.guestCount ? 'true' : 'false'}
                                    aria-describedby={touched.guestCount && errors.guestCount ? 'guestCount-err' : undefined}
                                    className={`${getInputClass('guestCount')} [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]`}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 z-10">
                                    <button type="button" onClick={handleIncrementGuests} className="p-1.5 text-[#98A2B3] hover:text-orange-500 transition-colors">
                                        <ChevronUp size={14} />
                                    </button>
                                    <button type="button" onClick={handleDecrementGuests} className="p-1.5 text-[#98A2B3] hover:text-orange-500 transition-colors">
                                        <ChevronDown size={14} />
                                    </button>
                                </div>
                            </div>
                            <ErrorMessage field="guestCount" />
                        </div>

                        {/* Select Area Dropdown */}
                        <div>
                            <label htmlFor="selectedArea" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Area <span className="text-[#F04438]">*</span>
                            </label>
                            <div className="relative" ref={areaDropdownRef}>
                                <button
                                    id="selectedArea"
                                    type="button"
                                    aria-required="true"
                                    aria-haspopup="listbox"
                                    aria-expanded={isAreaDropdownOpen}
                                    aria-invalid={touched.selectedArea && errors.selectedArea ? 'true' : 'false'}
                                    aria-describedby={touched.selectedArea && errors.selectedArea ? 'selectedArea-err' : undefined}
                                    onClick={() => { setIsAreaDropdownOpen(!isAreaDropdownOpen); setIsTableDropdownOpen(false); }}
                                    onBlur={() => setTimeout(() => handleBlur('selectedArea', selectedArea), 150)}
                                    className={`w-full h-[46px] px-4 bg-white border rounded-[10px] flex items-center justify-between focus:outline-none focus:ring-1 text-[14px] font-manrope transition-colors hover:border-[#FE8301] ${!selectedArea ? 'text-[#98A2B3]' : 'text-[#101828]'} ${isAreaDropdownOpen
                                        ? 'border-[#FE8301] focus:ring-[#FE8301]'
                                        : errors.selectedArea && touched.selectedArea
                                            ? 'border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]'
                                            : 'border-[#D0D5DD]'
                                        }`}
                                >
                                    <span>{areaOptions.find(a => a._id === selectedArea)?.name || 'Select'}</span>
                                    {isAreaDropdownOpen ? <ChevronUp size={18} className="text-[#98A2B3] pointer-events-none" /> : <ChevronDown size={18} className="text-[#98A2B3] pointer-events-none" />}
                                </button>

                                {isAreaDropdownOpen && (
                                    <div className="absolute top-[calc(100%+8px)] left-0 w-full z-[9999] bg-white border border-[#EAECF0] rounded-[12px] shadow-[0px_12px_16px_-4px_#10182814,0px_4px_6px_-2px_#10182808] overflow-hidden text-[14px] font-manrope font-[400] text-[#344054]">
                                        <div className="flex flex-col">
                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); handleChange('selectedArea', '', setSelectedArea); setSelectedTable(''); setSelectedTables([]); setIsAreaDropdownOpen(false); }}
                                                className={`px-4 py-3 text-left w-full transition-colors ${!selectedArea ? 'bg-[#ff8300] text-white font-[500]' : 'hover:bg-[#FFF3E6] hover:text-[#FE8301] border-b border-[#F2F4F7] text-[#475467]'}`}>
                                                Select
                                            </button>
                                            {areaOptions.map((opt, index) => (
                                                <button key={opt._id} type="button"
                                                    onMouseDown={(e) => { e.preventDefault(); handleChange('selectedArea', opt._id, setSelectedArea); setSelectedTable(''); setSelectedTables([]); setIsAreaDropdownOpen(false); }}
                                                    className={`px-4 py-3 text-left w-full transition-colors ${index !== areaOptions.length - 1 ? 'border-b border-[#F2F4F7]' : ''} ${selectedArea === opt._id ? 'bg-[#ff8300] text-white font-[500]' : 'hover:bg-[#FFF3E6] hover:text-[#FE8301] text-[#475467]'}`}>
                                                    {opt.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <ErrorMessage field="selectedArea" />
                        </div>
                    </div>

                    {/* ── Merge Suggestion Banner ─────────────────────────────── */}
                    {needsMerge && (
                        <div className={`flex items-start gap-3 px-4 py-3 rounded-[12px] border ${canFitWithMerge ? 'bg-[#F9F5FF] border-[#E9D5FF]' : 'bg-[#FFF1F3] border-[#FECDD6]'}`}>
                            <Link size={18} className={`mt-0.5 flex-shrink-0 rotate-45 ${canFitWithMerge ? 'text-[#9E77ED]' : 'text-[#F04438]'}`} />
                            <div>
                                <p className={`text-[13px] font-[600] font-manrope ${canFitWithMerge ? 'text-[#6941C6]' : 'text-[#F04438]'}`}>
                                    {canFitWithMerge
                                        ? `No single table fits ${guestCount} guests (max: ${maxSingleCapacity}). Select multiple tables to merge.`
                                        : `Not enough total capacity in this area. Available: ${totalCombinedCapacity}, needed: ${guestCount}.`
                                    }
                                </p>
                                {canFitWithMerge && selectedTables.length >= 2 && (
                                    <p className={`text-[12px] font-[500] font-manrope mt-1 ${mergeCapacitySufficient ? 'text-[#027A48]' : 'text-[#B54708]'}`}>
                                        Selected: {selectedMergeTables.map(t => t.name).join(' + ')} = {mergedCapacity} seats
                                        {mergeCapacitySufficient ? ' ✓' : ` (need ${guestCount - mergedCapacity} more)`}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Table Selection ──────────────────────────────────────── */}
                    {needsMerge && canFitWithMerge ? (
                        /* Multi-select table list for merge mode */
                        <div>
                            <label className="block text-[14px] leading-[20px] font-[500] text-[#344054] mb-1.5 font-manrope">
                                Select Tables to Merge <span className="text-[#F04438]">*</span>
                            </label>
                            <div className="border border-[#D0D5DD] rounded-[12px] overflow-hidden divide-y divide-[#F2F4F7] max-h-[200px] overflow-y-auto">
                                {tableOptions.map(table => {
                                    const isSelected = selectedTables.includes(table._id);
                                    return (
                                        <label
                                            key={table._id}
                                            className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${isSelected ? 'bg-[#F9F5FF]' : 'hover:bg-[#FAFAFA]'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => toggleMergeTable(table._id)}
                                                className="w-4 h-4 rounded border-[#D0D5DD] text-[#FE8301] focus:ring-[#FE8301] accent-[#FE8301]"
                                            />
                                            <div className="flex-1 flex items-center justify-between">
                                                <span className={`text-[14px] font-manrope ${isSelected ? 'font-[600] text-[#6941C6]' : 'font-[400] text-[#344054]'}`}>
                                                    {table.name}
                                                </span>
                                                <span className="text-[12px] text-[#667085] font-manrope">
                                                    {table.capacity} seats
                                                </span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                            <ErrorMessage field="selectedTable" />
                        </div>
                    ) : !needsMerge ? (
                        /* Single table dropdown (normal mode) */
                        <div>
                            <label htmlFor="selectedTable" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                                Table <span className="text-[#F04438]">*</span>
                            </label>
                            <div className="relative" ref={tableDropdownRef}>
                                <button
                                    id="selectedTable"
                                    type="button"
                                    disabled={!selectedArea}
                                    aria-required="true"
                                    aria-haspopup="listbox"
                                    aria-expanded={isTableDropdownOpen}
                                    aria-invalid={touched.selectedTable && errors.selectedTable ? 'true' : 'false'}
                                    aria-describedby={touched.selectedTable && errors.selectedTable ? 'selectedTable-err' : undefined}
                                    onClick={() => { setIsTableDropdownOpen(!isTableDropdownOpen); setIsAreaDropdownOpen(false); }}
                                    onBlur={() => setTimeout(() => handleBlur('selectedTable', selectedTable), 150)}
                                    className={`w-full h-[46px] px-4 bg-white border rounded-[10px] flex items-center justify-between focus:outline-none focus:ring-1 text-[14px] font-manrope transition-colors ${!selectedArea ? 'bg-gray-50 cursor-not-allowed text-[#98A2B3]' : 'hover:border-[#FE8301] cursor-pointer'} ${!selectedTable ? 'text-[#98A2B3]' : 'text-[#101828]'} ${isTableDropdownOpen
                                        ? 'border-[#FE8301] focus:ring-[#FE8301]'
                                        : errors.selectedTable && touched.selectedTable
                                            ? 'border-[#F04438] focus:border-[#F04438] focus:ring-[#F04438]'
                                            : 'border-[#D0D5DD]'
                                        }`}
                                >
                                    <span>{tableOptions.find(t => t._id === selectedTable)?.name || 'Select'}</span>
                                    {isTableDropdownOpen ? <ChevronUp size={18} className="text-[#98A2B3] pointer-events-none" /> : <ChevronDown size={18} className="text-[#98A2B3] pointer-events-none" />}
                                </button>

                                {isTableDropdownOpen && selectedArea && (
                                    <div className="absolute top-[calc(100%+8px)] left-0 w-full z-[9999] bg-white border border-[#EAECF0] rounded-[12px] shadow-[0px_12px_16px_-4px_#10182814,0px_4px_6px_-2px_#10182808] overflow-hidden text-[14px] font-manrope font-[400] text-[#344054]">
                                        <div className="flex flex-col">
                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); handleChange('selectedTable', '', setSelectedTable); setIsTableDropdownOpen(false); }}
                                                className={`px-4 py-3 text-left w-full transition-colors ${!selectedTable ? 'bg-[#ff8300] text-white font-[500]' : 'hover:bg-[#FFF3E6] hover:text-[#FE8301] border-b border-[#F2F4F7] text-[#475467]'}`}>
                                                Select
                                            </button>
                                            {tableOptions.length === 0 ? (
                                                <div className="px-4 py-3 text-left w-full text-[#98A2B3]">No free tables in this area</div>
                                            ) : (
                                                tableOptions.map((opt, index) => (
                                                    <button key={opt._id} type="button"
                                                        onMouseDown={(e) => { e.preventDefault(); handleChange('selectedTable', opt._id, setSelectedTable); setIsTableDropdownOpen(false); }}
                                                        className={`px-4 py-3 text-left w-full transition-colors ${index !== tableOptions.length - 1 ? 'border-b border-[#F2F4F7]' : ''} ${selectedTable === opt._id ? 'bg-[#ff8300] text-white font-[500]' : 'hover:bg-[#FFF3E6] hover:text-[#FE8301] text-[#475467]'}`}>
                                                        {opt.name} (Cap: {opt.capacity})
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <ErrorMessage field="selectedTable" />
                        </div>
                    ) : null}

                    {/* Notes */}
                    <div>
                        <label htmlFor="notes" className="block text-[14px] leading-5 font-medium text-[#344054] mb-1.5 font-manrope">
                            Notes <span className="text-[#98A2B3] font-normal">(optional)</span>
                        </label>
                        <textarea
                            id="notes"
                            placeholder="Special requests, allergies, occasion (birthday, anniversary)…"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full h-[100px] p-4 border border-[#D0D5DD] rounded-[10px] focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-[14px] text-[#101828] placeholder:text-[#98A2B3] font-manrope resize-none"
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-[#F2F4F7] bg-white rounded-b-2xl">
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || (needsMerge && !canFitWithMerge)}
                        className="w-full py-3 text-[14px] font-[600] text-white bg-[#FE8301] rounded-[10px] hover:bg-[#DC6803] shadow-lg shadow-orange-500/30 transition-all font-manrope disabled:opacity-50"
                    >
                        {isSubmitting
                            ? 'Creating Reservation...'
                            : needsMerge && selectedTables.length >= 2
                                ? `Merge ${selectedTables.length} Tables & Reserve`
                                : 'Confirm Reservation'
                        }
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AddReservationModal;
