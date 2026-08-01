-- Migration 011: Repair shifts table RLS policies for Admin SELECT access

-- 1. Drop existing SELECT policies on public.shifts
DROP POLICY IF EXISTS "Admins can view shifts" ON public.shifts;
DROP POLICY IF EXISTS "Admin select shifts" ON public.shifts;

-- 2. Create explicit Admin SELECT policy checking public.profiles
CREATE POLICY "Admins can view shifts" 
ON public.shifts 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.id = auth.uid() 
    AND profiles.role = 'admin'
  )
);
