'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const ZYTE_API_KEY = process.env.ZYTE_API_KEY!;
const MOONDREAM_API_KEY = process.env.MOONDREAM_API_KEY!;
const CAPMONSTER_API_KEY = process.env.CAPMONSTER_API_KEY!;
const KIE_API_KEY = process.env.KIE_AI_API_KEY!;

const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID!;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET!;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN!;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface ScrapedListing {
    address: string;
    city: string;
    price: number;
    daysOnMarket: number;
    priceReduced: boolean;
    photoCount: number;
    photos: string[];
    agentName: string;
    agentPhone?: string;
    agentEmail?: string;
    listingUrl: string;
    movotoMessageUrl?: string;
    keywords: string[];
    score?: number;
}

// ─────────────────────────────────────────────
// 1. ICP SCORING
// ─────────────────────────────────────────────

export async function scoreICP(listing: Partial<ScrapedListing>): Promise<number> {
    let score = 0;
    const kw = listing.keywords?.join(' ').toLowerCase() || '';

    if (kw.includes('vacant') || kw.includes('unfurnished') || kw.includes('immediate occupancy')) score += 40;
    if (listing.priceReduced) score += 25;
    if ((listing.daysOnMarket || 0) >= 60) score += 20;
    else if ((listing.daysOnMarket || 0) >= 30) score += 5;
    if ((listing.photoCount || 99) < 15) score += 10;

    return score;
}

// ─────────────────────────────────────────────
// 2. ZYTE SCRAPER — Movoto listing extraction
// ─────────────────────────────────────────────

export async function scrapeMovotoCity(city: string, maxListings: number = 10): Promise<{ listings?: ScrapedListing[]; error?: string }> {
    if (!ZYTE_API_KEY) return { error: 'ZYTE_API_KEY not configured' };

    try {
        const searchUrl = `https://www.movoto.com/search/?city=${encodeURIComponent(city)}&sort=listed_asc&priceLow=200000&priceHigh=600000&propertyTypes=single-family,condo`;

        // Use Zyte's browser rendering to get the full page
        const zyteRes = await fetch('https://api.zyte.com/v1/extract', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${ZYTE_API_KEY}:`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: searchUrl,
                browserHtml: true,
                httpResponseBody: false,
            }),
        });

        if (!zyteRes.ok) {
            const err = await zyteRes.text();
            return { error: `Zyte error ${zyteRes.status}: ${err}` };
        }

        const zyteData = await zyteRes.json();
        const html: string = zyteData.browserHtml || '';

        // Parse listings from HTML — extract JSON-LD or meta data
        const listings: ScrapedListing[] = [];

        // Extract listing cards using regex patterns from Movoto's HTML structure
        const addressMatches = html.matchAll(/"streetAddress"\s*:\s*"([^"]+)"/g);
        const priceMatches = html.matchAll(/"price"\s*:\s*"?\$?([\d,]+)"?/g);

        const addresses = Array.from(addressMatches).map(m => m[1]);
        const prices = Array.from(priceMatches).map(m => parseInt(m[1].replace(/,/g, '')));

        // Build basic listing objects (Zyte will give us richer data with AutoExtract)
        for (let i = 0; i < Math.min(addresses.length, maxListings); i++) {
            const listing: ScrapedListing = {
                address: addresses[i] || `Unknown Address ${i}`,
                city,
                price: prices[i] || 0,
                daysOnMarket: 0,
                priceReduced: html.toLowerCase().includes('price reduced'),
                photoCount: 0,
                photos: [],
                agentName: '',
                listingUrl: searchUrl,
                keywords: [],
            };
            listing.score = await scoreICP(listing);
            listings.push(listing);
        }

        return { listings };

    } catch (error: any) {
        return { error: error.message };
    }
}

// ─────────────────────────────────────────────
// 2b. ZYTE AUTO-EXTRACT — Richer structured data
// ─────────────────────────────────────────────

export async function extractListingDetails(listingUrl: string): Promise<{ data?: any; error?: string }> {
    if (!ZYTE_API_KEY) return { error: 'ZYTE_API_KEY not configured' };

    try {
        const res = await fetch('https://api.zyte.com/v1/extract', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${ZYTE_API_KEY}:`).toString('base64')}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: listingUrl,
                browserHtml: true,
                realEstate: true, // Zyte AutoExtract for real estate
            }),
        });

        if (!res.ok) return { error: `Zyte extract error: ${res.status}` };
        const data = await res.json();
        return { data };

    } catch (error: any) {
        return { error: error.message };
    }
}

