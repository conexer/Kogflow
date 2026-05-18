-- Add city_cursor to nail_pipeline_config so the scraper picks up where it left off
ALTER TABLE public.nail_pipeline_config ADD COLUMN IF NOT EXISTS city_cursor INTEGER DEFAULT 0;
