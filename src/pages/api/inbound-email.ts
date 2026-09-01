export const prerender = false;

import type { APIRoute } from 'astro';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { parseFleetPortEmail } from '../../lib/parser';
import { fetchVehicleSpecs } from '../../lib/rdw';

export const POST: APIRoute = async ({ request }) => {
  try {
    const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || import.meta.env.PUBLIC_SUPABASE_URL || '';
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || import.meta.env.SUPABASE_SERVICE_ROLE_KEY || '';
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Read raw body and extract Svix headers
    const rawBodyString = await request.text();
    const svixId = request.headers.get('svix-id');
    const svixTimestamp = request.headers.get('svix-timestamp');
    const svixSignature = request.headers.get('svix-signature');

    if (!svixId || !svixTimestamp || !svixSignature) {
      return new Response(
        JSON.stringify({ status: 'unauthorized', message: 'Missing Svix headers' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Cryptographic Webhook Verification via Resend SDK
    const resendApiKey = process.env.RESEND_API_KEY || import.meta.env.RESEND_API_KEY;
    const resendWebhookSecret = process.env.RESEND_WEBHOOK_SECRET || import.meta.env.RESEND_WEBHOOK_SECRET;
    const resend = new Resend(resendApiKey);

    let event: any;
    try {
      event = resend.webhooks.verify({
        payload: rawBodyString,
        headers: {
          id: svixId,
          timestamp: svixTimestamp,
          signature: svixSignature,
        },
        webhookSecret: resendWebhookSecret || '',
      });
    } catch (verifyError: any) {
      console.error('Svix signature verification failed:', verifyError);
      return new Response(
        JSON.stringify({ status: 'unauthorized', message: 'Svix signature verification failed' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 3. Verify Event Type & Extract email_id
    const eventPayload = typeof event === 'object' && event !== null ? event : JSON.parse(rawBodyString);

    if (!eventPayload || eventPayload.type !== 'email.received' || !eventPayload.data?.email_id) {
      return new Response(
        JSON.stringify({ status: 'skipped', message: 'Not an email.received event or missing email_id' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const emailId = eventPayload.data.email_id;

    // 4. Retrieve Full Email Data using Resend receiving API
    const { data: email, error: fetchError } = await (resend.emails as any).receiving.get(emailId);

    if (fetchError || !email) {
      console.error('Fetch receiving email error:', fetchError);
      return new Response(
        JSON.stringify({ status: 'skipped', message: 'Could not retrieve email data from Resend' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const subject = email.subject || '';
    const htmlBody = email.html || email.text || '';

    // 5. Filter Subject Line (case-insensitive transportopdracht or transportinstructie)
    const lowerSubject = subject.toLowerCase();
    if (!lowerSubject.includes('transportopdracht') && !lowerSubject.includes('transportinstructie')) {
      return new Response(
        JSON.stringify({ status: 'skipped', message: 'Subject line does not match transport criteria' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!htmlBody || !htmlBody.trim()) {
      return new Response(
        JSON.stringify({ status: 'skipped', message: 'Email body is empty' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 6. Execute Regex/DOM Parsing on email.html & RDW Lookup
    const parsedData = parseFleetPortEmail(email.html || htmlBody);

    if (!parsedData.vehicle_license_plate) {
      return new Response(
        JSON.stringify({ status: 'skipped', message: 'No license plate detected in email body' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const rdwData = await fetchVehicleSpecs(parsedData.vehicle_license_plate);

    // Title Case fallback for vehicle make and model
    const toTitleCase = (str: string) =>
      str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.substring(1)).join(' ');

    let finalMake = parsedData.vehicle_make || '';
    let finalModel = parsedData.vehicle_model || '';
    const combinedName = `${finalMake} ${finalModel}`.toLowerCase();

    if (combinedName.includes('niet bekend') || !finalMake.trim()) {
      if (rdwData?.rdw_make) finalMake = toTitleCase(rdwData.rdw_make);
      if (rdwData?.rdw_model && combinedName.includes('niet bekend')) finalModel = toTitleCase(rdwData.rdw_model);
    }

    const { rdw_make, rdw_model, ...cleanRdwData } = rdwData || {};

    // Peak HP extraction logic
    let finalHp = cleanRdwData.rdw_power_hp;
    const pkMatch = finalModel.match(/(\d+)\s*pk/i);
    const kwMatch = finalModel.match(/(\d+)\s*kw/i);

    if (pkMatch) {
      finalHp = parseInt(pkMatch[1], 10);
    } else if (kwMatch) {
      finalHp = Math.round(parseInt(kwMatch[1], 10) * 1.362);
    }

    cleanRdwData.rdw_power_hp = finalHp;

    // 7. Merge Payload & Assign Admin User ID
    const preparedPayload = {
      ...parsedData,
      ...cleanRdwData,
      vehicle_make: finalMake,
      vehicle_model: finalModel,
      user_id: process.env.ADMIN_USER_ID || import.meta.env.ADMIN_USER_ID
    };

    // 7b. Perform Nominatim Geocoding & OSRM Route Calculation
    async function geocodeLocation(address: string | null | undefined, city: string | null | undefined): Promise<{ lat: number | null, lng: number | null }> {
      const query = [address, city].filter(Boolean).join(', ');
      if (!query) return { lat: null, lng: null };
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`, {
          headers: { 'User-Agent': 'PersonalPortfolio-App/1.0' }
        });
        if (!res.ok) return { lat: null, lng: null };
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return {
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
          };
        }
      } catch {
        // Return nulls if geocoding fails gracefully
      }
      return { lat: null, lng: null };
    }

    const pickupCoords = await geocodeLocation(preparedPayload.pickup_address, preparedPayload.pickup_postal_city);
    await new Promise((r) => setTimeout(r, 1000));
    const dropoffCoords = await geocodeLocation(preparedPayload.dropoff_address, preparedPayload.dropoff_postal_city);

    let routeGeometry: [number, number][] | null = null;
    if (pickupCoords.lat !== null && pickupCoords.lng !== null && dropoffCoords.lat !== null && dropoffCoords.lng !== null) {
      try {
        const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${pickupCoords.lng},${pickupCoords.lat};${dropoffCoords.lng},${dropoffCoords.lat}?overview=simplified&geometries=geojson`;
        const osrmRes = await fetch(osrmUrl);
        if (osrmRes.ok) {
          const osrmData = await osrmRes.json();
          if (osrmData.routes && osrmData.routes.length > 0 && osrmData.routes[0].geometry?.coordinates) {
            routeGeometry = osrmData.routes[0].geometry.coordinates.map((coord: [number, number]) => [coord[1], coord[0]]);
          }
        }
      } catch {
        // Fail gracefully to null route_geometry
      }
    }

    const finalPayload = {
      ...preparedPayload,
      pickup_lat: pickupCoords.lat,
      pickup_lng: pickupCoords.lng,
      dropoff_lat: dropoffCoords.lat,
      dropoff_lng: dropoffCoords.lng,
      route_geometry: routeGeometry,
    };

    // 8. Upsert into Supabase
    const { error: insertError } = await supabaseAdmin
      .from('shifts')
      .upsert([finalPayload], {
        onConflict: 'user_id,shift_date,vehicle_license_plate,pickup_name',
        ignoreDuplicates: true,
      });

    if (insertError) {
      console.error('Supabase Insert Error:', insertError);
      return new Response(
        JSON.stringify({ status: 'error', message: insertError.message }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Webhook Success] Shift processed for ${preparedPayload.vehicle_license_plate} on ${preparedPayload.shift_date}`);
    return new Response("OK", { status: 200 });

  } catch (err: any) {
    console.error('Inbound Email Webhook Error:', err);
    return new Response("OK", { status: 200 });
  }
};
