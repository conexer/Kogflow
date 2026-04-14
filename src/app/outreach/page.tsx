'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
    Search, MapPin, Star, Clock, TrendingDown, Image, Mail,
    Play, Pause, Settings, RefreshCw, CheckCircle, AlertCircle,
    Zap, Database, Send, BarChart2, Filter, Copy, Terminal,
    ChevronRight, ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLeadStats, getLeads, runPipelineSession, detectRoom, scrapeMovotoCity } from '@/app/actions/outreach';
import { toast } from 'sonner';

const ALLOWED_EMAILS = ['conexer@gmail.com', 'rocsolid01@gmail.com'];

type LeadStatus = 'scraped' | 'scored' | 'staged' | 'form_filled' | 'emailed';

const STATUS_COLORS: Record<string, string> = {
    scraped: 'bg-slate-500/20 text-slate-400',
    scored: 'bg-blue-500/20 text-blue-400',
    staged: 'bg-violet-500/20 text-violet-400',
    form_filled: 'bg-amber-500/20 text-amber-400',
    emailed: 'bg-green-500/20 text-green-400',
};

const STATUS_LABELS: Record<string, string> = {
    scraped: 'Scraped',
    scored: 'Scored',
    staged: 'Staged',
    form_filled: 'Form Filled',
    emailed: 'Emailed',
};

const CITIES = [
    { region: 'Orange County (Local)', cities: ['Santa Ana', 'Garden Grove', 'Anaheim'] },
    { region: 'Texas', cities: ['Austin', 'Dallas-Fort Worth'] },
    { region: 'Florida', cities: ['Tampa', 'Miami'] },
    { region: 'National', cities: ['Charlotte', 'Raleigh-Durham', 'Atlanta', 'Phoenix'] },
];

const SETUP_SQL = `-- Run this in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS public.outreach_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  address TEXT NOT NULL,
  city TEXT,
  price INTEGER,
  days_on_market INTEGER DEFAULT 0,
  price_reduced BOOLEAN DEFAULT FALSE,
  photo_count INTEGER DEFAULT 0,
  agent_name TEXT,
  agent_phone TEXT,
  agent_email TEXT,
  listing_url TEXT,
  keywords TEXT[],
  icp_score INTEGER DEFAULT 0,
  empty_rooms JSONB DEFAULT '[]',
  staging_task_id TEXT,
  staged_image_url TEXT,
  status TEXT DEFAULT 'scraped',
  contacted_at TIMESTAMPTZ,
  notes TEXT
);

-- Index for fast score-ordered queries
CREATE INDEX IF NOT EXISTS idx_outreach_leads_score ON public.outreach_leads (icp_score DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_leads_status ON public.outreach_leads (status);

-- Enable RLS but allow service role full access
ALTER TABLE public.outreach_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON public.outreach_leads
  USING (TRUE) WITH CHECK (TRUE);`;

