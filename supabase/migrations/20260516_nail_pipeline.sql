-- Nail Outreach Pipeline tables
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/vmuvjfflszhifuyvmjwh/sql/new

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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.nail_pipeline_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.nail_city_log (
  city TEXT PRIMARY KEY,
  last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
  leads_found INTEGER DEFAULT 0
);

ALTER TABLE public.nail_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nail_pipeline_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nail_pipeline_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nail_city_log ENABLE ROW LEVEL SECURITY;
