import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import { useAuthStore } from './authStore';
import type { Database } from '../types/database';
import { MEMORY_TEMPLATES } from '@/lib/memoryTemplates';

type MemorySection = Database['public']['Tables']['memory_sections']['Row'];
type MemoryField = Database['public']['Tables']['memory_fields']['Row'];
type MemoryItem = Database['public']['Tables']['memory_items']['Row'];
type MemoryItemValue = Database['public']['Tables']['memory_item_values']['Row'];

export interface MemoryState {
  // Sections
  sections: MemorySection[];
  loadingSections: boolean;
  fetchSections: () => Promise<void>;
  createSection: (templateId: string, name?: string) => Promise<MemorySection | null>;
  deleteSection: (sectionId: string) => Promise<void>;
  updateSection: (sectionId: string, updates: Partial<MemorySection>) => Promise<void>;

  // Fields
  fields: MemoryField[];
  getFieldsBySectionId: (sectionId: string) => MemoryField[];
  addField: (sectionId: string, field: Omit<MemoryField, 'id' | 'section_id' | 'created_at'>) => Promise<MemoryField | null>;
  deleteField: (fieldId: string) => Promise<void>;

  // Items
  items: MemoryItem[];
  loadingItems: boolean;
  fetchItemsBySectionId: (sectionId: string) => Promise<void>;
  createItem: (sectionId: string, title: string) => Promise<MemoryItem | null>;
  deleteItem: (itemId: string) => Promise<void>;
  updateItem: (itemId: string, updates: Partial<MemoryItem>) => Promise<void>;

  // Item Values
  itemValues: MemoryItemValue[];
  getValuesByItemId: (itemId: string) => MemoryItemValue[];
  setItemValue: (itemId: string, fieldId: string, value: string | null) => Promise<void>;
  deleteItemValue: (valueId: string) => Promise<void>;

  // Search & Filter
  searchItems: (sectionId: string, query: string) => MemoryItem[];
  getItemWithValues: (itemId: string) => (MemoryItem & { values: MemoryItemValue[] }) | null;

  // Realtime
  subscribeToSection: (sectionId: string, callback: () => void) => void;
  unsubscribeFromSection: (sectionId: string) => void;
  subscriptions: Map<string, any>;
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  sections: [],
  loadingSections: false,
  fields: [],
  items: [],
  loadingItems: false,
  itemValues: [],
  subscriptions: new Map(),

  // ============ SECTIONS ============
  fetchSections: async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;

