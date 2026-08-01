import fs from 'fs';
import path from 'path';
import { simpleParser } from 'mailparser';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// 1. Initialize Supabase using Service Role Key to bypass RLS in CLI context
const supabaseUrl = process.env.PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('[ERROR] Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// 2. Standalone Resilient HTML & Dual-Mode Parser for FleetPort Dispatch Emails
function parseFleetPortEmailHtml(htmlString: string) {
  // Normalize HTML string to prevent broken whitespace or non-breaking space matches
  const cleanHtml = htmlString
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ');

  const getTextAfterLabel = (targetLabel: string, contextHtml: string = cleanHtml): string | null => {
    // 1. Try HTML Table Match first
    const htmlRegex = new RegExp(`(?:<b>|<strong>|td)[^>]*>${targetLabel}[^<]*(?:<\\/b>|<\\/strong>)?\\s*<\\/td>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`, 'i');
    const htmlMatch = contextHtml.match(htmlRegex);
    if (htmlMatch && htmlMatch[1]) {
      const clean = htmlMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (clean && clean.length < 150) return clean; // Sanity check to prevent massive HTML leakage
    }

    // 2. Smarter Plain Text Match (Line-by-line with stop words)
    const plainText = contextHtml
      .replace(/<(br|tr|div|p|li|h\d)[^>]*>/gi, '\n')
      .replace(/<\/(td|tr|div|p|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .replace(/[ \t]+/g, ' '); // collapse horizontal spaces

    const lines = plainText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const targetLower = targetLabel.toLowerCase();
      const lineLower = line.toLowerCase();
      
      if (lineLower.includes(targetLower)) {
        let val = line.substring(lineLower.indexOf(targetLower) + targetLabel.length).trim();
        if (val.startsWith(':')) val = val.substring(1).trim();

        // Force cut-off if it runs into another known label on the same flattened line
        const stopLabels = ['Kleur:', 'Type:', 'Datum', 'Uitvoering:', 'Gewenste', 'Naam:', 'Adres:', 'Postcode', 'Telefoon:', 'Kenteken:', 'Merk:', 'Laadgegevens', 'Losgegevens'];
        for (const stop of stopLabels) {
          const stopIdx = val.toLowerCase().indexOf(stop.toLowerCase());
          if (stopIdx > 0) {
            val = val.substring(0, stopIdx).trim();
          }
        }

        if (val) return val;
        
        // If value was pushed to the next line (e.g. <td> tags splitting into newlines)
        if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const isNextLineLabel = stopLabels.some(stop => nextLine.toLowerCase().includes(stop.toLowerCase()));
          if (!isNextLineLabel) return nextLine;
        }
      }
    }
    return null;
  };

  const getSectionHtml = (sectionHeader: string): string => {
    const index = cleanHtml.indexOf(sectionHeader);
    if (index === -1) return cleanHtml;
    return cleanHtml.substring(index, index + 3000);
  };

  // Parse Temporal Data
  const departureMatch = cleanHtml.match(/vertrektijd vanaf huis is:\s*(\d{2}:\d{2})/i);
  const departure_time = departureMatch ? departureMatch[1] : null;

  let shift_date = '';
  let pickup_window = null;
  const dateMatch = cleanHtml.match(/tussen\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})\s+en\s+\d{2}-\d{2}-\d{4}\s+(\d{2}:\d{2})/i);

  if (dateMatch) {
    const [_, dateStr, start, end] = dateMatch;
    const [day, month, year] = dateStr.split('-');
    shift_date = `${year}-${month}-${day}`;
    pickup_window = `${start} - ${end}`;
  } else {
    // Direct DD-MM-YYYY fallback match if 'tussen' structure differs
    const fallbackDate = cleanHtml.match(/(\d{2}-\d{2}-\d{4})/);
    if (fallbackDate) {
      const [day, month, year] = fallbackDate[1].split('-');
      shift_date = `${year}-${month}-${day}`;
    }
  }

  // Parse Vehicle Data
  const type = getTextAfterLabel('Type:');
  const uitvoering = getTextAfterLabel('Uitvoering:');
  const vehicle_model = type ? `${type}${uitvoering ? ' ' + uitvoering : ''}`.trim() : null;

  // Parse Spatial Sections
  const laadSection = getSectionHtml('Laadgegevens voertuig');
  const losSection = getSectionHtml('Losgegevens voertuig');

  return {
    shift_date,
    departure_time,
    pickup_window,
    vehicle_license_plate: getTextAfterLabel('Kenteken:') || '',
    vehicle_make: getTextAfterLabel('Merk:'),
    vehicle_model,
    vehicle_fuel: getTextAfterLabel('Brandstof:'),
    vehicle_color: getTextAfterLabel('Kleur:'),
    pickup_name: getTextAfterLabel('Naam:', laadSection),
    pickup_address: getTextAfterLabel('Adres:', laadSection),
    pickup_postal_city: getTextAfterLabel('Postcode / Plaats:', laadSection),
    dropoff_name: getTextAfterLabel('Naam:', losSection),
    dropoff_address: getTextAfterLabel('Adres:', losSection),
    dropoff_postal_city: getTextAfterLabel('Postcode / Plaats:', losSection)
  };
}

