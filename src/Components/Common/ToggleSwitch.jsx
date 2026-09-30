import React from 'react'

const ToggleSwitch = ({ checked, onChange, size = 'md', ariaLabel = 'Toggle', disabled = false }) => {
    const sizes = {
        sm: { track: 'w-[36px] h-[20px]', thumb: 'w-[16px] h-[16px]', move: 'translate-x-[16px]' },
        md: { track: 'w-[44px] h-[24px]', thumb: 'w-[20px] h-[20px]', move: 'translate-x-[20px]' },
    }
    const s = sizes[size] || sizes.md

    const handleClick = () => {
        if (disabled) return
        // Create a synthetic event matching what the parent expects
        onChange?.({ target: { checked: !checked } })
    }

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={ariaLabel}
            disabled={disabled}
            onClick={handleClick}
            className={`relative inline-flex items-center rounded-full transition-colors duration-200 ${s.track} ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${checked ? 'bg-[#34C759]' : 'bg-[#E5E5EA]'}`}
        >
            <span
                className={`inline-block rounded-full bg-white shadow-sm transition-transform duration-200 ${s.thumb} ${checked ? s.move : 'translate-x-[2px]'}`}
            />
        </button>
    )
}

export default ToggleSwitch
