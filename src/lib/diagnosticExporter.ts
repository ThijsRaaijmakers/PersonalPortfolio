export interface SatelliteDiagnosticContext {
  latestRow: Record<string, any>;
  historyRows?: Array<Record<string, any>>;
  latestCoreRow?: Record<string, any> | null;
  recentCommands?: Array<Record<string, any>>;
  venue?: string;
}

export interface CoreDiagnosticContext {
  latestRow: Record<string, any>;
  historyRows?: Array<Record<string, any>>;
  latestSatelliteRow?: Record<string, any> | null;
  venue?: string;
}

const SATELLITE_ASSETS = ['BTCUSDC', 'ETHUSDC', 'SOLUSDC', 'SUIUSDT', 'XRPUSDC', 'DOGEUSDC'] as const;
const CORE_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'LLY', 'JPM', 'GLD'] as const;

function num(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function fmtUsd(val: unknown, decimals = 2): string {
  const n = num(val, 0);
  const sign = n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtSignedUsd(val: unknown, decimals = 2): string {
  const n = num(val, 0);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}$${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtPct(ratioOrPct: unknown, decimals = 2, isAlreadyPct = false): string {
  const raw = num(ratioOrPct, 0);
  const pct = isAlreadyPct ? raw : raw * 100;
  return `${pct.toFixed(decimals)}%`;
}

function fmtSignedPct(ratioOrPct: unknown, decimals = 2, isAlreadyPct = false): string {
  const raw = num(ratioOrPct, 0);
  const pct = isAlreadyPct ? raw : raw * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(decimals)}%`;
}

function formatCetTimestamp(date: Date): string {
  try {
    return (
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).format(date) + ' CET'
    );
  } catch {
    return date.toISOString();
  }
}

export function normalizeSatelliteSnapshot(ctx: SatelliteDiagnosticContext) {
  const row = ctx.latestRow || {};
  const history = Array.isArray(ctx.historyRows) && ctx.historyRows.length > 0 ? ctx.historyRows : [row];
  const csd = typeof row.csd_status === 'object' && row.csd_status !== null ? row.csd_status : {};
  const exec =
    typeof row.execution_quality === 'object' && row.execution_quality !== null
      ? row.execution_quality
      : {};
  const gonogo =
    typeof row.gonogo_progress === 'object' && row.gonogo_progress !== null ? row.gonogo_progress : {};
  const rawPositions =
    typeof row.positions_lots === 'object' && row.positions_lots !== null
      ? row.positions_lots
      : typeof row.positions === 'object' && row.positions !== null
        ? row.positions
        : {};

  const barIdx = Math.round(num(row.bar_idx, 0));
  const timestampMs = num(row.timestamp_ms, Date.now());
  const barDate = new Date(timestampMs);
  const now = new Date();

  const navUsd = num(row.nav_usd, 100000);
  const walletUsd = num(row.wallet_balance_usd, navUsd);
  const unrealizedPnlUsd = num(row.unrealized_pnl_usd, navUsd - walletUsd);
  const realizedPnlUsd = num(row.realized_pnl_usd, walletUsd - 100000);
  const totalFeesUsd = num(row.total_fees_usd, 0);
  const drawdownRatio = num(row.drawdown_pct, 0);
  const grossLeverage = num(row.gross_leverage, 0);
  const netDollarExp = num(row.net_dollar_exposure, 0);
  const tailBeta = num(row.realized_tail_beta, 0);
  const zStress = num(row.z_stress, 0);
  const regimeGate = num(row.regime_gate_global ?? csd.regime_gate_global, 1.0);
  const gCsd = num(csd.g_csd ?? row.g_csd, 1.0);
  const rhoConc = num(csd.concordance_rho_h12 ?? row.concordance_rho_h12, 0.0);
  const activeSniperGate = Boolean(csd.active_sniper_gate ?? grossLeverage < 0.001);

  const histMaxNav = history.reduce((m, r) => Math.max(m, num(r?.nav_usd, 0)), navUsd);
  const impliedHwm = drawdownRatio > 0 && drawdownRatio < 0.99 ? navUsd / (1 - drawdownRatio) : navUsd;
  const hwmUsd = Math.max(histMaxNav, impliedHwm, 100000);

  const histMaxDd = history.reduce((m, r) => Math.max(m, num(r?.drawdown_pct, 0)), drawdownRatio);
  const maxDrawdownRatio = Math.max(num(gonogo.max_drawdown, 0), histMaxDd, drawdownRatio);

  const makerFills = Math.round(
    num(exec.maker_fills_count ?? gonogo.maker_fills_count ?? row.maker_fills_count, 0)
  );
  const takerFills = Math.round(
    num(exec.taker_fills_count ?? gonogo.taker_fills_count ?? row.taker_fills_count, 0)
  );
  const totalFills = makerFills + takerFills;
  let rawMakerRatio = num(
    exec.maker_taker_ratio ?? row.maker_taker_ratio ?? gonogo.maker_taker_ratio,
    totalFills > 0 ? makerFills / totalFills : 0
  );
  if (rawMakerRatio > 1.0) rawMakerRatio = rawMakerRatio / 100.0;

  const gtxRejects = Math.round(
    num(exec.gtx_rejects_count ?? gonogo.gtx_rejects_count ?? row.gtx_rejects_count, 0)
  );
  const l1QuantErr = num(
    exec.mean_quantization_l1_error ??
      gonogo.mean_quantization_l1_error ??
      row.mean_quantization_l1_error,
    0
  );

  const barsEvaluated = Math.max(Math.round(num(gonogo.bars_evaluated, barIdx)), barIdx);
  const targetBars = Math.round(num(gonogo.target_bars, 2000));
  const progressPct = Math.min(100, (barsEvaluated / Math.max(1, targetBars)) * 100);
  const remainingBars = Math.max(0, targetBars - barsEvaluated);
  const estDaysRemaining = remainingBars / 288;

  const netSharpe = num(gonogo.net_annual_sharpe ?? gonogo.sharpe_ratio, 0);
  const psrVs1 = num(gonogo.psr_vs_1_0 ?? gonogo.psr, 0);
  const ulcerIndex = num(gonogo.ulcer_index, 0);
  const invariantViolations = Math.round(num(gonogo.invariant_violations_count, 0));
  const failureReasons: string[] = Array.isArray(gonogo.failure_reasons)
    ? gonogo.failure_reasons.map(String)
    : barsEvaluated < targetBars
      ? [`bars_evaluated (${barsEvaluated}) < ${targetBars}`]
      : [];

  const holdings = SATELLITE_ASSETS.map((symbol) => {
    const rawEntry = rawPositions[symbol] ?? rawPositions[symbol.replace('USDC', '')] ?? 0;
    let qtyLots = 0;
    let notionalUsd = 0;
    let weight = 0;
    let entryPrice = 0;

    if (typeof rawEntry === 'number') {
      qtyLots = num(rawEntry, 0);
    } else if (typeof rawEntry === 'object' && rawEntry !== null) {
      qtyLots = num(rawEntry.qty_lots ?? rawEntry.qty ?? rawEntry.lots, 0);
      notionalUsd = num(rawEntry.notional_usd ?? rawEntry.notional, 0);
      weight = num(rawEntry.weight ?? (navUsd > 0 ? notionalUsd / navUsd : 0), 0);
      entryPrice = num(rawEntry.entry_price ?? rawEntry.mark_price, 0);
    }

    const direction =
      Math.abs(qtyLots) <= 1e-9 && Math.abs(notionalUsd) <= 1e-2
        ? 'FLAT'
        : qtyLots > 0 || notionalUsd > 0
          ? 'LONG'
          : 'SHORT';

    return {
      symbol,
      direction,
      qty_lots: qtyLots,
      notional_usd: notionalUsd,
      weight,
      entry_price: entryPrice,
    };
  });

  return {
    captured_at_utc: now.toISOString(),
    captured_at_cet: formatCetTimestamp(now),
    last_bar_utc: barDate.toISOString(),
    timestamp_ms: timestampMs,
    venue: String(ctx.venue || row.venue || 'paper').toUpperCase(),
    runtime_state: String(row.runtime_state || 'STATE_RUNNING'),
    bar_idx: barIdx,
    financials: {
      nav_usd: navUsd,
      wallet_balance_usd: walletUsd,
      unrealized_pnl_usd: unrealizedPnlUsd,
      realized_pnl_usd: realizedPnlUsd,
      total_fees_usd: totalFeesUsd,
      fee_drag_bps: navUsd > 0 ? (totalFeesUsd / navUsd) * 10000 : 0,
      high_water_mark_usd: hwmUsd,
      trailing_drawdown_ratio: drawdownRatio,
      max_drawdown_ratio: maxDrawdownRatio,
      gross_leverage: grossLeverage,
    },
    neutrality_and_regime: {
      realized_tail_beta: tailBeta,
      abs_tail_beta: Math.abs(tailBeta),
      tail_beta_limit: 0.035,
      tail_beta_pass: Math.abs(tailBeta) <= 0.035,
      net_dollar_exposure_usd: netDollarExp,
      z_stress: zStress,
      regime_gate_global: regimeGate,
      g_csd: gCsd,
      concordance_rho_h12: rhoConc,
      active_sniper_gate: activeSniperGate,
    },
    execution_quality: {
      maker_fills_count: makerFills,
      taker_fills_count: takerFills,
      total_fills_count: totalFills,
      maker_taker_ratio: rawMakerRatio,
      gtx_rejects_count: gtxRejects,
      mean_quantization_l1_error: l1QuantErr,
    },
    holdings,
    gonogo_protocol: {
      bars_evaluated: barsEvaluated,
      target_bars: targetBars,
      progress_pct: progressPct,
      est_days_remaining: estDaysRemaining,
      passed_currently: Boolean(gonogo.passed_currently ?? false),
      net_annual_sharpe: netSharpe,
      psr_vs_1_0: psrVs1,
      max_drawdown: maxDrawdownRatio,
      ulcer_index: ulcerIndex,
      invariant_violations_count: invariantViolations,
      failure_reasons: failureReasons,
    },
    core_cross_reference: ctx.latestCoreRow
      ? {
          core_portfolio_value_usd: num(ctx.latestCoreRow.portfolio_value, 0),
          core_run_timestamp: ctx.latestCoreRow.run_timestamp || null,
        }
      : null,
    recent_c2_commands: (ctx.recentCommands || []).slice(0, 5),
  };
}

export function buildSatelliteMarkdownSnapshot(ctx: SatelliteDiagnosticContext): string {
  const s = normalizeSatelliteSnapshot(ctx);
  const f = s.financials;
  const nr = s.neutrality_and_regime;
  const eq = s.execution_quality;
  const g = s.gonogo_protocol;

  const postureLabel =
    f.gross_leverage < 0.001 ? 'SNIPER STANDBY (100% CASH)' : 'COUPLED BASKET DEPLOYED';
  const netReturnUsd = f.nav_usd - 100000;
  const netReturnPct = f.nav_usd / 100000 - 1;

  const holdingsRows = s.holdings
    .map(
      (h) =>
        `| \`${h.symbol}\` | \`${h.direction}\` | \`${h.qty_lots.toFixed(4)}\` | \`${fmtUsd(h.notional_usd)}\` | \`${fmtSignedPct(h.weight, 2)}\` | \`${fmtUsd(h.entry_price)}\` |`
    )
    .join('\n');

  const invSample = g.bars_evaluated >= g.target_bars ? '[PASS]' : '[HOLD_ACCUMULATING]';
  const invSharpe = g.net_annual_sharpe >= 1.5 ? '[PASS]' : '[PENDING/BELOW]';
  const invPsr = g.psr_vs_1_0 >= 0.95 ? '[PASS]' : '[PENDING/BELOW]';
  const invDd = g.max_drawdown <= 0.08 ? '[PASS]' : '[FAIL]';
  const invUi = g.ulcer_index <= 0.025 ? '[PASS]' : '[FAIL]';
  const invBeta = nr.abs_tail_beta <= 0.035 ? '[PASS]' : '[FAIL]';
  const invMaker =
    eq.total_fills_count === 0
      ? '[NO_FILLS_YET]'
      : eq.maker_taker_ratio >= 0.1
        ? '[PASS]'
        : '[WARN_LOW_MAKER]';
  const invViol = g.invariant_violations_count === 0 ? '[PASS]' : '[FAIL]';

  return [
    `# QUANT-SATELLITE v2.5 — AI DIAGNOSTIC SNAPSHOT (SLEEVE A: CRYPTO CLOB)`,
    `- **Captured At (UTC):** ${s.captured_at_utc}`,
    `- **Captured At (CET):** ${s.captured_at_cet}`,
    `- **Last Bar Timestamp:** ${s.last_bar_utc} (\`${s.timestamp_ms}\`)`,
    `- **Venue / Mode:** \`${s.venue}\` | **Runtime C2 State:** \`${s.runtime_state}\``,
    `- **Master Dollar Bar Index:** \`#${s.bar_idx}\` | **Go/No-Go Progress:** \`${g.bars_evaluated} / ${g.target_bars}\` (\`${g.progress_pct.toFixed(2)}%\`, ~${g.est_days_remaining.toFixed(1)}d remaining @ 288 bars/d)`,
    ``,
    `## 1. Financials, NAV & Leverage Decomposition`,
    `| Metric | Value | Invariant / Note |`,
    `| :--- | :--- | :--- |`,
    `| **Mark-to-Market NAV** | \`${fmtUsd(f.nav_usd)}\` | Net return: \`${fmtSignedUsd(netReturnUsd)}\` (\`${fmtSignedPct(netReturnPct, 4)}\`) |`,
    `| **Wallet Balance (Cash)** | \`${fmtUsd(f.wallet_balance_usd)}\` | Realized PnL: \`${fmtSignedUsd(f.realized_pnl_usd)}\` |`,
    `| **Unrealized PnL** | \`${fmtSignedUsd(f.unrealized_pnl_usd)}\` | Open basket MTM delta |`,
    `| **Cumulative Exchange Fees** | \`${fmtUsd(f.total_fees_usd)}\` | Fee drag: \`${f.fee_drag_bps.toFixed(2)} bps\` of NAV |`,
    `| **High Water Mark (HWM)** | \`${fmtUsd(f.high_water_mark_usd)}\` | Peak MTM NAV |`,
    `| **Trailing Drawdown** | \`${fmtPct(f.trailing_drawdown_ratio, 4)}\` | Max Historical DD: \`${fmtPct(f.max_drawdown_ratio, 4)}\` (Limit \`<= 8.00%\`) |`,
    `| **Gross Leverage ($L_k$)** | \`${f.gross_leverage.toFixed(4)}x\` | Posture: \`${postureLabel}\` |`,
    ``,
    `## 2. Dual-Nullspace & Layer-1/2 Regime Telemetry`,
    `- **Realized Tail Beta ($\\beta_{\\text{BTC}}$):** \`${nr.realized_tail_beta >= 0 ? '+' : ''}${nr.realized_tail_beta.toFixed(4)}\` (Abs: \`${nr.abs_tail_beta.toFixed(4)}\` <= \`0.0350\` ${invBeta} | Margin: \`${(0.035 - nr.abs_tail_beta).toFixed(4)}\`)`,
    `- **Net Dollar Exposure ($\\sum w_i$):** \`${fmtSignedUsd(nr.net_dollar_exposure_usd)}\``,
    `- **Market Stress Z-Score ($z_{\\text{stress}}$):** \`${nr.z_stress >= 0 ? '+' : ''}${nr.z_stress.toFixed(3)}\``,
    `- **Global Regime Gate ($G_{\\text{regime}}$):** \`${fmtPct(nr.regime_gate_global, 2)}\` (\`${nr.regime_gate_global.toFixed(4)}\`)`,
    `- **CSD Gate ($g_{\\text{CSD}}$):** \`${nr.g_csd.toFixed(4)}\` | **Horizon Concordance ($\\rho_{\\text{conc}}^{(12)}$):** \`${nr.concordance_rho_h12 >= 0 ? '+' : ''}${nr.concordance_rho_h12.toFixed(4)}\``,
    `- **Active Sniper Gate:** \`${nr.active_sniper_gate ? 'STANDBY_FLAT' : 'ENGAGED_BASKET'}\``,
    ``,
    `## 3. CLOB Execution Quality & Microstructure`,
    `- **Maker / Taker Fills:** \`${eq.maker_fills_count} Maker\` / \`${eq.taker_fills_count} Taker\` (\`${eq.total_fills_count} Total Fills\`)`,
    `- **Maker Fill Ratio:** \`${fmtPct(eq.maker_taker_ratio, 2)}\` (Threshold \`>= 10.00%\` ${invMaker})`,
    `- **GTX Post-Only Cross Rejects:** \`${eq.gtx_rejects_count}\` (Threshold \`== 0\` ${eq.gtx_rejects_count === 0 ? '[PASS]' : '[WARN]'})`,
    `- **Mean Lot Quantization L1 Error:** \`${fmtPct(eq.mean_quantization_l1_error, 2)}\` (\`${eq.mean_quantization_l1_error.toFixed(4)}\`)`,
    ``,
    `## 4. 6-Asset Coupled Basket Holdings`,
    `| Asset | Direction | Quantity (Lots) | Notional (USD) | Weight (%) | Entry Price |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- |`,
    holdingsRows,
    ``,
    `## 5. N=2,000 Go/No-Go Protocol Invariants (8-Point Check)`,
    `1. **Sample Depth ($N \\ge 2000$):** \`${g.bars_evaluated} / ${g.target_bars}\` -> \`${invSample}\``,
    `2. **Net Annualized Sharpe ($\\ge 1.50$):** \`${g.net_annual_sharpe.toFixed(2)}\` -> \`${invSharpe}\``,
    `3. **Probabilistic Sharpe Ratio $\\text{PSR}(1.0) \\ge 0.95$:** \`${g.psr_vs_1_0.toFixed(3)}\` -> \`${invPsr}\``,
    `4. **Max Trailing Drawdown ($\\le 8.00\\%$):** \`${fmtPct(g.max_drawdown, 2)}\` -> \`${invDd}\``,
    `5. **Ulcer Index ($\\le 2.50\\%$):** \`${fmtPct(g.ulcer_index, 2)}\` -> \`${invUi}\``,
    `6. **Realized Tail Beta ($|\\beta_{\\text{BTC}}| \\le 0.035$):** \`${nr.abs_tail_beta.toFixed(4)}\` -> \`${invBeta}\``,
    `7. **Maker Fill Ratio ($\\ge 10.0\\%$):** \`${fmtPct(eq.maker_taker_ratio, 2)}\` -> \`${invMaker}\``,
    `8. **Hard Invariant Violations ($= 0$):** \`${g.invariant_violations_count}\` -> \`${invViol}\``,
    `- **Active Blockers:** \`${g.failure_reasons.length > 0 ? g.failure_reasons.join('; ') : 'NONE — READY FOR LIVE'}\``,
  ].join('\n');
}

export function normalizeCoreSnapshot(ctx: CoreDiagnosticContext) {
  const row = ctx.latestRow || {};
  const meta = typeof row.metadata === 'object' && row.metadata !== null ? row.metadata : {};
  const weightsRaw =
    typeof row.weights_raw === 'object' && row.weights_raw !== null ? row.weights_raw : {};
  const weightsEff =
    typeof row.weights_effective === 'object' && row.weights_effective !== null
      ? row.weights_effective
      : {};
  const sentiment =
    typeof row.sentiment_scores === 'object' && row.sentiment_scores !== null
      ? row.sentiment_scores
      : {};
  const orders = Array.isArray(row.orders_executed) ? row.orders_executed : [];

  const now = new Date();
  const portfolioValue = num(row.portfolio_value, 0);
  const cashBalance = num(row.cash_balance, 0);
  const cashBufferPct = num(row.cash_buffer_pct, 0.02);
  const dailyChangePct = num(row.daily_change_pct, 0);
  const dsor = num(row.dsor, 0);
  const ulcerIndex = num(row.ulcer_index, 0);
  const brokerFees = num(row.broker_fees, 0);
  const isDryRun = Boolean(row.is_dry_run ?? false);
  const circuitBreaker = Boolean(row.circuit_breaker_triggered ?? false);

  const allocations = CORE_TICKERS.map((ticker) => {
    const rawW = num(weightsRaw[ticker], 0);
    const effW = num(weightsEff[ticker], 0);
    const sent = num(sentiment[ticker], 0);
    return {
      ticker,
      weight_raw: rawW,
      weight_effective: effW,
      implied_notional_usd: portfolioValue * effW,
      finbert_sentiment: sent,
    };
  });

  return {
    captured_at_utc: now.toISOString(),
    captured_at_cet: formatCetTimestamp(now),
    run_timestamp: row.run_timestamp || row.created_at || now.toISOString(),
    venue: String(ctx.venue || row.venue || 'paper').toUpperCase(),
    execution_mode: isDryRun ? 'DRY_RUN' : 'LIVE_EXECUTION',
    checkpoint: String(meta.checkpoint || meta.model_version || 'checkpoint_000010 (SAC_Dirichlet_Aggressive)'),
    rebalance_reason: String(meta.rebalance_reason || 'scheduled_1545_et_rebalance'),
    circuit_breaker_triggered: circuitBreaker,
    financials: {
      portfolio_value_usd: portfolioValue,
      cash_balance_usd: cashBalance,
      invested_capital_usd: Math.max(0, portfolioValue - cashBalance),
      cash_buffer_target_ratio: cashBufferPct,
      effective_cash_ratio: portfolioValue > 0 ? cashBalance / portfolioValue : 0,
      daily_change_pct: dailyChangePct,
      broker_fees_usd: brokerFees,
    },
    risk_metrics: {
      dsor,
      ulcer_index: ulcerIndex,
    },
    allocations,
    orders_executed: orders,
  };
}

export function buildCoreMarkdownSnapshot(ctx: CoreDiagnosticContext): string {
  const c = normalizeCoreSnapshot(ctx);
  const f = c.financials;

  const allocRows = c.allocations
    .map(
      (a) =>
        `| \`${a.ticker}\` | \`${fmtPct(a.weight_raw, 2)}\` | \`${fmtPct(a.weight_effective, 2)}\` | \`${fmtUsd(a.implied_notional_usd)}\` | \`${a.finbert_sentiment >= 0 ? '+' : ''}${a.finbert_sentiment.toFixed(4)}\` |`
    )
    .join('\n');

  const orderLines =
    c.orders_executed.length > 0
      ? c.orders_executed
          .map(
            (o: any) =>
              `- \`${o.ticker || 'N/A'}\` | \`${o.side || 'N/A'}\` | \`${fmtUsd(o.notional ?? o.amount ?? 0)}\` | \`${o.status || 'FILLED'}\``
          )
          .join('\n')
      : `- None (No orders executed in latest run / within tolerance band)`;

  return [
    `# QUANT CORE (ALPACA) — AI DIAGNOSTIC SNAPSHOT (SLEEVE B: US EQUITIES & GOLD)`,
    `- **Captured At (UTC):** ${c.captured_at_utc}`,
    `- **Captured At (CET):** ${c.captured_at_cet}`,
    `- **Last Execution Run (\`run_timestamp\`):** ${c.run_timestamp}`,
    `- **Venue / Execution Mode:** \`${c.venue}\` (\`${c.execution_mode}\`)`,
    `- **Model Checkpoint:** \`${c.checkpoint}\``,
    `- **Circuit Breaker Status:** \`${c.circuit_breaker_triggered ? 'TRIGGERED (HALTED)' : 'NOMINAL (ARMED)'}\``,
    ``,
    `## 1. Portfolio Valuation & Cash Buffer`,
    `| Metric | Value | Note |`,
    `| :--- | :--- | :--- |`,
    `| **Total Portfolio Equity** | \`${fmtUsd(f.portfolio_value_usd)}\` | 1D Change: \`${fmtSignedPct(f.daily_change_pct, 2, true)}\` |`,
    `| **Cash Balance** | \`${fmtUsd(f.cash_balance_usd)}\` | Effective Cash: \`${fmtPct(f.effective_cash_ratio, 2)}\` (Target Buffer: \`${fmtPct(f.cash_buffer_target_ratio, 2)}\`) |`,
    `| **Invested Capital** | \`${fmtUsd(f.invested_capital_usd)}\` | Deployed across 6-asset Dirichlet simplex |`,
    `| **Broker Fees (Last Run)** | \`${fmtUsd(f.broker_fees_usd)}\` | Transaction cost |`,
    ``,
    `## 2. Risk & Return Telemetry`,
    `- **Differential Sortino Ratio (DSoR):** \`${c.risk_metrics.dsor.toFixed(4)}\``,
    `- **Ulcer Index (UI):** \`${c.risk_metrics.ulcer_index.toFixed(4)}\``,
    `- **Rebalance Trigger / Reason:** \`${c.rebalance_reason}\``,
    ``,
    `## 3. 6-Asset Dirichlet Simplex Allocations & FinBERT Sentiment`,
    `| Ticker | Raw Dirichlet Weight | Effective Weight (Capped) | Implied Notional ($) | FinBERT Sentiment ($s_t$) |`,
    `| :--- | :--- | :--- | :--- | :--- |`,
    allocRows,
    ``,
    `## 4. Executed Rebalance Orders (Latest Run)`,
    orderLines,
  ].join('\n');
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback hieronder
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    textArea.style.top = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    return ok;
  } catch {
    return false;
  }
}

export function triggerJsonDownload(filename: string, payload: unknown): void {
  if (typeof window === 'undefined') return;
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function showDiagnosticToast(message: string, isError = false): void {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById('quant-diagnostic-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'quant-diagnostic-toast';
  toast.className = `fixed bottom-6 right-6 z-50 flex items-center space-x-2.5 px-4 py-3 rounded-xl font-mono text-xs font-semibold shadow-xl border transition-all duration-300 ${
    isError
      ? 'bg-red-950/95 text-red-300 border-red-500/40 shadow-red-500/10'
      : 'bg-slate-900/95 text-cyan-300 border-cyan-500/40 shadow-cyan-500/15'
  }`;

  const dotClass = isError ? 'bg-red-400' : 'bg-emerald-400 animate-pulse';
  toast.innerHTML = `
    <span class="w-2 h-2 rounded-full ${dotClass}"></span>
    <span>${message}</span>
  `;

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

