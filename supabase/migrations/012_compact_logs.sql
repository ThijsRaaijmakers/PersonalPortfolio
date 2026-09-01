-- Migration 012: Compact Admin Logs Metadata for Shift Added Event

CREATE OR REPLACE FUNCTION public.log_shift_added()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.admin_logs (event_type, description, metadata)
    VALUES (
        'SHIFT_ADDED',
        'New FleetPort shift added for ' || COALESCE(NEW.shift_date::text, 'unknown date'),
        jsonb_build_object(
            'shift_date', NEW.shift_date,
            'vehicle_license_plate', NEW.vehicle_license_plate
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
