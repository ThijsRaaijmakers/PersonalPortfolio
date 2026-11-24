-- Migration 020: Automated Capital Settlement Queue, Isolated Withdrawal Vault & Weekly Universe Health Scanner

-- 1. Tabel voor geplande Stortingen (DEPOSIT) en Opnames (WITHDRAWAL) per Deelnemer-Partitie
CREATE TABLE IF NOT EXISTS public.quant_settlement_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at TIMESTAMPTZ DEFAULT NULL,
    paid_out_at TIMESTAMPTZ DEFAULT NULL,
    partition_id UUID NOT NULL REFERENCES public.quant_pool_partitions(id) ON DELETE CASCADE,
    participant_name TEXT NOT NULL,
    settlement_type TEXT NOT NULL CHECK (settlement_type IN ('DEPOSIT', 'WITHDRAWAL')),
    execution_mode TEXT NOT NULL DEFAULT 'AUTO_BAR_CLOSE' CHECK (
        execution_mode IN ('AUTO_BAR_CLOSE', 'PROPORTIONAL_TRIM', 'FULL_UNWIND_FLAT')
    ),
    requested_amount_usd NUMERIC NOT NULL CHECK (requested_amount_usd > 0.0),
    gross_amount_settled_usd NUMERIC DEFAULT 0.0,
    crystallized_fee_usd NUMERIC DEFAULT 0.0,
    net_amount_settled_usd NUMERIC DEFAULT 0.0,
    units_delta NUMERIC DEFAULT 0.0,
    settlement_unit_price NUMERIC DEFAULT NULL,
    settlement_bar_idx INTEGER DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING_VPS' CHECK (
        status IN ('PENDING_VPS', 'PROCESSING_UNWIND', 'SETTLED_ACTIVE', 'SETTLED_IN_VAULT', 'PAID_OUT', 'CANCELLED')
    ),
    notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_quant_settlement_queue_status
ON public.quant_settlement_queue (status, created_at ASC);

ALTER TABLE public.quant_settlement_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access quant_settlement_queue" ON public.quant_settlement_queue;
CREATE POLICY "Admin full access quant_settlement_queue"
ON public.quant_settlement_queue FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2. Tabel voor Wekelijkse Coin-Health & Universum-Geschiktheidsscans
CREATE TABLE IF NOT EXISTS public.quant_universe_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scan_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    lookback_bars INTEGER NOT NULL DEFAULT 2016,
    active_universe JSONB NOT NULL DEFAULT '[]'::jsonb,
    candidate_rankings JSONB NOT NULL DEFAULT '[]'::jsonb,
    rotation_recommended BOOLEAN NOT NULL DEFAULT FALSE,
    weakest_active_symbol TEXT DEFAULT NULL,
    top_replacement_symbol TEXT DEFAULT NULL,
    score_improvement NUMERIC DEFAULT 0.0,
    summary_markdown TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_quant_universe_scans_ts
ON public.quant_universe_scans (scan_timestamp DESC);

ALTER TABLE public.quant_universe_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin read quant_universe_scans" ON public.quant_universe_scans;
CREATE POLICY "Admin read quant_universe_scans"
ON public.quant_universe_scans FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- Voeg beide tabellen toe aan Supabase Realtime voor directe UI-updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quant_settlement_queue'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quant_settlement_queue;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'quant_universe_scans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.quant_universe_scans;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;