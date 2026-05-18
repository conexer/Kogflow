'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
    BarChart2, Users, Settings, Terminal, Play, RefreshCw,
    CheckCircle, AlertCircle, ExternalLink, Download, Scissors,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    getNailLeadStats,
    getNailLeads,
    getNailRecentRuns,
    loadNailPipelineConfig,
    saveNailPipelineConfig,
    exportNailLeadsCSV,
    runNailPipelineManual,
} from '@/app/actions/outreach-nail';
import { toast } from 'sonner';

const ALLOWED_EMAILS = ['conexer@gmail.com'];

type Tab = 'dashboard' | 'leads' | 'config' | 'setup';

const SPECIALTY_COLORS: Record<string, string> = {
    nail: 'bg-pink-500/20 text-pink-400',
    hair: 'bg-violet-500/20 text-violet-400',
    beauty: 'bg-cyan-500/20 text-cyan-400',
    lash: 'bg-amber-500/20 text-amber-400',
    spa: 'bg-emerald-500/20 text-emerald-400',
};

const DEFAULT_CITIES = [
    // Top 25 metros — highest nail salon density
    'New York, NY', 'Los Angeles, CA', 'Chicago, IL', 'Houston, TX', 'Phoenix, AZ',
    'Philadelphia, PA', 'San Antonio, TX', 'San Diego, CA', 'Dallas, TX', 'San Jose, CA',
    'Austin, TX', 'Jacksonville, FL', 'Fort Worth, TX', 'Columbus, OH', 'Charlotte, NC',
    'Indianapolis, IN', 'San Francisco, CA', 'Seattle, WA', 'Denver, CO', 'Nashville, TN',
    'Oklahoma City, OK', 'El Paso, TX', 'Las Vegas, NV', 'Washington, DC', 'Miami, FL',
    // Next 25
    'Atlanta, GA', 'Minneapolis, MN', 'Raleigh, NC', 'Tampa, FL', 'New Orleans, LA',
    'Portland, OR', 'Sacramento, CA', 'Kansas City, MO', 'Cincinnati, OH', 'Orlando, FL',
    'Riverside, CA', 'Cleveland, OH', 'Pittsburgh, PA', 'Baltimore, MD', 'Virginia Beach, VA',
    'Tucson, AZ', 'Fresno, CA', 'Mesa, AZ', 'Albuquerque, NM', 'Long Beach, CA',
    'Bakersfield, CA', 'Honolulu, HI', 'Anaheim, CA', 'Corpus Christi, TX', 'Lexington, KY',
    // Next 25
    'St. Louis, MO', 'St. Paul, MN', 'Stockton, CA', 'Henderson, NV', 'Greensboro, NC',
    'Plano, TX', 'Newark, NJ', 'Toledo, OH', 'Chandler, AZ', 'Laredo, TX',
    'Madison, WI', 'Durham, NC', 'Lubbock, TX', 'Garland, TX', 'Winston-Salem, NC',
    'Scottsdale, AZ', 'Baton Rouge, LA', 'Norfolk, VA', 'Jersey City, NJ', 'Chesapeake, VA',
    'Irvine, CA', 'Gilbert, AZ', 'Spokane, WA', 'Richmond, VA', 'Des Moines, IA',
    // Final 10
    'Boise, ID', 'Tacoma, WA', 'Salt Lake City, UT', 'Birmingham, AL', 'Rochester, NY',
    'San Bernardino, CA', 'Fremont, CA', 'Fayetteville, NC', 'Little Rock, AR', 'Aurora, CO',
];

