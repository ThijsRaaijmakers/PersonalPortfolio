-- Migration 010: Privacy Lockdown - Drop portfolio_shifts view & restrict shifts RLS to Admin only

-- 1. Drop public view to eliminate passive data leakage
DROP VIEW IF EXISTS public.portfolio_shifts;

-- 2. Enable RLS on public.shifts table
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing RLS policies on public.shifts
DROP POLICY IF EXISTS "Allow anon select portfolio" ON public.shifts;
DROP POLICY IF EXISTS "Allow authenticated select portfolio" ON public.shifts;
DROP POLICY IF EXISTS "Allow public read access" ON public.shifts;
DROP POLICY IF EXISTS "Admin full access shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admin select shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admin insert shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admin update shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admin delete shifts" ON public.shifts;

-- 4. Create strict Admin-only SELECT policy
CREATE POLICY "Admin select shifts" 
ON public.shifts 
FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- 5. Create Admin INSERT, UPDATE, DELETE policies
CREATE POLICY "Admin insert shifts" 
ON public.shifts 
FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admin update shifts" 
ON public.shifts 
FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admin delete shifts" 
ON public.shifts 
FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
