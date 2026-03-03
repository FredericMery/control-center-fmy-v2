-- Add slug column to memory_sections
-- Run this if you already have memory_sections table without slug

-- 1. Add slug column (nullable first to handle existing data)
ALTER TABLE public.memory_sections 
ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Generate slugs for existing sections
UPDATE public.memory_sections
SET slug = LOWER(REPLACE(REPLACE(section_name, ' ', '-'), '''', '')) || '-' || SUBSTRING(id::TEXT, 1, 8)
WHERE slug IS NULL;

-- 3. Make slug NOT NULL and UNIQUE
ALTER TABLE public.memory_sections 
ALTER COLUMN slug SET NOT NULL;

ALTER TABLE public.memory_sections 
ADD CONSTRAINT memory_sections_slug_unique UNIQUE (slug);

-- 4. Add index for performance
CREATE INDEX IF NOT EXISTS idx_memory_sections_slug ON public.memory_sections(slug);
