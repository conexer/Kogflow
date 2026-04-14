'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import {
    Search, MapPin, Star, Clock, TrendingDown, Image, Mail,
    Play, Pause, Settings, RefreshCw, CheckCircle, AlertCircle,
    Eye, Zap, Database, Send, BarChart2, Filter, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ALLOWED_EMAILS = ['conexer@gmail.com', 'rocsolid01@gmail.com'];

type LeadStatus = 'scraped' | 'scored' | 'staged' | 'form_filled' | 'emailed';

const STATUS_COLORS: Record<LeadStatus, string> = {
    scraped: 'bg-slate-500/20 text-slate-400',
    scored: 'bg-blue-500/20 text-blue-400',
    staged: 'bg-violet-500/20 text-violet-400',
    form_filled: 'bg-amber-500/20 text-amber-400',
    emailed: 'bg-green-500/20 text-green-400',
};

const STATUS_LABELS: Record<LeadStatus, string> = {
    scraped: 'Scraped',
    scored: 'Scored',
    staged: 'Staged',
    form_filled: 'Form Filled',
    emailed: 'Emailed',
};

const CITIES = [
    { region: 'Orange County', cities: ['Santa Ana', 'Garden Grove', 'Anaheim'] },
    { region: 'Texas', cities: ['Austin', 'Dallas-Fort Worth'] },
    { region: 'Florida', cities: ['Tampa', 'Miami'] },
    { region: 'National', cities: ['Charlotte', 'Raleigh-Durham', 'Atlanta', 'Phoenix'] },
];

// Mock stats for UI scaffold
const MOCK_STATS = {
    totalLeads: 0,
    staged: 0,
    emailed: 0,
    avgScore: 0,
};

const MOCK_LEADS: any[] = [];

