'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ZYTE_API_KEY = process.env.ZYTE_API_KEY!;

// ─────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────

export interface NailLead {
    id?: string;
    business_name: string;
    owner_name?: string;
    email?: string;
    normalized_email?: string;
    phone?: string;
    website_url?: string;
    vagaro_url: string;
    instagram?: string;
    facebook?: string;
    city?: string;
    state?: string;
    services?: string[];
    specialty?: string;
    review_count?: number;
    rating?: number;
    is_independent?: boolean;
    icp_score?: number;
    status?: string;
    scraped_at?: string;
    created_at?: string;
}

// ─────────────────────────────────────────────
// ICP SCORING — Wynkie (appointments, payments, finances for salon pros)
//
// Scoring strategy:
//  • Contact reachability is paramount — email + phone = Wynkie can reach them
//  • Independent/solo operators need management tools most (not corporate chains)
//  • Nail techs are the primary ICP; lash/brow/wax pros are secondary
//  • Established (reviews, rating) = paying clients = financial need for Wynkie
//  • Multi-service = busy = higher urgency for scheduling & payment tools
// ─────────────────────────────────────────────

export async function scoreNailLead(lead: Partial<NailLead>): Promise<number> {
    let score = 0;

    // Contact reachability
    if (lead.email && lead.normalized_email) score += 25;
    if (lead.phone) score += 15;
    if (lead.website_url) score += 10;

    // Established business signals
    if ((lead.rating || 0) >= 4.5) score += 15;
    else if ((lead.rating || 0) >= 4.0) score += 8;

    if ((lead.review_count || 0) >= 20) score += 15;
    else if ((lead.review_count || 0) >= 10) score += 8;
    else if ((lead.review_count || 0) >= 5) score += 3;

    // Service breadth = busy operator = stronger need for Wynkie
    const serviceCount = (lead.services || []).length;
    if (serviceCount >= 4) score += 12;
    else if (serviceCount >= 2) score += 6;

    // Social presence = tech-receptive
    if (lead.instagram) score += 5;

    // Independent operator = primary Wynkie ICP (no corporate system)
    if (lead.is_independent) score += 15;

    // Specialty: nail tech is the hero ICP for Wynkie outreach
    const specialty = (lead.specialty || '').toLowerCase();
    if (specialty.includes('nail')) score += 20;
    if (specialty.includes('lash') || specialty.includes('brow')) score += 12;
    if (specialty.includes('wax') || specialty.includes('estheti')) score += 8;
    if (specialty.includes('hair')) score += 5;
    if (specialty.includes('spa') || specialty.includes('massage')) score += 3;

    // Penalize corporate chains — Wynkie is for independents
    const name = (lead.business_name || '').toLowerCase();
    if (/supercuts|sport clips|great clips|fantastic sams|regis salon|mastercuts|jcpenney salon|ulta beauty/i.test(name)) {
        score -= 30;
    }

    // No contact info at all — low value
    if (!lead.email && !lead.phone) score -= 15;

    return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────

export async function loadNailPipelineConfig() {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from('nail_pipeline_config').select('*').eq('id', 1).maybeSingle();
    return { config: data };
}

export async function saveNailPipelineConfig(updates: {
    cities?: string[];
    sessions_per_day?: number;
    scrapes_per_session?: number;
    cron_enabled?: boolean;
    city_cursor?: number;
}) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase.from('nail_pipeline_config')
        .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() });
    return { error: error?.message };
}

// ─────────────────────────────────────────────
// ZYTE HELPER
// ─────────────────────────────────────────────

