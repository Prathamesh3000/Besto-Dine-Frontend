import React, { useState, useEffect } from 'react';
import { Link, X, AlertTriangle, Loader2 } from 'lucide-react';
import { mergeStatusColors as statusColors, mergeStatusTextColors as statusTextColors, hoverShadows, LEGEND_ITEMS } from '../utils/tableStyles.jsx';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

const MergeTables = ({ onCancel, onComplete }) => {
    const [selectedTables, setSelectedTables] = useState([]);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [activeFilter, setActiveFilter] = useState('All');
    
    const [tables, setTables] = useState([]);
    const [areas, setAreas] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchMergeData = async () => {
            try {
                const [tablesRes, areasRes] = await Promise.all([
                    api.get('/tables'),
                    api.get('/areas')
                ]);
                setTables(tablesRes.data.tables || (Array.isArray(tablesRes.data) ? tablesRes.data : []));
                setAreas(areasRes.data.areas || (Array.isArray(areasRes.data) ? areasRes.data : []));
            } catch (error) {
                console.error('Failed to fetch data for merge:', error);
            }
        };
        fetchMergeData();
    }, []);

    const filters = ['All', ...areas.filter(a => a.isActive).map(a => a.name)];

    const processedTables = tables.map(table => {
        const tableArea = areas.find(a => a._id === (table.area?._id || table.area) || a.name === table.area?.name);
        const isAreaActive = table.area?.isActive !== undefined 
            ? table.area.isActive 
            : (tableArea ? tableArea.isActive : true);
        
        const isTableSpecificallyDisabled = table.status === 'disabled' || table.isActive === false;
        
        return {
            ...table,
            isAreaActive,
            status: (!isAreaActive || isTableSpecificallyDisabled) ? 'disabled' : (table.status || 'free')
        };
    });

    // Filter tables based on active area filter
    const filteredTables = activeFilter === 'All'
        ? processedTables
        : processedTables.filter(table => (table.area?.name || table.area) === activeFilter);

    const toggleSelect = (tableId) => {
        const table = processedTables.find(t => (t._id || t.id) === tableId);
        
        // Cannot select merged or disabled tables
        if (!table || table.status === 'merged' || table.status === 'disabled' || table.status === 'reserved' || table.status === 'alert') {
            if (table) {
                if (table.status === 'disabled') toast.error("Cannot merge a disabled table.");
                if (table.status === 'merged') toast.error("This table is already part of another merge.");
                if (table.status === 'reserved') toast.error("Cannot merge a reserved table. Clear the reservation first.");
                if (table.status === 'alert') toast.error("Please resolve the table alert before merging.");
            }
            return;
        }

        // Selection logic
        if (selectedTables.includes(tableId)) {
            setSelectedTables(selectedTables.filter((id) => id !== tableId));
            return;
        }

        // Check area compatibility
        if (selectedTables.length > 0) {
            const firstTable = processedTables.find(t => (t._id || t.id) === selectedTables[0]);
            const tableAreaId = table.area?._id || table.area;
            const firstAreaId = firstTable?.area?._id || firstTable?.area;
            
            if (tableAreaId !== firstAreaId) {
                toast.error("You can only merge tables from the same area.");
                return;
            }

            // Check occupied status compatibility (Max 1 occupied table allowed)
            const currentlySelected = selectedTables.map(id => processedTables.find(t => (t._id || t.id) === id));
            const hasOccupied = currentlySelected.some(t => t.status === 'occupied');
            
            if (hasOccupied && table.status === 'occupied') {
                toast.error("Multiple tables have active orders. You can only merge one occupied table with free tables.");
                return;
            }
        }

        setSelectedTables([...selectedTables, tableId]);
    };

    const handleConfirmMerge = async () => {
        setIsSubmitting(true);
        try {
            await api.post('/tables/merge', { tableIds: selectedTables });
            toast.success('Tables merged successfully!');
            onComplete(selectedTables); // Notifies parent to close/refresh
            setShowConfirmModal(false);
        } catch (error) {
            console.error('Error merging tables:', error);
            const errorMsg = error.response?.data?.message || 'Failed to merge tables';
            toast.error(errorMsg);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Calculate total capacity
    const totalCapacity = selectedTables.reduce((acc, tableId) => {
        const table = processedTables.find(t => (t._id || t.id) === tableId);
        return acc + (table ? table.capacity : 0);
    }, 0);

    return (
        <div className="flex flex-col h-full relative">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 flex-shrink-0">
                <div>
                    <h1 className="text-[20px] leading-[32px] font-[700] text-[#1D2939] font-manrope">Merge Tables</h1>
                    <p className="text-[16px] leading-[20px] text-[#645E66] mt-1 font-[600] font-manrope">Combine two or more tables for larger groups</p>
                </div>

                <div className="flex items-center gap-4">
                    <div className="h-[40px] px-4 bg-[#F9F1FB] border-[0.5px] border-[#EFAEFF] text-[#AD09D4] text-[14px] leading-[20px] font-[500] rounded-[10px] font-manrope flex items-center justify-center">
                        {selectedTables.length} Tables Selected
                    </div>
                    <button
                        disabled={selectedTables.length < 2}
                        onClick={() => setShowConfirmModal(true)}
                        className={`h-[40px] px-5 rounded-[10px] font-[500] text-[14px] leading-[20px] font-manrope transition-all flex items-center gap-2 ${selectedTables.length >= 2
                            ? 'bg-[#FE8301] text-white hover:bg-[#DC6803] cursor-pointer'
                            : 'bg-[#DFDCE0] text-[#B6AEB8] cursor-not-allowed opacity-100'
                            }`}
                    >
                        <Link size={18} className="rotate-45" />
                        Complete Merge
                    </button>
                    <button
                        onClick={onCancel}
                        className="h-[40px] flex items-center text-[#FE8301] font-[500] text-[14px] leading-[20px] font-manrope hover:text-[#DC6803] transition-colors cursor-pointer"
                    >
                        Cancel
                    </button>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 mb-4 overflow-x-auto pb-2 no-scrollbar">
                {filters.map(filter => (
                    <button
                        key={filter}
                        onClick={() => setActiveFilter(filter)}
                        className={`h-[36px] px-4 py-2 rounded-[50px] text-[14px] leading-[20px] font-manrope font-[600] border-[1.5px] transition-all whitespace-nowrap cursor-pointer ${activeFilter === filter
                            ? 'bg-white text-[#702083] border-[#702083] shadow-[0px_2px_8px_0px_#00000029]'
                            : 'bg-white text-[#344054] border-[#D0D5DD] hover:bg-gray-50'
                            }`}
                    >
                        {filter}
                    </button>
                ))}
            </div>

            <div className="bg-white p-6 rounded-[20px]">
                {/* Legend */}
                <div className="flex items-center gap-6 mb-4 text-sm flex-wrap">
                    {LEGEND_ITEMS.map(l => (
                        <div key={l.label} className="flex items-center gap-2">
                            <div className={`w-4 h-4 ${l.bg} border ${l.border} rounded shadow-sm ${l.opacity ? 'opacity-50' : ''} flex items-center justify-center`}>
                                {l.icon && <AlertTriangle size={10} className="text-[#F5CD00]" />}
                            </div>
                            <span className="text-gray-600">{l.label}</span>
                        </div>
                    ))}
                </div>

                {/* Tables Grid */}
                <div className="flex flex-wrap gap-4 overflow-y-auto pb-4">
                    {filteredTables.map((table) => {
                        const tId = table._id || table.id;
                        const isSelected = selectedTables.includes(tId);
                        const isMerged = table.status === 'merged';
                        const isDisabled = table.status === 'disabled';
                        const isAlert = table.status === 'alert';
                        const isReserved = table.status === 'reserved';
                        // Cannot select merged, disabled, reserved or alert tables
                        const isSelectable = !isMerged && !isDisabled && !isReserved && !isAlert;

                        const hoverShadow = hoverShadows[table.status] || '';

                        return (
                            <div
                                key={tId}
                                onClick={() => toggleSelect(tId)}
                                className={`
                                        w-[110px] p-4 rounded-[12px] border transition-all relative
                                        ${statusColors[table.status]}
                                        ${hoverShadow}
                                        ${!isSelectable ? 'cursor-not-allowed' : 'cursor-pointer'}
                                        ${isSelected && isSelectable ? '!border-[#AD09D4] ring-1 ring-[#AD09D4] !bg-[#F9F1FB]' : ''}
                                    `}
                            >
                                {/* Merged Badge - Top Right */}
                                {isMerged && (
                                    <div className="absolute top-2 right-2">
                                        <span className="px-2 py-0.5 bg-white text-[#AD09D4] text-[10px] font-[600] rounded-[6px] font-manrope border-[1.5px] border-[#AD09D4]">
                                            Merged
                                        </span>
                                    </div>
                                )}

                                {isReserved && (
                                    <div className="absolute top-2 right-2">
                                        <span className="px-2 py-0.5 bg-white text-[#007AFF] text-[10px] font-[600] rounded-[6px] font-manrope border-[1.5px] border-[#007AFF]">
                                            Reserved
                                        </span>
                                    </div>
                                )}

                                <div className="flex items-start justify-between mb-2">
                                    <span className={`text-[18px] leading-[24px] font-[700] font-manrope ${isMerged || isDisabled ? 'text-gray-400' : statusTextColors[table.status]}`}>
                                        {table.name || table.id}
                                    </span>
                                    {isAlert && (
                                        <AlertTriangle size={16} className="text-[#FF3B30]" />
                                    )}
                                    {isSelectable && !isAlert && (
                                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${isSelected ? 'bg-[#AD09D4] border-[#AD09D4]' : 'border-[#D0D5DD] bg-white'}`}>
                                            {isSelected && (
                                                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                                                    <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <p className={`text-[12px] leading-[18px] font-[600] font-manrope ${isMerged || isDisabled ? 'text-[#AAAAAA]' : 'text-[#667085]'}`}>
                                    Capacity: {table.capacity}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Confirm Merge Modal */}
            {showConfirmModal && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[16px] w-full max-w-[400px] overflow-hidden shadow-xl transform transition-all">
                        {/* Modal Header */}
                        <div className="bg-[#FFF9F5] px-6 py-4 flex justify-between items-center border-b border-[#FFE8D6]">
                            <h3 className="text-[18px] font-[700] text-[#1D2939] font-manrope">Confirm Table Merge</h3>
                            <button onClick={() => setShowConfirmModal(false)} className="text-[#98A2B3] hover:text-[#667085] transition-colors">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6">
                            {/* Detailed Card */}
                            <div className="bg-[#FDF4FF] border border-[#E4A5FF] rounded-[12px] p-4 flex items-center justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="bg-[#F0D5FF] p-2 rounded-[8px] text-[#AD09D4]">
                                        <Link size={18} className="rotate-45" />
                                    </div>
                                    <span className="text-[#AD09D4] font-[600] font-manrope text-[16px]">
                                        {selectedTables.length} Tables selected
                                    </span>
                                </div>
                                <div className="bg-white border border-[#E4A5FF] text-[#AD09D4] text-[12px] font-[600] px-3 py-1 rounded-full font-manrope">
                                    Total Cap: {totalCapacity}
                                </div>
                            </div>

                            <p className="text-[#667085] text-[14px] font-[500] font-manrope mb-6 text-center">
                                Combine selected tables into a single unit of {totalCapacity}? 
                                {selectedTables.some(id => processedTables.find(t => (t._id || t.id) === id).status === 'occupied') && (
                                    <span className="block mt-2 text-[#FE8301] font-[600]">Note: Existing orders will be moved to the new merged unit.</span>
                                )}
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowConfirmModal(false)}
                                    className="flex-1 w-full border border-[#FE8301] text-[#FE8301] py-2.5 rounded-[10px] font-[600] font-manrope hover:bg-[#FFF3E6] transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleConfirmMerge}
                                    className={`flex-1 w-full bg-[#FE8301] text-white py-2.5 rounded-[10px] font-[600] font-manrope transition-colors flex justify-center items-center ${
                                        isSubmitting ? 'opacity-70 cursor-not-allowed' : 'hover:bg-[#DC6803]'
                                    }`}
                                >
                                    {isSubmitting ? 'Merging...' : 'Merge Now'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MergeTables;
