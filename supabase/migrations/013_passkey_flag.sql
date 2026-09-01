-- Add passkey tracking flag to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_passkey BOOLEAN DEFAULT false;
