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
          is_community: boolean;
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
          is_community?: boolean;
        };
        Update: {
          section_name?: string;
          description?: string | null;
          is_custom?: boolean;
          is_community?: boolean;
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
      memories: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          type: string;
          content: string | null;
          structured_data: Record<string, unknown>;
          rating: number | null;
          source: string | null;
          source_image: string | null;
          embedding: number[] | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          title: string;
          type?: string;
          content?: string | null;
          structured_data?: Record<string, unknown>;
          rating?: number | null;
          source?: string | null;
          source_image?: string | null;
          embedding?: number[] | null;
        };
        Update: {
          title?: string;
          type?: string;
          content?: string | null;
          structured_data?: Record<string, unknown>;
          rating?: number | null;
          source?: string | null;
          source_image?: string | null;
          embedding?: number[] | null;
          updated_at?: string;
        };
      };
      memory_relations: {
        Row: {
          id: string;
          from_memory: string;
          to_memory: string;
          relation_type: string;
          created_at: string;
        };
        Insert: {
          from_memory: string;
          to_memory: string;
          relation_type: string;
        };
        Update: {
          relation_type?: string;
        };
      };
      ai_usage_logs: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          service: string;
          tokens_used: number;
          cost_estimate: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          provider: string;
          service: string;
          tokens_used?: number;
          cost_estimate?: number;
        };
        Update: {
          provider?: string;
          service?: string;
          tokens_used?: number;
          cost_estimate?: number;
        };
      };
      user_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: string;
          price: number;
          features: Record<string, boolean>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          plan?: string;
          price?: number;
          features?: Record<string, boolean>;
        };
        Update: {
          plan?: string;
          price?: number;
          features?: Record<string, boolean>;
          updated_at?: string;
        };
      };
      user_email_aliases: {
        Row: {
          id: string;
          user_id: string;
          email_alias: string;
          label: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          email_alias: string;
          label?: string | null;
          is_active?: boolean;
        };
        Update: {
          email_alias?: string;
          label?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      inbound_alias_requests: {
        Row: {
          id: string;
          user_id: string;
          sender_email: string;
          sender_name: string | null;
          original_subject: string | null;
          original_body: string | null;
          inferred_title: string;
          inferred_deadline: string;
          status: string;
          review_note: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          sender_email: string;
          sender_name?: string | null;
          original_subject?: string | null;
          original_body?: string | null;
          inferred_title: string;
          inferred_deadline: string;
          status?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
        };
        Update: {
          sender_email?: string;
          sender_name?: string | null;
          original_subject?: string | null;
          original_body?: string | null;
          inferred_title?: string;
          inferred_deadline?: string;
          status?: string;
          review_note?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
      };
    };
  };
};
