-- ================================================
-- 📚 MEMORY SYSTEM - DATABASE SCHEMA
-- ================================================

-- 1. Memory Sections (templates + user instances)
CREATE TABLE IF NOT EXISTS public.memory_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Template reference
  template_id TEXT, -- ID from MEMORY_TEMPLATES
  section_name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  
  -- Configuration
  is_custom BOOLEAN DEFAULT false,
  items_count INTEGER DEFAULT 0,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Memory Fields (schema for each section)
CREATE TABLE IF NOT EXISTS public.memory_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.memory_sections(id) ON DELETE CASCADE,
  
  -- Field definition
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL, -- text, textarea, number, date, url, email, phone, select, tags, location, rating
  
  -- Configuration
  field_order INTEGER DEFAULT 0,
  is_required BOOLEAN DEFAULT false,
  is_searchable BOOLEAN DEFAULT false, -- Used in computed search field
  
  -- For select fields
  options TEXT[] DEFAULT NULL, -- Array of options
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Memory Items (entries in a section)
CREATE TABLE IF NOT EXISTS public.memory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.memory_sections(id) ON DELETE CASCADE,
  
  -- Title/name
  item_title TEXT NOT NULL,
  
  -- Metadata
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Memory Item Values (actual field values)
CREATE TABLE IF NOT EXISTS public.memory_item_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.memory_items(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.memory_fields(id) ON DELETE CASCADE,
  
  -- Value stored as TEXT
  field_value TEXT DEFAULT NULL,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(item_id, field_id)
);

-- ================================================
-- 🔐 ROW LEVEL SECURITY
-- ================================================

ALTER TABLE public.memory_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memory_item_values ENABLE ROW LEVEL SECURITY;

-- Memory Sections: Users can only see their own
CREATE POLICY "Users can read own memory_sections" 
  ON public.memory_sections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create memory_sections" 
  ON public.memory_sections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own memory_sections" 
  ON public.memory_sections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own memory_sections" 
  ON public.memory_sections FOR DELETE USING (auth.uid() = user_id);

-- Memory Fields: Accessible via section
CREATE POLICY "Users can read fields from own sections" 
  ON public.memory_fields FOR SELECT USING (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create fields in own sections" 
  ON public.memory_fields FOR INSERT WITH CHECK (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update fields in own sections" 
  ON public.memory_fields FOR UPDATE USING (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete fields in own sections" 
  ON public.memory_fields FOR DELETE USING (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );

-- Memory Items: Accessible via section
CREATE POLICY "Users can read items from own sections" 
  ON public.memory_items FOR SELECT USING (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "Users can create items in own sections" 
  ON public.memory_items FOR INSERT WITH CHECK (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "Users can update items in own sections" 
  ON public.memory_items FOR UPDATE USING (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );
CREATE POLICY "Users can delete items in own sections" 
  ON public.memory_items FOR DELETE USING (
    section_id IN (
      SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
    )
  );

-- Memory Item Values: Accessible via item/section ownership
CREATE POLICY "Users can read values from own items" 
  ON public.memory_item_values FOR SELECT USING (
    item_id IN (
      SELECT id FROM public.memory_items 
      WHERE section_id IN (
        SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Users can create values in own items" 
  ON public.memory_item_values FOR INSERT WITH CHECK (
    item_id IN (
      SELECT id FROM public.memory_items 
      WHERE section_id IN (
        SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Users can update values in own items" 
  ON public.memory_item_values FOR UPDATE USING (
    item_id IN (
      SELECT id FROM public.memory_items 
      WHERE section_id IN (
        SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
      )
    )
  );
CREATE POLICY "Users can delete values in own items" 
  ON public.memory_item_values FOR DELETE USING (
    item_id IN (
      SELECT id FROM public.memory_items 
      WHERE section_id IN (
        SELECT id FROM public.memory_sections WHERE user_id = auth.uid()
      )
    )
  );

-- ================================================
-- 📑 INDEXES FOR PERFORMANCE
-- ================================================

CREATE INDEX IF NOT EXISTS idx_memory_sections_user ON public.memory_sections(user_id);
CREATE INDEX IF NOT EXISTS idx_memory_fields_section ON public.memory_fields(section_id);
CREATE INDEX IF NOT EXISTS idx_memory_items_section ON public.memory_items(section_id);
CREATE INDEX IF NOT EXISTS idx_memory_item_values_item ON public.memory_item_values(item_id);
CREATE INDEX IF NOT EXISTS idx_memory_item_values_field ON public.memory_item_values(field_id);
