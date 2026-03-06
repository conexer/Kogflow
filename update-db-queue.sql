-- Add queue support to videos table
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/vmuvjfflszhifuyvmjwh/sql

ALTER TABLE public.videos 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS image_urls jsonb DEFAULT '[]',
ADD COLUMN IF NOT EXISTS realtor_info jsonb DEFAULT '{}',
ADD COLUMN IF NOT EXISTS aspect_ratio text DEFAULT '16:9',
ADD COLUMN IF NOT EXISTS progress integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS error text,
ADD COLUMN IF NOT EXISTS task_ids jsonb DEFAULT '[]';

-- Update existing videos to completed (safety)
UPDATE public.videos SET status = 'completed' WHERE status IS NULL;
