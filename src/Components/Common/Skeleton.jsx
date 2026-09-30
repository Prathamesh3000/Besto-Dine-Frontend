import React from 'react';

/**
 * Pulsing-grey building block for skeleton screens.
 *
 * Use shape primitives below for specific layouts; reach for the raw
 * <Skeleton /> only when none of them fit. The brand colour shimmer is
 * `bg-gray-200` → if you need a darker variant on top of an already-grey
 * card, pass `className="bg-gray-300"` to override.
 */
export const Skeleton = ({ className = '', ...rest }) => (
    <div
        className={`animate-pulse rounded bg-gray-200 ${className}`}
        aria-hidden="true"
        {...rest}
    />
);

/** A single line of placeholder text. width = % of container. */
export const SkeletonText = ({ width = '100%', className = '' }) => (
    <Skeleton className={`h-3.5 ${className}`} style={{ width }} />
);

/** Small avatar / icon placeholder. */
export const SkeletonAvatar = ({ size = 36, className = '' }) => (
    <Skeleton
        className={`rounded-full ${className}`}
        style={{ width: size, height: size }}
    />
);

/** Card placeholder used for top-row dashboard stat cards. */
export const SkeletonCard = ({ className = '' }) => (
    <div className={`p-4 rounded-xl border border-gray-100 bg-white ${className}`}>
        <Skeleton className="h-4 w-1/3 mb-3" />
        <Skeleton className="h-8 w-1/2 mb-2" />
        <Skeleton className="h-3 w-1/4" />
    </div>
);

/** Grid of stat cards (used in admin Dashboard.jsx). */
export const SkeletonStatGrid = ({ count = 4, className = '' }) => (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`}>
        {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
);

/** Table-cell grid for TablesDashboard live-feed view. */
export const SkeletonTablesGrid = ({ count = 12, className = '' }) => (
    <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 ${className}`}>
        {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
    </div>
);

/** Generic list-row placeholder (orders, staff, customers, etc.). */
export const SkeletonRow = ({ className = '' }) => (
    <div className={`flex items-center gap-3 py-3 border-b border-gray-100 ${className}`}>
        <SkeletonAvatar />
        <div className="flex-1 space-y-2">
            <SkeletonText width="40%" />
            <SkeletonText width="60%" />
        </div>
        <Skeleton className="h-6 w-16" />
    </div>
);

export const SkeletonRows = ({ count = 6, className = '' }) => (
    <div className={className}>
        {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
);

export default Skeleton;