// 3. Standalone RDW Enrichment Fetcher
async function fetchVehicleSpecs(licensePlate: string) {
  if (!licensePlate) return { rdw_make: null, rdw_model: null, vehicle_build_year: null, rdw_cylinders: null, rdw_capacity_cc: null, rdw_power_hp: null, rdw_catalog_price: null };
  const sanitizedPlate = licensePlate.replace(/-/g, '').toUpperCase();

  try {
    const [baseRes, powerRes] = await Promise.all([
      fetch(`https://opendata.rdw.nl/resource/m9d7-ebf2.json?kenteken=${sanitizedPlate}`),
      fetch(`https://opendata.rdw.nl/resource/8ys7-d773.json?kenteken=${sanitizedPlate}`)
    ]);

    const baseData = await baseRes.json();
    const powerData = await powerRes.json();

    let rdw_make: string | null = null;
    let rdw_model: string | null = null;
    let vehicle_build_year: number | null = null;
    let rdw_cylinders: number | null = null;
    let rdw_capacity_cc: number | null = null;
    let rdw_power_hp: number | null = null;
    let rdw_catalog_price: number | null = null;

    if (baseData && baseData.length > 0) {
      const vehicle = baseData[0];
      rdw_make = vehicle.merk || null;
      rdw_model = vehicle.handelsbenaming || null;
      rdw_cylinders = vehicle.aantal_cilinders ? parseInt(vehicle.aantal_cilinders, 10) : null;
      rdw_capacity_cc = vehicle.cilinderinhoud ? parseInt(vehicle.cilinderinhoud, 10) : null;
      rdw_catalog_price = vehicle.catalogusprijs ? parseInt(vehicle.catalogusprijs, 10) : null;
      
      if (vehicle.datum_eerste_toelating && typeof vehicle.datum_eerste_toelating === 'string' && vehicle.datum_eerste_toelating.length >= 4) {
        const parsedYear = parseInt(vehicle.datum_eerste_toelating.slice(0, 4), 10);
        if (!isNaN(parsedYear)) {
          vehicle_build_year = parsedYear;
        }
      }
    }

    if (powerData && Array.isArray(powerData) && powerData.length > 0) {
      const calculatedHpValues: number[] = [];

      powerData.forEach((engine: any) => {
        const rawKw = engine.nettomaximumvermogen || engine.nominaal_continu_maximumvermogen;
        if (rawKw) {
          const kw = parseFloat(rawKw);
          if (!isNaN(kw) && kw > 0) {
            const hp = Math.round(kw * 1.362);
            calculatedHpValues.push(hp);
          }
        }
      });

      if (calculatedHpValues.length > 0) {
        rdw_power_hp = Math.max(...calculatedHpValues);
      }
    }

    return {
      rdw_make,
      rdw_model,
      vehicle_build_year,
      rdw_cylinders,
      rdw_capacity_cc,
      rdw_power_hp,
      rdw_catalog_price
    };
  } catch (error) {
    console.error("RDW API Data Fetch Error:", error);
    return {
      rdw_make: null,
      rdw_model: null,
      vehicle_build_year: null,
      rdw_cylinders: null,
      rdw_capacity_cc: null,
      rdw_power_hp: null,
      rdw_catalog_price: null
    };
  }
}

