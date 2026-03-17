-- Fix: duplicate triggers both call auto_create_beds() on rooms INSERT
-- Migration 20260308210221 created trigger: auto_create_beds_trigger
-- Migration 20260308211818 created trigger: trg_auto_create_beds
-- Both fire on AFTER INSERT ON rooms, causing duplicate bed inserts
-- which violates beds_room_id_bed_number_unique constraint.
-- Drop the duplicate trigger, keep only trg_auto_create_beds.

DROP TRIGGER IF EXISTS auto_create_beds_trigger ON public.rooms;
