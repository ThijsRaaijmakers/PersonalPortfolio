import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('[SEED ERROR] Missing Supabase credentials in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('--- Seeding Quant Satellite v2.5 Telemetry & Sample Commands ---');

  const nowMs = Date.now();
  const barIntervalMs = 5 * 60 * 1000; // 5-minute bars
  const totalBars = 60; // 60 bars of telemetry history
  const startBarIdx = 1361;
  const currentBarIdx = 1420;

  const telemetryRows = [];

  let nav = 11850.0;
  let peakNav = 12600.0;

  for (let i = 0; i < totalBars; i++) {
    const barIdx = startBarIdx + i;
    const timeMs = nowMs - (totalBars - 1 - i) * barIntervalMs;

    // Small random walk for NAV
    const delta = (Math.random() - 0.46) * 35;
    nav = Math.max(10000, nav + delta);
    if (nav > peakNav) peakNav = nav;

    const ddPct = ((nav - peakNav) / peakNav) * 100;
    const tailBeta = 0.012 + Math.random() * 0.015; // comfortably below 0.035
    const netExposure = (Math.random() - 0.5) * 80;
    const grossLev = 1.15 + Math.random() * 0.15;
    const zStress = 0.4 + Math.random() * 0.35;
    const ulcer = 0.25 + Math.random() * 0.18;
    const mtRatio = 7.5 + Math.random() * 2.0;

    const positions = {
      BTCUSDC: {
        qty_lots: 0.0452,
        notional_usd: 3520.40,
        weight: 0.283,
        entry_price: 66800.00,
      },
      ETHUSDC: {
        qty_lots: 0.7850,
        notional_usd: 2150.10,
        weight: 0.172,
        entry_price: 2650.00,
      },
      SOLUSDC: {
        qty_lots: 12.40,
        notional_usd: 2280.60,
        weight: 0.183,
        entry_price: 178.50,
      },
      SUIUSDT: {
        qty_lots: 950.00,
        notional_usd: 1850.20,
        weight: 0.149,
        entry_price: 1.88,
      },
      XRPUSDC: {
        qty_lots: -1450.00,
        notional_usd: -850.50,
        weight: -0.068,
        entry_price: 0.582,
      },
      DOGEUSDC: {
        qty_lots: -6800.00,
        notional_usd: -980.20,
        weight: -0.079,
        entry_price: 0.142,
      },
      __execution: {
        maker_fills: 412 + i,
        taker_fills: 49 + Math.floor(i / 5),
        gtx_rejects: 3,
      },
    };

    const csdStatus = {
      g_csd: 0.135 + Math.random() * 0.02,
      concordance_rho_h12: 0.81 + Math.random() * 0.05,
      regime: 'EIGEN_EXPANSION',
    };

    const gonogoProgress = {
      bars_evaluated: barIdx,
      target_bars: 2000,
      status: 'IN_PROGRESS',
    };

    telemetryRows.push({
      bar_idx: barIdx,
      timestamp_ms: timeMs,
      venue: 'paper',
      runtime_state: 'STATE_RUNNING',
      nav_usd: parseFloat(nav.toFixed(2)),
      wallet_balance_usd: parseFloat((nav - 270.60).toFixed(2)),
      unrealized_pnl_usd: 270.60,
      realized_pnl_usd: 1240.50,
      total_fees_usd: 42.80,
      drawdown_pct: parseFloat(ddPct.toFixed(2)),
      gross_leverage: parseFloat(grossLev.toFixed(2)),
      net_dollar_exposure: parseFloat(netExposure.toFixed(2)),
      realized_tail_beta: parseFloat(tailBeta.toFixed(4)),
      ulcer_index: parseFloat(ulcer.toFixed(3)),
      z_stress: parseFloat(zStress.toFixed(2)),
      regime_gate_global: 1.0,
      maker_taker_ratio: parseFloat(mtRatio.toFixed(2)),
      positions_lots: positions,
      csd_status: csdStatus,
      gonogo_progress: gonogoProgress,
    });
  }

  // Insert or Upsert telemetry records
  const { error: telError } = await supabase
    .from('quant_satellite_telemetry')
    .upsert(telemetryRows, { onConflict: 'bar_idx' });

  if (telError) {
    console.error('Error inserting telemetry:', telError);
  } else {
    console.log(`Successfully seeded ${telemetryRows.length} telemetry records (Bar #${startBarIdx} to #${currentBarIdx})!`);
  }

  // Sample C2 Command
  const { error: cmdError } = await supabase
    .from('quant_satellite_commands')
    .upsert([
      {
        id: 'c4f1e8a2-7b3d-4c5e-9f1a-8a92b3c4d5e6',
        issued_at_ms: nowMs - 3600000,
        target_state: 'STATE_RUNNING',
        target_nav_usd: 12450.00,
        reason: 'Autonomous start: Tokyo VPS initialized after monthly rebalance',
        hmac_signature: '91b94f6e276e6c9e018a783c59b95c699750d54d168b61eb3693e32069a99a46',
        status: 'EXECUTED',
        executed_at: new Date(nowMs - 3590000).toISOString(),
        vps_response: { ack: true, code: 0 },
      },
    ], { onConflict: 'id' });

  if (cmdError) {
    console.error('Error inserting initial command:', cmdError);
  } else {
    console.log('Successfully seeded initial command record!');
  }

  console.log('--- Seeding Complete ---');
}

seed().catch(console.error);
