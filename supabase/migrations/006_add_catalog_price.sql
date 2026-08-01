-- Migration 006: Add rdw_catalog_price to shifts and recreate portfolio_shifts view

-- 1. Add rdw_catalog_price column to shifts table
ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS rdw_catalog_price INT;

-- 2. Recreate sanitized view for standard portfolio visitors including rdw_catalog_price
CREATE OR REPLACE VIEW public.portfolio_shifts AS
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
    '***-**-***' AS vehicle_license_plate -- Masked for privacy
FROM public.shifts;

-- Allow public/authenticated users to read this view safely
GRANT SELECT ON public.portfolio_shifts TO anon, authenticated;
