import { supabase } from './supabase';

export type AssetWeights = Record<string, number>;

export interface OrderExecution {
  ticker: string;
  side: 'BUY' | 'SELL' | string;
  notional: number;
  status: 'FILLED' | 'PENDING' | 'CANCELLED' | 'REJECTED' | string;
  [key: string]: any;
}

export interface TelemetryRecord {
  id: string;
  created_at: string;
  run_timestamp: string;
  venue: 'paper' | 'live';
  is_dry_run: boolean;
  portfolio_value: number;
  cash_balance: number;
  cash_buffer_pct: number;
  daily_change_pct: number;
  dsor: number | null;
  ulcer_index: number | null;
  circuit_breaker_triggered: boolean;
  weights_raw: AssetWeights;
  weights_effective: AssetWeights;
  sentiment_scores: Record<string, number> | null;
  orders_executed: OrderExecution[];
  broker_fees: number;
  metadata: Record<string, any>;
}

/**
 * Haalt het meest recente telemetry record op, optioneel gefilterd op venue ('paper' | 'live').
 */
export async function getLatestTelemetry(
  venue?: 'paper' | 'live' | string
): Promise<{ data: TelemetryRecord | null; error: any }> {
  let query = supabase
    .from('trading_telemetry')
    .select('*');

  if (venue) {
    query = query.eq('venue', venue);
  }

  const { data, error } = await query
    .order('run_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: (data as TelemetryRecord | null) ?? null, error };
}

/**
 * Haalt de laatste N telemetry runs op (chronologisch gesorteerd: oudste naar nieuwste), optioneel gefilterd op venue.
 */
export async function getHistoricalTelemetry(
  limit: number = 30,
  venue?: 'paper' | 'live' | string
): Promise<{ data: TelemetryRecord[] | null; error: any }> {
  let query = supabase
    .from('trading_telemetry')
    .select('*');

  if (venue) {
    query = query.eq('venue', venue);
  }

  const { data, error } = await query
    .order('run_timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: null, error };
  }

  // Reverse zodat records chronologisch gesorteerd zijn voor grafieken/tijdreeksen
  const chronologicallySorted = ((data as TelemetryRecord[]) || []).slice().reverse();
  return { data: chronologicallySorted, error: null };
}

/**
 * Formatteert een percentage met twee decimalen en een expliciet plusteken voor positieve getallen (bijv. "+1.24%").
 */
export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '0.00%';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}%`;
}

/**
 * Formatteert een numerieke waarde als USD valuta met scheidingstekens (bijv. "$102,450.00").
 */
export function formatDollar(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(val);
}

