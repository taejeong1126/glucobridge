import { timingSafeEqual } from 'node:crypto';

import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';

import { glucoseLookup, type HistoryOptions, safeGlucoseSummary } from '@/lib/caresens';

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
            description: 'Retrieve latest CareSens glucose; include event_at timestamp if returned. Do not infer units when absent.',
            inputSchema: z.object({ producer_id: z.string().min(1).optional() })
        },
        async ({ producer_id }) => lookupResponse('latest', producer_id)
    );
    server.registerTool(
        'caresens_get_glucose_history',
        {
            description:
                'Retrieve up to 24 hours of glucose history (default 3 hours). start_time/end_time are ISO 8601 and limit defaults to 12; The tool streams large upstream responses and filters records locally; results may be incomplete if the upstream scan hits resource limits.',
            inputSchema: z.object({
                producer_id: z.string().min(1).optional(),
                start_time: z.string().optional(),
                end_time: z.string().optional(),
                limit: z.number().int().min(1).max(288).optional()
            })
        },
        async ({ producer_id, start_time, end_time, limit }) => lookupResponse('history', producer_id, { start_time, end_time, limit })
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
