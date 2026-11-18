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

async function verifyAdminAuth(request: Request) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing Bearer token' };
  }

  const supabase = getSupabaseAdmin();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { ok: false, status: 401, error: 'Unauthorized: Invalid or expired token' };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    return { ok: false, status: 403, error: 'Forbidden: Admin clearance required' };
  }

  return { ok: true, user, supabase };
}

// GET: Retrieve all partitions sorted by is_master DESC, created_at ASC (auto-initializes master node if empty)
export const GET: APIRoute = async ({ request }) => {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.ok) {
      return new Response(JSON.stringify({ ok: false, error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const { supabase } = auth;
    const { data: partitions, error } = await supabase!
      .from('quant_pool_partitions')
      .select('*')
      .order('is_master', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    // Auto-initialize Master Node if table is currently empty
    if (!partitions || partitions.length === 0) {
      const initialMaster = {
        participant_name: 'Thijs (Master Node)',
        relation_label: 'Principal / Manager',
        is_master: true,
        performance_fee_pct: 0.0,
        initial_capital_usd: 2750.0,
        net_invested_usd: 2750.0,
        units_owned: 2750.0,
        entry_unit_price: 1.0,
        high_water_mark_unit_price: 1.0,
        crystallized_fees_paid_usd: 0.0,
        status: 'ACTIVE',
        notes: 'Initial Dirichlet-6 Seed Capital Pool',
      };

      const { data: seeded, error: seedError } = await supabase!
        .from('quant_pool_partitions')
        .insert(initialMaster)
        .select('*');

      if (!seedError && seeded && seeded.length > 0) {
        return new Response(JSON.stringify({ ok: true, partitions: seeded }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, partitions: partitions || [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};

// POST: Manage partitions (CREATE_PARTITION, ADJUST_CAPITAL, UPDATE_FEE_PCT, CRYSTALLIZE_FEES, DELETE_PARTITION)
export const POST: APIRoute = async ({ request }) => {
  try {
    const auth = await verifyAdminAuth(request);
    if (!auth.ok) {
      return new Response(JSON.stringify({ ok: false, error: auth.error }), {
        status: auth.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const { supabase, user } = auth;
    let body: any;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ ok: false, error: 'Malformed JSON payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }

    const { action } = body || {};

    // 1. CREATE_PARTITION
    if (action === 'CREATE_PARTITION') {
      const {
        participant_name,
        relation_label,
        initial_capital_usd,
        performance_fee_pct,
        current_unit_price,
        is_master,
      } = body;

      if (!participant_name || typeof participant_name !== 'string' || !participant_name.trim()) {
        return new Response(JSON.stringify({ ok: false, error: 'participant_name is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const capital = Number(initial_capital_usd);
      if (isNaN(capital) || capital <= 0) {
        return new Response(JSON.stringify({ ok: false, error: 'initial_capital_usd must be > 0' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const feePct = Math.max(0, Math.min(50, Number(performance_fee_pct) || 0));
      const unitPrice = Math.max(0.0001, Number(current_unit_price) || 1.0);
      const unitsOwned = capital / unitPrice;
      const isMasterBool = Boolean(is_master);

      const newRow = {
        participant_name: participant_name.trim(),
        relation_label: (relation_label && String(relation_label).trim()) || 'Family / Friend',
        is_master: isMasterBool,
        performance_fee_pct: isMasterBool ? 0.0 : feePct,
        initial_capital_usd: capital,
        net_invested_usd: capital,
        units_owned: unitsOwned,
        entry_unit_price: unitPrice,
        high_water_mark_unit_price: unitPrice,
        crystallized_fees_paid_usd: 0.0,
        status: 'ACTIVE',
      };

      const { data: inserted, error: insertError } = await supabase!
        .from('quant_pool_partitions')
        .insert(newRow)
        .select('*')
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ ok: false, error: insertError.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await supabase!.from('admin_logs').insert({
        event_type: 'QUANT_POOL_PARTITION_CREATE',
        description: `Created pool partition for ${newRow.participant_name} ($${capital.toFixed(2)} @ $${unitPrice.toFixed(4)}/unit, Fee: ${feePct}%)`,
        metadata: {
          partition_id: inserted.id,
          participant_name: newRow.participant_name,
          initial_capital_usd: capital,
          units_owned: unitsOwned,
          created_by: user!.id,
        },
      });

      return new Response(JSON.stringify({ ok: true, partition: inserted }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. ADJUST_CAPITAL (Deposit / Withdrawal)
    if (action === 'ADJUST_CAPITAL') {
      const { partition_id, delta_capital_usd, current_unit_price } = body;
      if (!partition_id) {
        return new Response(JSON.stringify({ ok: false, error: 'partition_id is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const deltaCapital = Number(delta_capital_usd);
      if (isNaN(deltaCapital) || deltaCapital === 0) {
        return new Response(JSON.stringify({ ok: false, error: 'delta_capital_usd must be a non-zero number' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const unitPrice = Math.max(0.0001, Number(current_unit_price) || 1.0);

      const { data: partition, error: fetchErr } = await supabase!
        .from('quant_pool_partitions')
        .select('*')
        .eq('id', partition_id)
        .single();

      if (fetchErr || !partition) {
        return new Response(JSON.stringify({ ok: false, error: 'Partition not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const deltaUnits = deltaCapital / unitPrice;
      const updatedUnits = Math.max(0, Number(partition.units_owned) + deltaUnits);
      const updatedInvested = Math.max(0, Number(partition.net_invested_usd) + deltaCapital);

      const { data: updated, error: updateErr } = await supabase!
        .from('quant_pool_partitions')
        .update({
          units_owned: updatedUnits,
          net_invested_usd: updatedInvested,
          updated_at: new Date().toISOString(),
        })
        .eq('id', partition_id)
        .select('*')
        .single();

      if (updateErr) {
        return new Response(JSON.stringify({ ok: false, error: updateErr.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await supabase!.from('admin_logs').insert({
        event_type: 'QUANT_POOL_CAPITAL_ADJUST',
        description: `Adjusted capital for ${partition.participant_name}: ${deltaCapital >= 0 ? '+' : ''}$${deltaCapital.toFixed(2)} (${deltaUnits >= 0 ? '+' : ''}${deltaUnits.toFixed(4)} units)`,
        metadata: {
          partition_id,
          delta_capital_usd: deltaCapital,
          current_unit_price: unitPrice,
          new_units_owned: updatedUnits,
          adjusted_by: user!.id,
        },
      });

      return new Response(JSON.stringify({ ok: true, partition: updated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. UPDATE_FEE_PCT
    if (action === 'UPDATE_FEE_PCT') {
      const { partition_id, performance_fee_pct } = body;
      if (!partition_id) {
        return new Response(JSON.stringify({ ok: false, error: 'partition_id is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const feePct = Math.max(0, Math.min(50, Number(performance_fee_pct) || 0));

      const { data: updated, error: updateErr } = await supabase!
        .from('quant_pool_partitions')
        .update({
          performance_fee_pct: feePct,
          updated_at: new Date().toISOString(),
        })
        .eq('id', partition_id)
        .select('*')
        .single();

      if (updateErr) {
        return new Response(JSON.stringify({ ok: false, error: updateErr.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await supabase!.from('admin_logs').insert({
        event_type: 'QUANT_POOL_FEE_UPDATE',
        description: `Updated fee rate for ${updated.participant_name} to ${feePct}%`,
        metadata: { partition_id, feePct, updated_by: user!.id },
      });

      return new Response(JSON.stringify({ ok: true, partition: updated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. CRYSTALLIZE_FEES
    if (action === 'CRYSTALLIZE_FEES') {
      const unitPrice = Math.max(0.0001, Number(body.current_unit_price) || 1.0);

      const { data: allPartitions, error: fetchErr } = await supabase!
        .from('quant_pool_partitions')
        .select('*')
        .order('is_master', { ascending: false });

      if (fetchErr || !allPartitions) {
        return new Response(JSON.stringify({ ok: false, error: fetchErr?.message || 'Unable to fetch partitions' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const master = allPartitions.find(p => p.is_master);
      if (!master) {
        return new Response(JSON.stringify({ ok: false, error: 'Master partition node not found' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      let totalAccruedFeeUsd = 0;
      let totalFeeUnitsForMaster = 0;
      const updates: Array<{ id: string; units_owned: number; high_water_mark_unit_price: number; crystallized_fees_paid_usd: number }> = [];

      for (const p of allPartitions) {
        if (p.is_master) continue;
        const hwm = Number(p.high_water_mark_unit_price || 1.0);
        const feeRate = Number(p.performance_fee_pct || 0) / 100.0;
        const currentUnits = Number(p.units_owned || 0);

        if (unitPrice > hwm && feeRate > 0 && currentUnits > 0) {
          const gainPerUnit = unitPrice - hwm;
          const accruedFeeUsd = feeRate * currentUnits * gainPerUnit;
          const feeUnits = accruedFeeUsd / unitPrice;

          totalAccruedFeeUsd += accruedFeeUsd;
          totalFeeUnitsForMaster += feeUnits;

          updates.push({
            id: p.id,
            units_owned: Math.max(0, currentUnits - feeUnits),
            high_water_mark_unit_price: unitPrice,
            crystallized_fees_paid_usd: Number(p.crystallized_fees_paid_usd || 0) + accruedFeeUsd,
          });
        }
      }

      // Execute updates
      for (const upd of updates) {
        await supabase!
          .from('quant_pool_partitions')
          .update({
            units_owned: upd.units_owned,
            high_water_mark_unit_price: upd.high_water_mark_unit_price,
            crystallized_fees_paid_usd: upd.crystallized_fees_paid_usd,
            updated_at: new Date().toISOString(),
          })
          .eq('id', upd.id);
      }

      // Add collected fee units to Master Node
      if (totalFeeUnitsForMaster > 0) {
        const nextMasterUnits = Number(master.units_owned) + totalFeeUnitsForMaster;
        await supabase!
          .from('quant_pool_partitions')
          .update({
            units_owned: nextMasterUnits,
            updated_at: new Date().toISOString(),
          })
          .eq('id', master.id);
      }

      await supabase!.from('admin_logs').insert({
        event_type: 'QUANT_POOL_CRYSTALLIZE_FEES',
        description: `Crystallized $${totalAccruedFeeUsd.toFixed(2)} in HWM performance fees (${totalFeeUnitsForMaster.toFixed(4)} units allocated to Master Node)`,
        metadata: {
          current_unit_price: unitPrice,
          total_crystallized_usd: totalAccruedFeeUsd,
          units_credited_master: totalFeeUnitsForMaster,
          affected_partitions_count: updates.length,
          crystallized_by: user!.id,
        },
      });

      return new Response(JSON.stringify({
        ok: true,
        total_crystallized_usd: totalAccruedFeeUsd,
        fee_units_credited: totalFeeUnitsForMaster,
        partitions_updated: updates.length,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 5. DELETE_PARTITION
    if (action === 'DELETE_PARTITION') {
      const { partition_id } = body;
      if (!partition_id) {
        return new Response(JSON.stringify({ ok: false, error: 'partition_id is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { data: partition, error: fetchErr } = await supabase!
        .from('quant_pool_partitions')
        .select('*')
        .eq('id', partition_id)
        .single();

      if (fetchErr || !partition) {
        return new Response(JSON.stringify({ ok: false, error: 'Partition not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (partition.is_master) {
        return new Response(JSON.stringify({ ok: false, error: 'Cannot delete the Master Node partition' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const { error: deleteErr } = await supabase!
        .from('quant_pool_partitions')
        .delete()
        .eq('id', partition_id);

      if (deleteErr) {
        return new Response(JSON.stringify({ ok: false, error: deleteErr.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      await supabase!.from('admin_logs').insert({
        event_type: 'QUANT_POOL_PARTITION_DELETE',
        description: `Deleted pool partition for ${partition.participant_name} ($${Number(partition.net_invested_usd).toFixed(2)})`,
        metadata: { partition_id, deleted_by: user!.id },
      });

      return new Response(JSON.stringify({ ok: true, deleted_id: partition_id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: `Unknown action: ${action}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err?.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
