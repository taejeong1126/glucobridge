import type { GlucoseLookupResult, GlucoseReading, GlucoseSummary } from './shared';
import { isRecord } from './shared';

const GLUCOSE_KEYS = ['glucose_value', 'glucoseValue', 'glucose', 'value', 'bg', 'sgv'] as const;
export const TIME_KEYS = ['measured_at', 'measuredAt', 'measurement_time', 'timestamp', 'datetime', 'recorded_at', 'event_at', 'eventAt', 'time'] as const;
export const RELEVANT_KEYS = new Set<string>([...GLUCOSE_KEYS, ...TIME_KEYS]);

export function parseMeasurementTime(value: string): number {
    if (/^\d{10}(?:\.\d+)?$/.test(value)) return Number(value) * 1_000;
    if (/^\d{13}$/.test(value)) return Number(value);
    return Date.parse(value);
}

export function extractReading(input: unknown): GlucoseReading | null {
    if (!isRecord(input)) return null;

    let glucose: number | undefined;
    for (const key of GLUCOSE_KEYS) {
        const candidate = input[key];
        if (typeof candidate === 'number' && Number.isFinite(candidate)) {
            glucose = candidate;
            break;
        }
    }
    if (glucose === undefined || glucose < 1 || glucose > 1_000) return null;

    const timestamp = TIME_KEYS.map((key) => input[key]).find(
        (candidate): candidate is string | number => typeof candidate === 'string' || typeof candidate === 'number'
    );

    return {
        glucose_value: Math.round(glucose),
        measured_at: timestamp === undefined ? null : String(timestamp)
    };
}

export function safeGlucoseSummary(result: GlucoseLookupResult): GlucoseSummary {
    const root = result.data;
    let candidates: unknown[] = [];

    if (Array.isArray(root)) {
        candidates = root;
    } else if (isRecord(root)) {
        candidates = [root];
        for (const name of ['data', 'items', 'records', 'results', 'cgms', 'measurements']) {
            const nested = root[name];
            if (Array.isArray(nested)) {
                candidates = nested;
                break;
            }
            if (isRecord(nested)) candidates.push(nested);
        }
    }

    const readings = candidates.map(extractReading).filter((reading): reading is GlucoseReading => reading !== null);

    const summary: GlucoseSummary = {
        candidate_count: candidates.length,
        unit: 'mg/dL'
    };

    if (result.history_complete === undefined) {
        const latest = readings[0];
        if (latest) {
            summary.glucose_value = latest.glucose_value;
            summary.measured_at = latest.measured_at;
        }
    } else {
        summary.measurements = readings;
    }

    if (readings.length === 0) {
        summary.message =
            result.history_complete === false
                ? 'No matching readings in the scanned portion. History scan was incomplete.'
                : 'No recognized glucose measurements were found.';
    }
    return summary;
}