// ─────────────────────────────────────────────
// 3. MOONDREAM — Room detection
// ─────────────────────────────────────────────

export async function detectRoom(imageUrl: string): Promise<{
    isEmpty: boolean;
    confidence: number;
    roomType: string;
    error?: string;
}> {
    if (!MOONDREAM_API_KEY) return { isEmpty: false, confidence: 0, roomType: 'unknown', error: 'MOONDREAM_API_KEY not configured' };

    try {
        const res = await fetch('https://api.moondream.ai/v1/query', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${MOONDREAM_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image_url: imageUrl,
                question: 'Is this an empty, unfurnished real estate room? If yes, what kind of room is it most likely (e.g., bedroom, living room, dining room, kitchen, office)? Answer format: [Yes/No], [Confidence 0-100], [Room Type]',
                stream: false,
            }),
        });

        if (!res.ok) {
            const err = await res.text();
            return { isEmpty: false, confidence: 0, roomType: 'unknown', error: `Moondream error ${res.status}: ${err}` };
        }

        const data = await res.json();
        const answer: string = data.answer || data.result || '';

        // Parse "Yes, 85, living room" or "No, 20, N/A"
        const parts = answer.split(',').map((s: string) => s.trim());
        const isEmpty = parts[0]?.toLowerCase().startsWith('yes');
        const confidence = parseInt(parts[1]) || 0;
        const roomType = parts[2]?.toLowerCase() || 'unknown';

        return { isEmpty, confidence, roomType };

    } catch (error: any) {
        return { isEmpty: false, confidence: 0, roomType: 'unknown', error: error.message };
    }
}

// ─────────────────────────────────────────────
// 4. CAPMONSTER — CAPTCHA solving
// ─────────────────────────────────────────────

export async function solveRecaptcha(websiteUrl: string, websiteKey: string): Promise<{ token?: string; error?: string }> {
    if (!CAPMONSTER_API_KEY) return { error: 'CAPMONSTER_API_KEY not configured' };

    try {
        // Create task
        const createRes = await fetch('https://api.capmonster.cloud/createTask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                clientKey: CAPMONSTER_API_KEY,
                task: {
                    type: 'RecaptchaV2TaskProxyless',
                    websiteURL: websiteUrl,
                    websiteKey: websiteKey,
                },
            }),
        });

        const createData = await createRes.json();
        if (createData.errorId !== 0) return { error: `CapMonster create error: ${createData.errorDescription}` };

        const taskId = createData.taskId;

        // Poll for result (up to 60 seconds)
        for (let i = 0; i < 12; i++) {
            await new Promise(r => setTimeout(r, 5000));

            const resultRes = await fetch('https://api.capmonster.cloud/getTaskResult', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientKey: CAPMONSTER_API_KEY, taskId }),
            });

            const resultData = await resultRes.json();
            if (resultData.status === 'ready') {
                return { token: resultData.solution?.gRecaptchaResponse };
            }
        }

        return { error: 'CAPTCHA solving timed out' };

    } catch (error: any) {
        return { error: error.message };
    }
}

// ─────────────────────────────────────────────
// 5. SUPABASE — Save & retrieve leads
// ─────────────────────────────────────────────

export async function saveLead(listing: ScrapedListing & { emptyRooms?: { roomType: string; imageUrl: string; stagedUrl?: string }[] }) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check Do Not Contact list
    const { data: existing } = await supabase
        .from('outreach_leads')
        .select('id')
        .eq('address', listing.address)
        .single();

    if (existing) return { skipped: true, reason: 'Already in database' };

    const { data, error } = await supabase
        .from('outreach_leads')
        .insert({
            address: listing.address,
            city: listing.city,
            price: listing.price,
            days_on_market: listing.daysOnMarket,
            price_reduced: listing.priceReduced,
            photo_count: listing.photoCount,
            agent_name: listing.agentName,
            agent_phone: listing.agentPhone,
            agent_email: listing.agentEmail,
            listing_url: listing.listingUrl,
            keywords: listing.keywords,
            icp_score: listing.score || 0,
            empty_rooms: listing.emptyRooms || [],
            status: 'scraped',
        })
        .select()
        .single();

    if (error) return { error: error.message };
    return { success: true, lead: data };
}

