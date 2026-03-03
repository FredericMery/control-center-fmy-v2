export type Database = {
  public: {
    Tables: {
      memory_sections: {
        Row: {
          id: string;
          user_id: string;
          template_id: string | null;
          section_name: string;
          description: string | null;
          is_custom: boolean;
          items_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          template_id?: string | null;
          section_name: string;
          description?: string | null;
          is_custom?: boolean;
        };
        Update: {
          section_name?: string;
          description?: string | null;
          is_custom?: boolean;
        };
      };
      memory_fields: {
        Row: {
          id: string;
          section_id: string;
          field_label: string;
          field_type: string;
          field_order: number;
          is_required: boolean;
          is_searchable: boolean;
          options: string[] | null;
          created_at: string;
        };
        Insert: {
          section_id: string;
          field_label: string;
          field_type: string;
          field_order: number;
          is_required?: boolean;
          is_searchable?: boolean;
          options?: string[] | null;
        };
        Update: {
          field_label?: string;
          field_type?: string;
          field_order?: number;
          is_required?: boolean;
          is_searchable?: boolean;
          options?: string[] | null;
        };
      };
      memory_items: {
        Row: {
          id: string;
          section_id: string;
          item_title: string;
          archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          section_id: string;
          item_title: string;
          archived?: boolean;
        };
        Update: {
          item_title?: string;
          archived?: boolean;
        };
      };
      memory_item_values: {
        Row: {
          id: string;
          item_id: string;
          field_id: string;
          field_value: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          item_id: string;
          field_id: string;
          field_value?: string | null;
        };
        Update: {
          field_value?: string | null;
        };
      };
    };
  };
};
