import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
// We use the Service Role Key to bypass RLS for administrative script execution
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Utility to comply with Nominatim's strict 1 request/second rate limit
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocode(address, city) {
  if (!address && !city) return null;
  
  // Clean up any weird comma placements
  const query = encodeURIComponent(`${address || ''}, ${city || ''}`.replace(/^, | ,/g, '').trim());
  
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}`, {
      headers: {
        'User-Agent': 'FleetPort-Geocoding-Script/1.0 (thijsraaijmakers.me)'
      }
    });
    
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (error) {
    console.error(`\nGeocoding failed for [${query}]:`, error.message);
  }
  return null;
}

async function run() {
  console.log("Querying FleetPort repository for unmapped shift records...");
  
  // Fetch shifts where pickup_lat is currently empty
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('id, pickup_address, pickup_postal_city, dropoff_address, dropoff_postal_city')
    .is('pickup_lat', null);

  if (error) {
    console.error("Error fetching shifts:", error);
    return;
  }

  console.log(`Found ${shifts.length} shifts requiring geospatial mapping.\n`);

  for (let i = 0; i < shifts.length; i++) {
    const shift = shifts[i];
    process.stdout.write(`Mapping record ${i + 1}/${shifts.length} [ID: ${shift.id}]... `);

    const pickupCoords = await geocode(shift.pickup_address, shift.pickup_postal_city);
    await delay(1500); // 1.5s delay to ensure compliance

    const dropoffCoords = await geocode(shift.dropoff_address, shift.dropoff_postal_city);
    await delay(1500); // 1.5s delay to ensure compliance

    const updatePayload = {
      pickup_lat: pickupCoords?.lat || null,
      pickup_lng: pickupCoords?.lng || null,
      dropoff_lat: dropoffCoords?.lat || null,
      dropoff_lng: dropoffCoords?.lng || null,
    };

    const { error: updateError } = await supabase
      .from('shifts')
      .update(updatePayload)
      .eq('id', shift.id);

    if (updateError) {
      console.log(`[FAILED]`);
      console.error(updateError);
    } else {
      console.log(`[OK]`);
    }
  }

  console.log("\nGeospatial backfill sequence complete.");
}

run();