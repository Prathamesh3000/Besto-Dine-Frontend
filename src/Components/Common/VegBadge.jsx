import React from 'react'

/**
 * VegBadge — unified veg/non-veg indicator used across the app.
 *
 * Accepts EITHER:
 *   isVeg={true|false}       (boolean)
 *   vegType="veg"|"non-veg"  (string from DB)
 *
 * If both are provided, vegType takes precedence.
 */
const VegBadge = ({ isVeg, vegType, size = 'md', className = '' }) => {
    const veg = vegType ? vegType === 'veg' : !!isVeg

    const sizes = {
        xs: { outer: 'w-3.5 h-3.5 rounded-[2px] p-[2px]', inner: 'w-1.5 h-1.5' },
        sm: { outer: 'w-4 h-4 rounded-[3px] p-0.5', inner: 'w-1.5 h-1.5' },
        md: { outer: 'w-5 h-5 rounded-[4px] p-1', inner: 'w-2.5 h-2.5' },
        lg: { outer: 'w-6 h-6 rounded-[4px] p-1', inner: 'w-3 h-3' },
    }
    const s = sizes[size] || sizes.md
    const color = veg ? 'border-[#22C55E]' : 'border-[#EF4444]'
    const bg = veg ? 'bg-[#22C55E]' : 'bg-[#EF4444]'

    return (
        <div
            className={`${s.outer} border-[1.5px] ${color} bg-white flex items-center justify-center ${className}`}
            role="img"
            aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'}
        >
            <div className={`${s.inner} rounded-full ${bg}`} />
        </div>
    )
}

export default VegBadge
