import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocode(address, city) {
  if (!address && !city) return null;
  // Strip out Dutch postal codes (e.g., "5215MX ") to help Nominatim
  const cleanCity = (city || '').replace(/^[A-Z0-9]{6}\s+/i, '').trim();
  const query = encodeURIComponent(`${address || ''}, ${cleanCity}`.replace(/^, | ,/g, '').trim());
  
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`, {
      headers: { 'User-Agent': 'FleetPort-Geocoding-Script/1.1 (thijsraaijmakers.me)' }
    });
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (error) {}
  return null;
}

async function run() {
  console.log("Querying FleetPort repository for unmapped shift records...");
  
  // THE FIX: Fetch shifts missing EITHER the pickup OR the dropoff
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('*')
    .or('pickup_lat.is.null,dropoff_lat.is.null');

  if (error) {
    console.error("Error fetching shifts:", error);
    return;
  }

  console.log(`Found ${shifts.length} shifts requiring geospatial mapping.\n`);

  for (let i = 0; i < shifts.length; i++) {
    const shift = shifts[i];
    process.stdout.write(`Mapping record ${i + 1}/${shifts.length} [ID: ${shift.id}]... `);

    let pickupLat = shift.pickup_lat;
    let pickupLng = shift.pickup_lng;
    
    // Only geocode if missing
    if (!pickupLat) {
      const coords = await geocode(shift.pickup_address, shift.pickup_postal_city);
      pickupLat = coords?.lat || null;
      pickupLng = coords?.lng || null;
      await delay(1500); 
    }

    let dropoffLat = shift.dropoff_lat;
    let dropoffLng = shift.dropoff_lng;
    
    // Only geocode if missing
    if (!dropoffLat) {
      const coords = await geocode(shift.dropoff_address, shift.dropoff_postal_city);
      dropoffLat = coords?.lat || null;
      dropoffLng = coords?.lng || null;
      await delay(1500); 
    }

    const { error: updateError } = await supabase
      .from('shifts')
      .update({
        pickup_lat: pickupLat,
        pickup_lng: pickupLng,
        dropoff_lat: dropoffLat,
        dropoff_lng: dropoffLng,
      })
      .eq('id', shift.id);

    if (updateError) {
      console.log(`[FAILED]`);
    } else {
      console.log(`[OK]`);
    }
  }
  console.log("\nGeospatial backfill sequence complete.");
}

run();