# 🚀 Migration: Ajouter le slug aux sections mémoire

## Étapes à suivre:

1. **Ouvre Supabase Dashboard**
   - Va sur https://supabase.com
   - Sélectionne ton projet
   - Va dans "SQL Editor"

2. **Exécute cette migration** (copie-colle tout):

```sql
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
```

3. **Clique sur "Run"**

4. **Vérifie que ça a marché** (dans SQL Editor):
```sql
SELECT section_name, slug FROM public.memory_sections;
```

## 🔍 Debugging

Si après ça tu as encore l'erreur "Impossible de créer la carte":

1. Ouvre la console du navigateur (F12)
2. Va sur l'onglet "Console"
3. Essaie de créer une carte
4. Tu verras des logs du type:
   ```
   [fetchItemsBySectionId] Loading items for section: xxx
   [fetchItemsBySectionId] Found 0 items
   [fetchItemsBySectionId] Found X fields
   [createItem] Creating item: xxx for section: xxx
   [createItem] Error: ...
   ```

Envoie-moi les logs et je pourrai t'aider plus précisément !
