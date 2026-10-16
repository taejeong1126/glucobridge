export const CONFIG = {
    apiOrigin: 'https://cgm.i-sens.com:10000',
    authOrigin: 'https://accounts.i-sens.com',
    clientId: '816a0b2c-9a90-4873-adcc-c48444a20f06',
    devicePath: '/v1/user-devices',
    latestPath: '/v1/cgms/latest',
    historyPath: '/v1/cgms',
    timeoutMs: 15_000,
    historyTimeoutMs: 25_000,
    refreshLeewayMs: 60_000,
    maxLatestBytes: 1 * 1024 * 1024,
    maxDevicesBytes: 1 * 1024 * 1024,
    maxHistoryBytes: 48 * 1024 * 1024,
    maxHistoryScanMs: 45_000
} as const;

export function isRecord(input: unknown): input is Record<string, unknown> {
    return typeof input === 'object' && input !== null && !Array.isArray(input);
}

export interface HistoryOptions {
    start_time?: string;
    end_time?: string;
    limit?: number;
}

export type HistoryQuery = Required<HistoryOptions>;

export interface GlucoseReading {
    glucose_value: number;
    measured_at: string | null;
    unit?: 'mg/dL' | 'mmol/L';
}

export interface GlucoseLookupResult {
    data: unknown;
    /** True if the entire upstream history response was consumed. */
    history_complete?: boolean;
    /** All matched readings, retained internally for optional day caching. */
}

export interface GlucoseSummary {
    candidate_count: number;
    glucose_value?: number;
    measured_at?: string | null;
    unit?: 'mg/dL' | 'mmol/L';
    measurements?: GlucoseReading[];
    /** Only emitted when the upstream history scan stopped early. */
    partial?: true;
    message?: string;
}

export type LookupKind = 'latest' | 'history';