export default function OutreachPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);
    const [dbReady, setDbReady] = useState<boolean | null>(null);

    // Stats
    const [stats, setStats] = useState({ total: 0, scraped: 0, scored: 0, staged: 0, form_filled: 0, emailed: 0, avgScore: 0 });
    const [leads, setLeads] = useState<any[]>([]);
    const [loadingData, setLoadingData] = useState(false);

    // Pipeline config
    const [sessionsPerDay, setSessionsPerDay] = useState(3);
    const [scrapesPerSession, setScrapesPerSession] = useState(10);
    const [selectedCities, setSelectedCities] = useState<string[]>(['Santa Ana', 'Garden Grove', 'Anaheim']);
    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [runningSession, setRunningSession] = useState(false);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'leads' | 'config' | 'email' | 'setup'>('dashboard');

    // Test tools
    const [testImageUrl, setTestImageUrl] = useState('');
    const [testResult, setTestResult] = useState<any>(null);
    const [testLoading, setTestLoading] = useState(false);

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
            const [statsRes, leadsRes] = await Promise.all([getLeadStats(), getLeads()]);
            if ('error' in statsRes && statsRes.error?.includes('outreach_leads')) {
                setDbReady(false);
                setActiveTab('setup');
            } else {
                setDbReady(true);
                if (statsRes.stats) setStats(statsRes.stats);
                if (leadsRes.leads) setLeads(leadsRes.leads);
            }
        } catch {
            setDbReady(false);
        }
        setLoadingData(false);
    }, []);

    useEffect(() => {
        if (authorized) loadData();
    }, [authorized, loadData]);

    const handleRunSession = async () => {
        if (selectedCities.length === 0) { toast.error('Select at least one city'); return; }
        setRunningSession(true);
        toast.loading('Running pipeline session...', { id: 'pipeline' });
        try {
            const result = await runPipelineSession({ cities: selectedCities, scrapesPerSession });
            toast.dismiss('pipeline');
            toast.success(`Session complete: ${result.processed} leads processed`);
            if (result.errors.length > 0) toast.error(`${result.errors.length} errors: ${result.errors[0]}`);
            await loadData();
        } catch (e: any) {
            toast.dismiss('pipeline');
            toast.error(e.message || 'Session failed');
        }
        setRunningSession(false);
    };

    const handleTestMoondream = async () => {
        if (!testImageUrl) { toast.error('Enter an image URL'); return; }
        setTestLoading(true);
        setTestResult(null);
        const result = await detectRoom(testImageUrl);
        setTestResult(result);
        setTestLoading(false);
    };

    if (!authorized) {
        return <div className="min-h-screen flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;
    }

    const toggleCity = (city: string) => {
        setSelectedCities(prev => prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]);
    };

    return (
        <div className="min-h-screen bg-background text-foreground">
            {/* Header */}
            <div className="border-b border-border/40 bg-background/80 backdrop-blur sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Zap className="w-6 h-6 text-primary" />
                            Outreach Pipeline
                            <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium">Internal Only</span>
                        </h1>
                        <p className="text-sm text-muted-foreground">Autonomous Kogflow Beta Outreach — Movoto → Moondream → Kie.ai → Gmail</p>
                    </div>
                    <div className="flex items-center gap-3">
                        {dbReady === false && (
                            <button onClick={() => setActiveTab('setup')} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 text-amber-500 rounded-full text-sm font-medium hover:bg-amber-500/20">
                                <AlertCircle className="w-4 h-4" /> DB Setup Required
                            </button>
                        )}
                        {dbReady && (
                            <button
                                onClick={handleRunSession}
                                disabled={runningSession}
                                className={cn("flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors",
                                    runningSession ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-primary/90"
                                )}
                            >
                                {runningSession
                                    ? <><div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" /> Running...</>
                                    : <><Play className="w-4 h-4" /> Run Session</>}
                            </button>
                        )}
                        <button onClick={loadData} className="p-2 hover:bg-muted rounded-lg transition-colors">
                            <RefreshCw className={cn("w-4 h-4", loadingData && "animate-spin")} />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="max-w-7xl mx-auto px-6 flex gap-1">
                    {(['dashboard', 'leads', 'config', 'email', 'setup'] as const).map(tab => (
                        <button key={tab} onClick={() => setActiveTab(tab)}
                            className={cn("px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors",
                                activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                            )}>
                            {tab === 'setup' ? '⚙ Setup' : tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                {/* ── DASHBOARD TAB ── */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Leads', value: stats.total, icon: Database, color: 'text-blue-400' },
                                { label: 'Staged', value: stats.staged, icon: Image, color: 'text-violet-400' },
                                { label: 'Emailed', value: stats.emailed, icon: Mail, color: 'text-green-400' },
                                { label: 'Avg ICP Score', value: stats.avgScore, icon: Star, color: 'text-amber-400' },
                            ].map(stat => (
                                <div key={stat.label} className="bg-card border border-border rounded-xl p-5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">{stat.label}</span>
                                        <stat.icon className={cn("w-4 h-4", stat.color)} />
                                    </div>
                                    <div className="text-3xl font-bold">{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Pipeline Flow */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h2 className="font-bold text-lg flex items-center gap-2"><BarChart2 className="w-5 h-5 text-primary" /> Pipeline Stages</h2>
                            <div className="flex items-center gap-2 flex-wrap">
                                {(['scraped', 'scored', 'staged', 'form_filled', 'emailed'] as const).map((stage, i, arr) => (
                                    <div key={stage} className="flex items-center gap-2">
                                        <div className={cn("px-4 py-2 rounded-lg text-sm font-medium", STATUS_COLORS[stage])}>
                                            <span className="font-bold">{stats[stage] ?? 0}</span> {STATUS_LABELS[stage]}
                                        </div>
                                        {i < arr.length - 1 && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ICP Scoring */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h2 className="font-bold text-lg flex items-center gap-2"><Star className="w-5 h-5 text-amber-400" /> ICP Scoring System</h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[
                                    { factor: 'Vacant / Unfurnished', points: '+40', reason: 'High visual need for staging' },
                                    { factor: 'Price Reduced', points: '+25', reason: 'Signals marketing failure' },
                                    { factor: 'Days on Market 60+', points: '+20', reason: 'High owner pressure' },
                                    { factor: 'Low Photo Count (<15)', points: '+10', reason: 'Tech-lagging indicator' },
                                    { factor: 'Days on Market 30–59', points: '+5', reason: 'Moderate frustration' },
                                ].map(row => (
                                    <div key={row.factor} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                                        <span className="font-bold text-green-400 text-sm w-10 shrink-0">{row.points}</span>
                                        <div>
                                            <div className="text-sm font-medium">{row.factor}</div>
                                            <div className="text-xs text-muted-foreground">{row.reason}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Moondream Test Tool */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h2 className="font-bold text-lg flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> Test Moondream Vision</h2>
                            <p className="text-sm text-muted-foreground">Paste any real estate photo URL to test room detection</p>
                            <div className="flex gap-2">
                                <input
                                    type="url"
                                    value={testImageUrl}
                                    onChange={e => setTestImageUrl(e.target.value)}
                                    placeholder="https://photos.movoto.com/..."
                                    className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                                <button onClick={handleTestMoondream} disabled={testLoading}
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                                    {testLoading ? 'Testing...' : 'Test'}
                                </button>
                            </div>
                            {testResult && (
                                <div className={cn("p-4 rounded-lg text-sm space-y-1 font-mono", testResult.isEmpty ? "bg-green-500/10 border border-green-500/20" : "bg-muted border border-border")}>
                                    <div><span className="text-muted-foreground">Empty room:</span> <span className="font-bold">{testResult.isEmpty ? '✅ Yes' : '❌ No'}</span></div>
                                    <div><span className="text-muted-foreground">Confidence:</span> <span className="font-bold">{testResult.confidence}%</span></div>
                                    <div><span className="text-muted-foreground">Room type:</span> <span className="font-bold capitalize">{testResult.roomType}</span></div>
                                    {testResult.error && <div className="text-destructive">{testResult.error}</div>}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── LEADS TAB ── */}
                {activeTab === 'leads' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-lg">Lead Queue <span className="text-muted-foreground font-normal text-sm">({leads.length} total, ordered by ICP score)</span></h2>
                        </div>
                        {leads.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-xl p-16 text-center space-y-3">
                                <Search className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                                <h3 className="font-medium text-muted-foreground">No leads yet</h3>
                                <p className="text-sm text-muted-foreground">Click "Run Session" to start scraping Movoto listings</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {leads.map((lead) => (
                                    <div key={lead.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 transition-colors">
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{lead.address}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5 flex-wrap">
                                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.city}</span>
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{lead.days_on_market}d on market</span>
                                                <span>${lead.price?.toLocaleString()}</span>
                                                {lead.price_reduced && <span className="flex items-center gap-1 text-red-400"><TrendingDown className="w-3 h-3" />Price Reduced</span>}
                                                {lead.empty_rooms?.length > 0 && <span className="flex items-center gap-1 text-violet-400"><Image className="w-3 h-3" />{lead.empty_rooms.length} empty rooms</span>}
                                            </div>
                                        </div>
                                        <div className="text-center shrink-0">
                                            <div className="text-lg font-bold text-amber-400">{lead.icp_score}</div>
                                            <div className="text-xs text-muted-foreground">ICP</div>
                                        </div>
                                        <span className={cn("px-2 py-1 rounded-full text-xs font-medium shrink-0", STATUS_COLORS[lead.status] || STATUS_COLORS.scraped)}>
                                            {STATUS_LABELS[lead.status] || lead.status}
                                        </span>
                                        <a href={lead.listing_url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-muted rounded transition-colors shrink-0">
                                            <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                        </a>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* ── CONFIG TAB ── */}
                {activeTab === 'config' && (
                    <div className="space-y-6 max-w-2xl">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Settings className="w-5 h-5" /> Pipeline Configuration</h2>

                        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                            <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Schedule & Throttling</h3>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center justify-between">Sessions per day <span className="text-primary font-bold">{sessionsPerDay}</span></label>
                                    <input type="range" min={1} max={10} value={sessionsPerDay} onChange={e => setSessionsPerDay(Number(e.target.value))} className="w-full accent-primary" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center justify-between">Scrapes per session <span className="text-primary font-bold">{scrapesPerSession}</span></label>
                                    <input type="range" min={5} max={50} step={5} value={scrapesPerSession} onChange={e => setScrapesPerSession(Number(e.target.value))} className="w-full accent-primary" />
                                </div>
                            </div>
                        </div>

                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Target Cities ({selectedCities.length} selected)</h3>
                            {CITIES.map(region => (
                                <div key={region.region} className="space-y-2">
                                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{region.region}</div>
                                    <div className="flex flex-wrap gap-2">
                                        {region.cities.map(city => (
                                            <button key={city} onClick={() => toggleCity(city)}
                                                className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                                    selectedCities.includes(city)
                                                        ? "bg-primary/10 border-primary text-primary"
                                                        : "bg-background border-border text-muted-foreground hover:border-primary/50"
                                                )}>
                                                {city}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold">ICP Filters (Active)</h3>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-muted-foreground">Price range:</span> <span className="font-medium">$200k – $600k</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-muted-foreground">Min DOM:</span> <span className="font-medium">30 days</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-muted-foreground">Min empty rooms:</span> <span className="font-medium">2</span></div>
                                <div className="p-3 bg-muted/30 rounded-lg"><span className="text-muted-foreground">Sort:</span> <span className="font-medium">Oldest first</span></div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {['Vacant', 'Unfurnished', 'Immediate Occupancy', 'Single Family', 'Condo'].map(tag => (
                                    <span key={tag} className="px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-xs font-medium">{tag}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── EMAIL TAB ── */}
                {activeTab === 'email' && (
                    <div className="space-y-6 max-w-2xl">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Send className="w-5 h-5" /> Email Outreach</h2>
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold">Sender — kogflow.media@gmail.com</h3>
                            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm text-amber-400 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                Gmail API connection coming next. Will send from kogflow.media@gmail.com with OAuth2.
                            </div>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold">Outreach Template</h3>
                            <div className="text-xs text-muted-foreground p-4 bg-muted/20 rounded-lg font-mono space-y-2 leading-relaxed">
                                <p>Hi <span className="text-amber-400">[Realtor Name]</span>,</p>
                                <br />
                                <p>I saw your listing at <span className="text-amber-400">[Exact Property Address]</span>. I noticed it's been active for <span className="text-amber-400">[X] days</span>—it's a great space, but the empty <span className="text-amber-400">[Room Type]</span> might be making it hard for buyers to commit after the recent price adjustment.</p>
                                <br />
                                <p>I made a free preview for you to help "refresh" the listing without another price drop:</p>
                                <p>Before: <span className="text-blue-400">[before link]</span> | Staged with Kogflow: <span className="text-blue-400">[staged link]</span></p>
                                <br />
                                <p>Would this help move <span className="text-amber-400">[Exact Property Address]</span> faster?</p>
                                <br />
                                <p>Best, Minh</p>
                            </div>
                        </div>
                        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
                            <h3 className="font-semibold flex items-center justify-between">Email Queue
                                <span className="text-sm text-muted-foreground">{leads.filter(l => l.status === 'staged').length} ready to send</span>
                            </h3>
                            {leads.filter(l => l.status === 'staged').length === 0
                                ? <p className="text-sm text-muted-foreground text-center py-6">No staged leads ready. Run the pipeline first.</p>
                                : leads.filter(l => l.status === 'staged').map(lead => (
                                    <div key={lead.id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{lead.address}</div>
                                            <div className="text-xs text-muted-foreground">{lead.agent_name || 'Agent unknown'} · Score {lead.icp_score}</div>
                                        </div>
                                        <button className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90">
                                            Send
                                        </button>
                                    </div>
                                ))
                            }
                        </div>
                    </div>
                )}

                {/* ── SETUP TAB ── */}
                {activeTab === 'setup' && (
                    <div className="space-y-6 max-w-3xl">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Terminal className="w-5 h-5" /> Database Setup</h2>

                        <div className={cn("p-4 rounded-xl border flex items-start gap-3", dbReady ? "bg-green-500/10 border-green-500/20" : "bg-amber-500/10 border-amber-500/20")}>
                            {dbReady
                                ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                                : <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />}
                            <div>
                                <div className="font-medium text-sm">{dbReady ? 'Database ready' : 'outreach_leads table not found'}</div>
                                <div className="text-xs text-muted-foreground mt-0.5">{dbReady ? 'All tables exist and are accessible.' : 'Run the SQL below in your Supabase SQL Editor to create the required table.'}</div>
                            </div>
                        </div>

                        {!dbReady && (
                            <>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <p className="text-sm font-medium">1. Go to <a href="https://supabase.com/dashboard/project/vmuvjfflszhifuyvmjwh/sql/new" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Supabase SQL Editor <ExternalLink className="w-3 h-3" /></a></p>
                                        <button onClick={() => { navigator.clipboard.writeText(SETUP_SQL); toast.success('SQL copied!'); }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-lg font-medium transition-colors">
                                            <Copy className="w-3 h-3" /> Copy SQL
                                        </button>
                                    </div>
                                    <pre className="bg-muted/50 border border-border rounded-xl p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-muted-foreground">{SETUP_SQL}</pre>
                                </div>
                                <p className="text-sm text-muted-foreground">2. Paste and run, then click Refresh below.</p>
                                <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:bg-primary/90">
                                    <RefreshCw className="w-4 h-4" /> Check Again
                                </button>
                            </>
                        )}

                        {/* API Key Status */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold">API Keys Status</h3>
                            <div className="space-y-2">
                                {[
                                    { name: 'Zyte (Scraper)', env: 'ZYTE_API_KEY', status: true },
                                    { name: 'Moondream (Vision)', env: 'MOONDREAM_API_KEY', status: true },
                                    { name: 'CapMonster (CAPTCHA)', env: 'CAPMONSTER_API_KEY', status: true },
                                    { name: 'Kie.ai (Staging)', env: 'KIE_AI_API_KEY', status: true },
                                    { name: 'Gmail API', env: 'GMAIL_CLIENT_ID', status: false },
                                ].map(key => (
                                    <div key={key.name} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                        <div>
                                            <div className="text-sm font-medium">{key.name}</div>
                                            <div className="text-xs text-muted-foreground font-mono">{key.env}</div>
                                        </div>
                                        <span className={cn("text-xs px-2 py-1 rounded-full font-medium", key.status ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground")}>
                                            {key.status ? '✓ Configured' : 'Not set'}
                                        </span>
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