async function zyteGet(url: string): Promise<string> {
    const res = await fetch('https://api.zyte.com/v1/extract', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + Buffer.from(`${ZYTE_API_KEY}:`).toString('base64'),
        },
        body: JSON.stringify({ url, browserHtml: true, geolocation: 'US' }),
    });
    if (!res.ok) throw new Error(`Zyte ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.browserHtml || '';
}

function stripHtml(html: string): string {
    return html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractEmails(text: string): string[] {
    const matches = [...text.matchAll(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g)];
    return [...new Set(matches.map(m => m[0]).filter(e =>
        !e.includes('example') && !e.includes('.png') && !e.includes('.jpg') &&
        !e.includes('sentry') && !e.includes('wix') && !e.includes('godaddy') &&
        !e.includes('vagaro') && !e.includes('noreply') && !e.startsWith('support@') &&
        !e.startsWith('info@vagaro') && !e.match(/^\d/) && e.length < 80
    ))];
}

function extractPhones(html: string): string[] {
    const telLinks = [...html.matchAll(/tel:([\+\d\s\(\)\-\.]{7,20})/g)].map(m => m[1].trim());
    const formatted = [...html.matchAll(/\(?\d{3}\)?[\s\-\.]\d{3}[\s\-\.]\d{4}/g)].map(m => m[0]);
    return [...new Set([...telLinks, ...formatted])].slice(0, 3);
}

function normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
}

function toCitySlug(city: string): string {
    // "Houston, TX" → "houston-tx"  |  "Los Angeles, CA" → "los-angeles-ca"
    return city.toLowerCase()
        .replace(/,\s*/g, '-')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');
}

// ─────────────────────────────────────────────
// PARSE VAGARO JSON-LD SCHEMA
// Vagaro embeds rich structured data in application/ld+json tags.
// This extracts business name, phone, address, and aggregate rating.
// ─────────────────────────────────────────────

function parseVagaroJsonLd(html: string): {
    name?: string;
    phone?: string;
    city?: string;
    state?: string;
    rating?: number;
    reviewCount?: number;
} {
    const result: {
        name?: string;
        phone?: string;
        city?: string;
        state?: string;
        rating?: number;
        reviewCount?: number;
    } = {};

    const scriptMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const match of scriptMatches) {
        try {
            const json = JSON.parse(match[1]);
            const obj = Array.isArray(json) ? json[0] : json;
            if (!obj) continue;
            if (obj.name && !result.name) result.name = obj.name;
            if (obj.telephone && !result.phone) result.phone = obj.telephone;
            if (obj.address && !result.city) {
                result.city = obj.address.addressLocality;
                result.state = obj.address.addressRegion;
            }
            if (obj.aggregateRating && !result.rating) {
                result.rating = parseFloat(obj.aggregateRating.ratingValue) || undefined;
                result.reviewCount = parseInt(obj.aggregateRating.reviewCount) || undefined;
            }
        } catch { /* skip malformed blocks */ }
    }

    return result;
}

// ─────────────────────────────────────────────
// DISCOVER VAGARO PROFILES IN A CITY
//
// Scraping strategy:
//  Vagaro search URLs: https://www.vagaro.com/usa/[category]/[city-slug]
//  Categories scraped: nail-salons, hair-salons, beauty-salons
//  Each search page yields up to ~15 business profile slugs.
//  Profile URLs follow: https://www.vagaro.com/[username]
// ─────────────────────────────────────────────

const VAGARO_CATEGORIES: { slug: string; specialty: string }[] = [
    { slug: 'nail-salons', specialty: 'nail' },
    { slug: 'hair-salons', specialty: 'hair' },
    { slug: 'beauty-salons', specialty: 'beauty' },
];

const VAGARO_SYSTEM_SLUGS = new Set([
    'usa', 'pro', 'business', 'about', 'login', 'signup', 'help', 'contact',
    'privacy', 'terms', 'careers', 'blog', 'press', 'enterprise', 'features',
    'pricing', 'integrations', 'marketplace', 'gift-cards', 'developers',
    // Additional Vagaro marketing / system pages found in search results
    'deals', 'listings', 'professionals', 'learn', 'photos', 'iconic25', 'news',
    'app', 'download', 'en', 'salon', 'salons', 'stylists', 'book-now',
    'gift-certificate', 'online-scheduling', 'vagaroinc1', 'trainingsalon',
]);

// Vagaro blocks all bots on their directory pages (robots.txt: "User-Agent: * Disallow: /")
// so we discover profiles via DuckDuckGo site: search instead.
const VAGARO_CATEGORY_QUERIES: { query: string; specialty: string }[] = [
    { query: '"nail salon"', specialty: 'nail' },
    { query: '"nail spa"', specialty: 'nail' },
    { query: '"hair salon"', specialty: 'hair' },
    { query: '"beauty salon"', specialty: 'beauty' },
];

async function discoverVagaroProfilesInCity(city: string, debugArr?: string[]): Promise<{ url: string; specialty: string }[]> {
    const results: { url: string; specialty: string }[] = [];
    // Extract just city name without state for a broader match
    const cityName = city.split(',')[0].trim();

    for (const { query, specialty } of VAGARO_CATEGORY_QUERIES) {
        const q = encodeURIComponent(`site:vagaro.com ${query} "${cityName}"`);
        const searchUrl = `https://duckduckgo.com/?q=${q}&kp=-1`;
        try {
            const html = await zyteGet(searchUrl);
            const slugs = [...html.matchAll(/vagaro\.com\/([a-z0-9][a-z0-9-]{2,50})/gi)]
                .map(m => m[1])
                .filter(s =>
                    !VAGARO_SYSTEM_SLUGS.has(s) &&
                    !s.startsWith('us') &&
                    !s.includes('category') &&
                    !s.includes('search') &&
                    s.length > 3 && s.length < 45
                );
            const unique = [...new Set(slugs)].slice(0, 10);
            if (debugArr) debugArr.push(`[${city}/${query}] DDG found ${unique.length}: ${unique.slice(0,5).join(', ')}`);
            for (const slug of unique) {
                results.push({ url: `https://www.vagaro.com/${slug}`, specialty });
            }
        } catch (e: any) {
            if (debugArr) debugArr.push(`[${city}/${query}] ERROR: ${e.message}`);
        }
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    return results.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
    });
}

