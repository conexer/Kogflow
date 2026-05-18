import { NextResponse } from 'next/server';
import { loadNailPipelineConfig, runNailPipelineSession, logNailRun } from '@/app/actions/outreach-nail';

export const maxDuration = 300;

// Manual runs use a fixed scrape budget — independent of the configured sliders
const MANUAL_SCRAPE_BUDGET = 20;

const ALLOWED_EMAILS = ['conexer@gmail.com'];

export async function POST(request: Request) {
    // Accept either CRON_SECRET bearer (for programmatic use) or admin email via request body
    const authHeader = request.headers.get('authorization');
    const cronOk = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    let emailOk = false;
    let body: any = {};
    try { body = await request.json(); } catch {}
    if (body?.adminEmail && ALLOWED_EMAILS.includes(body.adminEmail)) emailOk = true;

    if (!cronOk && !emailOk) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { config } = await loadNailPipelineConfig();
    if (!config) return NextResponse.json({ error: 'No config found' }, { status: 400 });

    const start = Date.now();
    const deadline = start + 240_000; // 4min budget for manual runs

    try {
        // Manual runs always use MANUAL_SCRAPE_BUDGET — never the slider value
        const result = await runNailPipelineSession({
            cities: config.cities,
            scrapes: MANUAL_SCRAPE_BUDGET,
            deadlineMs: deadline,
        });

        await logNailRun({
            processed: result.processed,
            errors: result.errors,
            debug: [`Manual run: budget=${MANUAL_SCRAPE_BUDGET} (independent of config)`, ...result.debug],
            trigger: 'manual',
        });

        return NextResponse.json({
            ok: true,
            mode: 'manual',
            budget: MANUAL_SCRAPE_BUDGET,
            processed: result.processed,
            errors: result.errors,
            debug: result.debug,
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
