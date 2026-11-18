-- Migration 019: Quant-Satellite Multi-Partition Sub-Accounting & High-Water-Mark Performance Fees
CREATE TABLE IF NOT EXISTS public.quant_pool_partitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    participant_name TEXT NOT NULL,
    relation_label TEXT NOT NULL DEFAULT 'Family / Friend',
    is_master BOOLEAN NOT NULL DEFAULT FALSE,
    performance_fee_pct NUMERIC NOT NULL DEFAULT 0.0 CHECK (performance_fee_pct >= 0.0 AND performance_fee_pct <= 50.0),
    initial_capital_usd NUMERIC NOT NULL CHECK (initial_capital_usd >= 0.0),
    net_invested_usd NUMERIC NOT NULL CHECK (net_invested_usd >= 0.0),
    units_owned NUMERIC NOT NULL CHECK (units_owned >= 0.0),
    entry_unit_price NUMERIC NOT NULL DEFAULT 1.0 CHECK (entry_unit_price > 0.0),
    high_water_mark_unit_price NUMERIC NOT NULL DEFAULT 1.0 CHECK (high_water_mark_unit_price > 0.0),
    crystallized_fees_paid_usd NUMERIC NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'CLOSED')),
    notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_quant_pool_partitions_status
ON public.quant_pool_partitions (status, is_master DESC, created_at ASC);

ALTER TABLE public.quant_pool_partitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access quant_pool_partitions" ON public.quant_pool_partitions;
CREATE POLICY "Admin full access quant_pool_partitions"
ON public.quant_pool_partitions FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Zorg dat quant_satellite_telemetry, quant_satellite_commands en quant_pool_partitions in de Supabase Realtime publicatie zitten voor instant push
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quant_satellite_telemetry'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quant_satellite_telemetry;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quant_satellite_commands'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quant_satellite_commands;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quant_pool_partitions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quant_pool_partitions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;