// ─────────────────────────────────────────────
// SCRAPE VAGARO PROFILE
//
// Data extracted from each profile:
//  - Business name (JSON-LD > title tag)
//  - Phone (JSON-LD telephone > tel: links > formatted numbers)
//  - Email (mailto: links > text > linked website scrape)
//  - Instagram & Facebook handles
//  - External website → deep-scraped for email if none found on Vagaro
//  - Services list (manicure, pedicure, acrylics, gel, etc.)
//  - Owner name (pattern matching: "Owner: Jane Doe", "Founded by Jane Doe")
//  - Rating & review count (JSON-LD aggregateRating)
//  - is_independent flag (no franchise keywords)
// ─────────────────────────────────────────────

async function scrapeVagaroProfile(profileUrl: string, city: string, specialty: string): Promise<Partial<NailLead> | null> {
    try {
        const html = await zyteGet(profileUrl);
        const text = stripHtml(html);

        const jsonLd = parseVagaroJsonLd(html);

        // Business name
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const businessName = jsonLd.name ||
            (titleMatch ? titleMatch[1].split(/[|\-–]/)[0].trim().substring(0, 80) : '');
        if (!businessName || businessName.length < 2) return null;

        // Phone: JSON-LD is most reliable, then tel: href links, then formatted patterns in text
        const rawPhones = extractPhones(html);
        const phone = jsonLd.phone || rawPhones[0];

        // Email from mailto: links in raw HTML
        const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g)]
            .map(m => m[1]);
        let emails = [...new Set([...mailtoMatches, ...extractEmails(text)])];

        // Instagram & Facebook
        const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9_\.]{1,50})/i);
        const instagram = igMatch ? `@${igMatch[1]}` : undefined;

        const fbMatch = html.match(/facebook\.com\/(?!sharer|share|dialog)([a-zA-Z0-9_\.\-]{1,80})/i);
        const facebook = fbMatch ? `https://facebook.com/${fbMatch[1]}` : undefined;

        // External website linked from the profile
        const websiteMatch = html.match(/href="(https?:\/\/(?!(?:www\.)?(?:vagaro|google|facebook|instagram|twitter|tiktok|yelp|apple|maps|bit\.ly)[^\w])[^"]{10,120})"/i);
        const websiteUrl = websiteMatch ? websiteMatch[1] : undefined;

        // If no email yet, try to scrape their website
        if (websiteUrl && emails.length === 0) {
            try {
                const siteHtml = await zyteGet(websiteUrl);
                const siteText = stripHtml(siteHtml);
                emails = extractEmails(siteText);
                // Also try contact page
                if (emails.length === 0) {
                    const contactPaths = [...siteHtml.matchAll(/href="(\/[^"]*(?:contact|about|reach)[^"]*)"/gi)].map(m => m[1]);
                    for (const path of contactPaths.slice(0, 2)) {
                        try {
                            const cHtml = await zyteGet(websiteUrl + path);
                            emails = extractEmails(stripHtml(cHtml));
                            if (emails.length > 0) break;
                        } catch { /* skip */ }
                    }
                }
            } catch { /* skip failed website */ }
        }

        const services = extractNailServices(text);
        const ownerName = extractOwnerName(text);

        const isIndependent = !/(?:supercuts|sport clips|great clips|fantastic sams|regis salon|mastercuts|jcpenney salon|ulta beauty)/i.test(businessName) &&
            !/\b(?:franchise|multiple locations|chain|corporate)\b/i.test(text.substring(0, 600));

        const [cityPart, statePart] = city.split(', ');

        const email = emails.filter(e => !e.includes('vagaro'))[0];
        const normalized = email ? normalizeEmail(email) : undefined;

        const lead: Partial<NailLead> = {
            business_name: businessName,
            owner_name: ownerName,
            email,
            normalized_email: normalized,
            phone,
            website_url: websiteUrl,
            vagaro_url: profileUrl,
            instagram,
            facebook,
            city: jsonLd.city || cityPart,
            state: jsonLd.state || statePart,
            services,
            specialty,
            review_count: jsonLd.reviewCount,
            rating: jsonLd.rating,
            is_independent: isIndependent,
        };

        lead.icp_score = await scoreNailLead(lead);
        return lead;
    } catch {
        return null;
    }
}

