import type { GlucoseReading } from './shared';

export function summarizeStatistics(readings: GlucoseReading[], start_time: string, end_time: string, complete: boolean) {
    const ordered = [...readings]
        .filter((r) => Number.isFinite(r.glucose_value) && r.measured_at && Number.isFinite(Date.parse(r.measured_at)))
        .sort((a, b) => Date.parse(a.measured_at!) - Date.parse(b.measured_at!));
    const values = ordered.map((r) => r.glucose_value);
    const n = values.length;
    const mean = n ? values.reduce((a, b) => a + b, 0) / n : null;
    const variance = n && mean !== null ? values.reduce((a, x) => a + (x - mean) ** 2, 0) / n : null;
    const std = variance === null ? null : Math.sqrt(variance);
    const inRange = values.filter((x) => x >= 70 && x <= 180).length;
    const under = values.filter((x) => x < 70).length;
    const above = values.filter((x) => x > 180).length;
    const round = (x: number | null) => (x === null ? null : Math.round(x * 100) / 100);
    const byDay = new Map<string, number[]>();
    for (const r of ordered) {
        const day = r.measured_at!.slice(0, 10);
        const group = byDay.get(day) ?? [];
        group.push(r.glucose_value);
        byDay.set(day, group);
    }
    return {
        start_time,
        end_time,
        complete,
        measurement_count: n,
        unit: 'mg/dL',
        average_glucose: round(mean),
        min_glucose: n ? Math.min(...values) : null,
        max_glucose: n ? Math.max(...values) : null,
        standard_deviation: round(std),
        coefficient_of_variation_percent: mean ? round((std! / mean) * 100) : null,
        time_in_range_percent: n ? round((inRange / n) * 100) : null,
        below_range_percent: n ? round((under / n) * 100) : null,
        above_range_percent: n ? round((above / n) * 100) : null,
        tir_method: 'sample-count approximation; gaps and unequal measurement intervals are not weighted',
        gmi_percent: mean !== null && n >= 100 && Date.parse(end_time) - Date.parse(start_time) >= 14 * 86400_000 ? round(3.31 + 0.02392 * mean) : null,
        daily: [...byDay].map(([date, items]) => ({ date, count: items.length, average_glucose: round(items.reduce((a, b) => a + b, 0) / items.length) }))
    };
}
