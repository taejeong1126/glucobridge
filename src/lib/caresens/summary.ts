import type { GlucoseLookupResult, GlucoseReading, GlucoseSummary } from './shared';
import { isRecord } from './shared';

const GLUCOSE_KEYS = ['glucose_value', 'glucoseValue', 'glucose', 'value', 'bg', 'sgv'] as const;
const TIME_KEYS = ['measured_at', 'measuredAt', 'measurement_time', 'timestamp', 'datetime', 'recorded_at', 'event_at', 'eventAt', 'time'] as const;
const UNIT_KEYS = ['unit', 'glucose_unit', 'glucoseUnit'] as const;
const CONTAINER_KEYS = ['data', 'items', 'records', 'results', 'cgms', 'measurements'] as const;
export const RELEVANT_KEYS = new Set<string>([...GLUCOSE_KEYS, ...TIME_KEYS, ...UNIT_KEYS]);

export function parseMeasurementTime(value: string): number {
    if (/^\d{9,10}(?:\.\d+)?$/.test(value)) return Number(value) * 1_000;
    if (/^\d{13}$/.test(value)) return Number(value);
    return Date.parse(value);
}

function parseGlucose(value: unknown): number | undefined {
    const candidate = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,4}(?:\.\d+)?$/.test(value.trim()) ? Number(value.trim()) : NaN;
    return Number.isFinite(candidate) && candidate >= 1 && candidate <= 1_000 ? candidate : undefined;
}

function parseUnit(value: unknown): GlucoseReading['unit'] {
    if (typeof value !== 'string') return undefined;
    const normalized = value.toLowerCase();
    if (normalized === 'mg/dl') return 'mg/dL';
    if (normalized === 'mmol/l') return 'mmol/L';
    return undefined;
}

export function extractReading(input: unknown): GlucoseReading | null {
    if (!isRecord(input)) return null;

    const glucose = GLUCOSE_KEYS.map((key) => parseGlucose(input[key])).find((value) => value !== undefined);
    if (glucose === undefined) return null;

    const timestamp = TIME_KEYS.map((key) => input[key]).find(
        (candidate): candidate is string | number => typeof candidate === 'string' || typeof candidate === 'number'
    );
    const unit = UNIT_KEYS.map((key) => parseUnit(input[key])).find((value) => value !== undefined);

    return {
        glucose_value: glucose,
        measured_at: timestamp === undefined ? null : String(timestamp),
        ...(unit ? { unit } : {})
    };
}

/** Flatten only known API envelope properties instead of recursively matching unrelated JSON. */
function collectCandidates(input: unknown, depth = 0): unknown[] {
    if (depth > 8) return [];
    if (Array.isArray(input)) return input.flatMap((item) => collectCandidates(item, depth + 1));
    if (!isRecord(input)) return [];

    let hasContainer = false;
    const nested = CONTAINER_KEYS.flatMap((key) => {
        const value = input[key];
        if (!Array.isArray(value) && !isRecord(value)) return [];
        hasContainer = true;
        return collectCandidates(value, depth + 1);
    });
    return hasContainer ? nested : [input];
}

export function safeGlucoseSummary(result: GlucoseLookupResult): GlucoseSummary {
    const candidates = collectCandidates(result.data);
    const readings = candidates.map(extractReading).filter((reading): reading is GlucoseReading => reading !== null);
    const summary: GlucoseSummary = { candidate_count: candidates.length };

    if (result.history_complete === undefined) {
        // The upstream latest endpoint is not guaranteed to return newest-first.
        const latest = readings.reduce<GlucoseReading | undefined>((best, reading) => {
            if (!best) return reading;
            const bestTime = best.measured_at ? parseMeasurementTime(best.measured_at) : -Infinity;
            const readingTime = reading.measured_at ? parseMeasurementTime(reading.measured_at) : -Infinity;
            return (Number.isFinite(readingTime) ? readingTime : -Infinity) > (Number.isFinite(bestTime) ? bestTime : -Infinity) ? reading : best;
        }, undefined);

        if (latest) {
            summary.glucose_value = latest.glucose_value;
            const timestamp = latest.measured_at === null ? NaN : parseMeasurementTime(latest.measured_at);
            summary.measured_at = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
            if (latest.unit) summary.unit = latest.unit;
        }
    } else {
        summary.measurements = readings;
        if (!result.history_complete) summary.partial = true;
    }

    if (readings.length === 0) {
        summary.message = summary.partial
            ? 'No matching readings in the scanned portion; history is incomplete.'
            : 'No recognized glucose measurements were found.';
    }

    summary.unit = 'mg/dL';

    return summary;
}