function extractNailServices(text: string): string[] {
    const services: string[] = [];
    if (/\b(?:manicure|mani)\b/i.test(text)) services.push('manicure');
    if (/\b(?:pedicure|pedi)\b/i.test(text)) services.push('pedicure');
    if (/\bacrylic/i.test(text)) services.push('acrylics');
    if (/\bgel\s*(?:nail|polish|overlay)/i.test(text)) services.push('gel nails');
    if (/\b(?:dip powder|sns|nexgen)\b/i.test(text)) services.push('dip powder');
    if (/\b(?:nail art|nail design|press.on)\b/i.test(text)) services.push('nail art');
    if (/\bwax(?:ing)?\b/i.test(text)) services.push('waxing');
    if (/\b(?:lash|eyelash)\b/i.test(text)) services.push('lash extensions');
    if (/\b(?:brow|eyebrow)\b/i.test(text)) services.push('brow shaping');
    if (/\b(?:haircut|blowout|hair color|highlight|balayage|keratin)\b/i.test(text)) services.push('hair services');
    if (/\b(?:facial|skincare|skin care|dermaplaning|microneedling)\b/i.test(text)) services.push('facials');
    if (/\b(?:massage|deep tissue|swedish)\b/i.test(text)) services.push('massage');
    if (/\b(?:tanning|spray tan)\b/i.test(text)) services.push('tanning');
    return [...new Set(services)];
}

function extractOwnerName(text: string): string | undefined {
    const patterns = [
        /(?:Owner|Founder|Proprietor|Operator|Licensed Nail Tech)[,:\s]+([A-Z][a-z]+ [A-Z][a-z]+)/,
        /([A-Z][a-z]+ [A-Z][a-z]+)[,\s-]+(?:Owner|Founder|Licensed Nail Technician|Nail Technician|Esthetician)/,
        /(?:Founded|Started|Run)\s+by\s+([A-Z][a-z]+ [A-Z][a-z]+)/i,
        /Meet\s+([A-Z][a-z]+ [A-Z][a-z]+)[,\s]/,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m?.[1]) return m[1];
    }
    return undefined;
}

