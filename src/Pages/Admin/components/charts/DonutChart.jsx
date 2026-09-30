import React, { useMemo } from 'react';

const DonutChart = ({
    data = [],
    size = 160,
    thickness = 20,
    centerLabel = '',
    centerSubLabel = '',
    showSegmentLabels = false,
    startAngle = -90
}) => {
    const radius = size / 2;
    const innerRadius = radius - thickness;
    const circumference = 2 * Math.PI * innerRadius;
    const total = data.reduce((acc, item) => acc + item.value, 0);

    // Pre-compute slice offsets immutably
    const slices = useMemo(() => {
        let runningAngle = 0;
        return data.map((item) => {
            const sliceAngle = total > 0 ? (item.value / total) * 360 : 0;
            const dashArray = total > 0 ? (item.value / total) * circumference : 0;
            const dashOffset = total > 0 ? -((runningAngle / 360) * circumference) : 0;
            const midAngle = runningAngle + sliceAngle / 2;
            runningAngle += sliceAngle;
            return { ...item, sliceAngle, dashArray, dashOffset, midAngle };
        });
    }, [data, total, circumference]);

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg
                width={size}
                height={size}
                viewBox={`0 0 ${size} ${size}`}
                style={{ transform: `rotate(${startAngle}deg)` }}
                role="img"
                aria-label={centerLabel ? `Chart: ${centerLabel}` : 'Donut chart'}
            >
                {total === 0 ? (
                    <circle cx={radius} cy={radius} r={innerRadius} fill="transparent" stroke="#F3F4F6" strokeWidth={thickness} />
                ) : (
                    slices.map((slice, index) => (
                        <circle
                            key={slice.label || index}
                            cx={radius}
                            cy={radius}
                            r={innerRadius}
                            fill="transparent"
                            stroke={slice.color}
                            strokeWidth={thickness}
                            strokeDasharray={`${slice.dashArray} ${circumference}`}
                            strokeDashoffset={slice.dashOffset}
                            strokeLinecap="butt"
                        />
                    ))
                )}
            </svg>

            {/* Segment Labels */}
            {showSegmentLabels && total > 0 && (
                <div className="absolute inset-0 pointer-events-none">
                    {slices.map((slice, index) => {
                        if (slice.value === 0) return null;
                        const rad = (slice.midAngle + startAngle) * (Math.PI / 180);
                        const labelRadius = radius - thickness / 2;
                        const x = radius + labelRadius * Math.cos(rad);
                        const y = radius + labelRadius * Math.sin(rad);

                        return (
                            <div
                                key={slice.label || index}
                                className="absolute flex items-center justify-center px-2 py-0.5 rounded-md backdrop-blur-sm bg-white/40 shadow-sm border border-white/50"
                                style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
                            >
                                <span className="text-[14px] font-[600] text-[#1A181B] font-manrope">
                                    {slice.value}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Center Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center font-manrope pointer-events-none">
                <span className="text-[20px] font-[700] text-[#1A181B] leading-[26px] text-center">{centerLabel}</span>
                {centerSubLabel && (
                    <span className="text-[11px] text-[#645E66] font-[500] leading-[100%] text-center">{centerSubLabel}</span>
                )}
            </div>
        </div>
    );
};

export default DonutChart;
