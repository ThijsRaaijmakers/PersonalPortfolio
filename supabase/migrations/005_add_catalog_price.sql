-- Migration 006: Add catalog price to shifts and recreate portfolio_shifts view

-- 1. Add rdw_catalog_price column to shifts table
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS rdw_catalog_price INT;

-- 2. Drop the existing view
DROP VIEW IF EXISTS public.portfolio_shifts;

-- 3. Recreate sanitized view including rdw_catalog_price
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
    '***-**-***' AS vehicle_license_plate
FROM public.shifts;

-- 4. Re-grant permissions
GRANT SELECT ON public.portfolio_shifts TO anon, authenticated;