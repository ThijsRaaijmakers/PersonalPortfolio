export interface FleetPortShift {
  id?: string;
  user_id?: string;
  
  // Temporal
  shift_date: string; // YYYY-MM-DD
  departure_time: string | null; // HH:MM
  pickup_window: string | null;
  
  // Vehicle
  vehicle_license_plate: string;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_fuel: string | null;
  vehicle_color: string | null;
  vehicle_build_year: number | null;
  
  // RDW Enriched
  rdw_cylinders: number | null;
  rdw_capacity_cc: number | null;
  rdw_power_hp: number | null;
  rdw_catalog_price: number | null;
  
  // Pickup
  pickup_name: string | null;
  pickup_address: string | null;
  pickup_postal_city: string | null;
  
  // Dropoff
  dropoff_name: string | null;
  dropoff_address: string | null;
  dropoff_postal_city: string | null;
}
