import { after } from 'next/server';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
    loadNailPipelineConfig,
    saveNailPipelineConfig,
    runNailPipelineSession,
    logNailRun,
    countTodayNailCronRuns,
} from '@/app/actions/outreach-nail';

export const maxDuration = 300;

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        // Log auth failure so we can debug cron misconfiguration
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!,
        );
        await supabase.from('nail_pipeline_runs').insert({
            ran_at: new Date().toISOString(),
            processed: 0,
            errors: [`CRON_AUTH_FAIL: header="${(authHeader ?? 'none').slice(0, 40)}"`],
            trigger: 'cron',
        }).then(null, () => {});
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { config } = await loadNailPipelineConfig();
    if (!config) return NextResponse.json({ skipped: true, reason: 'No config found' });
    if (!config.cron_enabled) return NextResponse.json({ skipped: true, reason: 'Schedule stopped' });

    after(async () => {
        const start = Date.now();

        // Check daily session cap before counting this run
        const todayRuns = await countTodayNailCronRuns();
        if (todayRuns >= config.sessions_per_day) return;

        const sessionBudget = Math.max(60_000, 270_000 - (Date.now() - start) - 10_000);

        const cursor = config.city_cursor ?? 0;
        const result = await runNailPipelineSession({
            cities: config.cities,
            scrapes: config.scrapes_per_session,
            deadlineMs: Date.now() + sessionBudget,
            cursor,
        });

        await saveNailPipelineConfig({ city_cursor: result.newCursor });

        await logNailRun({
            processed: result.processed,
            errors: result.errors,
            debug: [
                `Cron session ${todayRuns + 1}/${config.sessions_per_day}, budget=${config.scrapes_per_session}, cursor=${cursor}→${result.newCursor}`,
                ...result.debug,
            ],
            trigger: 'cron',
        });
    });

    return NextResponse.json({ accepted: true }, { status: 202 });
}