// ─────────────────────────────────────────────
// PIPELINE SESSION
// ─────────────────────────────────────────────

export async function runNailPipelineSession({
    cities,
    scrapes,
    deadlineMs,
    cursor = 0,
}: {
    cities: string[];
    scrapes: number;
    deadlineMs: number;
    cursor?: number;
}): Promise<{ processed: number; errors: string[]; debug: string[]; newCursor: number }> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const debug: string[] = [];
    const errors: string[] = [];
    let processed = 0;
    let totalScraped = 0;

    // Sequential rotation: start from cursor, wrap around the end of the list
    const startIdx = cities.length > 0 ? cursor % cities.length : 0;
    const cityPool = [
        ...cities.slice(startIdx),
        ...cities.slice(0, startIdx),
    ];
    let citiesVisited = 0;

    debug.push(`City cursor: ${startIdx}/${cities.length}, starting at "${cityPool[0] ?? 'none'}", budget: ${scrapes} profiles`);

    for (const city of cityPool) {
        if (Date.now() > deadlineMs - 30_000) { debug.push('Deadline approaching — stopping'); break; }
        if (totalScraped >= scrapes) { debug.push('Scrape budget reached'); break; }

        citiesVisited++;

        try {
            const profiles = await discoverVagaroProfilesInCity(city, debug);
            debug.push(`[${city}] Discovered ${profiles.length} Vagaro profiles`);

            let cityNew = 0;
            for (const { url: profileUrl, specialty } of profiles) {
                if (Date.now() > deadlineMs - 20_000) break;
                if (totalScraped >= scrapes) break;

                // Dedup by vagaro_url (UNIQUE constraint)
                const { data: existing } = await supabase
                    .from('nail_leads').select('id').eq('vagaro_url', profileUrl).maybeSingle();
                if (existing) { debug.push(`  Skip (exists): ${profileUrl}`); continue; }

                totalScraped++;
                const lead = await scrapeVagaroProfile(profileUrl, city, specialty);
                if (!lead?.business_name) { debug.push(`  No data: ${profileUrl}`); continue; }

                // Dedup by normalized email
                if (lead.normalized_email) {
                    const { data: emailDup } = await supabase
                        .from('nail_leads').select('id').eq('normalized_email', lead.normalized_email).maybeSingle();
                    if (emailDup) { debug.push(`  Dup email: ${lead.email}`); continue; }
                }

                const { error } = await supabase.from('nail_leads').insert({
                    ...lead,
                    status: 'scraped',
                    scraped_at: new Date().toISOString(),
                    created_at: new Date().toISOString(),
                });
                if (error) { errors.push(`Insert: ${error.message}`); continue; }

                processed++;
                cityNew++;
                debug.push(`  Saved: "${lead.business_name}" score=${lead.icp_score} email=${lead.email ?? 'none'} phone=${lead.phone ?? 'none'}`);
            }

            await supabase.from('nail_city_log').upsert({
                city,
                last_scraped_at: new Date().toISOString(),
                leads_found: cityNew,
            });
        } catch (e: any) {
            errors.push(`[${city}] ${e.message}`);
        }
    }

    const newCursor = cities.length > 0 ? (startIdx + citiesVisited) % cities.length : 0;
    debug.push(`Next cursor: ${newCursor} ("${cities[newCursor] ?? 'wrap'}")`);
    return { processed, errors, debug, newCursor };
}

// ─────────────────────────────────────────────
// STATS & QUERIES
// ─────────────────────────────────────────────

