import { CONFIG, isRecord } from './shared';

type CareSensSession = {
    tokens: {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
    };
    token_endpoint: string;
    acquired_at: number;
};

let sessionCache: CareSensSession | undefined;
let refreshInFlight: Promise<string> | undefined;

function optionalTokenFields(tokens: Record<string, unknown>) {
    return {
        ...(typeof tokens.refresh_token === 'string' ? { refresh_token: tokens.refresh_token } : {}),
        ...(typeof tokens.expires_in === 'number' ? { expires_in: tokens.expires_in } : {})
    };
}

function loadSession(): CareSensSession {
    const base64 = process.env.CARESENS_SESSION_B64;
    if (!base64) throw new Error('CARESENS_SESSION_B64 missing');

    try {
        const decoded = Buffer.from(base64, 'base64').toString('utf8');
        const input: unknown = JSON.parse(decoded);
        if (!isRecord(input) || !isRecord(input.tokens)) {
            throw new Error('Invalid CareSens session');
        }

        const tokens = input.tokens;
        if (typeof tokens.access_token !== 'string' || !tokens.access_token) {
            throw new Error('CareSens session is missing access_token');
        }
        if (typeof input.token_endpoint !== 'string' || new URL(input.token_endpoint).origin !== CONFIG.authOrigin) {
            throw new Error('Unexpected CareSens token endpoint');
        }
        if (typeof input.acquired_at !== 'number' || !Number.isFinite(input.acquired_at)) {
            throw new Error('Invalid session acquired_at');
        }

        return {
            acquired_at: input.acquired_at,
            token_endpoint: input.token_endpoint,
            tokens: {
                access_token: tokens.access_token,
                ...optionalTokenFields(tokens)
            }
        };
    } catch (error) {
        if (error instanceof Error && error.message.startsWith('Unexpected CareSens')) throw error;
        throw new Error('Invalid CARESENS_SESSION_B64; export the CareSens session again');
    }
}

async function refreshAccessToken(session: CareSensSession): Promise<string> {
    if (!session.tokens.refresh_token) {
        throw new Error('CareSens refresh_token missing; re-login needed');
    }

    const response = await fetch(session.token_endpoint, {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: CONFIG.clientId,
            refresh_token: session.tokens.refresh_token
        }),
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(CONFIG.timeoutMs)
    });

    if (!response.ok) {
        throw new Error(`CareSens token refresh failed (HTTP ${response.status}); re-login may be needed`);
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.access_token !== 'string') {
        throw new Error('CareSens token refresh response is invalid');
    }

    sessionCache = {
        ...session,
        acquired_at: Date.now(),
        tokens: {
            ...session.tokens,
            access_token: payload.access_token,
            ...optionalTokenFields(payload)
        }
    };

    return sessionCache.tokens.access_token;
}

export async function getAccessToken(): Promise<string> {
    sessionCache ??= loadSession();
    const { tokens, acquired_at } = sessionCache;
    const expiresAt = acquired_at + (tokens.expires_in ?? 0) * 1_000;

    if (!tokens.expires_in || Date.now() < expiresAt - CONFIG.refreshLeewayMs) {
        return tokens.access_token;
    }

    refreshInFlight ??= refreshAccessToken(sessionCache).finally(() => {
        refreshInFlight = undefined;
    });
    return refreshInFlight;
}
