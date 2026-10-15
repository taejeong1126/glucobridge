import type { GlucoseReading, HistoryQuery } from './shared';
import { CONFIG } from './shared';
import { extractReading, parseMeasurementTime, RELEVANT_KEYS } from './summary';

type Scalar = string | number;

export interface ScanResult {
    readings: GlucoseReading[];
    complete: boolean;
}

interface JsonFrame {
    kind: 'object' | 'array';
    key: string | null;
    expectingKey: boolean;
    fields: Record<string, Scalar>;
}

export async function readHistoryStream(response: Response, query: HistoryQuery): Promise<ScanResult> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('History response has no body');

    const decoder = new TextDecoder();
    const stack: JsonFrame[] = [];
    const readings: GlucoseReading[] = [];
    const started = Date.now();
    const startMs = Date.parse(query.start_time);
    const endMs = Date.parse(query.end_time);
    const maxScalarLength = 256;
    const maxDepth = 128;
    let bytesRead = 0;
    let complete = false;
    let insideString = false;
    let escaping = false;
    let scalarText = '';
    let scalarTruncated = false;
    let atom = '';

    const parent = (): JsonFrame | undefined => stack[stack.length - 1];

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
        readings.push(reading);
        readings.sort((a, b) => parseMeasurementTime(b.measured_at!) - parseMeasurementTime(a.measured_at!));
        if (readings.length > query.limit) readings.length = query.limit;
    }

    try {
        while (bytesRead < CONFIG.maxHistoryBytes && Date.now() - started <= CONFIG.maxHistoryScanMs) {
            const { done, value } = await reader.read();
            if (done) {
                complete = stack.length === 0 && !insideString;
                break;
            }
            bytesRead += value.byteLength;
            const chunk = decoder.decode(value, { stream: true });

            for (const ch of chunk) {
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
        complete
    };
}
