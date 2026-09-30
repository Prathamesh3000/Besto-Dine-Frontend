import React, { useState, useEffect } from 'react'
import { X, Save, Upload } from 'lucide-react'

const AddEventTypeModal = ({ isOpen, onClose, onSave, eventType }) => {
    const [name, setName] = useState('')
    const [isActive, setIsActive] = useState(true)
    const [iconUrl, setIconUrl] = useState('')
    const [iconFile, setIconFile] = useState(null)
    const [iconPreview, setIconPreview] = useState('')
    // Inline validation — shown only after the user has touched the field
    // (blurred it) so the form doesn't yell at them on mount.
    const [nameTouched, setNameTouched] = useState(false)
    const nameError = nameTouched && !name.trim() ? 'Event type name is required' : ''

    useEffect(() => {
        if (isOpen) {
            setNameTouched(false)
            if (eventType) {
                setName(eventType.title || '')
                setIsActive(eventType.status !== false)
                setIconUrl(eventType.icon || '')
                setIconPreview('')
                setIconFile(null)
            } else {
                setName('')
                setIsActive(true)
                setIconUrl('')
                setIconPreview('')
                setIconFile(null)
            }
        }
    }, [isOpen, eventType])

    // Cleanup blob preview URL on unmount
    useEffect(() => {
        return () => {
            if (iconPreview) URL.revokeObjectURL(iconPreview)
        }
    }, [iconPreview])

    const handleFileSelect = (e) => {
        const file = e.target.files[0]
        if (!file) return
        setIconFile(file)
        // Preview only — not persisted
        const preview = URL.createObjectURL(file)
        setIconPreview(preview)
    }

    // Resolve display icon: new preview > existing server path > nothing
    const BACKEND_URL = import.meta.env.VITE_API_URL?.replace(/\/api.*$/, '') || ''
    const displayIcon = iconPreview
        || (iconUrl && (iconUrl.startsWith('/uploads/') ? `${BACKEND_URL}${iconUrl}` : iconUrl))
        || ''

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center font-manrope p-4">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity"
                onClick={onClose}
            />

            <div className="relative w-[840px] max-w-full bg-white rounded-[24px] shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-8 py-5 bg-[#FFF8F0] flex justify-between items-center shrink-0">
                    <h2 className="text-[20px] font-[700] text-[#1A181B]">
                        {eventType ? 'Edit Event Type' : 'Add New Event Type'}
                    </h2>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => setIsActive(!isActive)}
                            className={`relative w-[52px] h-[28px] rounded-full transition-colors duration-200 focus:outline-none ${isActive ? 'bg-[#34C759]' : 'bg-gray-200'}`}
                        >
                            <div className={`absolute top-[2px] left-[2px] bg-white w-[24px] h-[24px] rounded-full transition-transform duration-200 shadow-sm ${isActive ? 'translate-x-[24px]' : ''}`} />
                        </button>
                        <button onClick={onClose} className="text-[#645E66] hover:text-[#1A181B] transition-colors p-1">
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="p-8 lg:p-10">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
                        {/* Event Type Name */}
                        <div>
                            <label htmlFor="eventTypeName" className="block text-[15px] font-semibold text-[#1A181B] mb-3">
                                Event type name <span className="text-red-500 ml-0.5" aria-hidden="true">*</span>
                            </label>
                            <input
                                id="eventTypeName"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                onBlur={() => setNameTouched(true)}
                                placeholder="e.g. Wedding Reception, Birthday Party"
                                aria-required="true"
                                aria-invalid={nameError ? 'true' : 'false'}
                                aria-describedby={nameError ? 'eventTypeName-err' : undefined}
                                autoFocus
                                className={`w-full h-14 px-5 rounded-xl border focus:outline-none text-[15px] placeholder:text-[#9CA3AF] ${nameError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FE8301]'}`}
                            />
                            {nameError && (
                                <p id="eventTypeName-err" role="alert" className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                                    <span aria-hidden="true">⚠</span>{nameError}
                                </p>
                            )}
                        </div>

                        {/* Icon Upload */}
                        <div>
                            <label className="block text-[15px] font-[600] text-[#1A181B] mb-3">Icon</label>
                            <div className="h-[120px] bg-[#F8F9FA] border-2 border-dashed border-gray-200 rounded-[16px] flex items-center p-6 gap-6">
                                <div className="w-[72px] h-[72px] bg-white rounded-[12px] border border-gray-100 flex items-center justify-center overflow-hidden shadow-sm shrink-0">
                                    {displayIcon ? (
                                        <img src={displayIcon} alt="Icon" className="w-12 h-12 object-contain" />
                                    ) : (
                                        <span className="text-3xl">🎂</span>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <div className="flex flex-col">
                                        <span className="text-[14px] font-[600] text-[#1A181B]">Click to upload</span>
                                        <span className="text-[12px] text-[#9CA3AF]">PNG, JPG, SVG up to 5MB</span>
                                    </div>
                                    <label className="cursor-pointer">
                                        <div className="flex items-center gap-2 px-5 py-2 border-2 border-[#FE8301] text-[#FE8301] rounded-[10px] text-[13px] font-[700] hover:bg-orange-50 transition-colors w-fit">
                                            <Upload size={16} strokeWidth={2.5} />
                                            Upload Icon
                                        </div>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleFileSelect}
                                        />
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-8 lg:px-10 pb-8 lg:pb-10 flex gap-5">
                    <button
                        onClick={onClose}
                        className="flex-1 h-[56px] border-2 border-[#FE8301] text-[#FE8301] rounded-[16px] font-[700] flex items-center justify-center gap-3 hover:bg-orange-50 transition-all text-[16px]"
                    >
                        <X size={20} strokeWidth={2.5} /> Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (!name.trim()) { setNameTouched(true); return }
                            onSave?.({
                                ...eventType,
                                id: eventType?.id,
                                title: name,
                                icon: iconUrl,
                                iconFile: iconFile,
                                status: isActive
                            })
                            onClose()
                        }}
                        disabled={!name.trim()}
                        className="flex-1 h-[56px] bg-[#FE8301] text-white rounded-[16px] font-[700] flex items-center justify-center gap-3 hover:bg-[#e07400] transition-all text-[16px] shadow-lg shadow-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save size={20} strokeWidth={2} /> Save Event Type
                    </button>
                </div>
            </div>
        </div>
    )
}

export default AddEventTypeModal
