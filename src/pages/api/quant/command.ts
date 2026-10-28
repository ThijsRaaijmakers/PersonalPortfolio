import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomUUID } from 'node:crypto';

export const prerender = false;

const ALLOWED_STATES = [
  'STATE_RUNNING',
  'STATE_PAUSE_MAINTAIN',
  'STATE_GRACEFUL_UNWIND_FLAT',
  'STATE_EMERGENCY_HALT',
] as const;

type AllowedState = (typeof ALLOWED_STATES)[number];

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

// POST: Issue a signed C2 Command to Tokyo VPS
export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Extract and verify Bearer token from Authorization header
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized: Missing or malformed Bearer token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized: Invalid or expired access token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // 2. Check profile role === 'admin'
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ ok: false, error: 'Forbidden: Admin clearance required' }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // 3. Validate JSON body
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({ ok: false, error: 'Malformed JSON payload' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    const { target_state, reason, target_nav_usd } = body || {};

    if (!target_state || !ALLOWED_STATES.includes(target_state as AllowedState)) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Invalid target_state. Must be one of: ${ALLOWED_STATES.join(', ')}`,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 250) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: 'Reason must be a non-empty string of maximum 250 characters',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    let parsedNav: number | null = null;
    if (target_nav_usd !== undefined && target_nav_usd !== null && target_nav_usd !== '') {
      parsedNav = Number(target_nav_usd);
      if (isNaN(parsedNav) || parsedNav <= 0) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: 'target_nav_usd must be a positive number if provided',
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
          }
        );
      }
    }

    // 4. Generate command_id and issued_at_ms
    const command_id = randomUUID();
    const issued_at_ms = Date.now();

    // 5. Calculate HMAC-SHA256 signature
    const hmacSecret =
      import.meta.env.QUANT_C2_HMAC_SECRET || process.env.QUANT_C2_HMAC_SECRET || '';

    if (!hmacSecret) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Internal Server Error: QUANT_C2_HMAC_SECRET not configured' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // Canonical payload: ${command_id}:${issued_at_ms}:${target_state}:${target_nav_usd ?? ''}
    const canonicalPayload = `${command_id}:${issued_at_ms}:${target_state}:${target_nav_usd ?? ''}`;
    const hmacSignature = createHmac('sha256', hmacSecret).update(canonicalPayload).digest('hex');

    // 6. Write record to public.quant_satellite_commands
    const cleanReason = reason.trim();
    const { error: cmdError } = await supabase
      .from('quant_satellite_commands')
      .insert({
        id: command_id,
        issued_at_ms,
        issued_by: user.id,
        target_state,
        target_nav_usd: parsedNav,
        reason: cleanReason,
        hmac_signature: hmacSignature,
        status: 'PENDING',
      });

    if (cmdError) {
      return new Response(
        JSON.stringify({ ok: false, error: `Database error inserting command: ${cmdError.message}` }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        }
      );
    }

    // 7. Write audit log in public.admin_logs
    await supabase.from('admin_logs').insert({
      event_type: 'QUANT_C2_COMMAND',
      description: `Issued ${target_state}: ${cleanReason}`,
      metadata: {
        command_id,
        target_nav_usd: parsedNav,
        issued_by: user.id,
        issued_at_ms,
      },
    });

    // 8. Return HTTP 200 with result payload
    return new Response(
      JSON.stringify({
        ok: true,
        command_id,
        target_state,
        issued_at_ms,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'Internal Server Error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      }
    );
  }
};

// GET: Retrieve recent C2 commands for the console feed
export const GET: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized: Missing Bearer token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Unauthorized' }),
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
        JSON.stringify({ ok: false, error: 'Forbidden' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { data: commands, error: fetchErr } = await supabase
      .from('quant_satellite_commands')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (fetchErr) {
      return new Response(
        JSON.stringify({ ok: false, error: fetchErr.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, commands: commands || [] }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ ok: false, error: err?.message || 'Internal Server Error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

