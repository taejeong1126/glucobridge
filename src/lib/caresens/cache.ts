import { createHash } from 'node:crypto';

import { getCache } from '@vercel/functions';

import type { GlucoseReading } from './shared';

/** Best-effort regional cache, never treated as durable or an authorization layer. */
export const THREE_HOURS_MS = 3 * 60 * 60 * 1000;
const TTL_SECONDS = 7 * 24 * 60 * 60;
const VERSION = 'gluco-days-v1';

function key(producerId: string, day: string): string {
    // Session + producer scoping prevents cross-account cache collisions.
    const identity = `${process.env.CARESENS_SESSION_B64 ?? ''}:${producerId}`;
    return `${VERSION}:${createHash('sha256').update(identity).digest('hex')}:${day}`;
}

export function utcDay(timestamp: number): string {
    return new Date(timestamp).toISOString().slice(0, 10);
}

export function dayStart(day: string): number {
    return Date.parse(`${day}T00:00:00.000Z`);
}

function validateDay(readings: unknown, day: string): readings is GlucoseReading[] {
    return (
        Array.isArray(readings) &&
        readings.length < 1000 &&
        readings.every((r) => {
            if (!r || typeof r !== 'object') return false;
            const item = r as Partial<GlucoseReading>;
            return (
                typeof item.glucose_value === 'number' &&
                Number.isFinite(item.glucose_value) &&
                typeof item.measured_at === 'string' &&
                utcDay(Date.parse(item.measured_at)) === day
            );
        })
    );
}

export async function readDay(producerId: string, day: string): Promise<GlucoseReading[] | null> {
    try {
        const value: unknown = await getCache().get(key(producerId, day));
        return validateDay(value, day) ? value : null;
    } catch {
        return null; // Local development or temporary Vercel cache outage.
    }
}

export async function saveCompleteDays(producerId: string, all: GlucoseReading[], rangeStart: number, rangeEnd: number, now = Date.now()): Promise<void> {
    const cutoff = now - THREE_HOURS_MS;
    const grouped = new Map<string, GlucoseReading[]>();
    for (const reading of all) {
        if (!reading.measured_at) continue;
        const ms = Date.parse(reading.measured_at);
        if (!Number.isFinite(ms) || ms > cutoff || ms < now - 91 * 86_400_000) continue;
        const day = utcDay(ms);
        // Only closed days: avoids snapshot completeness problems and delayed corrections.
        if (dayStart(day) + 24 * 60 * 60 * 1000 > cutoff || dayStart(day) < rangeStart || dayStart(day) + 86_400_000 > rangeEnd) continue;
        const list = grouped.get(day) ?? [];
        list.push(reading);
        grouped.set(day, list);
    }
    await Promise.all(
        [...grouped].map(async ([day, readings]) => {
            if (readings.length > 999) return;
            try {
                await getCache().set(key(producerId, day), readings, { ttl: TTL_SECONDS });
            } catch {
                /* best effort */
            }
        })
    );
}

/** A complete cache hit requires every UTC day to be old enough and cached. */
export async function readCompleteRange(producerId: string, start: number, end: number): Promise<GlucoseReading[] | null> {
    if (end > Date.now() - THREE_HOURS_MS) return null;
    const first = dayStart(utcDay(start));
    const last = dayStart(utcDay(end));
    const days: string[] = [];
    for (let t = first; t <= last; t += 86_400_000) {
        if (t + 86_400_000 > Date.now() - THREE_HOURS_MS) return null;
        days.push(utcDay(t));
    }
    const values = await Promise.all(days.map((day) => readDay(producerId, day)));
    if (values.some((item) => item === null)) return null;
    return (values as GlucoseReading[][]).flat().filter((r) => {
        const time = Date.parse(r.measured_at ?? '');
        return time >= start && time <= end;
    });
}

/** Optional result-level statistics cache for windows ending over three hours ago. */
export async function readStatisticsCache<T>(producerId: string, start: number, end: number): Promise<T | null> {
    if (end > Date.now() - THREE_HOURS_MS) return null;
    const cacheKey = key(producerId, `stats-v1:${new Date(start).toISOString()}:${new Date(end).toISOString()}`);
    try {
        return (await getCache().get(cacheKey)) as T | null;
    } catch {
        return null;
    }
}

export async function saveStatisticsCache<T>(producerId: string, start: number, end: number, value: T): Promise<void> {
    if (end > Date.now() - THREE_HOURS_MS) return;
    const cacheKey = key(producerId, `stats-v1:${new Date(start).toISOString()}:${new Date(end).toISOString()}`);
    try {
        await getCache().set(cacheKey, value, { ttl: TTL_SECONDS });
    } catch {
        /* best effort */
    }
}