export async function getLeads(status?: string, limit = 50) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
        .from('outreach_leads')
        .select('*')
        .order('icp_score', { ascending: false })
        .limit(limit);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) return { error: error.message };
    return { leads: data || [] };
}

export async function updateLeadStatus(id: string, status: string, updates?: any) {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { error } = await supabase
        .from('outreach_leads')
        .update({ status, ...updates })
        .eq('id', id);

    if (error) return { error: error.message };
    return { success: true };
}

export async function getLeadStats() {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase
        .from('outreach_leads')
        .select('status, icp_score');

    if (error) return { error: error.message };

    const stats = {
        total: data?.length || 0,
        scraped: data?.filter(l => l.status === 'scraped').length || 0,
        scored: data?.filter(l => l.status === 'scored').length || 0,
        staged: data?.filter(l => l.status === 'staged').length || 0,
        form_filled: data?.filter(l => l.status === 'form_filled').length || 0,
        emailed: data?.filter(l => l.status === 'emailed').length || 0,
        avgScore: data?.length ? Math.round(data.reduce((s, l) => s + (l.icp_score || 0), 0) / data.length) : 0,
    };

    return { stats };
}

// ─────────────────────────────────────────────
// 6. KIE.AI — Stage empty room
// ─────────────────────────────────────────────

export async function stageEmptyRoom(imageUrl: string, roomType: string): Promise<{ taskId?: string; error?: string }> {
    if (!KIE_API_KEY) return { error: 'KIE_AI_API_KEY not configured' };

    try {
        const prompt = `Add fully furnished ${roomType} decor in modern contemporary style. Keep all structural elements (walls, windows, floor, ceiling) identical. High quality, photorealistic real estate photography.`;

        const res = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KIE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'nano-banana-pro',
                input: {
                    prompt,
                    image_input: [imageUrl],
                    aspect_ratio: 'auto',
                },
            }),
        });

        if (!res.ok) return { error: `Kie.ai error: ${res.status}` };
        const data = await res.json();
        const taskId = data.data?.taskId;
        if (!taskId) return { error: 'No taskId returned' };
        return { taskId };

    } catch (error: any) {
        return { error: error.message };
    }
}

export async function checkStagingResult(taskId: string): Promise<{ status: string; url?: string; error?: string }> {
    if (!KIE_API_KEY) return { status: 'error', error: 'KIE_AI_API_KEY not configured' };

    try {
        const res = await fetch(`https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${taskId}`, {
            headers: { 'Authorization': `Bearer ${KIE_API_KEY}` },
            cache: 'no-store',
        });

        if (!res.ok) return { status: 'error', error: `Kie.ai error: ${res.status}` };

        const data = await res.json();
        const state = data.data?.state;

        if (state === 'success') {
            const resultJson = JSON.parse(data.data.resultJson || '{}');
            const url = resultJson.resultUrls?.[0];
            return { status: 'success', url };
        } else if (state === 'failed') {
            return { status: 'failed', error: data.data?.failMsg || 'Generation failed' };
        }

        return { status: 'processing' };

    } catch (error: any) {
        return { status: 'error', error: error.message };
    }
}

// ─────────────────────────────────────────────
// 7. GMAIL — Send outreach email
// ─────────────────────────────────────────────

async function getGmailAccessToken(): Promise<string> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: GMAIL_CLIENT_ID,
            client_secret: GMAIL_CLIENT_SECRET,
            refresh_token: GMAIL_REFRESH_TOKEN,
            grant_type: 'refresh_token',
        }),
    });
    const data = await res.json();
    if (!data.access_token) throw new Error(`Token refresh failed: ${JSON.stringify(data)}`);
    return data.access_token;
}

export async function sendOutreachEmail(lead: {
    agentName: string;
    agentEmail: string;
    address: string;
    stagedImageUrl?: string;
}): Promise<{ success?: boolean; error?: string }> {
    if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
        return { error: 'Gmail OAuth credentials not configured' };
    }
    if (!lead.agentEmail) return { error: 'No agent email' };

    try {
        const accessToken = await getGmailAccessToken();

        const subject = `Your listing at ${lead.address} — free virtual staging sample inside`;
        const body = `Hi ${lead.agentName || 'there'},

I noticed your listing at ${lead.address} and wanted to reach out.

${lead.stagedImageUrl ? `I took the liberty of virtually staging one of your empty rooms — you can see it here:\n${lead.stagedImageUrl}\n\n` : ''}Virtual staging typically helps homes sell faster and for more. We do it in about 15 seconds at Kogflow.com — no design skills needed.

Would love to show you what it could do for this listing. Happy to send a few free samples if you're curious.

Best,
Kogflow
https://kogflow.com`;

        // Encode as RFC 2822 message
        const message = [
            `From: Kogflow <kogflow.media@gmail.com>`,
            `To: ${lead.agentEmail}`,
            `Subject: ${subject}`,
            `Content-Type: text/plain; charset=utf-8`,
            ``,
            body,
        ].join('\r\n');

        const encoded = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ raw: encoded }),
        });

        if (!sendRes.ok) {
            const err = await sendRes.text();
            return { error: `Gmail send error ${sendRes.status}: ${err}` };
        }

        return { success: true };

    } catch (error: any) {
        return { error: error.message };
    }
}

