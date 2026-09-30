// Round a raw step up to the next "nice" number (1/2/5 × 10^n) so the
// Y-axis reads as 0/100/200… instead of 0/3800/7600…. Shared between
// the chart itself and any caller that wants to decide ticks ahead of
// render (e.g. so the axis stays stable across period changes).
function niceStep(raw) {
    if (raw <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const frac = raw / pow;
    const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
    return nice * pow;
}

export function computeYTicks(values, ticks = 4) {
    const max = Math.max(0, ...values);
    if (max === 0) return [0, 100, 200, 300, 400];
    const step = niceStep(max / ticks);
    return Array.from({ length: ticks + 1 }, (_, i) => i * step);
}
