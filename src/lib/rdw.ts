export async function fetchVehicleSpecs(licensePlate: string) {
  if (!licensePlate) return null;

  // The RDW API requires license plates to be uppercase and without dashes
  const sanitizedPlate = licensePlate.replace(/-/g, '').toUpperCase();

  try {
    // We use Promise.all to fetch from both datasets concurrently for maximum speed
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

    // 1. Extract Build Year, Cylinders, Engine Capacity, Make, Model, and Catalog Price (Base Dataset)
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

    // 2. Extract Power for all engines and find maximum HP (Fuel/Power Dataset)
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
    // Fail gracefully so the shift can still be logged even if the API goes down
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
