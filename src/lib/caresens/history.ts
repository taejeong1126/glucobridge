import type { GlucoseReading, HistoryQuery } from './shared';
import { CONFIG } from './shared';
import { extractReading, parseMeasurementTime, RELEVANT_KEYS } from './summary';

type Scalar = string | number;

export interface ScanResult {
    readings: GlucoseReading[];
    complete: boolean;
    allReadings?: GlucoseReading[];
}

interface JsonFrame {
    kind: 'object' | 'array';
    key: string | null;
    expectingKey: boolean;
    fields: Record<string, Scalar>;
}

export async function readHistoryStream(
    response: Response,
    query: HistoryQuery,
    limits: { maxBytes?: number; maxDurationMs?: number; collectAll?: boolean } = {}
): Promise<ScanResult> {
    if (!response.body) throw new Error('History response has no body');
    const reader = response.body.getReader();

    const decoder = new TextDecoder();
    const stack: JsonFrame[] = [];
    const readings: GlucoseReading[] = [];
    const allReadings: GlucoseReading[] | undefined = limits.collectAll ? [] : undefined;
    const started = Date.now();
    const startMs = Date.parse(query.start_time);
    const endMs = Date.parse(query.end_time);
    const maxScalarLength = 256;
    const maxBytes = limits.maxBytes ?? CONFIG.maxHistoryBytes;
    const maxDurationMs = limits.maxDurationMs ?? CONFIG.maxHistoryScanMs;
    const maxDepth = 128;
    let bytesRead = 0;
    let complete = false;
    let insideString = false;
    let escaping = false;
    let scalarText = '';
    let scalarTruncated = false;
    let atom = '';
    let rootClosed = false;
    let rootOpened = false;

    const parent = (): JsonFrame | undefined => stack[stack.length - 1];

    // A stalled upstream chunk must not keep the function alive beyond the scan deadline.
    function readWithDeadline(remainingMs: number): Promise<ReadableStreamReadResult<Uint8Array> | null> {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => resolve(null), remainingMs);
            reader.read().then(
                (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                (error: unknown) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            );
        });
    }

    function storeScalar(value: Scalar | null): void {
        const frame = parent();
        if (frame?.kind !== 'object' || frame.key === null) return;
        if (value !== null && RELEVANT_KEYS.has(frame.key)) {
            frame.fields[frame.key] = value;
        }
        frame.key = null;
    }

    function flushAtom(): void {
        const text = atom.trim();
        atom = '';
        if (!text) return;
        const number = Number(text);
        storeScalar(text !== 'true' && text !== 'false' && text !== 'null' && Number.isFinite(number) ? number : null);
    }

    function closeObject(frame: JsonFrame): void {
        const reading = extractReading(frame.fields);
        if (!reading?.measured_at) return;

        const timestamp = parseMeasurementTime(reading.measured_at);
        if (!Number.isFinite(timestamp) || timestamp < startMs || timestamp > endMs) return;
        reading.measured_at = new Date(timestamp).toISOString();
        allReadings?.push(reading);
        readings.push(reading);
        readings.sort((a, b) => parseMeasurementTime(b.measured_at!) - parseMeasurementTime(a.measured_at!));
        if (readings.length > query.limit) readings.length = query.limit;
    }

    try {
        while (bytesRead < maxBytes && Date.now() - started <= maxDurationMs) {
            const next = await readWithDeadline(Math.max(1, maxDurationMs - (Date.now() - started)));
            if (!next) break;
            if (next.done) {
                if (!rootOpened) throw new Error('Malformed history JSON: missing object/array root');
                complete = rootClosed && stack.length === 0 && !insideString;
                break;
            }
            const { value } = next;
            const available = Math.min(value.byteLength, maxBytes - bytesRead);
            bytesRead += available;
            const chunk = decoder.decode(value.subarray(0, available), { stream: true });

            for (const ch of chunk) {
                if (rootClosed && !/\s/.test(ch)) throw new Error('Malformed history JSON after root value');
                if (insideString) {
                    if (escaping) {
                        escaping = false;
                        if (!scalarTruncated) scalarText += `\\${ch}`;
                    } else if (ch === '\\') {
                        escaping = true;
                    } else if (ch === '"') {
                        insideString = false;
                        let decoded: string | null = null;
                        if (!scalarTruncated) {
                            try {
                                decoded = JSON.parse(`"${scalarText}"`) as string;
                            } catch {}
                        }
                        const frame = parent();
                        if (frame?.kind === 'object' && frame.expectingKey) {
                            frame.key = decoded;
                            frame.expectingKey = false;
                        } else {
                            storeScalar(decoded);
                        }
                        scalarText = '';
                        scalarTruncated = false;
                    } else if (!scalarTruncated) {
                        scalarText += ch;
                    }
                    if (scalarText.length > maxScalarLength) scalarTruncated = true;
                    continue;
                }

                if (ch === '"') {
                    flushAtom();
                    insideString = true;
                    escaping = false;
                    scalarText = '';
                    scalarTruncated = false;
                } else if (ch === '{' || ch === '[') {
                    if (stack.length === 0) {
                        if (rootOpened) throw new Error('Malformed history JSON: multiple roots');
                        rootOpened = true;
                    }
                    flushAtom();
                    storeScalar(null);
                    if (stack.length >= maxDepth) throw new Error('History JSON nesting too deep');
                    stack.push({ kind: ch === '{' ? 'object' : 'array', key: null, expectingKey: ch === '{', fields: {} });
                } else if (ch === '}' || ch === ']') {
                    flushAtom();
                    const frame = stack.pop();
                    if (!frame || (ch === '}' && frame.kind !== 'object') || (ch === ']' && frame.kind !== 'array')) {
                        throw new Error('Malformed history JSON structure');
                    }
                    if (frame.kind === 'object') closeObject(frame);
                    if (stack.length === 0) rootClosed = true;
                } else if (ch === ',') {
                    flushAtom();
                    const frame = parent();
                    if (frame?.kind === 'object') frame.expectingKey = true;
                } else if (ch === ':' || /\s/.test(ch)) {
                    flushAtom();
                } else if (atom.length < 64) {
                    atom += ch;
                }
            }
        }
    } finally {
        try {
            await reader.cancel();
        } catch {}
    }

    return {
        readings,
        complete,
        ...(allReadings ? { allReadings } : {})
    };
}
