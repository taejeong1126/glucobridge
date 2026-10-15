import { app } from 'electron';
import { createHash, randomBytes } from 'node:crypto';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
const authOrigin = 'https://accounts.i-sens.com';
const clientId = '816a0b2c-9a90-4873-adcc-c48444a20f06';
const redirectUri = 'm-csair.i-sens.com:/redirect/authorization';
const scope = 'openid email profile offline_access';
let session = null;

async function getAuthConfig() {
    const response = await fetch(`${authOrigin}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`OIDC discovery HTTP ${response.status}`);

    const config = await response.json();
    for (const key of ['authorization_endpoint', 'token_endpoint']) {
        if (new URL(config[key]).origin !== authOrigin) throw Error('Unexpected OAuth endpoint origin');
    }
    return config;
}

export async function beginLogin() {
    const config = await getAuthConfig();
    const verifier = randomBytes(32).toString('base64url');
    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const url = new URL(config.authorization_endpoint);

    for (const [key, value] of Object.entries({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirectUri,
        scope,
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256'
    })) {
        url.searchParams.set(key, value);
    }

    return { url: url.href, verifier, state, tokenEndpoint: config.token_endpoint };
}

export function readSession() {
    return session;
}

export async function removeSavedSession() {
    try {
        await unlink(join(app.getPath('userData'), 'care-sens-session.bin'));
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
}

async function tokenRequest(endpoint, form) {
    if (new URL(endpoint).origin !== authOrigin) throw Error('Untrusted token endpoint');
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
        body: new URLSearchParams(form),
        redirect: 'error',
        signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw Error(`OAuth token exchange HTTP ${response.status}`);
    const tokens = await response.json();
    if (!tokens.access_token) throw Error('No access_token in response');
    return tokens;
}
export async function finishLogin(callbackUrl, pending) {
    if (!pending) throw Error('먼저 로그인 시작 버튼을 눌러주세요.');
    const got = new URL(callbackUrl);
    const expected = new URL(redirectUri);
    if (got.protocol !== expected.protocol || got.host !== expected.host || got.pathname !== expected.pathname) throw Error('잘못된 redirect URI');
    if (got.searchParams.get('state') !== pending.state) throw Error('OAuth state 검증 실패');
    if (got.searchParams.has('error')) throw Error('OAuth: ' + got.searchParams.get('error'));
    const code = got.searchParams.get('code');
    if (!code) throw Error('리디렉션 URL에 code가 없습니다');
    const tokens = await tokenRequest(pending.tokenEndpoint, {
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: redirectUri,
        code,
        code_verifier: pending.verifier
    });
    session = { tokens, token_endpoint: pending.tokenEndpoint, acquired_at: Date.now() };
    return true;
}