export async function getNailLeadStats() {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from('nail_leads').select('status, icp_score, email, phone, specialty');
    const leads = data || [];

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { count: scrapedToday } = await supabase.from('nail_leads')
        .select('*', { count: 'exact', head: true }).gte('scraped_at', today.toISOString());

    return {
        total: leads.length,
        withEmail: leads.filter(l => l.email).length,
        withPhone: leads.filter(l => l.phone).length,
        withBoth: leads.filter(l => l.email && l.phone).length,
        scrapedToday: scrapedToday ?? 0,
        avgScore: leads.length ? Math.round(leads.reduce((s, l) => s + (l.icp_score || 0), 0) / leads.length) : 0,
        highScore: leads.filter(l => (l.icp_score || 0) >= 60).length,
        nailSpecialty: leads.filter(l => l.specialty === 'nail').length,
    };
}

export async function getNailLeads(limit = 200, offset = 0) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from('nail_leads')
        .select('*').order('icp_score', { ascending: false }).range(offset, offset + limit - 1);
    return data || [];
}

export async function getNailRecentRuns(limit = 10) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from('nail_pipeline_runs')
        .select('*').order('ran_at', { ascending: false }).limit(limit);
    return data || [];
}

export async function logNailRun(run: { processed: number; errors: string[]; debug: string[]; trigger: string }) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.from('nail_pipeline_runs').insert({
        processed: run.processed,
        errors: run.errors,
        debug: run.debug,
        trigger: run.trigger,
        ran_at: new Date().toISOString(),
    });
}

export async function countTodayNailCronRuns(): Promise<number> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { count } = await supabase.from('nail_pipeline_runs')
        .select('*', { count: 'exact', head: true })
        .eq('trigger', 'cron')
        .gte('ran_at', today.toISOString());
    return count ?? 0;
}

// ─────────────────────────────────────────────
// CSV EXPORT — master file, all leads sorted by ICP score
// ─────────────────────────────────────────────

export async function exportNailLeadsCSV(): Promise<string> {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data } = await supabase.from('nail_leads')
        .select('*').order('icp_score', { ascending: false });

    const rows = data || [];

    const headers = [
        'ICP Score', 'Business Name', 'Owner Name', 'Email', 'Phone',
        'Instagram', 'Website', 'Vagaro URL', 'Facebook',
        'City', 'State', 'Specialty', 'Services',
        'Rating', 'Reviews', 'Independent', 'Status', 'Scraped At',
    ];

    function esc(v: unknown): string {
        const s = String(v ?? '').replace(/"/g, '""');
        return `"${s}"`;
    }

    const csvRows = [
        headers.join(','),
        ...rows.map(r => [
            r.icp_score ?? 0,
            esc(r.business_name),
            esc(r.owner_name),
            esc(r.email),
            esc(r.phone),
            esc(r.instagram),
            esc(r.website_url),
            esc(r.vagaro_url),
            esc(r.facebook),
            esc(r.city),
            esc(r.state),
            esc(r.specialty),
            esc((r.services ?? []).join('; ')),
            r.rating ?? '',
            r.review_count ?? '',
            r.is_independent ? 'Yes' : 'No',
            esc(r.status),
            esc(r.scraped_at),
        ].join(','))
    ];

    return csvRows.join('\n');
}

// ─────────────────────────────────────────────
// MANUAL RUN SERVER ACTION
// Runs pipeline in background via after() — no CRON_SECRET needed from client
// ─────────────────────────────────────────────

import { after } from 'next/server';

export async function runNailPipelineManual(): Promise<{ accepted: boolean }> {
    const { config } = await loadNailPipelineConfig();
    if (!config) return { accepted: false };

    after(async () => {
        const cursor = config.city_cursor ?? 0;
        const result = await runNailPipelineSession({
            cities: config.cities,
            scrapes: 20,
            deadlineMs: Date.now() + 240_000,
            cursor,
        });

        await saveNailPipelineConfig({ city_cursor: result.newCursor });

        await logNailRun({
            processed: result.processed,
            errors: result.errors,
            debug: [`Manual run: budget=20, cursor=${cursor}→${result.newCursor}`, ...result.debug],
            trigger: 'manual',
        });
    });

    return { accepted: true };
}
