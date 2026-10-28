import { supabase } from './supabase';

export type RuntimeState =
  | 'STATE_RUNNING'
  | 'STATE_PAUSE_MAINTAIN'
  | 'STATE_GRACEFUL_UNWIND_FLAT'
  | 'STATE_EMERGENCY_HALT';

export interface PositionDetails {
  qty_lots?: number;
  notional_usd?: number;
  weight?: number;
  entry_price?: number;
  current_price?: number;
  [key: string]: any;
}

export interface CsdStatus {
  g_csd?: number;
  concordance_rho_h12?: number;
  regime?: string;
  [key: string]: any;
}

export interface GoNoGoProgress {
  bars_evaluated?: number;
  target_bars?: number;
  status?: string;
  remaining_days?: number;
  [key: string]: any;
}

export interface QuantSatelliteTelemetry {
  bar_idx: number;
  timestamp_ms: number;
  created_at: string;
  venue: 'paper' | 'live';
  runtime_state: RuntimeState | string;
  nav_usd: number;
  wallet_balance_usd: number;
  unrealized_pnl_usd: number;
  realized_pnl_usd: number;
  total_fees_usd: number;
  drawdown_pct: number;
  gross_leverage: number;
  net_dollar_exposure: number;
  realized_tail_beta: number;
  z_stress: number;
  regime_gate_global: number;
  maker_taker_ratio: number;
  positions_lots: Record<string, PositionDetails>;
  csd_status: CsdStatus;
  gonogo_progress: GoNoGoProgress;
}

export interface QuantSatelliteCommand {
  id: string;
  created_at: string;
  issued_at_ms: number;
  issued_by: string | null;
  target_state: RuntimeState | string;
  target_nav_usd: number | null;
  reason: string;
  hmac_signature: string;
  status: 'PENDING' | 'ACKNOWLEDGED' | 'EXECUTED' | 'REJECTED';
  executed_at: string | null;
  vps_response: any;
}

/**
 * Fetch latest telemetry record from public.quant_satellite_telemetry
 */
export async function getLatestQuantSatelliteTelemetry(
  venue?: 'paper' | 'live'
): Promise<{ data: QuantSatelliteTelemetry | null; error: any }> {
  let query = supabase
    .from('quant_satellite_telemetry')
    .select('*')
    .order('timestamp_ms', { ascending: false })
    .limit(1);

  if (venue) {
    query = query.eq('venue', venue);
  }

  const { data, error } = await query;
  return { data: data?.[0] || null, error };
}

/**
 * Fetch historical telemetry records (default 500)
 */
export async function getQuantSatelliteTelemetryHistory(
  limit: number = 500,
  venue?: 'paper' | 'live'
): Promise<{ data: QuantSatelliteTelemetry[]; error: any }> {
  let query = supabase
    .from('quant_satellite_telemetry')
    .select('*')
    .order('timestamp_ms', { ascending: false })
    .limit(limit);

  if (venue) {
    query = query.eq('venue', venue);
  }

  const { data, error } = await query;
  return { data: (data as QuantSatelliteTelemetry[]) || [], error };
}

/**
 * Fetch recent C2 commands (default 10)
 */
export async function getRecentQuantSatelliteCommands(
  limit: number = 10
): Promise<{ data: QuantSatelliteCommand[]; error: any }> {
  const { data, error } = await supabase
    .from('quant_satellite_commands')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  return { data: (data as QuantSatelliteCommand[]) || [], error };
}

