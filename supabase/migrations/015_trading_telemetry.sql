-- Migration 015: Trading Telemetry Table, RLS Policies, and Seed Mock Data

-- 1. Create table public.trading_telemetry
CREATE TABLE IF NOT EXISTS public.trading_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    run_timestamp TIMESTAMPTZ NOT NULL,
    is_dry_run BOOLEAN NOT NULL DEFAULT false,
    portfolio_value NUMERIC NOT NULL,
    cash_balance NUMERIC NOT NULL,
    cash_buffer_pct NUMERIC NOT NULL DEFAULT 0.02,
    daily_change_pct NUMERIC NOT NULL DEFAULT 0.0,
    dsor NUMERIC,
    ulcer_index NUMERIC,
    circuit_breaker_triggered BOOLEAN NOT NULL DEFAULT false,
    weights_raw JSONB NOT NULL,
    weights_effective JSONB NOT NULL,
    sentiment_scores JSONB,
    orders_executed JSONB NOT NULL,
    broker_fees NUMERIC NOT NULL DEFAULT 0.0,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Performance Index for time-series queries
CREATE INDEX IF NOT EXISTS idx_trading_telemetry_run_timestamp 
ON public.trading_telemetry (run_timestamp DESC);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.trading_telemetry ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy: Only admins have SELECT, INSERT, UPDATE, and DELETE rights
DROP POLICY IF EXISTS "Admin full access trading telemetry" ON public.trading_telemetry;
CREATE POLICY "Admin full access trading telemetry"
ON public.trading_telemetry
FOR ALL
USING (
    public.is_admin() OR 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
)
WITH CHECK (
    public.is_admin() OR 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'admin'
    )
);

-- 5. Seed Mock Runs (Startrun $100.000 en vervolgrun $101.240)
INSERT INTO public.trading_telemetry (
    id,
    run_timestamp,
    is_dry_run,
    portfolio_value,
    cash_balance,
    cash_buffer_pct,
    daily_change_pct,
    dsor,
    ulcer_index,
    circuit_breaker_triggered,
    weights_raw,
    weights_effective,
    sentiment_scores,
    orders_executed,
    broker_fees,
    metadata
) VALUES 
(
    '00000000-0000-0000-0000-000000000001',
    NOW() - INTERVAL '1 day',
    false,
    100000.00,
    2000.00,
    0.02,
    0.0,
    1.85,
    0.42,
    false,
    '{"AAPL": 0.22, "NVDA": 0.25, "TSLA": 0.15, "LLY": 0.15, "JPM": 0.13, "GLD": 0.10}'::jsonb,
    '{"AAPL": 0.2156, "NVDA": 0.2450, "TSLA": 0.1470, "LLY": 0.1470, "JPM": 0.1274, "GLD": 0.0980}'::jsonb,
    '{"AAPL": 0.65, "NVDA": 0.88, "TSLA": 0.35, "LLY": 0.72, "JPM": 0.45, "GLD": 0.50}'::jsonb,
    '[
        {"ticker": "AAPL", "side": "BUY", "notional": 21560.00, "status": "FILLED"},
        {"ticker": "NVDA", "side": "BUY", "notional": 24500.00, "status": "FILLED"},
        {"ticker": "TSLA", "side": "BUY", "notional": 14700.00, "status": "FILLED"},
        {"ticker": "LLY", "side": "BUY", "notional": 14700.00, "status": "FILLED"},
        {"ticker": "JPM", "side": "BUY", "notional": 12740.00, "status": "FILLED"},
        {"ticker": "GLD", "side": "BUY", "notional": 9800.00, "status": "FILLED"}
    ]'::jsonb,
    6.00,
    '{"rebalance_reason": "initial_allocation", "model_version": "v2.4-hybrid"}'::jsonb
),
(
    '00000000-0000-0000-0000-000000000002',
    NOW(),
    false,
    101240.00,
    2024.80,
    0.02,
    1.24,
    2.15,
    0.38,
    false,
    '{"AAPL": 0.20, "NVDA": 0.28, "TSLA": 0.12, "LLY": 0.16, "JPM": 0.14, "GLD": 0.10}'::jsonb,
    '{"AAPL": 0.1960, "NVDA": 0.2744, "TSLA": 0.1176, "LLY": 0.1568, "JPM": 0.1372, "GLD": 0.0980}'::jsonb,
    '{"AAPL": 0.70, "NVDA": 0.92, "TSLA": 0.28, "LLY": 0.75, "JPM": 0.48, "GLD": 0.52}'::jsonb,
    '[
        {"ticker": "NVDA", "side": "BUY", "notional": 2940.00, "status": "FILLED"},
        {"ticker": "TSLA", "side": "SELL", "notional": 2940.00, "status": "FILLED"},
        {"ticker": "LLY", "side": "BUY", "notional": 980.00, "status": "FILLED"},
        {"ticker": "AAPL", "side": "SELL", "notional": 1960.00, "status": "FILLED"},
        {"ticker": "JPM", "side": "BUY", "notional": 980.00, "status": "FILLED"}
    ]'::jsonb,
    5.00,
    '{"rebalance_reason": "daily_rebalance", "model_version": "v2.4-hybrid"}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

