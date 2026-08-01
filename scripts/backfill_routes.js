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

async function run() {
  console.log("Querying FleetPort repository for missing route geometries...");
  
  // Fetch shifts that have coordinates but no route geometry
  const { data: shifts, error } = await supabase
    .from('shifts')
    .select('id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng')
    .not('pickup_lat', 'is', null)
    .not('dropoff_lat', 'is', null)
    .is('route_geometry', null);

  if (error) {
    console.error("Error fetching shifts:", error);
    return;
  }

  console.log(`Found ${shifts.length} shifts requiring OSRM geometry calculation.\n`);

  for (let i = 0; i < shifts.length; i++) {
    const shift = shifts[i];
    process.stdout.write(`Calculating route ${i + 1}/${shifts.length} [ID: ${shift.id}]... `);

    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${shift.pickup_lng},${shift.pickup_lat};${shift.dropoff_lng},${shift.dropoff_lat}?overview=simplified&geometries=geojson`;
      const response = await fetch(osrmUrl);
      const data = await response.json();

      if (data.code === 'Ok' && data.routes.length > 0) {
        // Flip [lng, lat] to [lat, lng] for Leaflet
        const flippedCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        
        const { error: updateError } = await supabase
          .from('shifts')
          .update({ route_geometry: flippedCoords })
          .eq('id', shift.id);

        if (updateError) {
          console.log(`[DB UPDATE FAILED]`);
          console.error(updateError);
        } else {
          console.log(`[OK]`);
        }
      } else {
        console.log(`[OSRM FAILED: ${data.code}]`);
      }
    } catch (err) {
      console.log(`[NETWORK FAILED]`);
    }

    // 500ms delay to respect OSRM public API limits
    await delay(500); 
  }

  console.log("\nTelemetry geometry backfill sequence complete.");
}

run();