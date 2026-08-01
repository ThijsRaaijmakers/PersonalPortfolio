-- Migration 008: Add lat/lng coordinates to shifts table and update portfolio_shifts view

-- 1. Add coordinate columns to public.shifts table
ALTER TABLE public.shifts 
  ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION;

-- 2. Drop and recreate public.portfolio_shifts view including coordinate columns
DROP VIEW IF EXISTS public.portfolio_shifts;

CREATE VIEW public.portfolio_shifts AS
SELECT 
    id,
    shift_date,
    vehicle_make,
    vehicle_model,
    vehicle_fuel,
    vehicle_color,
    vehicle_build_year,
    rdw_cylinders,
    rdw_capacity_cc,
    rdw_power_hp,
    rdw_catalog_price,
    pickup_postal_city,
    dropoff_postal_city,
    pickup_lat,
    pickup_lng,
    dropoff_lat,
    dropoff_lng,
    '***-**-***' AS vehicle_license_plate -- Masked for privacy
FROM public.shifts;

-- 3. Grant SELECT permissions on view to anon and authenticated users
GRANT SELECT ON public.portfolio_shifts TO anon, authenticated;
