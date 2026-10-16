import { getAccessToken } from './auth';
import { readCompleteRange, readStatisticsCache, saveCompleteDays, saveStatisticsCache } from './cache';
import { readHistoryStream } from './history';
import type { GlucoseLookupResult, HistoryOptions, HistoryQuery, LookupKind } from './shared';
import { CONFIG, isRecord } from './shared';

const HOUR_MS = 60 * 60 * 1_000;

async function apiGet(path: string, query?: URLSearchParams, timeoutMs: number = CONFIG.timeoutMs): Promise<Response> {
    const url = new URL(path, CONFIG.apiOrigin);
    if (query) url.search = query.toString();

    const request = (token: string) =>
        fetch(url, {
            headers: { accept: 'application/json', authorization: `Bearer ${token}` },
            cache: 'no-store',
            redirect: 'error',
            signal: AbortSignal.timeout(timeoutMs)
        });

    const token = await getAccessToken();
    let response = await request(token);

    // Some sessions do not contain expires_in; in that case an API 401 triggers refresh.
    if (response.status === 401) {
        await response.body?.cancel().catch(() => undefined);
        response = await request(await getAccessToken(token));
    }

    if (!response.ok) throw new Error(`CareSens API returned HTTP ${response.status} (${path})`);
    if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('application/json')) {
        throw new Error(`CareSens API returned non-JSON (${path})`);
    }
    return response;
}

async function readLimitedJson(response: Response, maxBytes: number): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('CareSens API response has no body');

    const decoder = new TextDecoder();
    const parts: string[] = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxBytes) throw new Error('CareSens API response is too large');
            parts.push(decoder.decode(value, { stream: true }));
        }
        parts.push(decoder.decode());
    } finally {
        await reader.cancel().catch(() => undefined);
    }

    return JSON.parse(parts.join('')) as unknown;
}

async function getDeviceRecords(): Promise<Array<{ user_id: string; last_measured?: string }>> {
    const payload = await readLimitedJson(await apiGet(CONFIG.devicePath), CONFIG.maxDevicesBytes);
    if (!Array.isArray(payload)) throw new Error('Unexpected CareSens devices response');

    return payload.filter(isRecord).flatMap((record) => {
        const userId = typeof record.user_id === 'string' ? record.user_id.trim() : '';
        return userId ? [{ user_id: userId, last_measured: typeof record.last_measured === 'string' ? record.last_measured : undefined }] : [];
    });
}

/** Parse explicit-zone ISO timestamps; never rely on the server's local timezone. */
function parseInputTime(value: string): number {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
        throw new Error('Times must be ISO 8601 with a timezone (Z or +09:00)');
    }
    return Date.parse(value);
}

export function buildHistoryQuery(options: HistoryOptions = {}): HistoryQuery {
    const end = options.end_time === undefined ? Date.now() : parseInputTime(options.end_time);
    const start = options.start_time === undefined ? end - 3 * HOUR_MS : parseInputTime(options.start_time);
    const limit = options.limit ?? 12;

    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new Error('Invalid start_time/end_time');
    }
    if (end - start > 7 * 24 * HOUR_MS) throw new Error('History range must not exceed 7 days');
    if (!Number.isInteger(limit) || limit < 1 || limit > 288) throw new Error('History limit must be an integer between 1 and 288');

    return {
        start_time: new Date(start).toISOString(),
        end_time: new Date(end).toISOString(),
        limit
    };
}

export async function resolveProducerId(explicit?: string): Promise<string> {
    const producerId = explicit?.trim();
    if (producerId) return producerId;

    const records = await getDeviceRecords();
    records.sort((a, b) => (Date.parse(b.last_measured ?? '') || 0) - (Date.parse(a.last_measured ?? '') || 0));
    if (!records[0]) throw new Error('No producer_id candidate; specify producer_id');
    return records[0].user_id;
}

export async function glucoseLookup(kind: LookupKind, explicitProducerId?: string, historyOptions?: HistoryOptions): Promise<GlucoseLookupResult> {
    // Validate the range before contacting the upstream API.
    const historyQuery = kind === 'history' ? buildHistoryQuery(historyOptions) : undefined;
    const producerId = await resolveProducerId(explicitProducerId);
    if (historyQuery) {
        const cached = await readCompleteRange(producerId, Date.parse(historyQuery.start_time), Date.parse(historyQuery.end_time));
        if (cached) {
            cached.sort((a, b) => Date.parse(b.measured_at ?? '') - Date.parse(a.measured_at ?? ''));
            return { data: cached.slice(0, historyQuery.limit), history_complete: true };
        }
    }
    const query = new URLSearchParams({ producer_id: producerId });
    if (historyQuery) {
        for (const [key, value] of Object.entries(historyQuery)) query.set(key, String(value));
    }

    const response = await apiGet(
        kind === 'latest' ? CONFIG.latestPath : CONFIG.historyPath,
        query,
        kind === 'history' ? CONFIG.historyTimeoutMs : CONFIG.timeoutMs
    );

    if (historyQuery) {
        const history = await readHistoryStream(response, historyQuery, { collectAll: true });
        if (history.complete && history.allReadings)
            await saveCompleteDays(producerId, history.allReadings, Date.parse(historyQuery.start_time), Date.parse(historyQuery.end_time));
        return { data: history.readings, history_complete: history.complete };
    }
    return { data: await readLimitedJson(response, CONFIG.maxLatestBytes) };
}

/** Up to 90 days. Cache full historical UTC days; new readings always hit upstream. */
export async function glucoseStatistics(explicitProducerId?: string, options: Omit<HistoryOptions, 'limit'> = {}) {
    const end = options.end_time === undefined ? Date.now() : parseInputTime(options.end_time);
    const start = options.start_time === undefined ? end - 7 * 24 * HOUR_MS : parseInputTime(options.start_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end || end - start > 90 * 24 * HOUR_MS) {
        throw new Error('Statistics range must be greater than 0 and at most 90 days');
    }
    const producerId = await resolveProducerId(explicitProducerId);
    const memo = await readStatisticsCache<{ readings: import('./shared').GlucoseReading[]; complete: boolean }>(producerId, start, end);
    if (memo?.complete) return { ...memo, start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString() };
    let all = await readCompleteRange(producerId, start, end);
    let complete = true;
    if (all === null) {
        const query = new URLSearchParams({ producer_id: producerId, start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString() });
        const response = await apiGet(CONFIG.historyPath, query, CONFIG.historyTimeoutMs + 30000);
        const scan = await readHistoryStream(
            response,
            { start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), limit: 1 },
            { collectAll: true, maxDurationMs: 45_000 }
        );
        all = scan.allReadings ?? [];
        complete = scan.complete;
        if (complete) await saveCompleteDays(producerId, all, start, end);
    }
    if (complete) await saveStatisticsCache(producerId, start, end, { readings: all, complete });
    return { readings: all, complete, start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString() };
}
