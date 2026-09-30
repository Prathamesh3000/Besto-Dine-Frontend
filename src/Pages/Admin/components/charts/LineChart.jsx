import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { computeYTicks } from './chartUtils';

const LineChart = ({
    data = [],
    height = 200,
    color = '#2F80ED',
    yTicks,
    peakIndex = null,
    currentIndex = null,
    formatValue = (v) => `₹${Number(v).toLocaleString('en-IN')}`,
}) => {
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(500);
    const [tooltip, setTooltip] = useState(null);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(([entry]) => {
            setContainerWidth(Math.round(entry.contentRect.width));
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    const width = containerWidth;
    const resolvedTicks = useMemo(
        () => yTicks && yTicks.length ? yTicks : computeYTicks(data.map(d => d.value)),
        [yTicks, data]
    );
    const allZero = useMemo(() => data.every(d => !d.value), [data]);

    const hasData = data.length >= 2;
    const maxY = Math.max(...resolvedTicks) || 1;
    const padding = { top: 24, right: 20, bottom: 30, left: 44 };
    const chartWidth = Math.max(0, width - padding.left - padding.right);
    const chartHeight = height - padding.top - padding.bottom;
    const denom = Math.max(1, data.length - 1);

    const getX = (index) => padding.left + (index / denom) * chartWidth;
    const getY = (value) => height - padding.bottom - (value / maxY) * chartHeight;

    const points = useMemo(
        () => hasData ? data.map((d, i) => ({ x: getX(i), y: getY(d.value), ...d })) : [],
        // getX/getY are pure over (width, height, denom, maxY); listing the
        // ingredients keeps the memo stable when data/layout don't change.
        [data, hasData, width, height, chartWidth, chartHeight, maxY, denom, padding.left, padding.bottom] // eslint-disable-line react-hooks/exhaustive-deps
    );

    const pathData = points.reduce((acc, point, i, a) => {
        if (i === 0) return `M ${point.x},${point.y}`;
        const prev = a[i - 1];
        const cp1x = prev.x + (point.x - prev.x) * 0.4;
        const cp2x = point.x - (point.x - prev.x) * 0.4;
        return `${acc} C ${cp1x},${prev.y} ${cp2x},${point.y} ${point.x},${point.y}`;
    }, '');

    const areaPath = hasData
        ? `${pathData} L ${points[points.length - 1].x},${height - padding.bottom} L ${points[0].x},${height - padding.bottom} Z`
        : '';

    // Space labels by the widest label (hours like "11:00 AM" ≈ 56px)
    // so they never overlap regardless of how many buckets we render.
    const labelSkip = Math.max(1, Math.ceil(Math.max(1, data.length) / Math.max(1, Math.floor(chartWidth / 60))));

    const handleMouseMove = useCallback((e) => {
        if (!points.length) return;
        const svg = containerRef.current?.querySelector('svg');
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        let nearest = 0;
        let minDist = Infinity;
        for (let i = 0; i < points.length; i++) {
            const dist = Math.abs(points[i].x - mouseX);
            if (dist < minDist) { minDist = dist; nearest = i; }
        }
        if (minDist < 30) {
            setTooltip({ index: nearest, x: points[nearest].x, y: points[nearest].y, value: points[nearest].value, label: points[nearest].label });
        } else {
            setTooltip(null);
        }
    }, [points]);

    const handleMouseLeave = useCallback(() => setTooltip(null), []);

    if (!hasData) {
        return (
            <div ref={containerRef} className="w-full h-full flex items-center justify-center text-gray-400">
                <p className="text-[14px] font-[500]">No earnings data to display</p>
            </div>
        );
    }

    const peakPoint = peakIndex != null && peakIndex >= 0 && peakIndex < points.length && points[peakIndex].value > 0
        ? points[peakIndex] : null;
    const currentPoint = currentIndex != null && currentIndex >= 0 && currentIndex < points.length
        ? points[currentIndex] : null;

    return (
        <div ref={containerRef} className="w-full h-full relative" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
            <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="Earnings trend chart">
                <defs>
                    <linearGradient id="lineChartAreaFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                        <stop offset="100%" stopColor={color} stopOpacity="0" />
                    </linearGradient>
                </defs>

                {resolvedTicks.map((tick, i) => {
                    const yPos = getY(tick);
                    return (
                        <g key={`y-${tick}-${i}`}>
                            <line x1={padding.left} y1={yPos} x2={width - padding.right} y2={yPos} stroke="#E5E7EB" strokeDasharray="4 4" strokeWidth="1" />
                            <text x={padding.left - 10} y={yPos + 4} textAnchor="end" className="fill-gray-400 font-manrope" style={{ fontSize: '10px', fontWeight: 500 }}>
                                {tick >= 1000 ? `${(tick / 1000).toFixed(tick % 1000 === 0 ? 0 : 1)}k` : tick}
                            </text>
                        </g>
                    );
                })}

                {/* Current-position guide (e.g. current hour) drawn behind data */}
                {currentPoint && (
                    <line
                        x1={currentPoint.x} y1={padding.top}
                        x2={currentPoint.x} y2={height - padding.bottom}
                        stroke={color} strokeWidth="1" strokeDasharray="2 3" opacity="0.35"
                    />
                )}

                <path d={areaPath} fill="url(#lineChartAreaFill)" />
                <path d={pathData} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {points.map((p, i) => {
                    const isTooltip = tooltip?.index === i;
                    const isPeak = peakPoint && i === peakIndex;
                    const isCurrent = currentPoint && i === currentIndex;
                    const r = isTooltip ? 5 : isPeak ? 4.5 : isCurrent ? 4 : 3;
                    const fill = isPeak ? color : 'white';
                    return (
                        <circle
                            key={`dot-${i}`}
                            cx={p.x} cy={p.y} r={r}
                            fill={fill} stroke={color} strokeWidth="2"
                            className="transition-all duration-150"
                        />
                    );
                })}

                {/* Peak annotation — only when there's real data and it isn't
                    being occluded by the hover tooltip. */}
                {peakPoint && !allZero && tooltip?.index !== peakIndex && (
                    <g transform={`translate(${peakPoint.x}, ${peakPoint.y - 14})`}>
                        <rect x="-28" y="-14" width="56" height="16" rx="4" fill={color} opacity="0.95" />
                        <text x="0" y="-2" textAnchor="middle" fill="white" style={{ fontSize: '9px', fontWeight: 700 }}>
                            Peak
                        </text>
                    </g>
                )}

                {tooltip && (
                    <line x1={tooltip.x} y1={padding.top} x2={tooltip.x} y2={height - padding.bottom} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.4" />
                )}

                {data.map((d, i) => {
                    if (!d.label) return null;
                    if (i % labelSkip !== 0 && i !== data.length - 1 && i !== 0) return null;
                    return (
                        <text key={`x-${i}`} x={getX(i)} y={height - 5} textAnchor="middle" className="fill-gray-400 font-manrope" style={{ fontSize: '10px', fontWeight: 500 }}>
                            {d.label}
                        </text>
                    );
                })}
            </svg>

            {tooltip && (
                <div
                    className="absolute pointer-events-none bg-[#1A181B] text-white px-3 py-1.5 rounded-lg shadow-lg text-center z-10"
                    style={{ left: tooltip.x, top: tooltip.y - 44, transform: 'translateX(-50%)' }}
                >
                    <p className="text-[11px] font-[500] opacity-70">{tooltip.label}</p>
                    <p className="text-[13px] font-[700]">{formatValue(tooltip.value)}</p>
                </div>
            )}

            {allZero && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <p className="text-[13px] font-[500] text-gray-400 bg-white/80 px-3 py-1 rounded-full">
                        No earnings recorded yet
                    </p>
                </div>
            )}
        </div>
    );
};

export default LineChart;
