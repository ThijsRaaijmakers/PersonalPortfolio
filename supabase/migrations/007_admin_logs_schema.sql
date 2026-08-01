-- Migration 007: Admin Activity Log Table, RLS Policies, and Automated Audit Triggers

-- 1. Create admin_logs table
CREATE TABLE IF NOT EXISTS public.admin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy: ONLY users with admin privileges can SELECT from admin_logs
DROP POLICY IF EXISTS "Admins can view admin logs" ON public.admin_logs;
CREATE POLICY "Admins can view admin logs"
ON public.admin_logs
FOR SELECT
USING (
    public.is_admin() OR 
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin') OR
    (auth.jwt() -> 'user_metadata' ->> 'role' = 'admin')
);

-- 4. Function and Trigger on shifts table (AFTER INSERT)
CREATE OR REPLACE FUNCTION public.log_shift_added()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.admin_logs (event_type, description, metadata)
    VALUES (
        'SHIFT_ADDED',
        'New FleetPort shift added for ' || COALESCE(NEW.shift_date::text, 'unknown date'),
        jsonb_build_object(
            'shift_id', NEW.id,
            'user_id', NEW.user_id,
            'shift_date', NEW.shift_date,
            'vehicle_license_plate', NEW.vehicle_license_plate
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_shift_added ON public.shifts;
CREATE TRIGGER on_shift_added
    AFTER INSERT ON public.shifts
    FOR EACH ROW
    EXECUTE FUNCTION public.log_shift_added();

-- 5. Function and Trigger on auth.users table (AFTER INSERT)
CREATE OR REPLACE FUNCTION public.log_user_registered()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.admin_logs (event_type, description, metadata)
    VALUES (
        'USER_REGISTERED',
        'New user registered with email: ' || COALESCE(NEW.email, 'unknown'),
        jsonb_build_object(
            'user_id', NEW.id,
            'email', NEW.email
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_user_registered ON auth.users;
CREATE TRIGGER on_user_registered
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.log_user_registered();
