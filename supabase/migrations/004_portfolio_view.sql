-- Create a sanitized view for standard portfolio visitors
CREATE OR REPLACE VIEW public.portfolio_shifts AS
SELECT 
    id,
    shift_date,
    vehicle_make,
    vehicle_model,
    vehicle_fuel,
    vehicle_color,
    rdw_cylinders,
    rdw_capacity_cc,
    rdw_power_hp,
    pickup_postal_city,
    dropoff_postal_city,
    '***-**-***' AS vehicle_license_plate -- Masked for privacy
FROM public.shifts;

-- Allow public/authenticated users to read this view safely
GRANT SELECT ON public.portfolio_shifts TO anon, authenticated;