const SETUP_SQL = `-- Run in Supabase SQL Editor or call /api/admin/nail-migrate with CRON_SECRET Bearer header

CREATE TABLE IF NOT EXISTS public.nail_leads (
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
);

CREATE INDEX IF NOT EXISTS nail_leads_icp_score_idx ON public.nail_leads (icp_score DESC);
CREATE INDEX IF NOT EXISTS nail_leads_normalized_email_idx ON public.nail_leads (normalized_email);
CREATE INDEX IF NOT EXISTS nail_leads_vagaro_url_idx ON public.nail_leads (vagaro_url);

CREATE TABLE IF NOT EXISTS public.nail_pipeline_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMPTZ DEFAULT NOW(),
  processed INTEGER DEFAULT 0,
  errors TEXT[] DEFAULT '{}',
  debug TEXT[] DEFAULT '{}',
  trigger TEXT DEFAULT 'cron'
);

CREATE TABLE IF NOT EXISTS public.nail_pipeline_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  cities TEXT[] DEFAULT ARRAY['Houston, TX','Dallas, TX','Austin, TX'],
  sessions_per_day INTEGER DEFAULT 4,
  scrapes_per_session INTEGER DEFAULT 10,
  cron_enabled BOOLEAN DEFAULT FALSE,
  city_cursor INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.nail_pipeline_config ADD COLUMN IF NOT EXISTS city_cursor INTEGER DEFAULT 0;

INSERT INTO public.nail_pipeline_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.nail_city_log (
  city TEXT PRIMARY KEY,
  last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
  leads_found INTEGER DEFAULT 0
);

ALTER TABLE public.nail_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nail_pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nail_pipeline_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nail_city_log ENABLE ROW LEVEL SECURITY;`;

// ─────────────────────────────────────────────
// SLIDER + NUMBER INPUT COMBO
// ─────────────────────────────────────────────

