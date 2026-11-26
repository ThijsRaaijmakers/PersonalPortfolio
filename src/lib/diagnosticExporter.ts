export interface SatelliteDiagnosticContext {
  latestRow: Record<string, any>;
  historyRows?: Array<Record<string, any>>;
  latestCoreRow?: Record<string, any> | null;
  recentCommands?: Array<Record<string, any>>;
  venue?: string;
  livePricesMap?: Record<string, number>;
}

export interface CoreDiagnosticContext {
  latestRow: Record<string, any>;
  historyRows?: Array<Record<string, any>>;
  latestSatelliteRow?: Record<string, any> | null;
  venue?: string;
}

export const V31_TRADABLE_SYMBOLS: readonly string[] = [
  'SOLUSDC', 'XRPUSDC', 'BNBUSDC', 'NEARUSDC', 'ENAUSDC', 'DOGEUSDC',
  '1000PEPEUSDC', 'AVAXUSDC', 'UNIUSDC', 'FILUSDC', 'ADAUSDC', 'SUIUSDC',
  'WLDUSDC', 'AAVEUSDC', 'LINKUSDC', 'BCHUSDC', 'ARBUSDC', 'LTCUSDC',
] as const;

export const SATELLITE_ASSETS = ['BTCUSDC', 'ETHUSDC', 'SOLUSDC', 'SUIUSDT', 'XRPUSDC', 'DOGEUSDC'] as const;
const CORE_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'LLY', 'JPM', 'GLD'] as const;

const BINANCE_FUTURES_TICKER_URL = 'https://fapi.binance.com/fapi/v1/ticker/price';
let cachedLivePrices: Record<string, number> = {};
let lastPriceFetchTs = 0;
const PRICE_CACHE_TTL_MS = 10_000;

export async function fetchLiveBinanceFuturesPrices(
  forceRefresh = false
): Promise<Record<string, number>> {
  if (typeof window === 'undefined') return cachedLivePrices;
  const now = Date.now();
  if (!forceRefresh && now - lastPriceFetchTs < PRICE_CACHE_TTL_MS && Object.keys(cachedLivePrices).length > 0) {
    return cachedLivePrices;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    // Belangrijk: roep /fapi/v1/ticker/price ZONDER ?symbols= parameter aan om HTTP 400 (-1100) op Futures te voorkomen
    const res = await fetch(BINANCE_FUTURES_TICKER_URL, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        const nextMap: Record<string, number> = {};
        for (const item of data) {
          if (item && typeof item.symbol === 'string') {
            const p = Number(item.price);
            if (Number.isFinite(p) && p > 0) {
              nextMap[item.symbol.toUpperCase()] = p;
            }
          }
        }
        if (Object.keys(nextMap).length > 0) {
          cachedLivePrices = nextMap;
          lastPriceFetchTs = now;
        }
      }
    }
  } catch {
    // Gebruik laatst bekende cache of fallback bij netwerk-/adblock-restricties
  }
  return cachedLivePrices;
}

export function getCachedBinanceFuturesPrices(): Record<string, number> {
  return cachedLivePrices;
}

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

