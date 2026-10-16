import { timingSafeEqual } from 'node:crypto';

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

import { glucoseLookup, glucoseStatistics, type HistoryOptions, safeGlucoseSummary, summarizeStatistics } from '@/lib/caresens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function lookupResponse(kind: 'latest' | 'history', producerId?: string, options?: HistoryOptions) {
    try {
        const data = await glucoseLookup(kind, producerId, options);
        return { content: [{ type: 'text' as const, text: JSON.stringify(safeGlucoseSummary(data)) }] };
    } catch (error) {
        const fallback = kind === 'latest' ? 'Glucose lookup failed' : 'History lookup failed';
        return { isError: true, content: [{ type: 'text' as const, text: String(error instanceof Error ? error.message : fallback) }] };
    }
}

const handler = createMcpHandler((server) => {
    server.registerTool(
        'caresens_get_latest_glucose',
        {
            description: 'Get the latest CareSens glucose measurement. Unit is included only when provided by CareSens; do not infer one.',
            inputSchema: z.object({ producer_id: z.string().min(1).optional() })
        },
        async ({ producer_id }) => lookupResponse('latest', producer_id)
    );
    server.registerTool(
        'caresens_get_glucose_history',
        {
            description:
                'Get up to 7 days of CareSens history (default 3 hours, default limit 12). ISO 8601 timestamps must include Z or an offset. The response has partial=true when scanning stopped early; do not treat partial data as complete.',
            inputSchema: z.object({
                producer_id: z.string().min(1).optional(),
                start_time: z.string().optional(),
                end_time: z.string().optional(),
                limit: z.number().int().min(1).max(288).optional()
            })
        },
        async ({ producer_id, start_time, end_time, limit }) => lookupResponse('history', producer_id, { start_time, end_time, limit })
    );
    server.registerTool(
        'caresens_get_glucose_statistics',
        {
            description:
                'Calculate CareSens glucose statistics for up to 90 days (default 7 days). Older complete UTC days are cached for 7 days; the latest three hours are never cached. Statistics are calculated from returned CGM samples, and completeness must be checked.',
            inputSchema: z.object({
                producer_id: z.string().min(1).optional(),
                start_time: z.string().optional(),
                end_time: z.string().optional()
            })
        },
        async ({ producer_id, start_time, end_time }) => {
            try {
                const result = await glucoseStatistics(producer_id, { start_time, end_time });
                return {
                    content: [
                        {
                            type: 'text' as const,
                            text: JSON.stringify(summarizeStatistics(result.readings, result.start_time, result.end_time, result.complete))
                        }
                    ]
                };
            } catch (error) {
                return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : 'Statistics lookup failed' }] };
            }
        }
    );
});

async function guarded(req: Request, ctx: { params: Promise<{ secret: string }> }): Promise<Response> {
    const { secret } = await ctx.params;
    const expected = process.env.CARESENS_ROUTE_SECRET;
    if (
        !expected ||
        !/^[a-f0-9]{64}$/.test(expected) ||
        !/^[a-f0-9]{64}$/.test(secret) ||
        !timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(secret, 'hex'))
    ) {
        return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
    }
    const response = await handler(req);
    response.headers.set('cache-control', 'no-store');
    response.headers.set('referrer-policy', 'no-referrer');
    response.headers.set('x-robots-tag', 'noindex, nofollow');
    return response;
}

export { guarded as DELETE, guarded as GET, guarded as POST };
