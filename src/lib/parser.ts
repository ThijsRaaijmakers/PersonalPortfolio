import type { FleetPortShift } from './types/shift';
import { parseHTML } from 'linkedom';

export function parseFleetPortEmail(htmlString: string): Partial<FleetPortShift> {
  let doc: any;
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    doc = parser.parseFromString(htmlString, 'text/html');
  } else {
    doc = parseHTML(htmlString).document;
  }

  const decodeEntities = (str: string) => {
    if (!str) return '';
    return str
      .replace(/&#039;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">");
  };

  // Helper to extract text from the <td> immediately following a <b> or <strong> tag
  const getTextAfterNode = (searchString: string, context: any = doc): string | null => {
    const bTags = Array.from(context.querySelectorAll('b, strong')) as any[];
    const targetB = bTags.find(b => b.textContent?.trim().includes(searchString));
    
    if (!targetB) return null;
    
    const parentTd = targetB.closest('td');
    if (parentTd && parentTd.nextElementSibling) {
      // Replace non-breaking spaces and normalize whitespace
      return parentTd.nextElementSibling.textContent?.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim() || null;
    }
    return null;
  };

  // Helper to isolate specific tables (e.g., Pickup vs Dropoff)
  const getTableByHeader = (headerText: string): any | null => {
    const bTags = Array.from(doc.querySelectorAll('b, strong')) as any[];
    const header = bTags.find(b => b.textContent?.trim().includes(headerText));
    return header ? header.closest('table') : null;
  };

  // 1. Parse Temporal Data using Regex
  const departureMatch = htmlString.match(/vertrektijd vanaf huis is:\s*(\d{2}:\d{2})/i);
  const departure_time = departureMatch ? departureMatch[1] : null;

  let shift_date = '';
  let pickup_window = null;
  // Matches: "tussen 22-07-2026 06:00 en 22-07-2026 17:00"
  const dateMatch = htmlString.match(/tussen\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}:\d{2})\s+en\s+\d{2}-\d{2}-\d{4}\s+(\d{2}:\d{2})/i);
  if (dateMatch) {
    const [_, dateStr, start, end] = dateMatch;
    const [day, month, year] = dateStr.split('-');
    shift_date = `${year}-${month}-${day}`; // Convert to Postgres YYYY-MM-DD
    pickup_window = `${start} -${end}`;
  }

  // 2. Parse Vehicle Data
  const type = getTextAfterNode('Type:');
  const uitvoering = getTextAfterNode('Uitvoering:');
  const vehicle_model = type ? `${type}${uitvoering ? uitvoering : ''}`.trim() : null;

  // 3. Parse Spatial Data (Isolate tables to prevent cross-contamination)
  const laadTable = getTableByHeader('Laadgegevens voertuig');
  const losTable = getTableByHeader('Losgegevens voertuig');

  const rawPickupAddress = laadTable ? getTextAfterNode('Adres:', laadTable) : null;
  const rawPickupPostalCity = laadTable ? getTextAfterNode('Postcode / Plaats:', laadTable) : null;
  const rawDropoffAddress = losTable ? getTextAfterNode('Adres:', losTable) : null;
  const rawDropoffPostalCity = losTable ? getTextAfterNode('Postcode / Plaats:', losTable) : null;

  const pickup_address = rawPickupAddress ? decodeEntities(rawPickupAddress) : null;
  const pickup_postal_city = rawPickupPostalCity 
    ? decodeEntities(rawPickupPostalCity).replace(/^[A-Z0-9]{6}\s+/i, '') 
    : null;

  const dropoff_address = rawDropoffAddress ? decodeEntities(rawDropoffAddress) : null;
  const dropoff_postal_city = rawDropoffPostalCity 
    ? decodeEntities(rawDropoffPostalCity).replace(/^[A-Z0-9]{6}\s+/i, '') 
    : null;

  return {
    shift_date,
    departure_time,
    pickup_window,
    
    vehicle_license_plate: getTextAfterNode('Kenteken:') || '',
    vehicle_make: getTextAfterNode('Merk:'),
    vehicle_model,
    vehicle_fuel: getTextAfterNode('Brandstof:'),
    vehicle_color: getTextAfterNode('Kleur:'),
    
    pickup_name: laadTable ? getTextAfterNode('Naam:', laadTable) : null,
    pickup_address,
    pickup_postal_city,
    
    dropoff_name: losTable ? getTextAfterNode('Naam:', losTable) : null,
    dropoff_address,
    dropoff_postal_city,
  };
}
