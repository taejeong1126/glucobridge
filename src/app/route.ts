import { NextResponse } from 'next/server';

import packageJson from '../../package.json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
    return NextResponse.json({ status: 'ok', version: packageJson.version, timestamp: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
}
