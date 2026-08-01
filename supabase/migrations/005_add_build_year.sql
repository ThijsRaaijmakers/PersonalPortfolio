-- Migration 005: Add vehicle_build_year to shifts and recreate portfolio_shifts view

-- 1. Add vehicle_build_year column to shifts table
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS vehicle_build_year INT;

-- 2. Drop the existing view so Postgres allows the new column order
DROP VIEW IF EXISTS public.portfolio_shifts;

-- 3. Recreate sanitized view for standard portfolio visitors
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
    pickup_postal_city,
    dropoff_postal_city,
    '***-**-***' AS vehicle_license_plate -- Masked for privacy
FROM public.shifts;

-- 4. Re-grant permissions
GRANT SELECT ON public.portfolio_shifts TO anon, authenticated;