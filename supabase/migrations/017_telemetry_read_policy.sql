-- Migration 017: Allow read access for authenticated and anon users to trading_telemetry
-- Ensures frontend client role (anon / authenticated) can read trading telemetry without RLS blockage
DROP POLICY IF EXISTS "Allow public/auth read" ON public.trading_telemetry;
CREATE POLICY "Allow public/auth read" 
ON public.trading_telemetry 
FOR SELECT 
USING (true);

