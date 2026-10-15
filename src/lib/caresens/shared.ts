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
    maxLatestChars: 1_000_000,
    maxHistoryBytes: 48 * 1024 * 1024,
    maxHistoryScanMs: 19_000
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
}

export interface GlucoseLookupResult {
    data: unknown;
    history_complete?: boolean;
}

export interface GlucoseSummary {
    candidate_count: number;
    unit: string;
    glucose_value?: number;
    measured_at?: string | null;
    measurements?: GlucoseReading[];
    message?: string;
}

export type LookupKind = 'latest' | 'history';