export function fmtContractPrice(price: unknown, symbol = ''): string {
  const p = Math.abs(num(price, 0));
  if (p === 0) return '$0.00';
  const sym = symbol.toUpperCase();
  let decimals = 2;
  if (p < 0.02 || sym.includes('PEPE')) {
    decimals = 6;
  } else if (p < 0.1 || sym.includes('DOGE')) {
    decimals = 5;
  } else if (p < 10) {
    decimals = 4;
  } else {
    decimals = 2;
  }
  return `$${p.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export interface V31PositionItem {
  symbol: string;
  direction: 'LONG' | 'SHORT';
  qty_lots: number;
  signed_qty: number;
  notional_usd: number;
  weight: number;
  entry_price: number;
  mark_price: number;
  upnl_usd: number;
  upnl_pct: number; // al in procentpunten (bijv. +5.0 betekent +5.00%)
}

export interface V31RankedCoin {
  symbol: string;
  score: number;
  weight: number;
}

export interface V31FactorsPayload {
  bar_mode: string;
  model_name: string;
  eligible_count: number;
  active_k: number;
  target_leverage: number;
  aci_multiplier: number;
  expected_beta_post: number;
  expected_dollar_post: number;
  top_longs: V31RankedCoin[];
  bottom_shorts: V31RankedCoin[];
}

export interface V31ExecAuditPayload {
  rebalances_completed: number;
  avg_is_p0_bps: number;
  avg_cost_wt_bps: number;
  avg_implied_rt_cost_bps: number;
  avg_maker_fill_ratio_pct: number;
  beats_regime_a_ratio: number;
  total_aborts: number;
  total_timeouts: number;
  total_repegs: number;
  total_traded_notional_usd: number;
  total_fees_usd: number;
}

export interface V31MetaResult {
  isV31: boolean;
  engineVersion: string;
  initialNavUsd: number;
  navUsd: number;
  walletBalanceUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  reservedVaultUsd: number;
  totalFeesUsd: number;
  cumulativeFundingUsd: number;
  hwmUsd: number;
  eligibleCount: number;
  factors: V31FactorsPayload;
  execAudit: V31ExecAuditPayload;
  positionsV31: V31PositionItem[];
  rawGonogoReport: Record<string, any>;
}

export function safeParseObj(val: unknown): Record<string, any> {
  if (!val) return {};
  if (typeof val === 'object' && val !== null) return val as Record<string, any>;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {
      return {};
    }
  }
  return {};
}

export function extractV31Meta(
  latestRow: Record<string, any> | null | undefined,
  historyRows: Array<Record<string, any>> = []
): V31MetaResult {
  const g = safeParseObj(latestRow?.gonogo_report);
  const isV31 =
    g?.engine_version === 'v3.1' ||
    Boolean(g?.factors) ||
    Boolean(g?.exec_audit) ||
    Array.isArray(g?.positions_v31);

  const factorsRaw = safeParseObj(g?.factors);
  const execAuditRaw = safeParseObj(g?.exec_audit);

  const eligibleCount = num(
    factorsRaw?.eligible_count,
    num(g?.eligible_count, 18)
  );

  // Reject legacy dummy test balance (100k) from older test DB runs
  const isLegacyNominal100k = (val: number) => Math.abs(val - 1e5) < 0.01;

  // Initial NAV determination:
  // 1. g.initial_nav_usd (if > 0 and !== 1e5)
  // 2. Oldest history row nav_usd (if > 0 and !== 1e5)
  // 3. latestRow nav_usd (if > 0 and !== 1e5)
  // 4. Fallback 2750.0
  let oldestHistoryNav = 0;
  if (Array.isArray(historyRows) && historyRows.length > 0) {
    let oldestRow = historyRows[0];
    for (const r of historyRows) {
      const tCurr = num(r?.timestamp_ms ?? r?.bar_idx, 0);
      const tOld = num(oldestRow?.timestamp_ms ?? oldestRow?.bar_idx, 0);
      if (tCurr > 0 && (tOld === 0 || tCurr < tOld)) {
        oldestRow = r;
      }
    }
    const oNav = num(oldestRow?.nav_usd, 0);
    if (oNav > 0 && !isLegacyNominal100k(oNav)) {
      oldestHistoryNav = oNav;
    } else {
      const h0 = num(historyRows[0]?.nav_usd, 0);
      if (h0 > 0 && !isLegacyNominal100k(h0)) oldestHistoryNav = h0;
    }
  }

  const gInit = num(g?.initial_nav_usd, 0);
  let initialNavUsd = 2750.0;
  if (gInit > 0 && !isLegacyNominal100k(gInit)) {
    initialNavUsd = gInit;
  } else if (oldestHistoryNav > 0) {
    initialNavUsd = oldestHistoryNav;
  } else {
    const latNav = num(latestRow?.nav_usd, 0);
    if (latNav > 0 && !isLegacyNominal100k(latNav)) {
      initialNavUsd = latNav;
    } else {
      initialNavUsd = 2750.0;
    }
  }

  const navUsd = num(latestRow?.nav_usd, initialNavUsd);
  const walletBalanceUsd = num(
    g?.wallet_balance_usd ?? latestRow?.cash_usd ?? latestRow?.wallet_balance_usd,
    navUsd
  );
  const realizedPnlUsd =
    g?.realized_pnl_usd != null
      ? num(g.realized_pnl_usd, 0)
      : walletBalanceUsd - initialNavUsd;
  const unrealizedPnlUsd =
    g?.unrealized_pnl_usd != null
      ? num(g.unrealized_pnl_usd, 0)
      : navUsd - walletBalanceUsd;
  const reservedVaultUsd = num(g?.reserved_vault_usd, 0);
  const totalFeesUsd = num(
    g?.total_fees_usd ?? latestRow?.fees_paid_bar_usd ?? latestRow?.total_fees_usd,
    0
  );
  const cumulativeFundingUsd = num(g?.cumulative_funding_usd, 0);

  let histMaxNav = navUsd;
  if (Array.isArray(historyRows) && historyRows.length > 0) {
    for (const r of historyRows) {
      const hn = num(r?.nav_usd, 0);
      if (hn > 0 && !isLegacyNominal100k(hn) && hn > histMaxNav) {
        histMaxNav = hn;
      }
    }
  }
  const hwmUsd = Math.max(histMaxNav, num(g?.high_water_mark_usd, 0), navUsd, initialNavUsd);

  const factors: V31FactorsPayload = {
    bar_mode: String(factorsRaw?.bar_mode ?? g?.bar_mode ?? 'SYNTHETIC_2352_UTC_CLOSE'),
    model_name: String(factorsRaw?.model_name ?? g?.model_name ?? 'M2'),
    eligible_count: eligibleCount,
    active_k: num(factorsRaw?.active_k ?? g?.active_k, 4),
    target_leverage: num(factorsRaw?.target_leverage ?? g?.target_leverage, 0.5),
    aci_multiplier: num(factorsRaw?.aci_multiplier ?? g?.aci_multiplier, 1.0),
    expected_beta_post: num(factorsRaw?.expected_beta_post ?? g?.expected_beta_post, 0.0),
    expected_dollar_post: num(factorsRaw?.expected_dollar_post ?? g?.expected_dollar_post, 0.0),
    top_longs: Array.isArray(factorsRaw?.top_longs)
      ? factorsRaw.top_longs.map((c: any) => ({
          symbol: String(c?.symbol || '').toUpperCase(),
          score: num(c?.score, 0),
          weight: num(c?.weight, 0),
        }))
      : [],
    bottom_shorts: Array.isArray(factorsRaw?.bottom_shorts)
      ? factorsRaw.bottom_shorts.map((c: any) => ({
          symbol: String(c?.symbol || '').toUpperCase(),
          score: num(c?.score, 0),
          weight: num(c?.weight, 0),
        }))
      : [],
  };

  const execAudit: V31ExecAuditPayload = {
    rebalances_completed: num(execAuditRaw?.rebalances_completed ?? g?.rebalances_completed, 0),
    avg_is_p0_bps: num(execAuditRaw?.avg_is_p0_bps ?? g?.avg_is_p0_bps, 0),
    avg_cost_wt_bps: num(execAuditRaw?.avg_cost_wt_bps ?? g?.avg_cost_wt_bps, 0),
    avg_implied_rt_cost_bps: num(execAuditRaw?.avg_implied_rt_cost_bps ?? g?.avg_implied_rt_cost_bps, 0),
    avg_maker_fill_ratio_pct: num(execAuditRaw?.avg_maker_fill_ratio_pct ?? g?.avg_maker_fill_ratio_pct, 0),
    beats_regime_a_ratio: num(execAuditRaw?.beats_regime_a_ratio ?? g?.beats_regime_a_ratio, 0),
    total_aborts: num(execAuditRaw?.total_aborts ?? g?.total_aborts, 0),
    total_timeouts: num(execAuditRaw?.total_timeouts ?? g?.total_timeouts, 0),
    total_repegs: num(execAuditRaw?.total_repegs ?? g?.total_repegs, 0),
    total_traded_notional_usd: num(execAuditRaw?.total_traded_notional_usd ?? g?.total_traded_notional_usd, 0),
    total_fees_usd: num(execAuditRaw?.total_fees_usd ?? g?.total_fees_usd, 0),
  };

  const rawPositionsV31 = Array.isArray(g?.positions_v31) ? g.positions_v31 : [];
  const positionsV31: V31PositionItem[] = rawPositionsV31.map((p: any) => {
    const symbol = String(p?.symbol || '').toUpperCase();
    const direction: 'LONG' | 'SHORT' =
      p?.direction === 'SHORT' || num(p?.signed_qty ?? p?.qty_lots, 0) < 0 ? 'SHORT' : 'LONG';
    const qty_lots = Math.abs(num(p?.qty_lots ?? p?.qty, 0));
    const signed_qty =
      p?.signed_qty != null
        ? num(p.signed_qty, 0)
        : direction === 'SHORT'
          ? -qty_lots
          : qty_lots;
    const entry_price = num(p?.entry_price ?? p?.avg_entry_price, 0);
    const mark_price = num(p?.mark_price ?? p?.current_price, entry_price);
    const notional_usd = num(p?.notional_usd, Math.abs(signed_qty) * mark_price);
    const weight = num(p?.weight, navUsd > 0 ? (notional_usd / navUsd) * (direction === 'SHORT' ? -1 : 1) : 0);
    const upnl_usd = num(p?.upnl_usd, signed_qty * (mark_price - entry_price));
    const upnl_pct = num(p?.upnl_pct, 0);
    return {
      symbol,
      direction,
      qty_lots,
      signed_qty,
      notional_usd,
      weight,
      entry_price,
      mark_price,
      upnl_usd,
      upnl_pct,
    };
  });

  return {
    isV31,
    engineVersion: String(g?.engine_version || (isV31 ? 'v3.1' : 'v2.5')),
    initialNavUsd,
    navUsd,
    walletBalanceUsd,
    realizedPnlUsd,
    unrealizedPnlUsd,
    reservedVaultUsd,
    totalFeesUsd,
    cumulativeFundingUsd,
    hwmUsd,
    eligibleCount,
    factors,
    execAudit,
    positionsV31,
    rawGonogoReport: g,
  };
}

export interface EnrichedAssetHolding {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'FLAT';
  qty_lots: number;
  notional_usd: number;
  weight: number;
  entry_price: number;
  mark_price: number;
  upnl_usd: number;
  upnl_pct: number;
}

export function computeAssetHoldingMetrics(
  symbol: string,
  rawEntry: any,
  navUsd: number,
  livePricesMap?: Record<string, number>,
  fallbackUpnlUsd = 0
): EnrichedAssetHolding {
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
    entryPrice = num(rawEntry.entry_price ?? rawEntry.avg_entry_price ?? 0, 0);
  }

  const isFlat = Math.abs(qtyLots) <= 1e-9 && Math.abs(notionalUsd) <= 1e-2;
  const direction: 'LONG' | 'SHORT' | 'FLAT' = isFlat
    ? 'FLAT'
    : qtyLots > 0 || notionalUsd > 0
      ? 'LONG'
      : 'SHORT';

  if (isFlat) {
    return {
      symbol,
      direction: 'FLAT',
      qty_lots: 0,
      notional_usd: 0,
      weight: 0,
      entry_price: 0,
      mark_price: 0,
      upnl_usd: 0,
      upnl_pct: 0,
    };
  }

  const sign = direction === 'LONG' ? 1 : -1;
  const absQty = Math.abs(qtyLots);
  const signedQty = sign * absQty;
  const costBasisUsd = entryPrice > 0 ? absQty * entryPrice : Math.abs(notionalUsd);
  if (entryPrice <= 0 && absQty > 1e-12) {
    entryPrice = Math.abs(notionalUsd) / absQty;
  }

  // 1. Bepaal Mark Price: eerst uit livePricesMap (of USDT-equivalent), anders uit expliciet payload-veld of fallbackUpnlUsd
  const symUpper = symbol.toUpperCase();
  const usdtFallbackSym = symUpper.replace('USDC', 'USDT');
  const liveTickerPrice =
    livePricesMap?.[symUpper] ?? livePricesMap?.[usdtFallbackSym] ?? 0;
  const payloadMarkPrice =
    typeof rawEntry === 'object' && rawEntry !== null
      ? num(rawEntry.mark_price ?? rawEntry.current_price, 0)
      : 0;

  let markPrice = entryPrice;
  let upnlUsd = 0;

  if (liveTickerPrice > 0) {
    markPrice = liveTickerPrice;
    upnlUsd = signedQty * (markPrice - entryPrice);
  } else if (
    payloadMarkPrice > 0 &&
    Math.abs(payloadMarkPrice - entryPrice) / Math.max(entryPrice, 1e-9) > 1e-5
  ) {
    markPrice = payloadMarkPrice;
    upnlUsd = signedQty * (markPrice - entryPrice);
  } else if (Math.abs(fallbackUpnlUsd) > 1e-4 && absQty > 1e-12) {
    upnlUsd = fallbackUpnlUsd;
    markPrice = Math.max(0, entryPrice + upnlUsd / signedQty);
  }

  const liveNotionalUsd = signedQty * markPrice;
  const upnlPct = costBasisUsd > 1e-6 ? (upnlUsd / costBasisUsd) * 100 : 0;
  const effectiveWeight = navUsd > 0 ? liveNotionalUsd / navUsd : weight;

  return {
    symbol,
    direction,
    qty_lots: signedQty,
    notional_usd: liveNotionalUsd,
    weight: effectiveWeight,
    entry_price: entryPrice,
    mark_price: markPrice,
    upnl_usd: upnlUsd,
    upnl_pct: upnlPct,
  };
}

export function computeAllBasketHoldings(
  rawPositions: Record<string, any> | any[] | undefined,
  navUsd: number,
  _totalLedgerUpnlUsd = 0,
  livePricesMap?: Record<string, number> | Map<string, number>
): EnrichedAssetHolding[] {
  function lookupPrice(sym: string): number {
    if (!livePricesMap) return 0;
    const s = sym.toUpperCase();
    if (livePricesMap instanceof Map) {
      return livePricesMap.get(s) ?? livePricesMap.get(s.replace('USDC', 'USDT')) ?? 0;
    }
    return (livePricesMap as Record<string, number>)[s] ?? (livePricesMap as Record<string, number>)[s.replace('USDC', 'USDT')] ?? 0;
  }

  // Case 1: An explicit array of positions or object containing positions_v31
  let v31Array: any[] | null = null;
  if (Array.isArray(rawPositions)) {
    v31Array = rawPositions;
  } else if (rawPositions && Array.isArray((rawPositions as any).positions_v31)) {
    v31Array = (rawPositions as any).positions_v31;
  } else if (rawPositions && typeof (rawPositions as any).gonogo_report === 'object') {
    const g = safeParseObj((rawPositions as any).gonogo_report);
    if (Array.isArray(g.positions_v31)) {
      v31Array = g.positions_v31;
    }
  }

  if (v31Array && v31Array.length > 0) {
    const results: EnrichedAssetHolding[] = [];
    for (const item of v31Array) {
      if (!item || typeof item !== 'object') continue;
      const symbol = String(item.symbol || '').toUpperCase();
      if (!symbol) continue;
      const rawQty = num(item.qty_lots ?? item.qty, 0);
      const rawSigned = item.signed_qty != null ? num(item.signed_qty, 0) : undefined;
      const dirStr = String(item.direction || '').toUpperCase();
      const direction: 'LONG' | 'SHORT' =
        dirStr === 'SHORT' || (rawSigned !== undefined && rawSigned < 0) || (rawSigned === undefined && rawQty < 0)
          ? 'SHORT'
          : 'LONG';
      const signedQty =
        rawSigned !== undefined
          ? rawSigned
          : direction === 'SHORT'
            ? -Math.abs(rawQty)
            : Math.abs(rawQty);

      if (Math.abs(signedQty) <= 1e-9) continue;

      const livePrice = lookupPrice(symbol);
      const entryPrice = num(item.entry_price ?? item.avg_entry_price, 0);
      const itemMark = num(item.mark_price ?? item.current_price, entryPrice);
      const liveMark = livePrice > 0 ? livePrice : itemMark;

      const notionalUsd = Math.abs(signedQty) * liveMark;
      let upnlUsd = 0;
      let upnlPct = 0;

      if (livePrice > 0) {
        upnlUsd = entryPrice > 0 ? signedQty * (liveMark - entryPrice) : 0;
        const costBasis = Math.abs(signedQty) * entryPrice;
        upnlPct = costBasis > 1e-12 ? (upnlUsd / costBasis) * 100.0 : 0.0;
      } else {
        upnlUsd = item.upnl_usd != null ? num(item.upnl_usd, 0) : (entryPrice > 0 ? signedQty * (liveMark - entryPrice) : 0);
        upnlPct = num(item.upnl_pct, 0); // already in percentage points!
      }

      const weight = navUsd > 0 ? (notionalUsd / navUsd) * (direction === 'SHORT' ? -1 : 1) : num(item.weight, 0);

      results.push({
        symbol,
        direction,
        qty_lots: signedQty,
        notional_usd: notionalUsd,
        weight,
        entry_price: entryPrice,
        mark_price: liveMark,
        upnl_usd: upnlUsd,
        upnl_pct: upnlPct,
      });
    }

    const active = results.filter((h) => Math.abs(h.qty_lots) > 1e-9);
    active.sort((a, b) => {
      if (a.direction !== b.direction) {
        return a.direction === 'LONG' ? -1 : 1;
      }
      return Math.abs(b.notional_usd) - Math.abs(a.notional_usd);
    });
    return active;
  }

  // Case 2: Legacy rawPositions Record<string, any>
  const posObj = (rawPositions && typeof rawPositions === 'object' ? rawPositions : {}) as Record<string, any>;
  const symbols = Array.from(
    new Set([
      ...V31_TRADABLE_SYMBOLS,
      ...SATELLITE_ASSETS,
      ...Object.keys(posObj).map((s) => s.toUpperCase()),
    ])
  );

  const activeHoldings: EnrichedAssetHolding[] = [];

  for (const sym of symbols) {
    const rawEntry = posObj[sym] ?? posObj[sym.replace('USDC', '')] ?? posObj[sym.replace('USDT', '')];
    if (rawEntry === undefined || rawEntry === null) continue;

    let qtyLots = 0;
    let notional = 0;
    let entryPrice = 0;
    if (typeof rawEntry === 'number') {
      qtyLots = num(rawEntry, 0);
    } else if (typeof rawEntry === 'object') {
      qtyLots = num(rawEntry.qty_lots ?? rawEntry.qty ?? rawEntry.lots, 0);
      notional = num(rawEntry.notional_usd ?? rawEntry.notional, 0);
      entryPrice = num(rawEntry.entry_price ?? rawEntry.avg_entry_price, 0);
    }

    if (Math.abs(qtyLots) <= 1e-9 && Math.abs(notional) <= 1e-2) continue;

    const direction: 'LONG' | 'SHORT' = qtyLots < 0 || notional < 0 ? 'SHORT' : 'LONG';
    const signedQty = direction === 'SHORT' ? -Math.abs(qtyLots) : Math.abs(qtyLots);
    const livePrice = lookupPrice(sym);
    const markPrice = livePrice > 0 ? livePrice : (entryPrice > 0 ? entryPrice : (Math.abs(signedQty) > 0 ? Math.abs(notional) / Math.abs(signedQty) : 0));
    const liveNotional = Math.abs(signedQty) * markPrice;
    const upnlUsd = entryPrice > 0 ? signedQty * (markPrice - entryPrice) : 0;
    const costBasis = Math.abs(signedQty) * entryPrice;
    const upnlPct = costBasis > 1e-12 ? (upnlUsd / costBasis) * 100.0 : 0.0;
    const weight = navUsd > 0 ? (liveNotional / navUsd) * (direction === 'SHORT' ? -1 : 1) : 0;

    activeHoldings.push({
      symbol: sym,
      direction,
      qty_lots: signedQty,
      notional_usd: liveNotional,
      weight,
      entry_price: entryPrice,
      mark_price: markPrice,
      upnl_usd: upnlUsd,
      upnl_pct: upnlPct,
    });
  }

  activeHoldings.sort((a, b) => {
    if (a.direction !== b.direction) {
      return a.direction === 'LONG' ? -1 : 1;
    }
    return Math.abs(b.notional_usd) - Math.abs(a.notional_usd);
  });

  return activeHoldings;
}

export function normalizeSatelliteSnapshot(ctx: SatelliteDiagnosticContext) {
  const row = ctx.latestRow || {};
  const rawHistory =
    Array.isArray(ctx.historyRows) && ctx.historyRows.length > 0 ? ctx.historyRows : [row];
  const sortedHistory = [...rawHistory].sort((a, b) => {
    const dt = num(a?.timestamp_ms, 0) - num(b?.timestamp_ms, 0);
    if (dt !== 0) return dt;
    return num(a?.bar_idx, 0) - num(b?.bar_idx, 0);
  });

  const v31 = extractV31Meta(row, sortedHistory);
  const g = v31.rawGonogoReport;
  const csd = typeof row.csd_status === 'object' && row.csd_status !== null ? row.csd_status : {};
  const exec =
    typeof row.execution_quality === 'object' && row.execution_quality !== null
      ? row.execution_quality
      : {};
  const execAuditRaw = safeParseObj(g?.exec_audit);
  const gonogo =
    typeof row.gonogo_progress === 'object' && row.gonogo_progress !== null ? row.gonogo_progress : {};
  const rawPositions =
    v31.positionsV31.length > 0
      ? v31.positionsV31
      : typeof row.positions_lots === 'object' && row.positions_lots !== null
        ? row.positions_lots
        : typeof row.positions === 'object' && row.positions !== null
          ? row.positions
          : {};

  const barIdx = Math.round(num(row.bar_idx, 0));
  const timestampMs = num(row.timestamp_ms, Date.now());
  const barDate = new Date(timestampMs);
  const now = new Date();

  const navUsd = v31.navUsd;
  const walletUsd = v31.walletBalanceUsd;
  const unrealizedPnlUsd = v31.unrealizedPnlUsd;
  const realizedPnlUsd = v31.realizedPnlUsd;
  const initialNavUsd = v31.initialNavUsd;
  const totalFeesUsd = v31.totalFeesUsd;
  const cumulativeFundingUsd = v31.cumulativeFundingUsd;
  const grossLeverage = num(g?.gross_leverage ?? row.gross_leverage, 0);
  const tailBeta = num(g?.realized_tail_beta ?? row.realized_tail_beta, 0);
  const absTailBeta = Math.abs(tailBeta);
  const tailBetaLimit = v31.isV31 ? 0.030 : 0.035;
  const tailBetaPass = absTailBeta <= tailBetaLimit;
  const zStress = num(row.z_stress, 0);
  const regimeGate = num(row.regime_gate_global ?? csd.regime_gate_global, 1.0);
  const gCsd = num(csd.g_csd ?? row.g_csd, 1.0);
  const rhoConc = num(csd.concordance_rho_h12 ?? row.concordance_rho_h12, 0.0);
  const activeSniperGate = Boolean(csd.active_sniper_gate ?? grossLeverage < 0.001);

  const livePrices =
    ctx.livePricesMap && Object.keys(ctx.livePricesMap).length > 0
      ? ctx.livePricesMap
      : getCachedBinanceFuturesPrices();
  const holdings: EnrichedAssetHolding[] = computeAllBasketHoldings(
    rawPositions,
    navUsd,
    unrealizedPnlUsd,
    livePrices
  );

  // Net dollar exposure: prefer gonogo_report.net_dollar_exposure_usd -> active holdings sum -> row column
  const holdingsNetExpUsd = holdings.reduce((sum, h) => sum + h.qty_lots * h.mark_price, 0);
  const gNetExp = g?.net_dollar_exposure_usd != null ? num(g.net_dollar_exposure_usd, 0) : null;
  const rowNetExp = row.net_dollar_exposure != null ? num(row.net_dollar_exposure, 0) : null;
  const netDollarExp =
    gNetExp != null && (Math.abs(gNetExp) > 1e-6 || holdings.length === 0)
      ? gNetExp
      : Math.abs(holdingsNetExpUsd) > 1e-6
        ? holdingsNetExpUsd
        : rowNetExp ?? 0;

  // Drawdown & Historical Max Drawdown across all loaded bars
  const isLegacyNominal100k = (val: number) => Math.abs(val - 1e5) < 0.01;
  const hwmUsd = v31.hwmUsd;
  const computedTrailingDdRatio = hwmUsd > 0 ? Math.max(0, (hwmUsd - navUsd) / hwmUsd) : 0;
  const gTrailingDd =
    g?.trailing_drawdown_ratio != null ? Math.max(0, num(g.trailing_drawdown_ratio, 0)) : null;
  const rowDdPct = row.drawdown_pct != null ? Math.abs(num(row.drawdown_pct, 0)) / 100 : 0;
  const trailingDrawdownRatio =
    gTrailingDd != null
      ? gTrailingDd > 0
        ? gTrailingDd
        : computedTrailingDdRatio
      : Math.max(computedTrailingDdRatio, rowDdPct);

  let runningPeak =
    initialNavUsd > 0 && !isLegacyNominal100k(initialNavUsd) ? initialNavUsd : 0;
  let histMaxDdRatio = 0;
  for (const hr of sortedHistory) {
    const hn = num(hr?.nav_usd, 0);
    if (hn <= 0 || isLegacyNominal100k(hn)) continue;
    if (hn > runningPeak) runningPeak = hn;
    if (runningPeak > 0) {
      const dd = Math.max(0, (runningPeak - hn) / runningPeak);
      if (dd > histMaxDdRatio) histMaxDdRatio = dd;
    }
  }
  const reportedMaxDd = num(g?.max_drawdown_ratio ?? g?.max_drawdown ?? gonogo.max_drawdown, 0);
  const maxDrawdownRatio = Math.max(reportedMaxDd, histMaxDdRatio, trailingDrawdownRatio);

  const makerFills = Math.round(
    num(exec.maker_fills_count ?? gonogo.maker_fills_count ?? row.maker_fills_count, 0)
  );
  const takerFills = Math.round(
    num(exec.taker_fills_count ?? gonogo.taker_fills_count ?? row.taker_fills_count, 0)
  );
  const totalFills = makerFills + takerFills;
  let rawMakerRatio = num(
    exec.maker_taker_ratio ?? row.maker_taker_ratio ?? gonogo.maker_taker_ratio,
    totalFills > 0 ? makerFills / totalFills : v31.execAudit.avg_maker_fill_ratio_pct / 100.0
  );
  if (rawMakerRatio > 1.0) rawMakerRatio = rawMakerRatio / 100.0;

  const gtxRejects = Math.round(
    num(exec.gtx_rejects_count ?? gonogo.gtx_rejects_count ?? row.gtx_rejects_count, 0)
  );
  const l1QuantErr = num(
    row.quantization_l1_error ??
      row.mean_quantization_l1_error ??
      execAuditRaw?.mean_quantization_l1_error ??
      execAuditRaw?.quantization_l1_error ??
      exec.mean_quantization_l1_error ??
      gonogo.mean_quantization_l1_error ??
      g?.mean_quantization_l1_error,
    0
  );

  const netSharpe = num(gonogo.net_annual_sharpe ?? gonogo.sharpe_ratio ?? g?.net_annual_sharpe, 0);
  const psrVs1 = num(gonogo.psr_vs_1_0 ?? gonogo.psr ?? g?.psr_vs_1_0, 0);
  const ulcerIndex = num(gonogo.ulcer_index ?? g?.ulcer_index, 0);
  const invariantViolations = Math.round(
    num(gonogo.invariant_violations_count ?? g?.invariant_violations_count, 0)
  );

  let protocolMode: 'V31_30D_EXECUTION_AUDIT' | 'V2_2000_BAR_SAMPLE';
  let rebalancesCompleted: number;
  let targetRebalances: number;
  let barsEvaluated: number;
  let targetBars: number;
  let progressPct: number;
  let estDaysRemaining: number;
  let passedCurrently: boolean;
  let auditStatus: string;
  let failureReasons: string[];

  if (v31.isV31) {
    protocolMode = 'V31_30D_EXECUTION_AUDIT';
    rebalancesCompleted = v31.execAudit.rebalances_completed;
    targetRebalances = 30;
    barsEvaluated = rebalancesCompleted;
    targetBars = 30;
    progressPct = Math.min(100, Math.max(0, (rebalancesCompleted / targetRebalances) * 100));
    estDaysRemaining = Math.max(0, targetRebalances - rebalancesCompleted);
    passedCurrently =
      rebalancesCompleted >= 30 &&
      v31.execAudit.avg_implied_rt_cost_bps <= 5.50 &&
      absTailBeta <= 0.030 &&
      maxDrawdownRatio <= 0.12 &&
      invariantViolations === 0;
    auditStatus =
      rebalancesCompleted < 30 ? 'IN PROGRESS' : passedCurrently ? 'PASSED' : 'NO-GO';

    failureReasons = [];
    if (rebalancesCompleted < 30) {
      failureReasons.push(`rebalances_completed (${rebalancesCompleted}) < 30 (IN PROGRESS)`);
    }
    if (rebalancesCompleted > 0 && v31.execAudit.avg_implied_rt_cost_bps > 5.50) {
      failureReasons.push(
        `avg_implied_rt_cost_bps (${v31.execAudit.avg_implied_rt_cost_bps.toFixed(2)}) > 5.50`
      );
    }
    if (absTailBeta > 0.030) {
      failureReasons.push(`abs_tail_beta (${absTailBeta.toFixed(4)}) > 0.030`);
    }
    if (maxDrawdownRatio > 0.12) {
      failureReasons.push(
        `max_drawdown_ratio (${(maxDrawdownRatio * 100).toFixed(2)}%) > 12.00%`
      );
    }
    if (invariantViolations > 0) {
      failureReasons.push(`invariant_violations (${invariantViolations}) > 0`);
    }
  } else {
    protocolMode = 'V2_2000_BAR_SAMPLE';
    rebalancesCompleted = 0;
    targetRebalances = 2000;
    barsEvaluated = Math.max(Math.round(num(gonogo.bars_evaluated, barIdx)), barIdx);
    targetBars = Math.round(num(gonogo.target_bars, 2000));
    progressPct = Math.min(100, (barsEvaluated / Math.max(1, targetBars)) * 100);
    estDaysRemaining = Math.max(0, targetBars - barsEvaluated) / 288;
    passedCurrently = Boolean(gonogo.passed_currently ?? false);
    auditStatus = passedCurrently ? 'PASSED' : 'IN PROGRESS';
    failureReasons = Array.isArray(gonogo.failure_reasons)
      ? gonogo.failure_reasons.map(String)
      : barsEvaluated < targetBars
        ? [`bars_evaluated (${barsEvaluated}) < ${targetBars}`]
        : [];
  }

  return {
    captured_at_utc: now.toISOString(),
    captured_at_cet: formatCetTimestamp(now),
    last_bar_utc: barDate.toISOString(),
    timestamp_ms: timestampMs,
    venue: String(ctx.venue || row.venue || 'paper').toUpperCase(),
    runtime_state: String(row.runtime_state || 'STATE_RUNNING'),
    bar_idx: barIdx,
    financials: {
      initial_nav_usd: initialNavUsd,
      nav_usd: navUsd,
      wallet_balance_usd: walletUsd,
      unrealized_pnl_usd: unrealizedPnlUsd,
      realized_pnl_usd: realizedPnlUsd,
      cumulative_funding_usd: cumulativeFundingUsd,
      total_fees_usd: totalFeesUsd,
      fee_drag_bps: navUsd > 0 ? (totalFeesUsd / navUsd) * 10000 : 0,
      high_water_mark_usd: hwmUsd,
      trailing_drawdown_ratio: trailingDrawdownRatio,
      max_drawdown_ratio: maxDrawdownRatio,
      gross_leverage: grossLeverage,
    },
    neutrality_and_regime: {
      realized_tail_beta: tailBeta,
      abs_tail_beta: absTailBeta,
      tail_beta_limit: tailBetaLimit,
      tail_beta_pass: tailBetaPass,
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
    factors: v31.factors,
    exec_audit: v31.execAudit,
    is_v31: v31.isV31,
    gonogo_protocol: {
      protocol_mode: protocolMode,
      status: auditStatus,
      rebalances_completed: rebalancesCompleted,
      target_rebalances: targetRebalances,
      bars_evaluated: barsEvaluated,
      target_bars: targetBars,
      progress_pct: progressPct,
      est_days_remaining: estDaysRemaining,
      passed_currently: passedCurrently,
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
    f.gross_leverage < 0.001 ? 'SNIPER STANDBY (100% CASH)' : '18-ASSET BASKET DEPLOYED';
  const netReturnUsd = f.nav_usd - f.initial_nav_usd;
  const netReturnPct = f.initial_nav_usd > 0 ? f.nav_usd / f.initial_nav_usd - 1 : 0;

  const holdingsRows = s.holdings
    .map(
      (h) =>
        `| \`${h.symbol}\` | \`${h.direction}\` | \`${h.qty_lots.toFixed(4)}\` | \`${fmtUsd(h.notional_usd)}\` | \`${fmtSignedPct(h.weight, 2)}\` | \`${fmtContractPrice(h.entry_price, h.symbol)} -> ${fmtContractPrice(h.mark_price, h.symbol)}\` | \`${fmtSignedUsd(h.upnl_usd)} (${h.upnl_pct >= 0 ? '+' : ''}${h.upnl_pct.toFixed(2)}%)\` |`
    )
    .join('\n');

  const betaLimitStr = nr.tail_beta_limit.toFixed(3);
  const invBeta = nr.tail_beta_pass ? '[PASS]' : '[FAIL]';
  const invViol = g.invariant_violations_count === 0 ? '[PASS]' : '[FAIL]';
  const invMaker =
    eq.total_fills_count === 0
      ? '[NO_FILLS_YET]'
      : eq.maker_taker_ratio >= 0.1
        ? '[PASS]'
        : '[WARN_LOW_MAKER]';

  const progressHeaderLine = s.is_v31
    ? `- **Heartbeat Index:** \`#${s.bar_idx.toLocaleString()}\` | **30-Day Live Paper Audit:** \`${g.rebalances_completed} / ${g.target_rebalances} Rebalances\` (\`${g.progress_pct.toFixed(1)}%\`, ~${g.est_days_remaining}d remaining) | **Audit Status:** \`${g.status}\``
    : `- **Master Dollar Bar Index:** \`#${s.bar_idx}\` | **Go/No-Go Progress:** \`${g.bars_evaluated} / ${g.target_bars}\` (\`${g.progress_pct.toFixed(2)}%\`, ~${g.est_days_remaining.toFixed(1)}d remaining @ 288 bars/d)`;

  const protocolSection = s.is_v31
    ? [
        `## 6. v3.1 30-Rebalance Live Paper Audit Protocol (Go/No-Go Gates)`,
        `1. **Audit Sample Depth (Rebalances $\\ge 30$):** \`${g.rebalances_completed} / 30\` -> \`${g.rebalances_completed >= 30 ? '[PASS]' : '[IN_PROGRESS]'}\``,
        `2. **Avg Implied Round-Trip Cost ($\\le 5.50\\text{ bps}$):** \`${s.exec_audit.avg_implied_rt_cost_bps.toFixed(2)} bps RT\` -> \`${s.exec_audit.avg_implied_rt_cost_bps <= 5.50 ? '[PASS]' : '[FAIL]'}\``,
        `3. **Realized Tail Beta ($|\\beta_{\\text{BTC}}| \\le 0.030$):** \`${nr.abs_tail_beta.toFixed(4)}\` -> \`${invBeta}\``,
        `4. **Max Historical Drawdown ($\\le 12.00\\%$):** \`${fmtPct(g.max_drawdown, 2)}\` -> \`${g.max_drawdown <= 0.12 ? '[PASS]' : '[FAIL]'}\``,
        `5. **Hard Invariant Violations ($= 0$):** \`${g.invariant_violations_count}\` -> \`${invViol}\``,
        `- **Overall Decision:** \`${g.passed_currently ? 'GO — AUDIT PASSED' : g.status}\``,
        `- **Active Blockers:** \`${g.failure_reasons.length > 0 ? g.failure_reasons.join('; ') : 'NONE — READY FOR LIVE'}\``,
      ]
    : [
        `## 6. N=2,000 Go/No-Go Protocol Invariants (8-Point Check)`,
        `1. **Sample Depth ($N \\ge 2000$):** \`${g.bars_evaluated} / ${g.target_bars}\` -> \`${g.bars_evaluated >= g.target_bars ? '[PASS]' : '[HOLD_ACCUMULATING]'}\``,
        `2. **Net Annualized Sharpe ($\\ge 1.50$):** \`${g.net_annual_sharpe.toFixed(2)}\` -> \`${g.net_annual_sharpe >= 1.5 ? '[PASS]' : '[PENDING/BELOW]'}\``,
        `3. **Probabilistic Sharpe Ratio $\\text{PSR}(1.0) \\ge 0.95$:** \`${g.psr_vs_1_0.toFixed(3)}\` -> \`${g.psr_vs_1_0 >= 0.95 ? '[PASS]' : '[PENDING/BELOW]'}\``,
        `4. **Max Trailing Drawdown ($\\le 8.00\\%$):** \`${fmtPct(g.max_drawdown, 2)}\` -> \`${g.max_drawdown <= 0.08 ? '[PASS]' : '[FAIL]'}\``,
        `5. **Ulcer Index ($\\le 2.50\\%$):** \`${fmtPct(g.ulcer_index, 2)}\` -> \`${g.ulcer_index <= 0.025 ? '[PASS]' : '[FAIL]'}\``,
        `6. **Realized Tail Beta ($|\\beta_{\\text{BTC}}| \\le ${betaLimitStr}$):** \`${nr.abs_tail_beta.toFixed(4)}\` -> \`${invBeta}\``,
        `7. **Maker Fill Ratio ($\\ge 10.0\\%$):** \`${fmtPct(eq.maker_taker_ratio, 2)}\` -> \`${invMaker}\``,
        `8. **Hard Invariant Violations ($= 0$):** \`${g.invariant_violations_count}\` -> \`${invViol}\``,
        `- **Active Blockers:** \`${g.failure_reasons.length > 0 ? g.failure_reasons.join('; ') : 'NONE — READY FOR LIVE'}\``,
      ];

  return [
    `# QUANT-SATELLITE v3.1 — AI DIAGNOSTIC SNAPSHOT (SLEEVE A: CRYPTO CLOB)`,
    `- **Captured At (UTC):** ${s.captured_at_utc}`,
    `- **Captured At (CET):** ${s.captured_at_cet}`,
    `- **Last Bar Timestamp:** ${s.last_bar_utc} (\`${s.timestamp_ms}\`)`,
    `- **Venue / Mode:** \`${s.venue}\` | **Runtime C2 State:** \`${s.runtime_state}\``,
    progressHeaderLine,
    ``,
    `## 1. Financials, NAV & Leverage Decomposition`,
    `| Metric | Value | Invariant / Note |`,
    `| :--- | :--- | :--- |`,
    `| **Initial NAV Baseline** | \`${fmtUsd(f.initial_nav_usd)}\` | Seed capital baseline |`,
    `| **Mark-to-Market NAV** | \`${fmtUsd(f.nav_usd)}\` | Net return: \`${fmtSignedUsd(netReturnUsd)}\` (\`${fmtSignedPct(netReturnPct, 4)}\`) |`,
    `| **Wallet Balance (Cash)** | \`${fmtUsd(f.wallet_balance_usd)}\` | Realized PnL: \`${fmtSignedUsd(f.realized_pnl_usd)}\` |`,
    `| **Unrealized PnL** | \`${fmtSignedUsd(f.unrealized_pnl_usd)}\` | Open basket MTM delta |`,
    `| **Cumulative Funding PnL** | \`${fmtSignedUsd(f.cumulative_funding_usd)}\` | Perpetual funding cashflow |`,
    `| **Cumulative Exchange Fees** | \`${fmtUsd(f.total_fees_usd)}\` | Fee drag: \`${f.fee_drag_bps.toFixed(2)} bps\` of NAV |`,
    `| **High Water Mark (HWM)** | \`${fmtUsd(f.high_water_mark_usd)}\` | Peak MTM NAV |`,
    `| **Trailing Drawdown** | \`${fmtPct(f.trailing_drawdown_ratio, 4)}\` | Max Historical DD: \`${fmtPct(f.max_drawdown_ratio, 4)}\` (Limit \`<= 12.00%\`) |`,
    `| **Gross Leverage ($L_k$)** | \`${f.gross_leverage.toFixed(4)}x\` | Posture: \`${postureLabel}\` |`,
    ``,
    `## 2. Dual-Nullspace & Layer-1/2 Regime Telemetry`,
    `- **Realized Tail Beta ($\\beta_{\\text{BTC}}$):** \`${nr.realized_tail_beta >= 0 ? '+' : ''}${nr.realized_tail_beta.toFixed(4)}\` (Abs: \`${nr.abs_tail_beta.toFixed(4)}\` <= \`${betaLimitStr}\` ${invBeta} | Margin: \`${(nr.tail_beta_limit - nr.abs_tail_beta).toFixed(4)}\`)`,
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
    `## 4. 18-Asset All-USDC Basket Holdings`,
    `| Asset | Direction | Quantity (Lots) | Notional (USD) | Weight (%) | Entry -> Mark | Unrealized PnL |`,
    `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |`,
    holdingsRows || '| *No active positions* | 100% CASH / FLAT | -- | $0.00 | 0.00% | -- | $0.00 |',
    ``,
    `## 5. Slow-Alpha (M2) Factor Engine & 30-Day Execution Audit`,
    `- **Model / Bar Mode:** \`${s.factors.model_name}\` | \`${s.factors.bar_mode}\``,
    `- **PIT Eligible:** \`${s.factors.eligible_count} / 18\` | **Active K:** \`${s.factors.active_k}\` Long / \`${s.factors.active_k}\` Short`,
    `- **Target Leverage:** \`${s.factors.target_leverage.toFixed(2)}x\` | **ACI Multiplier:** \`${s.factors.aci_multiplier.toFixed(2)}\``,
    `- **Expected Post Neutrality:** \`Beta ${s.factors.expected_beta_post.toExponential(2)}\` | \`Dollar $${s.factors.expected_dollar_post.toExponential(2)}\``,
    `- **30D Rebalances Completed:** \`${s.exec_audit.rebalances_completed} / 30\``,
    `- **Avg Implied Round-Trip Cost:** \`${s.exec_audit.avg_implied_rt_cost_bps.toFixed(2)} bps RT\` (Target <= 5.50 bps)`,
    `- **Avg Maker Fill Ratio:** \`${s.exec_audit.avg_maker_fill_ratio_pct.toFixed(1)}%\``,
    `- **Beats Regime A Ratio:** \`${(s.exec_audit.beats_regime_a_ratio * 100).toFixed(0)}%\``,
    `- **Circuit Breakers (Aborts / Timeouts):** \`${s.exec_audit.total_aborts} / ${s.exec_audit.total_timeouts}\``,
    `- **15s BBO Re-Pegs:** \`${s.exec_audit.total_repegs}\``,
    `- **Traded Volume / Fees:** \`$${s.exec_audit.total_traded_notional_usd.toLocaleString('en-US', { maximumFractionDigits: 0 })} / $${s.exec_audit.total_fees_usd.toFixed(2)}\``,
    ``,
    ...protocolSection,
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
    const ok = (document as any).execCommand('copy');
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

export interface PoolPartitionValuation {
  id: string;
  participant_name: string;
  relation_label: string;
  is_master: boolean;
  performance_fee_pct: number;
  initial_capital_usd: number;
  net_invested_usd: number;
  units_owned: number;
  entry_unit_price: number;
  high_water_mark_unit_price: number;
  crystallized_fees_paid_usd: number;
  status: string;
  notes?: string;
  gross_value_usd: number;
  gross_pnl_usd: number;
  above_hwm_per_unit: number;
  accrued_fee_usd: number;
  net_value_usd: number;
  net_pnl_usd: number;
  net_roi_pct: number;
  pool_share_pct: number;
}

export interface PoolValuationResult {
  grossUnitPrice: number;
  totalUnits: number;
  totalGrossUsd: number;
  totalAccruedFeesFromOthers: number;
  totalNetPoolUsd: number;
  valuations: PoolPartitionValuation[];
}

export function computePoolPartitionValuations(
  partitions: any[],
  livePoolNavUsd: number,
  initialVpsBaselineUsd: number = 2750.0
): PoolValuationResult {
  if (!Array.isArray(partitions) || partitions.length === 0) {
    return {
      grossUnitPrice: 1.0,
      totalUnits: 0,
      totalGrossUsd: 0,
      totalAccruedFeesFromOthers: 0,
      totalNetPoolUsd: 0,
      valuations: [],
    };
  }

  const totalUnits = partitions.reduce((sum, p) => sum + num(p?.units_owned, 0), 0);
  const baseline = initialVpsBaselineUsd > 0 && Math.abs(initialVpsBaselineUsd - 1e5) >= 0.01 ? initialVpsBaselineUsd : 2750.0;

  // Unit Price Calculation:
  // In unitized equity mode: grossUnitPrice = livePoolNavUsd / totalUnits (or baseline if totalUnits === 0)
  let grossUnitPrice = 1.0;
  if (totalUnits > 0) {
    grossUnitPrice = Math.max(0.0001, livePoolNavUsd / totalUnits);
  } else if (baseline > 0) {
    grossUnitPrice = Math.max(0.0001, livePoolNavUsd / baseline);
  }

  let totalAccruedFeesFromOthers = 0;
  const intermediate = partitions.map((p) => {
    const units = num(p?.units_owned, 0);
    const netInvested = num(p?.net_invested_usd, num(p?.initial_capital_usd, 0));
    const hwm = num(p?.high_water_mark_unit_price, 1.0);
    const feePct = num(p?.performance_fee_pct, 0);
    const isMaster = Boolean(p?.is_master);

    const grossVal = units * grossUnitPrice;
    const grossPnl = grossVal - netInvested;
    const aboveHwm = Math.max(0, grossUnitPrice - hwm);
    const accruedFee = isMaster ? 0 : (feePct / 100.0) * units * aboveHwm;

    if (!isMaster) {
      totalAccruedFeesFromOthers += accruedFee;
    }

    return {
      p,
      units,
      netInvested,
      hwm,
      feePct,
      isMaster,
      grossVal,
      grossPnl,
      aboveHwm,
      accruedFee,
    };
  });

  let totalGrossUsd = 0;
  let totalNetPoolUsd = 0;

  const valuationsWithoutShares = intermediate.map((item) => {
    const { p, units, netInvested, hwm, feePct, isMaster, grossVal, grossPnl, aboveHwm, accruedFee } = item;

    totalGrossUsd += grossVal;

    let netVal: number;
    if (isMaster) {
      netVal = grossVal + totalAccruedFeesFromOthers;
    } else {
      netVal = grossVal - accruedFee;
    }

    totalNetPoolUsd += netVal;
    const netPnl = netVal - netInvested;
    const netRoi = netInvested > 0 ? (netPnl / netInvested) * 100.0 : 0;

    return {
      id: String(p?.id || ''),
      participant_name: String(p?.participant_name || 'Participant'),
      relation_label: String(p?.relation_label || 'Family / Friend'),
      is_master: isMaster,
      performance_fee_pct: feePct,
      initial_capital_usd: num(p?.initial_capital_usd, netInvested),
      net_invested_usd: netInvested,
      units_owned: units,
      entry_unit_price: num(p?.entry_unit_price, 1.0),
      high_water_mark_unit_price: hwm,
      crystallized_fees_paid_usd: num(p?.crystallized_fees_paid_usd, 0),
      status: String(p?.status || 'ACTIVE'),
      notes: p?.notes ? String(p.notes) : '',
      gross_value_usd: grossVal,
      gross_pnl_usd: grossPnl,
      above_hwm_per_unit: aboveHwm,
      accrued_fee_usd: accruedFee,
      net_value_usd: netVal,
      net_pnl_usd: netPnl,
      net_roi_pct: netRoi,
    };
  });

  const valuations: PoolPartitionValuation[] = valuationsWithoutShares.map((val) => {
    const poolShare = totalNetPoolUsd > 0 ? (val.net_value_usd / totalNetPoolUsd) * 100.0 : 0;
    return {
      ...val,
      pool_share_pct: poolShare,
    };
  });

  return {
    grossUnitPrice,
    totalUnits,
    totalGrossUsd,
    totalAccruedFeesFromOthers,
    totalNetPoolUsd,
    valuations,
  };
}


