import { getAccessToken } from './auth';
import { readHistoryStream } from './history';
import type { GlucoseLookupResult, HistoryOptions, HistoryQuery, LookupKind } from './shared';
import { CONFIG, isRecord } from './shared';

type DeviceRecord = {
    user_id?: string;
    last_measured?: string;
};

async function apiGet(path: string, query?: URLSearchParams, timeoutMs: number = CONFIG.timeoutMs): Promise<Response> {
    const url = new URL(path, CONFIG.apiOrigin);
    if (query) url.search = query.toString();

    const response = await fetch(url, {
        headers: {
            accept: 'application/json',
            authorization: `Bearer ${await getAccessToken()}`
        },
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
    });

    if (!response.ok) throw new Error(`CareSens API returned HTTP ${response.status} (${path})`);
    if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
        throw new Error(`CareSens API returned non-JSON (${path})`);
    }
    return response;
}

async function getDeviceRecords(): Promise<DeviceRecord[]> {
    const response = await apiGet(CONFIG.devicePath);
    const payload: unknown = await response.json();
    if (!Array.isArray(payload)) throw new Error('Unexpected CareSens devices response');
    return payload.filter(isRecord) as DeviceRecord[];
}

function buildHistoryQuery(options: HistoryOptions = {}): HistoryQuery {
    const end = options.end_time ? Date.parse(options.end_time) : Date.now();
    const start = options.start_time ? Date.parse(options.start_time) : end - 3 * 60 * 60 * 1_000;
    const limit = options.limit ?? 12;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new Error('Invalid start_time/end_time');
    }
    if (end - start > 24 * 60 * 60 * 1_000) {
        throw new Error('History range must not exceed 24 hours');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 288) {
        throw new Error('History limit must be an integer between 1 and 288');
    }

    return {
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        limit
    };
}

async function resolveProducerId(explicit?: string): Promise<{
    value: string;
}> {
    const value = explicit?.trim();
    if (value) return { value };

    const records = await getDeviceRecords();
    const newest = [...records].sort((a, b) => (Date.parse(b.last_measured ?? '') || 0) - (Date.parse(a.last_measured ?? '') || 0))[0];

    if (!newest?.user_id) throw new Error('No producer_id candidate; specify producer_id');
    return { value: newest.user_id };
}

export async function glucoseLookup(kind: LookupKind, explicitProducerId?: string, historyOptions?: HistoryOptions): Promise<GlucoseLookupResult> {
    const producer = await resolveProducerId(explicitProducerId);
    const endpoint = kind === 'latest' ? CONFIG.latestPath : CONFIG.historyPath;
    const query = new URLSearchParams({ producer_id: producer.value });
    const historyQuery = kind === 'history' ? buildHistoryQuery(historyOptions) : undefined;

    if (historyQuery) {
        for (const [key, value] of Object.entries(historyQuery)) query.set(key, String(value));
    }

    const response = await apiGet(endpoint, query, kind === 'history' ? CONFIG.historyTimeoutMs : CONFIG.timeoutMs);

    if (historyQuery) {
        const history = await readHistoryStream(response, historyQuery);
        return {
            data: history.readings,
            history_complete: history.complete
        };
    }

    const declaredLength = Number(response.headers.get('content-length') ?? 0);
    if (declaredLength > CONFIG.maxLatestChars) throw new Error('Latest response unexpectedly large');
    const jsonText = await response.text();
    if (jsonText.length > CONFIG.maxLatestChars) throw new Error('Latest response unexpectedly large');

    return {
        data: JSON.parse(jsonText) as unknown
    };
}

export type { GlucoseLookupResult, GlucoseReading, GlucoseSummary, HistoryOptions, HistoryQuery } from './shared';
export { safeGlucoseSummary } from './summary';