// 4. Utility Sleep Function
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 5. Main Importer Workflow for .EML Files
async function runImporter() {
  console.log('=== Starting Resilient Bulk .EML Email Importer ===');

  const userId = process.env.ADMIN_USER_ID;
  if (!userId) {
    console.error('[ERROR] Missing ADMIN_USER_ID in environment variables.');
    process.exit(1);
  }

  console.log(`[CONFIG] Target Admin User ID: ${userId}`);

  // 1. Read Target Directory containing .eml files
  const emlDir = path.join(process.cwd(), 'fleetport_emails');
  if (!fs.existsSync(emlDir)) {
    console.error(`[ERROR] Directory '${emlDir}' not found. Please create it and add .eml files.`);
    process.exit(1);
  }

  const files = fs.readdirSync(emlDir).filter(f => f.endsWith('.eml'));
  console.log(`[EML] Found ${files.length} .eml files in ${emlDir}`);

  if (files.length === 0) {
    console.log('[NOTICE] No .eml files found to process.');
    console.log("Batch import complete. Awaiting socket cleanup...");
    await sleep(250);
    process.exit(0);
  }

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // 2. Process Each .EML File Sequentially
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(emlDir, file);

    try {
      const emailBuffer = fs.readFileSync(filePath);
      const parsed = await simpleParser(emailBuffer);

      // Subject Filter Check (Flexible Case-Insensitive Inclusion)
      const subject = (parsed.subject || '').toLowerCase();
      const isTarget = subject.includes('transportopdracht') || subject.includes('transportinstructie');
      
      if (!isTarget) {
        console.log(`[SKIP-SUBJECT] (${file}): Subject "${parsed.subject}" does not contain target keywords.`);
        skipCount++;
        continue;
      }

      const htmlContent = parsed.html || parsed.textAsHtml || parsed.text || '';
      if (!htmlContent) {
        console.log(`[SKIP-NO-HTML] (${file}): Email does not contain HTML or text content.`);
        skipCount++;
        continue;
      }

      const parsedData = parseFleetPortEmailHtml(htmlContent);

      // Subject-Line License Plate Fallback if body parsing failed to extract it
      if (!parsedData.vehicle_license_plate && parsed.subject) {
        const subjPlateMatch = parsed.subject.match(/([A-Z0-9]{1,3}-[A-Z0-9]{1,3}-[A-Z0-9]{1,3})/i);
        if (subjPlateMatch) {
          parsedData.vehicle_license_plate = subjPlateMatch[1].toUpperCase();
        }
      }

      if (!parsedData.vehicle_license_plate || !parsedData.shift_date) {
        console.log(`[SKIP-PARSE-FAIL] (${file}): Could not extract plate or date. Plate: "${parsedData.vehicle_license_plate}", Date: "${parsedData.shift_date}"`);
        errorCount++;
        continue;
      }

      // Check if already exists in Supabase
      const { data: existing } = await supabase
        .from('shifts')
        .select('id')
        .eq('shift_date', parsedData.shift_date)
        .eq('vehicle_license_plate', parsedData.vehicle_license_plate)
        .eq('pickup_name', parsedData.pickup_name || '');

      if (existing && existing.length > 0) {
        console.log(`[SKIP-EXISTS] (${file}): Shift on ${parsedData.shift_date} (${parsedData.vehicle_license_plate}) already logged.`);
        skipCount++;
        continue;
      }

      // Fetch RDW Enrichment
      const rdwData = await fetchVehicleSpecs(parsedData.vehicle_license_plate);

      // Fallback logic for "Niet bekend" vehicle names
      const toTitleCase = (str: string) => str.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.substring(1)).join(' ');
      
      let finalMake = parsedData.vehicle_make || '';
      let finalModel = parsedData.vehicle_model || '';
      const combinedName = `${finalMake} ${finalModel}`.toLowerCase();
      
      if (combinedName.includes('niet bekend') || !finalMake.trim()) {
        if (rdwData.rdw_make) finalMake = toTitleCase(rdwData.rdw_make);
        if (rdwData.rdw_model && combinedName.includes('niet bekend')) finalModel = toTitleCase(rdwData.rdw_model);
      }

      const { rdw_make, rdw_model, ...cleanRdwData } = rdwData;

      let finalHp = cleanRdwData.rdw_power_hp;
      const pkMatch = finalModel.match(/(\d+)\s*pk/i);
      const kwMatch = finalModel.match(/(\d+)\s*kw/i);
      
      if (pkMatch) {
        finalHp = parseInt(pkMatch[1], 10);
      } else if (kwMatch) {
        finalHp = Math.round(parseInt(kwMatch[1], 10) * 1.362);
      }
      
      cleanRdwData.rdw_power_hp = finalHp;

      const payload = {
        ...parsedData,
        ...cleanRdwData,
        vehicle_make: finalMake,
        vehicle_model: finalModel,
        user_id: userId
      };

      const { error: insertError } = await supabase.from('shifts').insert([payload]);

      if (insertError) {
        console.error(`[ERROR] (${file}): Insert failed for ${parsedData.shift_date} (${parsedData.vehicle_license_plate}):`, insertError.message);
        errorCount++;
      } else {
        console.log(`[SUCCESS] (${file}): Logged shift for ${parsedData.shift_date} - ${finalMake} ${finalModel} (${parsedData.vehicle_license_plate})`);
        successCount++;
      }

      // Respect RDW API rate limits
      await sleep(1500);

    } catch (err: any) {
      console.error(`[ERROR] Failed to process ${file}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\n=== Import Finished: ${successCount} inserted, ${skipCount} skipped, ${errorCount} errors ===`);
  console.log("Batch import complete. Awaiting socket cleanup...");
  await sleep(250);
  process.exit(0);
}

runImporter();
