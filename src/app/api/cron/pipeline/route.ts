import { NextResponse } from 'next/server';
import { loadPipelineConfig, runPipelineSession, logPipelineRun } from '@/app/actions/outreach';

// Vercel Hobby plan allows one cron per day.
// This route runs all sessions_per_day sessions sequentially in one execution,
// with a 2-minute gap between each to spread the load.
export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { config } = await loadPipelineConfig();
    if (!config) return NextResponse.json({ skipped: true, reason: 'No config found' });

    const results: { session: number; processed: number; errors: string[] }[] = [];

    for (let i = 0; i < config.sessions_per_day; i++) {
        const result = await runPipelineSession({
            cities: config.cities,
            scrapesPerSession: config.scrapes_per_session,
        });
        await logPipelineRun(result);
        results.push({ session: i + 1, processed: result.processed, errors: result.errors });

        // Wait 2 minutes between sessions (skip after last)
        if (i < config.sessions_per_day - 1) {
            await new Promise(r => setTimeout(r, 2 * 60 * 1000));
        }
    }

    return NextResponse.json({
        success: true,
        sessions_run: config.sessions_per_day,
        results,
    });
}
