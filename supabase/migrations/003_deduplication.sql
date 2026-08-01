-- Migration 003: Deduplication Constraint on Shifts Table
-- Adds a composite UNIQUE constraint to prevent duplicate shift entries

ALTER TABLE public.shifts
ADD CONSTRAINT shifts_user_id_shift_date_vehicle_license_plate_pickup_name_key
UNIQUE (user_id, shift_date, vehicle_license_plate, pickup_name);