export default function OutreachPage() {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [authorized, setAuthorized] = useState(false);

    // Pipeline config state
    const [sessionsPerDay, setSessionsPerDay] = useState(3);
    const [scrapesPerSession, setScrapesPerSession] = useState(10);
    const [selectedCities, setSelectedCities] = useState<string[]>(['Santa Ana', 'Garden Grove', 'Anaheim']);
    const [pipelineRunning, setPipelineRunning] = useState(false);
    const [activeTab, setActiveTab] = useState<'dashboard' | 'leads' | 'config' | 'email'>('dashboard');

    useEffect(() => {
        if (!loading) {
            if (!user) { router.replace('/login'); return; }
            if (!ALLOWED_EMAILS.includes(user.email || '')) { router.replace('/dashboard'); return; }
            setAuthorized(true);
        }
    }, [user, loading, router]);

    if (!authorized) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    const toggleCity = (city: string) => {
        setSelectedCities(prev =>
            prev.includes(city) ? prev.filter(c => c !== city) : [...prev, city]
        );
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
                        </h1>
                        <p className="text-sm text-muted-foreground">Autonomous Kogflow Beta Outreach — Internal Only</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium", pipelineRunning ? "bg-green-500/10 text-green-500" : "bg-muted text-muted-foreground")}>
                            <div className={cn("w-2 h-2 rounded-full", pipelineRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground")} />
                            {pipelineRunning ? 'Pipeline Running' : 'Pipeline Idle'}
                        </div>
                        <button
                            onClick={() => setPipelineRunning(!pipelineRunning)}
                            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors",
                                pipelineRunning
                                    ? "bg-destructive/10 text-destructive hover:bg-destructive/20"
                                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                            )}
                        >
                            {pipelineRunning ? <><Pause className="w-4 h-4" /> Pause</> : <><Play className="w-4 h-4" /> Start Pipeline</>}
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="max-w-7xl mx-auto px-6 flex gap-1">
                    {(['dashboard', 'leads', 'config', 'email'] as const).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={cn("px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors",
                                activeTab === tab
                                    ? "border-primary text-primary"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

                {/* ── DASHBOARD TAB ── */}
                {activeTab === 'dashboard' && (
                    <div className="space-y-8">
                        {/* Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Leads', value: MOCK_STATS.totalLeads, icon: Database, color: 'text-blue-400' },
                                { label: 'Staged', value: MOCK_STATS.staged, icon: Image, color: 'text-violet-400' },
                                { label: 'Emailed', value: MOCK_STATS.emailed, icon: Mail, color: 'text-green-400' },
                                { label: 'Avg ICP Score', value: MOCK_STATS.avgScore, icon: Star, color: 'text-amber-400' },
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
                                {(['scraped', 'scored', 'staged', 'form_filled', 'emailed'] as LeadStatus[]).map((stage, i, arr) => (
                                    <div key={stage} className="flex items-center gap-2">
                                        <div className={cn("px-4 py-2 rounded-lg text-sm font-medium", STATUS_COLORS[stage])}>
                                            <span className="font-bold">0</span> {STATUS_LABELS[stage]}
                                        </div>
                                        {i < arr.length - 1 && <span className="text-muted-foreground">→</span>}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* ICP Scoring Legend */}
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
                    </div>
                )}

                {/* ── LEADS TAB ── */}
                {activeTab === 'leads' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="font-bold text-lg">Lead Queue</h2>
                            <div className="flex items-center gap-2">
                                <button className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
                                    <Filter className="w-4 h-4" /> Filter
                                </button>
                                <button className="flex items-center gap-2 px-3 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors">
                                    <RefreshCw className="w-4 h-4" /> Refresh
                                </button>
                            </div>
                        </div>

                        {MOCK_LEADS.length === 0 ? (
                            <div className="bg-card border border-dashed border-border rounded-xl p-16 text-center space-y-3">
                                <Search className="w-10 h-10 text-muted-foreground/50 mx-auto" />
                                <h3 className="font-medium text-muted-foreground">No leads yet</h3>
                                <p className="text-sm text-muted-foreground">Start the pipeline to begin scraping Movoto listings</p>
                                <button
                                    onClick={() => { setPipelineRunning(true); setActiveTab('dashboard'); }}
                                    className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                                >
                                    Start Pipeline
                                </button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {MOCK_LEADS.map((lead, i) => (
                                    <div key={i} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4">
                                        <div className="w-16 h-12 bg-muted rounded-lg overflow-hidden shrink-0">
                                            <img src={lead.imageUrl} alt="" className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{lead.address}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                                                <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.city}</span>
                                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{lead.daysOnMarket}d</span>
                                                {lead.priceReduced && <span className="flex items-center gap-1 text-red-400"><TrendingDown className="w-3 h-3" />Price Reduced</span>}
                                            </div>
                                        </div>
                                        <div className="text-center shrink-0">
                                            <div className="text-lg font-bold text-amber-400">{lead.score}</div>
                                            <div className="text-xs text-muted-foreground">ICP Score</div>
                                        </div>
                                        <span className={cn("px-2 py-1 rounded-full text-xs font-medium shrink-0", STATUS_COLORS[lead.status as LeadStatus])}>
                                            {STATUS_LABELS[lead.status as LeadStatus]}
                                        </span>
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

                        {/* Schedule */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-5">
                            <h3 className="font-semibold flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> Schedule & Throttling</h3>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center justify-between">
                                        Sessions per day <span className="text-primary font-bold">{sessionsPerDay}</span>
                                    </label>
                                    <input type="range" min={1} max={10} value={sessionsPerDay}
                                        onChange={e => setSessionsPerDay(Number(e.target.value))}
                                        className="w-full accent-primary" />
                                    <div className="flex justify-between text-xs text-muted-foreground"><span>1</span><span>10</span></div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center justify-between">
                                        Scrapes per session <span className="text-primary font-bold">{scrapesPerSession}</span>
                                    </label>
                                    <input type="range" min={5} max={50} step={5} value={scrapesPerSession}
                                        onChange={e => setScrapesPerSession(Number(e.target.value))}
                                        className="w-full accent-primary" />
                                    <div className="flex justify-between text-xs text-muted-foreground"><span>5</span><span>50</span></div>
                                </div>
                            </div>
                        </div>

                        {/* Target Cities */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold flex items-center gap-2"><MapPin className="w-4 h-4 text-primary" /> Target Cities</h3>
                            {CITIES.map(region => (
                                <div key={region.region} className="space-y-2">
                                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{region.region}</div>
                                    <div className="flex flex-wrap gap-2">
                                        {region.cities.map(city => (
                                            <button
                                                key={city}
                                                onClick={() => toggleCity(city)}
                                                className={cn("px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                                    selectedCities.includes(city)
                                                        ? "bg-primary/10 border-primary text-primary"
                                                        : "bg-background border-border text-muted-foreground hover:border-primary/50"
                                                )}
                                            >
                                                {city}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Filters */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold flex items-center gap-2"><Filter className="w-4 h-4 text-primary" /> ICP Filters</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Min Price</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                        <input type="number" defaultValue={200000} className="w-full pl-7 pr-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Max Price</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                                        <input type="number" defaultValue={600000} className="w-full pl-7 pr-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Min Days on Market</label>
                                    <input type="number" defaultValue={30} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-sm font-medium">Min Empty Rooms</label>
                                    <input type="number" defaultValue={2} className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
                                </div>
                            </div>
                            <div className="space-y-2 pt-2">
                                <div className="text-sm font-medium">Keywords</div>
                                <div className="flex flex-wrap gap-2">
                                    {['Vacant', 'Unfurnished', 'Immediate Occupancy'].map(kw => (
                                        <span key={kw} className="px-3 py-1 bg-primary/10 text-primary border border-primary/30 rounded-full text-sm font-medium">{kw}</span>
                                    ))}
                                </div>
                            </div>
                            <div className="space-y-2 pt-2">
                                <div className="text-sm font-medium">Property Types</div>
                                <div className="flex flex-wrap gap-2">
                                    {['Single Family', 'Condo'].map(type => (
                                        <span key={type} className="px-3 py-1 bg-primary/10 text-primary border border-primary/30 rounded-full text-sm font-medium">{type}</span>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button className="w-full py-3 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 transition-colors">
                            Save Configuration
                        </button>
                    </div>
                )}

                {/* ── EMAIL TAB ── */}
                {activeTab === 'email' && (
                    <div className="space-y-6 max-w-2xl">
                        <h2 className="font-bold text-lg flex items-center gap-2"><Send className="w-5 h-5" /> Email Outreach</h2>

                        {/* Sender Config */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold">Sender</h3>
                            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                                <Mail className="w-5 h-5 text-primary" />
                                <div>
                                    <div className="text-sm font-medium">kogflow.media@gmail.com</div>
                                    <div className="text-xs text-muted-foreground">Gmail API · Not connected</div>
                                </div>
                                <button className="ml-auto px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90">
                                    Connect
                                </button>
                            </div>
                        </div>

                        {/* Email Template */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                            <h3 className="font-semibold">Message Template</h3>
                            <div className="text-xs text-muted-foreground space-y-1 p-3 bg-muted/20 rounded-lg font-mono">
                                <p>Hi [Realtor Name],</p>
                                <br />
                                <p>I saw your listing at [Exact Property Address]. I noticed it's been active for [X] days—it's a great space, but the empty [Room Type] might be making it hard for buyers to commit after the recent price adjustment.</p>
                                <br />
                                <p>I made a free preview for you to help "refresh" the listing without another price drop:</p>
                                <p>Before: [link] | Staged with Kogflow: [link]</p>
                                <br />
                                <p>Would this help move [Exact Property Address] faster?</p>
                                <br />
                                <p>Best, Minh</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {['[Realtor Name]', '[Exact Property Address]', '[X] days', '[Room Type]', '[link]'].map(v => (
                                    <span key={v} className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-xs rounded font-mono">{v}</span>
                                ))}
                            </div>
                        </div>

                        {/* Queue */}
                        <div className="bg-card border border-border rounded-xl p-6 space-y-3">
                            <h3 className="font-semibold flex items-center justify-between">
                                Email Queue
                                <span className="text-sm text-muted-foreground">0 pending</span>
                            </h3>
                            <div className="text-center py-8 text-sm text-muted-foreground">
                                No leads ready to email yet. Complete the staging step first.
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
