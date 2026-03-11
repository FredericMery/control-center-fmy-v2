-- Add community visibility for memory type definitions
ALTER TABLE public.memory_sections
  ADD COLUMN IF NOT EXISTS is_community BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_memory_sections_is_community
  ON public.memory_sections(is_community);
