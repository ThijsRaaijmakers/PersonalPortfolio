-- Migration 018: Quant-Satellite v2.5 Telemetry, Live State & Command Queue
-- Sluit aan op public.is_admin() en public.admin_logs uit migraties 001 en 007.

-- 1. Tabel voor Master Bar tijdreeks-telemetrie van de Tokyo VPS
CREATE TABLE IF NOT EXISTS public.quant_satellite_telemetry (
    bar_idx INTEGER PRIMARY KEY,
    timestamp_ms BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    venue TEXT NOT NULL DEFAULT 'paper' CHECK (venue IN ('paper', 'live')),
    runtime_state TEXT NOT NULL DEFAULT 'STATE_RUNNING',
    nav_usd NUMERIC NOT NULL,
    wallet_balance_usd NUMERIC NOT NULL,
    unrealized_pnl_usd NUMERIC NOT NULL DEFAULT 0.0,
    realized_pnl_usd NUMERIC NOT NULL DEFAULT 0.0,
    total_fees_usd NUMERIC NOT NULL DEFAULT 0.0,
    drawdown_pct NUMERIC NOT NULL DEFAULT 0.0,
    gross_leverage NUMERIC NOT NULL DEFAULT 0.0,
    net_dollar_exposure NUMERIC NOT NULL DEFAULT 0.0,
    realized_tail_beta NUMERIC NOT NULL DEFAULT 0.0,
    z_stress NUMERIC NOT NULL DEFAULT 0.0,
    regime_gate_global NUMERIC NOT NULL DEFAULT 1.0,
    maker_taker_ratio NUMERIC NOT NULL DEFAULT 1.0,
    positions_lots JSONB NOT NULL DEFAULT '{}'::jsonb,
    csd_status JSONB NOT NULL DEFAULT '{}'::jsonb,
    gonogo_progress JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quant_sat_telemetry_ts 
ON public.quant_satellite_telemetry (timestamp_ms DESC);

ALTER TABLE public.quant_satellite_telemetry ENABLE ROW LEVEL SECURITY;

-- Alleen Admin (en Service Role vanaf Tokyo VPS) mag lezen/schrijven
DROP POLICY IF EXISTS "Admin read quant_satellite_telemetry" ON public.quant_satellite_telemetry;
CREATE POLICY "Admin read quant_satellite_telemetry"
ON public.quant_satellite_telemetry FOR SELECT
USING (public.is_admin());

-- 2. Tabel voor Command & Control (Website Admin -> Tokyo VPS)
CREATE TABLE IF NOT EXISTS public.quant_satellite_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    issued_at_ms BIGINT NOT NULL,
    issued_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    target_state TEXT NOT NULL CHECK (
        target_state IN (
            'STATE_RUNNING',
            'STATE_PAUSE_MAINTAIN',
            'STATE_GRACEFUL_UNWIND_FLAT',
            'STATE_EMERGENCY_HALT'
        )
    ),
    target_nav_usd NUMERIC DEFAULT NULL,
    reason TEXT NOT NULL DEFAULT '',
    hmac_signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN ('PENDING', 'ACKNOWLEDGED', 'EXECUTED', 'REJECTED')
    ),
    executed_at TIMESTAMPTZ DEFAULT NULL,
    vps_response JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_quant_sat_commands_status 
ON public.quant_satellite_commands (status, created_at ASC);

ALTER TABLE public.quant_satellite_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access quant_satellite_commands" ON public.quant_satellite_commands;
CREATE POLICY "Admin full access quant_satellite_commands"
ON public.quant_satellite_commands FOR ALL
USING (public.is_admin())
WITH CHECK (public.is_admin());