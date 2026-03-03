-- Fix memory_items table schema
-- Remove user_id column (not needed, we use section_id -> memory_sections.user_id)

-- 1. Drop old policies that depend on user_id
DROP POLICY IF EXISTS "Users manage own items" ON public.memory_items;
DROP POLICY IF EXISTS "Users can read own items" ON public.memory_items;
DROP POLICY IF EXISTS "Users can create own items" ON public.memory_items;
DROP POLICY IF EXISTS "Users can update own items" ON public.memory_items;
DROP POLICY IF EXISTS "Users can delete own items" ON public.memory_items;

-- 2. Drop the user_id column
ALTER TABLE public.memory_items 
DROP COLUMN IF EXISTS user_id CASCADE;

-- Note: The correct RLS policies (via section ownership) already exist from the original schema
-- No need to recreate them

-- Verify the table structure is correct
-- Should have: id, section_id, item_title, archived, created_at, updated_at