// ─────────────────────────────────────────────
// 8. PIPELINE RUNNER — Orchestrates everything
// ─────────────────────────────────────────────

export async function runPipelineSession(config: {
    cities: string[];
    scrapesPerSession: number;
}): Promise<{ processed: number; errors: string[] }> {
    const errors: string[] = [];
    let processed = 0;

    for (const city of config.cities) {
        const { listings, error } = await scrapeMovotoCity(city, Math.ceil(config.scrapesPerSession / config.cities.length));

        if (error) { errors.push(`Scrape ${city}: ${error}`); continue; }
        if (!listings) continue;

        for (const listing of listings) {
            // Score the lead
            listing.score = await scoreICP(listing);
            if (listing.score < 5) continue; // Skip low-value leads

            // Detect empty rooms using Moondream
            const emptyRooms: { roomType: string; imageUrl: string; stagedUrl?: string }[] = [];

            for (const photoUrl of listing.photos.slice(0, 8)) { // Check first 8 photos
                const { isEmpty, confidence, roomType } = await detectRoom(photoUrl);
                if (isEmpty && confidence >= 60) {
                    emptyRooms.push({ roomType, imageUrl: photoUrl });
                }
            }

            if (emptyRooms.length < 2) continue; // ICP: need 2+ empty rooms

            // Save to Supabase
            const saveResult = await saveLead({ ...listing, emptyRooms });
            if (saveResult.skipped || saveResult.error) continue;

            const leadId = saveResult.lead?.id;
            if (!leadId) continue;

            // Stage the first empty room
            const firstRoom = emptyRooms[0];
            const { taskId } = await stageEmptyRoom(firstRoom.imageUrl, firstRoom.roomType);

            if (taskId) {
                await updateLeadStatus(leadId, 'staged', { staging_task_id: taskId });
            }

            processed++;
        }
    }

    return { processed, errors };
}

// ─────────────────────────────────────────────
// 9. PIPELINE CONFIG — Persist & load settings
// ─────────────────────────────────────────────

export interface PipelineConfig {
    sessions_per_day: number;
    scrapes_per_session: number;
    cities: string[];
}

export async function savePipelineConfig(config: PipelineConfig): Promise<{ success?: boolean; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase
        .from('pipeline_config')
        .upsert({ id: 1, ...config, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) return { error: error.message };
    return { success: true };
}

export async function loadPipelineConfig(): Promise<{ config?: PipelineConfig; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('pipeline_config')
        .select('*')
        .eq('id', 1)
        .single();
    if (error || !data) return { config: { sessions_per_day: 3, scrapes_per_session: 10, cities: ['Santa Ana', 'Garden Grove', 'Anaheim'] } };
    return { config: { sessions_per_day: data.sessions_per_day, scrapes_per_session: data.scrapes_per_session, cities: data.cities } };
}

// ─────────────────────────────────────────────
// 10. PIPELINE RUNS — Log cron executions
// ─────────────────────────────────────────────

export async function logPipelineRun(result: { processed: number; errors: string[] }): Promise<void> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('pipeline_runs').insert({
        ran_at: new Date().toISOString(),
        processed: result.processed,
        errors: result.errors,
    });
}

export async function countTodayRuns(): Promise<number> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count } = await supabase
        .from('pipeline_runs')
        .select('*', { count: 'exact', head: true })
        .gte('ran_at', todayStart.toISOString());
    return count ?? 0;
}

export async function getRecentRuns(limit = 20): Promise<{ runs?: any[]; error?: string }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
        .from('pipeline_runs')
        .select('*')
        .order('ran_at', { ascending: false })
        .limit(limit);
    if (error) return { error: error.message };
    return { runs: data || [] };
}
