-- Migration 002: FleetPort Shifts Schema & RLS

CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    
    -- Temporal Data
    shift_date DATE NOT NULL,
    departure_time TIME,
    pickup_window TEXT,
    
    -- Vehicle Data (From Email)
    vehicle_license_plate TEXT NOT NULL,
    vehicle_make TEXT,
    vehicle_model TEXT,
    vehicle_fuel TEXT,
    vehicle_color TEXT,
    
    -- Vehicle Data (Enriched via RDW)
    rdw_cylinders INTEGER,
    rdw_capacity_cc INTEGER,
    rdw_power_hp INTEGER,
    
    -- Spatial Data (Pickup)
    pickup_name TEXT,
    pickup_address TEXT,
    pickup_postal_city TEXT,
    
    -- Spatial Data (Dropoff)
    dropoff_name TEXT,
    dropoff_address TEXT,
    dropoff_postal_city TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Strict Admin-Only Policies
CREATE POLICY "Admins have full access to shifts" 
ON public.shifts FOR ALL 
USING (public.is_admin()) 
WITH CHECK (public.is_admin());
