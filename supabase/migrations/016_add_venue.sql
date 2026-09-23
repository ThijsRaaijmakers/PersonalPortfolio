-- Migration 016: Add trading venue column to public.trading_telemetry

ALTER TABLE public.trading_telemetry 
ADD COLUMN IF NOT EXISTS venue TEXT NOT NULL DEFAULT 'paper' CHECK (venue IN ('paper', 'live'));

-- Create index on venue and run_timestamp for fast filtered queries
CREATE INDEX IF NOT EXISTS idx_trading_telemetry_venue_timestamp 
ON public.trading_telemetry (venue, run_timestamp DESC);

