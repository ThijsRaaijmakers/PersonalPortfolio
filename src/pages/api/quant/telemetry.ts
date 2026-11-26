import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

export const prerender = false;

function getSupabaseAdmin() {
  const supabaseUrl = import.meta.env.PUBLIC_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = import.meta.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase credentials in server environment');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export const GET: APIRoute = async ({ request, url }) => {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Missing Bearer token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized: Invalid token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden: Admin clearance required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const limit = Math.min(50000, Math.max(1, Number(url.searchParams.get('limit')) || 15000));
    const sinceMs = Math.max(0, Number(url.searchParams.get('since_ms')) || 0);
    const fieldsParam = url.searchParams.get('fields') || '';
    const venue = url.searchParams.get('venue');

    // Always fetch the latest full row unaltered (with gonogo_report, positions_lots, etc.)
    let latestQuery = supabase
      .from('quant_satellite_telemetry')
      .select('*')
      .order('timestamp_ms', { ascending: false })
      .order('bar_idx', { ascending: false })
      .limit(1);

    if (venue === 'paper' || venue === 'live') {
      latestQuery = latestQuery.eq('venue', venue);
    }

    const { data: latestArr, error: latestError } = await latestQuery;
    if (latestError) {
      return new Response(
        JSON.stringify({ success: false, error: latestError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const latest = latestArr && latestArr.length > 0 ? latestArr[0] : null;

    // Fetch multi-page history ordered descending (newest first so large datasets never drop live tail),
    // then deduplicate and sort strictly ascending by timestamp_ms.
    const selectCols =
      fieldsParam === 'chart'
        ? 'bar_idx,timestamp_ms,created_at,venue,runtime_state,nav_usd,wallet_balance_usd,unrealized_pnl_usd,realized_pnl_usd,total_fees_usd,drawdown_pct,gross_leverage,net_dollar_exposure,realized_tail_beta,z_stress,regime_gate_global,maker_taker_ratio'
        : '*';

    const chunkSize = 1000;
    const collected: any[] = [];
    let from = 0;

    while (collected.length < limit) {
      const batchSize = Math.min(chunkSize, limit - collected.length);
      let histQuery = supabase
        .from('quant_satellite_telemetry')
        .select(selectCols)
        .order('timestamp_ms', { ascending: false })
        .order('bar_idx', { ascending: false })
        .range(from, from + batchSize - 1);

      if (venue === 'paper' || venue === 'live') {
        histQuery = histQuery.eq('venue', venue);
      }
      if (sinceMs > 0) {
        histQuery = histQuery.gt('timestamp_ms', sinceMs);
      }

      const { data: pageRows, error: pageError } = await histQuery;
      if (pageError) {
        return new Response(
          JSON.stringify({ success: false, error: pageError.message }),
          { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!pageRows || pageRows.length === 0) break;

      collected.push(...pageRows);
      if (pageRows.length < batchSize) break;
      from += batchSize;
    }

    // Deduplicate and guarantee full latest row is included without duplicates
    const dedupMap = new Map<string | number, any>();
    for (const r of collected) {
      const key = r?.bar_idx != null ? Number(r.bar_idx) : Number(r?.timestamp_ms || 0);
      if (!dedupMap.has(key)) dedupMap.set(key, r);
    }
    if (latest) {
      const latestKey = latest?.bar_idx != null ? Number(latest.bar_idx) : Number(latest?.timestamp_ms || 0);
      dedupMap.set(latestKey, latest);
    }

    const rows = Array.from(dedupMap.values()).sort((a, b) => {
      const dt = Number(a?.timestamp_ms || 0) - Number(b?.timestamp_ms || 0);
      if (dt !== 0) return dt;
      return Number(a?.bar_idx || 0) - Number(b?.bar_idx || 0);
    });

    return new Response(
      JSON.stringify({
        success: true,
        latest: latest || (rows.length > 0 ? rows[rows.length - 1] : null),
        history: rows,
        count: rows.length,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
          'CDN-Cache-Control': 'no-store',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err?.message || 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

