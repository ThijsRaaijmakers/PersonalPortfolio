import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[SEED ERROR] Missing Supabase credentials in .env (PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const mockRuns = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    run_timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    venue: 'paper',
    is_dry_run: false,
    portfolio_value: 100000.00,
    cash_balance: 2000.00,
    cash_buffer_pct: 0.02,
    daily_change_pct: 0.00,
    dsor: 1.85,
    ulcer_index: 0.42,
    circuit_breaker_triggered: false,
    weights_raw: {
      AAPL: 0.22,
      NVDA: 0.25,
      TSLA: 0.15,
      LLY: 0.15,
      JPM: 0.13,
      GLD: 0.10,
    },
    weights_effective: {
      AAPL: 0.2156,
      NVDA: 0.2450,
      TSLA: 0.1470,
      LLY: 0.1470,
      JPM: 0.1274,
      GLD: 0.0980,
    },
    sentiment_scores: {
      AAPL: 0.65,
      NVDA: 0.88,
      TSLA: 0.35,
      LLY: 0.72,
      JPM: 0.45,
      GLD: 0.50,
    },
    orders_executed: [
      { ticker: 'AAPL', side: 'BUY', notional: 21560.00, status: 'FILLED' },
      { ticker: 'NVDA', side: 'BUY', notional: 24500.00, status: 'FILLED' },
      { ticker: 'TSLA', side: 'BUY', notional: 14700.00, status: 'FILLED' },
      { ticker: 'LLY', side: 'BUY', notional: 14700.00, status: 'FILLED' },
      { ticker: 'JPM', side: 'BUY', notional: 12740.00, status: 'FILLED' },
      { ticker: 'GLD', side: 'BUY', notional: 9800.00, status: 'FILLED' },
    ],
    broker_fees: 6.00,
    metadata: {
      rebalance_reason: 'initial_allocation',
      model_version: 'v2.4-hybrid',
      execution_venue: 'ALPACA_PAPER',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    run_timestamp: new Date().toISOString(),
    venue: 'paper',
    is_dry_run: false,
    portfolio_value: 101240.00,
    cash_balance: 2024.80,
    cash_buffer_pct: 0.02,
    daily_change_pct: 1.24,
    dsor: 2.15,
    ulcer_index: 0.38,
    circuit_breaker_triggered: false,
    weights_raw: {
      AAPL: 0.20,
      NVDA: 0.28,
      TSLA: 0.12,
      LLY: 0.16,
      JPM: 0.14,
      GLD: 0.10,
    },
    weights_effective: {
      AAPL: 0.1960,
      NVDA: 0.2744,
      TSLA: 0.1176,
      LLY: 0.1568,
      JPM: 0.1372,
      GLD: 0.0980,
    },
    sentiment_scores: {
      AAPL: 0.70,
      NVDA: 0.92,
      TSLA: 0.28,
      LLY: 0.75,
      JPM: 0.48,
      GLD: 0.52,
    },
    orders_executed: [
      { ticker: 'NVDA', side: 'BUY', notional: 2940.00, status: 'FILLED' },
      { ticker: 'TSLA', side: 'SELL', notional: 2940.00, status: 'FILLED' },
      { ticker: 'LLY', side: 'BUY', notional: 980.00, status: 'FILLED' },
      { ticker: 'AAPL', side: 'SELL', notional: 1960.00, status: 'FILLED' },
      { ticker: 'JPM', side: 'BUY', notional: 980.00, status: 'FILLED' },
    ],
    broker_fees: 5.00,
    metadata: {
      rebalance_reason: 'daily_rebalance',
      model_version: 'v2.4-hybrid',
      execution_venue: 'ALPACA_PAPER',
    },
  },
];

async function seedTradingTelemetry() {
  console.log('Seeding mock trading telemetry records to Supabase...');

  for (const record of mockRuns) {
    const { error } = await supabase
      .from('trading_telemetry')
      .upsert(record, { onConflict: 'id' });

    if (error) {
      console.error(`[FAILED] Seeding run (${record.id}, $${record.portfolio_value}):`, error.message);
    } else {
      console.log(`[SUCCESS] Seeded run (${record.id}) - Portfolio Value: $${record.portfolio_value} (${record.daily_change_pct > 0 ? '+' : ''}${record.daily_change_pct}%)`);
    }
  }

  console.log('\nSeed sequence complete.');
}

seedTradingTelemetry().catch((err) => {
  console.error('Fatal error running seed script:', err);
  process.exit(1);
});