function SliderInput({
    label,
    hint,
    value,
    min,
    max,
    onChange,
}: {
    label: string;
    hint: string;
    value: number;
    min: number;
    max: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-sm font-medium text-white">{label}</span>
                    <span className="block text-xs text-zinc-500 mt-0.5">{hint}</span>
                </div>
                <input
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    onChange={e => onChange(Math.max(min, Math.min(max, Number(e.target.value))))}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-center font-mono text-pink-400 focus:outline-none focus:border-pink-500"
                />
            </div>
            <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-600 w-4">{min}</span>
                <input
                    type="range"
                    min={min}
                    max={max}
                    value={value}
                    onChange={e => onChange(Number(e.target.value))}
                    className="flex-1 accent-pink-500 h-2 rounded cursor-pointer"
                />
                <span className="text-xs text-zinc-600 w-4">{max}</span>
            </div>
            <div className="text-xs text-zinc-500">
                Current: <span className="text-pink-400 font-medium">{value}</span>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────

export default function OutreachNailPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');

    // Stats & data
    const [stats, setStats] = useState({
        total: 0, withEmail: 0, withPhone: 0, withBoth: 0,
        scrapedToday: 0, avgScore: 0, highScore: 0, nailSpecialty: 0,
    });
    const [leads, setLeads] = useState<any[]>([]);
    const [runs, setRuns] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    // Config state
    const [config, setConfig] = useState<any>(null);
    const [cities, setCities] = useState<string[]>(DEFAULT_CITIES);
    const [sessionsPerDay, setSessionsPerDay] = useState(4);
    const [scrapesPerSession, setScrapesPerSession] = useState(10);
    const [cronEnabled, setCronEnabled] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);

    // Run state
    const [running, setRunning] = useState(false);
    const [runLog, setRunLog] = useState<string[]>([]);

    // CSV download
    const [downloadingCsv, setDownloadingCsv] = useState(false);

    useEffect(() => {
        if (!loading) {
            if (!user) { router.replace('/login'); return; }
            if (!ALLOWED_EMAILS.includes(user.email || '')) { router.replace('/dashboard'); return; }
            setAuthorized(true);
        }
    }, [user, loading, router]);

    const loadData = useCallback(async () => {
        setLoadingData(true);
        try {
            const [statsRes, leadsRes, runsRes, configRes] = await Promise.all([
                getNailLeadStats(),
                getNailLeads(200),
                getNailRecentRuns(10),
                loadNailPipelineConfig(),
            ]);
            setStats(statsRes);
            setLeads(leadsRes);
            setRuns(runsRes);
            if (configRes.config) {
                setConfig(configRes.config);
                setCities(configRes.config.cities ?? DEFAULT_CITIES);
                setSessionsPerDay(configRes.config.sessions_per_day ?? 4);
                setScrapesPerSession(configRes.config.scrapes_per_session ?? 10);
                setCronEnabled(configRes.config.cron_enabled ?? false);
            }
        } catch (e: any) {
            toast.error('Load failed: ' + e.message);
        } finally {
            setLoadingData(false);
        }
    }, []);

    useEffect(() => {
        if (authorized) loadData();
    }, [authorized, loadData]);

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            const { error } = await saveNailPipelineConfig({
                cities,
                sessions_per_day: sessionsPerDay,
                scrapes_per_session: scrapesPerSession,
                cron_enabled: cronEnabled,
            });
            if (error) throw new Error(error);
            toast.success('Config saved');
            await loadData();
        } catch (e: any) {
            toast.error('Save failed: ' + e.message);
        } finally {
            setSavingConfig(false);
        }
    };

    // Manual run — uses server action (no CRON_SECRET needed), fixed 20-profile budget
    const handleManualRun = async () => {
        setRunning(true);
        setRunLog(['Starting manual scrape (20 profiles, sequential city rotation)...']);
        try {
            const result = await runNailPipelineManual();
            if (!result.accepted) throw new Error('No pipeline config found');
            setRunLog(prev => [...prev, 'Pipeline started in background — refresh in ~60s to see results']);
            toast.success('Pipeline started');
            setTimeout(() => { loadData(); setRunning(false); }, 8000);
        } catch (e: any) {
            setRunLog(prev => [...prev, `Error: ${e.message}`]);
            toast.error(e.message);
            setRunning(false);
        }
    };

    const handleDownloadCSV = async () => {
        setDownloadingCsv(true);
        try {
            const csv = await exportNailLeadsCSV();
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nail-leads-${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            toast.success('CSV downloaded');
        } catch (e: any) {
            toast.error('CSV export failed: ' + e.message);
        } finally {
            setDownloadingCsv(false);
        }
    };

    const handleRunMigration = async () => {
        setRunLog(['Running DB migration...']);
        try {
            const secret = prompt('Enter CRON_SECRET to run migration:');
            if (!secret) return;
            const res = await fetch('/api/admin/nail-migrate', {
                headers: { 'Authorization': `Bearer ${secret}` },
            });
            const data = await res.json();
            setRunLog(data.results || ['Done']);
            toast.success(`Migration complete`);
            await loadData();
        } catch (e: any) {
            toast.error(e.message);
        }
    };

    if (loading || !authorized) {
        return <div className="flex items-center justify-center min-h-screen bg-black text-white">Loading...</div>;
    }

    const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
        { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 className="w-4 h-4" /> },
        { id: 'leads', label: `Leads (${stats.total})`, icon: <Users className="w-4 h-4" /> },
        { id: 'config', label: 'Config', icon: <Settings className="w-4 h-4" /> },
        { id: 'setup', label: 'Setup', icon: <Terminal className="w-4 h-4" /> },
    ];

    return (
        <div className="min-h-screen bg-black text-white">
            <div className="max-w-7xl mx-auto px-4 py-6">

                {/* Header */}
                <div className="flex items-start justify-between mb-6 gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-pink-600 flex items-center justify-center flex-shrink-0">
                            <Scissors className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Outreach Nail</h1>
                            <p className="text-sm text-zinc-400 mt-0.5">Nail & salon pro discovery via Vagaro → Wynkie ICP pipeline</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={handleDownloadCSV}
                            disabled={downloadingCsv || stats.total === 0}
                            className="flex items-center gap-2 px-3 py-1.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                        >
                            {downloadingCsv
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <Download className="w-4 h-4" />}
                            {stats.total > 0 ? `Download CSV (${stats.total})` : 'No leads yet'}
                        </button>
                        <button
                            onClick={loadData}
                            disabled={loadingData}
                            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm transition-colors"
                        >
                            <RefreshCw className={cn('w-4 h-4', loadingData && 'animate-spin')} />
                            Refresh
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mb-6 border-b border-zinc-800 pb-0">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px',
                                activeTab === tab.id
                                    ? 'border-pink-500 text-pink-400 bg-pink-500/5'
                                    : 'border-transparent text-zinc-400 hover:text-white'
                            )}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* ── DASHBOARD TAB ── */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-6">

                        {/* Stat cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'Total Leads', value: stats.total, color: 'text-white' },
                                { label: 'With Email', value: stats.withEmail, color: 'text-pink-400' },
                                { label: 'With Phone', value: stats.withPhone, color: 'text-violet-400' },
                                { label: 'Email + Phone', value: stats.withBoth, color: 'text-emerald-400' },
                                { label: 'High ICP (60+)', value: stats.highScore, color: 'text-amber-400' },
                                { label: 'Avg ICP Score', value: stats.avgScore, color: 'text-cyan-400' },
                                { label: 'Nail Specialists', value: stats.nailSpecialty, color: 'text-pink-300' },
                                { label: 'Scraped Today', value: stats.scrapedToday, color: 'text-zinc-300' },
                            ].map(s => (
                                <div key={s.label} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                                    <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
                                    <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Schedule status */}
                        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-semibold">Scheduled Scrape</h2>
                                <div className="flex items-center gap-3">
                                    <span className={cn(
                                        'px-2.5 py-1 rounded-full text-xs font-semibold',
                                        cronEnabled ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'
                                    )}>
                                        {cronEnabled ? '● Active' : '○ Stopped'}
                                    </span>
                                    <button
                                        onClick={async () => {
                                            const next = !cronEnabled;
                                            setCronEnabled(next);
                                            await saveNailPipelineConfig({
                                                cities, sessions_per_day: sessionsPerDay,
                                                scrapes_per_session: scrapesPerSession, cron_enabled: next,
                                            });
                                            toast.success(next ? 'Schedule activated' : 'Schedule stopped');
                                        }}
                                        className={cn(
                                            'relative w-11 h-6 rounded-full transition-colors',
                                            cronEnabled ? 'bg-green-600' : 'bg-zinc-700'
                                        )}
                                    >
                                        <span className={cn(
                                            'absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform',
                                            cronEnabled && 'translate-x-5'
                                        )} />
                                    </button>
                                </div>
                            </div>
                            <div className="text-sm text-zinc-400 space-y-1">
                                <div>Cron: <code className="text-zinc-300">every 2h, 8am–6pm PT</code></div>
                                <div>Sessions/day: <span className="text-zinc-300">{config?.sessions_per_day ?? '—'}</span></div>
                                <div>Scrapes/session: <span className="text-zinc-300">{config?.scrapes_per_session ?? '—'}</span></div>
                                <div>Cities in rotation: <span className="text-zinc-300">{cities.length}</span></div>
                            </div>
                        </div>

                        {/* Manual run (independent of slider params) */}
                        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                            <div className="flex items-center justify-between mb-1">
                                <h2 className="font-semibold">Manual Run</h2>
                                <span className="text-xs text-zinc-500">Runs 20 profiles — independent of session sliders</span>
                            </div>
                            <p className="text-sm text-zinc-500 mb-3">
                                Triggers a one-off Vagaro scrape across your configured cities using a fixed budget of 20 profiles.
                                This does not consume your daily session count.
                            </p>
                            <button
                                onClick={handleManualRun}
                                disabled={running}
                                className="flex items-center gap-2 px-5 py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
                            >
                                {running
                                    ? <RefreshCw className="w-4 h-4 animate-spin" />
                                    : <Play className="w-4 h-4" />}
                                {running ? 'Running...' : 'Manual Run'}
                            </button>
                            {runLog.length > 0 && (
                                <div className="mt-3 bg-black rounded-lg p-3 font-mono text-xs text-zinc-300 space-y-1 max-h-40 overflow-y-auto">
                                    {runLog.map((line, i) => <div key={i}>{line}</div>)}
                                </div>
                            )}
                        </div>

                        {/* Recent runs */}
                        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
                            <h2 className="font-semibold mb-3">Recent Runs</h2>
                            {runs.length === 0 ? (
                                <p className="text-zinc-500 text-sm">No runs yet — start a manual run or enable the schedule.</p>
                            ) : (
                                <div className="space-y-2">
                                    {runs.map(run => (
                                        <div key={run.id} className="flex items-start gap-3 py-2 border-b border-zinc-800 last:border-0">
                                            <div className={cn('mt-0.5 w-2 h-2 rounded-full flex-shrink-0 mt-1.5',
                                                (run.errors?.length ?? 0) > 0 ? 'bg-red-400' : 'bg-green-400'
                                            )} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 text-sm flex-wrap">
                                                    <span className="font-medium">{run.processed ?? 0} leads saved</span>
                                                    <span className={cn('text-xs capitalize px-1.5 py-0.5 rounded',
                                                        run.trigger === 'manual' ? 'bg-pink-500/20 text-pink-400' : 'bg-zinc-700 text-zinc-400'
                                                    )}>{run.trigger}</span>
                                                    <span className="text-zinc-600 text-xs ml-auto flex-shrink-0">
                                                        {new Date(run.ran_at).toLocaleString()}
                                                    </span>
                                                </div>
                                                {(run.errors?.length ?? 0) > 0 && (
                                                    <div className="text-xs text-red-400 mt-1 truncate">{run.errors[0]}</div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── LEADS TAB ── */}
                {activeTab === 'leads' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold">{leads.length} Nail & Salon Leads</h2>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-zinc-500">Sorted highest → lowest ICP score</span>
                                <button
                                    onClick={handleDownloadCSV}
                                    disabled={downloadingCsv || stats.total === 0}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-pink-600/20 hover:bg-pink-600/30 text-pink-400 disabled:opacity-40 rounded-lg text-xs font-medium transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    CSV
                                </button>
                            </div>
                        </div>

                        {leads.length === 0 ? (
                            <div className="text-center py-20 text-zinc-500">
                                <Scissors className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                <p>No leads yet. Run a scrape session to discover nail & salon professionals.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {leads.map(lead => (
                                    <div key={lead.id} className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 hover:border-zinc-700 transition-colors">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-medium truncate">{lead.business_name}</span>
                                                    {lead.vagaro_url && (
                                                        <a href={lead.vagaro_url} target="_blank" rel="noopener noreferrer"
                                                            className="text-zinc-500 hover:text-zinc-300" title="Vagaro profile">
                                                            <ExternalLink className="w-3 h-3" />
                                                        </a>
                                                    )}
                                                    {lead.specialty && (
                                                        <span className={cn(
                                                            'px-2 py-0.5 rounded-full text-xs font-medium',
                                                            SPECIALTY_COLORS[lead.specialty] ?? 'bg-zinc-700 text-zinc-400'
                                                        )}>
                                                            {lead.specialty}
                                                        </span>
                                                    )}
                                                    {lead.is_independent && (
                                                        <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-400">indie</span>
                                                    )}
                                                </div>

                                                <div className="text-sm text-zinc-400 mt-1 flex items-center gap-3 flex-wrap">
                                                    {lead.email && (
                                                        <a href={`mailto:${lead.email}`} className="text-pink-400 hover:text-pink-300 text-xs font-mono">
                                                            {lead.email}
                                                        </a>
                                                    )}
                                                    {lead.phone && <span className="text-xs">{lead.phone}</span>}
                                                    {lead.city && <span className="text-xs">{lead.city}{lead.state ? `, ${lead.state}` : ''}</span>}
                                                    {lead.instagram && (
                                                        <span className="text-xs text-violet-400">{lead.instagram}</span>
                                                    )}
                                                    {lead.rating != null && (
                                                        <span className="text-xs text-amber-400">★ {lead.rating} ({lead.review_count ?? 0})</span>
                                                    )}
                                                    {lead.owner_name && (
                                                        <span className="text-xs text-zinc-500">Owner: {lead.owner_name}</span>
                                                    )}
                                                </div>

                                                {(lead.services?.length ?? 0) > 0 && (
                                                    <div className="flex gap-1 mt-2 flex-wrap">
                                                        {lead.services.map((s: string) => (
                                                            <span key={s} className="px-2 py-0.5 bg-zinc-800 rounded text-xs text-zinc-400">{s}</span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex-shrink-0 text-right">
                                                <div className={cn('text-lg font-bold tabular-nums',
                                                    (lead.icp_score ?? 0) >= 60 ? 'text-green-400' :
                                                    (lead.icp_score ?? 0) >= 40 ? 'text-amber-400' :
                                                    (lead.icp_score ?? 0) >= 20 ? 'text-zinc-300' : 'text-zinc-500'
                                                )}>
                                                    {lead.icp_score ?? 0}
                                                </div>
                                                <div className="text-xs text-zinc-600">ICP</div>
                                                {lead.website_url && (
                                                    <a href={lead.website_url} target="_blank" rel="noopener noreferrer"
                                                        className="text-zinc-500 hover:text-zinc-300 text-xs block mt-1">
                                                        site ↗
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── CONFIG TAB ── */}
                {activeTab === 'config' && (
                    <div className="max-w-2xl space-y-6">

                        {/* Scraping parameters */}
                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 space-y-6">
                            <div>
                                <h2 className="font-semibold mb-1">Scraping Parameters</h2>
                                <p className="text-xs text-zinc-500">
                                    These control scheduled runs only. Manual runs always use a fixed budget of 20 profiles.
                                </p>
                            </div>

                            <SliderInput
                                label="Sessions per day"
                                hint="How many scrape sessions run per day on the schedule"
                                value={sessionsPerDay}
                                min={1}
                                max={10}
                                onChange={setSessionsPerDay}
                            />

                            <SliderInput
                                label="Scrapes per session"
                                hint="Max Vagaro profiles scraped per session (each costs 1 Zyte call)"
                                value={scrapesPerSession}
                                min={1}
                                max={50}
                                onChange={setScrapesPerSession}
                            />

                            <div className="pt-2 border-t border-zinc-800">
                                <div className="text-xs text-zinc-500 space-y-1">
                                    <div>Estimated profiles/day: <span className="text-zinc-300 font-medium">{sessionsPerDay * scrapesPerSession}</span></div>
                                    <div>Approx Zyte API calls/day: <span className="text-zinc-300 font-medium">~{sessionsPerDay * (scrapesPerSession * 2 + 3)}</span> (search + profile + optional website)</div>
                                </div>
                            </div>
                        </div>

                        {/* Schedule toggle */}
                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm font-medium">Cron Schedule</div>
                                    <div className="text-xs text-zinc-500 mt-0.5">Run automatically every 2h, 8am–6pm PT</div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className={cn('text-xs font-semibold', cronEnabled ? 'text-green-400' : 'text-zinc-500')}>
                                        {cronEnabled ? 'Active' : 'Stopped'}
                                    </span>
                                    <button
                                        onClick={() => setCronEnabled(!cronEnabled)}
                                        className={cn('relative w-11 h-6 rounded-full transition-colors', cronEnabled ? 'bg-pink-600' : 'bg-zinc-700')}
                                    >
                                        <span className={cn('absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform', cronEnabled && 'translate-x-5')} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Target cities */}
                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="font-semibold">Target Cities ({cities.length})</h2>
                                    <p className="text-xs text-zinc-500 mt-0.5">Large US metros with dense salon professional populations</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setCities(DEFAULT_CITIES)} className="text-xs text-zinc-400 hover:text-white">Reset</button>
                                    <button onClick={() => setCities([])} className="text-xs text-zinc-400 hover:text-white">Clear</button>
                                </div>
                            </div>
                            <textarea
                                value={cities.join('\n')}
                                onChange={e => setCities(e.target.value.split('\n').map(c => c.trim()).filter(Boolean))}
                                rows={14}
                                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:border-pink-500"
                                placeholder="One city per line: Houston, TX"
                            />
                            <div className="text-xs text-zinc-500">One city per line in "City, ST" format. Cities not scraped in the last 24h are prioritized first.</div>
                        </div>

                        <button
                            onClick={handleSaveConfig}
                            disabled={savingConfig}
                            className="flex items-center gap-2 px-6 py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors"
                        >
                            {savingConfig ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            Save Config
                        </button>
                    </div>
                )}

                {/* ── SETUP TAB ── */}
                {activeTab === 'setup' && (
                    <div className="max-w-3xl space-y-6">

                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                            <h2 className="font-semibold mb-3">DB Migration</h2>
                            <p className="text-sm text-zinc-400 mb-3">Creates all nail_ tables in Supabase. You&apos;ll need the CRON_SECRET.</p>
                            <button
                                onClick={handleRunMigration}
                                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded-lg text-sm font-medium transition-colors"
                            >
                                <AlertCircle className="w-4 h-4" />
                                Run Migration
                            </button>
                            {runLog.length > 0 && (
                                <div className="mt-3 bg-black rounded-lg p-3 font-mono text-xs text-zinc-300 space-y-1 max-h-60 overflow-y-auto">
                                    {runLog.map((line, i) => <div key={i}>{line}</div>)}
                                </div>
                            )}
                        </div>

                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                            <div className="flex items-center justify-between mb-3">
                                <h2 className="font-semibold">SQL Reference</h2>
                                <button
                                    onClick={() => { navigator.clipboard.writeText(SETUP_SQL); toast.success('Copied'); }}
                                    className="text-xs text-zinc-400 hover:text-white"
                                >
                                    Copy SQL
                                </button>
                            </div>
                            <pre className="text-xs text-zinc-400 overflow-x-auto bg-black rounded-lg p-4 max-h-96 overflow-y-auto whitespace-pre-wrap">
                                {SETUP_SQL}
                            </pre>
                        </div>

                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                            <h2 className="font-semibold mb-3">Scraping Strategy</h2>
                            <div className="text-sm text-zinc-400 space-y-2">
                                <p><span className="text-zinc-200 font-medium">Source:</span> Vagaro.com — salon & beauty professional booking platform</p>
                                <p><span className="text-zinc-200 font-medium">Search URLs:</span></p>
                                <ul className="list-disc list-inside text-zinc-500 space-y-1 text-xs font-mono ml-2">
                                    <li>vagaro.com/usa/nail-salons/[city-slug]</li>
                                    <li>vagaro.com/usa/hair-salons/[city-slug]</li>
                                    <li>vagaro.com/usa/beauty-salons/[city-slug]</li>
                                </ul>
                                <p className="mt-2"><span className="text-zinc-200 font-medium">Extracted per profile:</span></p>
                                <ul className="list-disc list-inside text-zinc-500 space-y-1 ml-2">
                                    <li>Business name, owner name</li>
                                    <li>Phone (JSON-LD schema &gt; tel: links &gt; formatted text)</li>
                                    <li>Email (mailto: links &gt; visible text &gt; linked website scrape)</li>
                                    <li>Instagram &amp; Facebook handles</li>
                                    <li>Services (manicure, pedicure, acrylics, gel, waxing, lash, etc.)</li>
                                    <li>Rating &amp; review count (JSON-LD aggregateRating)</li>
                                    <li>City &amp; state (JSON-LD address)</li>
                                </ul>
                                <p className="mt-2"><span className="text-zinc-200 font-medium">Dedup:</span> vagaro_url (UNIQUE) + normalized_email — profiles and emails are never scraped twice</p>
                            </div>
                        </div>

                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                            <h2 className="font-semibold mb-3">ICP Scoring Breakdown (Wynkie)</h2>
                            <div className="text-sm space-y-1">
                                {[
                                    ['+25', 'Has email', 'text-green-400'],
                                    ['+15', 'Has phone', 'text-green-400'],
                                    ['+15', 'Is independent operator (not franchise)', 'text-green-400'],
                                    ['+20', 'Nail specialist (primary Wynkie ICP)', 'text-pink-400'],
                                    ['+15', 'Rating ≥ 4.5 (quality-focused)', 'text-amber-400'],
                                    ['+15', '20+ reviews (established, busy)', 'text-amber-400'],
                                    ['+12', 'Lash / brow specialist', 'text-violet-400'],
                                    ['+10', 'Website present', 'text-zinc-300'],
                                    ['+12', '4+ services (busy operator)', 'text-zinc-300'],
                                    ['+5', 'Instagram present (tech-receptive)', 'text-zinc-300'],
                                    ['-15', 'No email or phone', 'text-red-400'],
                                    ['-30', 'Corporate chain (Supercuts, Great Clips, etc.)', 'text-red-400'],
                                ].map(([pts, desc, color]) => (
                                    <div key={desc as string} className="flex gap-3 items-start">
                                        <span className={cn('font-mono font-bold text-xs w-6 flex-shrink-0 mt-0.5', color as string)}>{pts}</span>
                                        <span className="text-zinc-400 text-sm">{desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-zinc-900 rounded-xl p-5 border border-zinc-800">
                            <h2 className="font-semibold mb-3">API Endpoints</h2>
                            <div className="space-y-2 text-xs font-mono">
                                {[
                                    { path: '/api/cron/nail-pipeline', note: 'Scheduled scrape — GET, requires Bearer CRON_SECRET' },
                                    { path: '/api/admin/run-nail-pipeline', note: 'Manual trigger — POST, mode: manual' },
                                    { path: '/api/admin/nail-migrate', note: 'DB migration — GET, requires Bearer CRON_SECRET' },
                                ].map(ep => (
                                    <div key={ep.path} className="flex gap-3">
                                        <code className="text-pink-400">{ep.path}</code>
                                        <span className="text-zinc-500">— {ep.note}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
