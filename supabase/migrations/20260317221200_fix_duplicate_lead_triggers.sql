-- Fix: "stack depth limit exceeded" when creating a lead.
--
-- Root cause: Duplicate triggers on the 'leads' table created by two migrations:
--   Migration 20260308174530 created: lead_auto_score, trg_lead_status_change, trg_lead_agent_change
--   Migration 20260308211818 re-created: trg_auto_score_lead, trg_log_lead_status, trg_log_lead_agent
--
-- CRITICAL: trg_auto_score_lead (20260308211818) has NO column filter (fires on ANY update),
-- while lead_auto_score (20260308174530) is restricted to specific columns.
-- calculate_lead_score() does: UPDATE leads SET lead_score = v_score
-- This UPDATE fires trg_auto_score_lead again → infinite recursion → stack depth exceeded.
--
-- Fix: Drop all duplicate triggers from migration 20260308211818.
-- Keep the originals from 20260308174530 which have proper column-restricted filters.

-- Drop the unfiltered duplicate that causes infinite recursion (critical fix)
DROP TRIGGER IF EXISTS trg_auto_score_lead ON public.leads;

-- Drop duplicate status/agent log triggers (cause double activity_log entries)
DROP TRIGGER IF EXISTS trg_log_lead_status ON public.leads;
DROP TRIGGER IF EXISTS trg_log_lead_agent ON public.leads;

-- Drop duplicate visit log trigger
DROP TRIGGER IF EXISTS trg_log_visit ON public.visits;

-- Drop duplicate room status confirm trigger
DROP TRIGGER IF EXISTS trg_room_status_confirm ON public.room_status_log;

-- Drop duplicate bed status log trigger
DROP TRIGGER IF EXISTS trg_log_bed_status ON public.beds;