    set({ loadingSections: true });
    try {
      const { data, error } = await supabase
        .from('memory_sections')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      set({ sections: data || [] });
    } catch (error) {
      console.error('Failed to fetch memory sections:', error);
      set({ sections: [] });
    } finally {
      set({ loadingSections: false });
    }
  },

  createSection: async (templateId: string, name?: string) => {
    const user = useAuthStore.getState().user;
    if (!user) {
      console.error('createSection: No user logged in');
      return null;
    }

    try {
      const template = MEMORY_TEMPLATES[templateId];
      if (!template) {
        console.error(`createSection: Template not found for templateId: ${templateId}`);
        return null;
      }

      console.log(`Creating section with template: ${templateId}, name: ${name || template.name}`);

      // Generate a unique slug from name
      const sectionName = name || template.name || templateId;
      const slug = sectionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        + '-' + Date.now().toString(36);

      const section = {
        user_id: user.id,
        template_id: templateId,
        section_name: sectionName,
        slug: slug,
        description: template.description || '',
      };

      const { data, error } = await supabase
        .from('memory_sections')
        .insert([section])
        .select()
        .single();

      if (error) {
        console.error('Failed to insert memory_sections:', error);
        throw error;
      }

      console.log('Section created:', data);

      // Create fields from local template definition
      if (template?.fields?.length) {
        const fieldsToCreate = template.fields.map((field, index) => ({
          section_id: data.id,
          field_label: field.label,
          field_type: field.field_type,
          field_order: index,
          is_required: field.is_required ?? false,
          is_searchable: field.is_searchable ?? false,
          options: field.options ?? null,
        }));

        console.log(`Creating ${fieldsToCreate.length} fields for section ${data.id}`);

        const { error: fieldsError } = await supabase.from('memory_fields').insert(fieldsToCreate);
        if (fieldsError) {
          console.error('Failed to create template fields:', fieldsError);
        } else {
          console.log('Fields created successfully');
        }
      }

      set((state) => ({
        sections: [...state.sections, data],
      }));

      return data;
    } catch (error) {
      console.error('Failed to create memory section:', error);
      return null;
    }
  },

  deleteSection: async (sectionId: string) => {
    try {
      const { error } = await supabase
        .from('memory_sections')
        .delete()
        .eq('id', sectionId);

      if (error) throw error;

      set((state) => ({
        sections: state.sections.filter((s) => s.id !== sectionId),
      }));
    } catch (error) {
      console.error('Failed to delete memory section:', error);
    }
  },

  updateSection: async (sectionId: string, updates: Partial<MemorySection>) => {
    try {
      const { error } = await supabase
        .from('memory_sections')
        .update(updates)
        .eq('id', sectionId);

      if (error) throw error;

      set((state) => ({
        sections: state.sections.map((s) =>
          s.id === sectionId ? { ...s, ...updates } : s
        ),
      }));
    } catch (error) {
      console.error('Failed to update memory section:', error);
    }
  },

  // ============ FIELDS ============
  getFieldsBySectionId: (sectionId: string) => {
    return get().fields.filter((f) => f.section_id === sectionId);
  },

  addField: async (sectionId: string, field: Omit<MemoryField, 'id' | 'section_id' | 'created_at'>) => {
    try {
      const { data, error } = await supabase
        .from('memory_fields')
        .insert([{ section_id: sectionId, ...field }])
        .select()
        .single();

      if (error) throw error;

      set((state) => ({
        fields: [...state.fields, data],
      }));

      return data;
    } catch (error) {
      console.error('Failed to add field:', error);
      return null;
    }
  },

  deleteField: async (fieldId: string) => {
    try {
      const { error } = await supabase
        .from('memory_fields')
        .delete()
        .eq('id', fieldId);

      if (error) throw error;

      set((state) => ({
        fields: state.fields.filter((f) => f.id !== fieldId),
      }));
    } catch (error) {
      console.error('Failed to delete field:', error);
    }
  },

  // ============ ITEMS ============
  fetchItemsBySectionId: async (sectionId: string) => {
    set({ loadingItems: true });
    try {
      console.log(`[fetchItemsBySectionId] Loading items for section: ${sectionId}`);
      
      // Fetch items
      const { data: items, error: itemsError } = await supabase
        .from('memory_items')
        .select('*')
        .eq('section_id', sectionId)
        .order('created_at', { ascending: false });

      if (itemsError) throw itemsError;

      console.log(`[fetchItemsBySectionId] Found ${items?.length || 0} items`);

      // Fetch fields for this section
      const { data: fields, error: fieldsError } = await supabase
        .from('memory_fields')
        .select('*')
        .eq('section_id', sectionId)
        .order('field_order', { ascending: true });

      if (fieldsError) throw fieldsError;

      console.log(`[fetchItemsBySectionId] Found ${fields?.length || 0} fields`);

      // Fetch all values for these items
      if (items && items.length > 0) {
        const itemIds = items.map((i) => i.id);
        const { data: values, error: valuesError } = await supabase
          .from('memory_item_values')
          .select('*')
          .in('item_id', itemIds);

        if (valuesError) throw valuesError;

        set((state) => ({
          items: [...state.items.filter((i) => i.section_id !== sectionId), ...(items || [])],
          itemValues: [...state.itemValues.filter((v) => !itemIds.includes(v.item_id)), ...(values || [])],
          fields: [...state.fields.filter((f) => f.section_id !== sectionId), ...(fields || [])],
        }));
      } else {
        // No items yet, but still update fields
        set((state) => ({
          items: state.items.filter((i) => i.section_id !== sectionId),
          fields: [...state.fields.filter((f) => f.section_id !== sectionId), ...(fields || [])],
        }));
      }
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      set({ loadingItems: false });
    }
  },

  createItem: async (sectionId: string, title: string) => {
    console.log(`[createItem] Creating item: ${title} for section: ${sectionId}`);
    
    try {
      const { data, error } = await supabase
        .from('memory_items')
        .insert([{ section_id: sectionId, item_title: title }])
        .select()
        .single();

      if (error) {
        console.error('[createItem] Error:', error);
        throw error;
      }

      console.log('[createItem] Item created successfully:', data);

      set((state) => ({
        items: [...state.items, data],
      }));

      return data;
    } catch (error) {
      console.error('[createItem] Failed to create item:', error);
      return null;
    }
  },

  deleteItem: async (itemId: string) => {
    try {
      const { error } = await supabase
        .from('memory_items')
        .delete()
        .eq('id', itemId);

      if (error) throw error;

      set((state) => ({
        items: state.items.filter((i) => i.id !== itemId),
        itemValues: state.itemValues.filter((v) => v.item_id !== itemId),
      }));
    } catch (error) {
      console.error('Failed to delete item:', error);
    }
  },

  updateItem: async (itemId: string, updates: Partial<MemoryItem>) => {
    try {
      const { error } = await supabase
        .from('memory_items')
        .update(updates)
        .eq('id', itemId);

      if (error) throw error;

      set((state) => ({
        items: state.items.map((i) =>
          i.id === itemId ? { ...i, ...updates } : i
        ),
      }));
    } catch (error) {
      console.error('Failed to update item:', error);
    }
  },

  // ============ ITEM VALUES ============
  getValuesByItemId: (itemId: string) => {
    return get().itemValues.filter((v) => v.item_id === itemId);
  },

  setItemValue: async (itemId: string, fieldId: string, value: string | null) => {
    try {
      // Check if value exists
      const existing = get().itemValues.find(
        (v) => v.item_id === itemId && v.field_id === fieldId
      );

      if (existing && !value) {
        // Delete if exists and value is null
        await get().deleteItemValue(existing.id);
        return;
      }

      if (existing) {
        // Update
        const { error } = await supabase
          .from('memory_item_values')
          .update({ field_value: value })
          .eq('id', existing.id);

        if (error) throw error;

        set((state) => ({
          itemValues: state.itemValues.map((v) =>
            v.id === existing.id ? { ...v, field_value: value } : v
          ),
        }));
      } else if (value) {
        // Create
        const { data, error } = await supabase
          .from('memory_item_values')
          .insert([{ item_id: itemId, field_id: fieldId, field_value: value }])
          .select()
          .single();

        if (error) throw error;

        set((state) => ({
          itemValues: [...state.itemValues, data],
        }));
      }
    } catch (error) {
      console.error('Failed to set item value:', error);
    }
  },

  deleteItemValue: async (valueId: string) => {
    try {
      const { error } = await supabase
        .from('memory_item_values')
        .delete()
        .eq('id', valueId);

      if (error) throw error;

      set((state) => ({
        itemValues: state.itemValues.filter((v) => v.id !== valueId),
      }));
    } catch (error) {
      console.error('Failed to delete item value:', error);
    }
  },

  // ============ SEARCH & FILTER ============
  searchItems: (sectionId: string, query: string) => {
    const state = get();
    const items = state.items.filter((i) => i.section_id === sectionId);

    if (!query.trim()) return items;

    const lowerQuery = query.toLowerCase();
    return items.filter((item) => {
      // Search in title
      if (item.item_title?.toLowerCase().includes(lowerQuery)) return true;

      // Search in field values
      const values = state.itemValues.filter((v) => v.item_id === item.id);
      return values.some((v) => v.field_value?.toLowerCase().includes(lowerQuery));
    });
  },

  getItemWithValues: (itemId: string) => {
    const item = get().items.find((i) => i.id === itemId);
    if (!item) return null;

    const values = get().itemValues.filter((v) => v.item_id === itemId);
    return { ...item, values };
  },

  // ============ REALTIME ============
  subscribeToSection: (sectionId: string, callback: () => void) => {
    const subscription = supabase
      .channel(`memory:${sectionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'memory_items',
          filter: `section_id=eq.${sectionId}`,
        },
        callback
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'memory_item_values',
        },
        callback
      )
      .subscribe();

    set((state) => {
      const newSubs = new Map(state.subscriptions);
      newSubs.set(sectionId, subscription);
      return { subscriptions: newSubs };
    });
  },

  unsubscribeFromSection: (sectionId: string) => {
    const subscription = get().subscriptions.get(sectionId);
    if (subscription) {
      subscription.unsubscribe();
      set((state) => {
        const newSubs = new Map(state.subscriptions);
        newSubs.delete(sectionId);
        return { subscriptions: newSubs };
      });
    }
  },
}));
