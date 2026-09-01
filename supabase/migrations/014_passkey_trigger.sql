-- Automated Security Logging for Passkey Registrations
CREATE OR REPLACE FUNCTION public.log_passkey_added() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.has_passkey = true AND (OLD.has_passkey = false OR OLD.has_passkey IS NULL) THEN
        INSERT INTO public.admin_logs (event_type, description, metadata)
        VALUES (
            'SECURITY_UPGRADE',
            'User registered a biometric passkey',
            jsonb_build_object('user_id', NEW.id, 'email', NEW.email)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_passkey_added ON public.profiles;

CREATE TRIGGER on_passkey_added
    AFTER UPDATE OF has_passkey ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.log_passkey_added();
