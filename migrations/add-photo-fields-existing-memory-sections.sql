-- Add a photo field to existing memory sections that do not already have one

INSERT INTO public.memory_fields (
  section_id,
  field_label,
  field_type,
  field_order,
  is_required,
  is_searchable,
  options
)
SELECT
  s.id,
  CASE
    WHEN s.template_id = 'movies' THEN 'Affiche / Photo'
    ELSE 'Photo'
  END AS field_label,
  'url' AS field_type,
  COALESCE(MAX(f.field_order), -1) + 1 AS field_order,
  false,
  false,
  NULL
FROM public.memory_sections s
LEFT JOIN public.memory_fields f ON f.section_id = s.id
WHERE s.template_id IN ('wines', 'spirits', 'restaurants', 'books', 'movies', 'contacts', 'ideas', 'learnings')
  AND NOT EXISTS (
    SELECT 1
    FROM public.memory_fields f2
    WHERE f2.section_id = s.id
      AND (
        LOWER(f2.field_label) LIKE '%photo%'
        OR LOWER(f2.field_label) LIKE '%image%'
        OR LOWER(f2.field_label) LIKE '%affiche%'
      )
  )
GROUP BY s.id, s.template_id;
