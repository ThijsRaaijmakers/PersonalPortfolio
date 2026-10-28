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

    const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 500));
    const venue = url.searchParams.get('venue');

    let query = supabase
      .from('quant_satellite_telemetry')
      .select('*')
      .order('timestamp_ms', { ascending: false })
      .limit(limit);

    if (venue === 'paper' || venue === 'live') {
      query = query.eq('venue', venue);
    }

    const { data, error } = await query;

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const rows = data || [];
    const latest = rows.length > 0 ? rows[0] : null;

    return new Response(
      JSON.stringify({
        success: true,
        latest,
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

