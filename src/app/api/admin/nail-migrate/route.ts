import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS public.nail_leads (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        business_name TEXT NOT NULL,
        owner_name TEXT,
        email TEXT,
        normalized_email TEXT,
        phone TEXT,
        website_url TEXT,
        vagaro_url TEXT UNIQUE,
        instagram TEXT,
        facebook TEXT,
        city TEXT,
        state TEXT,
        services TEXT[] DEFAULT '{}',
        specialty TEXT,
        review_count INTEGER DEFAULT 0,
        rating NUMERIC,
        is_independent BOOLEAN DEFAULT TRUE,
        icp_score INTEGER DEFAULT 0,
        status TEXT DEFAULT 'scraped',
        scraped_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS nail_leads_icp_score_idx ON public.nail_leads (icp_score DESC)`,
    `CREATE INDEX IF NOT EXISTS nail_leads_normalized_email_idx ON public.nail_leads (normalized_email)`,
    `CREATE INDEX IF NOT EXISTS nail_leads_vagaro_url_idx ON public.nail_leads (vagaro_url)`,
    `CREATE TABLE IF NOT EXISTS public.nail_pipeline_runs (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        ran_at TIMESTAMPTZ DEFAULT NOW(),
        processed INTEGER DEFAULT 0,
        errors TEXT[] DEFAULT '{}',
        debug TEXT[] DEFAULT '{}',
        trigger TEXT DEFAULT 'cron'
    )`,
    `CREATE TABLE IF NOT EXISTS public.nail_pipeline_config (
        id INTEGER PRIMARY KEY DEFAULT 1,
        cities TEXT[] DEFAULT ARRAY['Houston, TX','Dallas, TX','Austin, TX'],
        sessions_per_day INTEGER DEFAULT 4,
        scrapes_per_session INTEGER DEFAULT 10,
        cron_enabled BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `INSERT INTO public.nail_pipeline_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
    `CREATE TABLE IF NOT EXISTS public.nail_city_log (
        city TEXT PRIMARY KEY,
        last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
        leads_found INTEGER DEFAULT 0
    )`,
    `ALTER TABLE public.nail_leads ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.nail_pipeline_runs ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.nail_pipeline_config ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.nail_city_log ENABLE ROW LEVEL SECURITY`,
];

export async function GET(request: Request) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Check which tables already exist (PGRST205 = table not found)
    const tableChecks: Record<string, boolean> = {};
    for (const t of ['nail_leads', 'nail_pipeline_config', 'nail_pipeline_runs', 'nail_city_log']) {
        const { error } = await supabase.from(t as any).select('id', { count: 'exact', head: true }).limit(0);
        tableChecks[t] = !error || error.code !== 'PGRST205';
    }

    const FULL_CITY_LIST = [
        'New York, NY','Los Angeles, CA','Chicago, IL','Houston, TX','Phoenix, AZ',
        'Philadelphia, PA','San Antonio, TX','San Diego, CA','Dallas, TX','San Jose, CA',
        'Austin, TX','Jacksonville, FL','Fort Worth, TX','Columbus, OH','Charlotte, NC',
        'Indianapolis, IN','San Francisco, CA','Seattle, WA','Denver, CO','Nashville, TN',
        'Oklahoma City, OK','El Paso, TX','Las Vegas, NV','Washington, DC','Miami, FL',
        'Atlanta, GA','Minneapolis, MN','Raleigh, NC','Tampa, FL','New Orleans, LA',
        'Portland, OR','Sacramento, CA','Kansas City, MO','Cincinnati, OH','Orlando, FL',
        'Riverside, CA','Cleveland, OH','Pittsburgh, PA','Baltimore, MD','Virginia Beach, VA',
        'Tucson, AZ','Fresno, CA','Mesa, AZ','Albuquerque, NM','Long Beach, CA',
        'Bakersfield, CA','Honolulu, HI','Anaheim, CA','Corpus Christi, TX','Lexington, KY',
        'St. Louis, MO','St. Paul, MN','Stockton, CA','Henderson, NV','Greensboro, NC',
        'Plano, TX','Newark, NJ','Toledo, OH','Chandler, AZ','Laredo, TX',
        'Madison, WI','Durham, NC','Lubbock, TX','Garland, TX','Winston-Salem, NC',
        'Scottsdale, AZ','Baton Rouge, LA','Norfolk, VA','Jersey City, NJ','Chesapeake, VA',
        'Irvine, CA','Gilbert, AZ','Spokane, WA','Richmond, VA','Des Moines, IA',
        'Boise, ID','Tacoma, WA','Salt Lake City, UT','Birmingham, AL','Rochester, NY',
        'San Bernardino, CA','Fremont, CA','Fayetteville, NC','Little Rock, AR','Aurora, CO',
    ];

    // If config table exists, update city list to the full 80-city set
    let cityUpdateError: string | null = null;
    if (tableChecks.nail_pipeline_config) {
        const { error: upsertErr } = await supabase.from('nail_pipeline_config' as any).upsert({
            id: 1,
            cities: FULL_CITY_LIST,
            sessions_per_day: 4,
            scrapes_per_session: 10,
            cron_enabled: false,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'id', ignoreDuplicates: false });
        if (upsertErr) cityUpdateError = upsertErr.message;
    }

    const allExist = Object.values(tableChecks).every(Boolean);
    const missingTables = Object.entries(tableChecks).filter(([, v]) => !v).map(([k]) => k);

    return NextResponse.json({
        tableChecks,
        allExist,
        missingTables,
        cityUpdateError,
        citiesLoaded: FULL_CITY_LIST.length,
        message: allExist
            ? `All nail tables exist — city list updated to ${FULL_CITY_LIST.length} cities. Ready to scrape.`
            : `Tables missing: ${missingTables.join(', ')}. Run the SQL in the Supabase SQL Editor.`,
        cursorMigrationSql: 'ALTER TABLE public.nail_pipeline_config ADD COLUMN IF NOT EXISTS city_cursor INTEGER DEFAULT 0;',
        sqlEditorUrl: 'https://supabase.com/dashboard/project/vmuvjfflszhifuyvmjwh/sql/new',
    });
}
