export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      block_assignments: {
        Row: {
          applies_to_id: number;
          applies_to_type:
            | Database["public"]["Enums"]["block_applies_to"]
            | null;
          block_id: number;
          created_at: string;
          id: number;
        };
        Insert: {
          applies_to_id: number;
          applies_to_type?:
            | Database["public"]["Enums"]["block_applies_to"]
            | null;
          block_id: number;
          created_at?: string;
          id?: number;
        };
        Update: {
          applies_to_id?: number;
          applies_to_type?:
            | Database["public"]["Enums"]["block_applies_to"]
            | null;
          block_id?: number;
          created_at?: string;
          id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "block_assignment_applies_to_id_fkey";
            columns: ["applies_to_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "block_assignment_applies_to_id_fkey1";
            columns: ["applies_to_id"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "block_assignment_applies_to_id_fkey2";
            columns: ["applies_to_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "block_assignment_block_id_fkey";
            columns: ["block_id"];
            isOneToOne: false;
            referencedRelation: "blocks";
            referencedColumns: ["id"];
          }
        ];
      };
      blocks: {
        Row: {
          config: Json;
          created_at: string;
          id: number;
          type: Database["public"]["Enums"]["content_types"];
          updated_at: string;
        };
        Insert: {
          config: Json;
          created_at?: string;
          id?: number;
          type: Database["public"]["Enums"]["content_types"];
          updated_at?: string;
        };
        Update: {
          config?: Json;
          created_at?: string;
          id?: number;
          type?: Database["public"]["Enums"]["content_types"];
          updated_at?: string;
        };
        Relationships: [];
      };
      content: {
        Row: {
          content: Json;
          created_at: string;
          id: number;
          name: string;
          parent_section: number | null;
          position: number;
          type: Database["public"]["Enums"]["content_types"];
          updated_at: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          id?: number;
          name: string;
          parent_section?: number | null;
          position?: number;
          type: Database["public"]["Enums"]["content_types"];
          updated_at?: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          id?: number;
          name?: string;
          parent_section?: number | null;
          position?: number;
          type?: Database["public"]["Enums"]["content_types"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_parent_section_fkey";
            columns: ["parent_section"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          }
        ];
      };
      sections: {
        Row: {
          created_at: string;
          description: string | null;
          id: number;
          name: string;
          parent_section: number | null;
          position: number;
          story_id: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name: string;
          parent_section?: number | null;
          position?: number;
          story_id: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: number;
          name?: string;
          parent_section?: number | null;
          position?: number;
          story_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sections_parent_section_fkey";
            columns: ["parent_section"];
            isOneToOne: false;
            referencedRelation: "sections";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sections_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          }
        ];
      };
      stories: {
        Row: {
          author_id: string;
          created_at: string;
          description: string | null;
          id: number;
          status: Database["public"]["Enums"]["stories_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          status?: Database["public"]["Enums"]["stories_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          created_at?: string;
          description?: string | null;
          id?: number;
          status?: Database["public"]["Enums"]["stories_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stories_author_id_users_id_fk";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };
      users: {
        Row: {
          avatar: string | null;
          email: string;
          id: string;
          name: string;
        };
        Insert: {
          avatar?: string | null;
          email: string;
          id: string;
          name: string;
        };
        Update: {
          avatar?: string | null;
          email?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_story_outline: {
        Args: { story_id_input: number };
        Returns: Json;
      };
    };
    Enums: {
      block_applies_to: "story" | "section" | "content";
      block_applies_to_types: "map" | "passcode" | "password";
      content_types: "text" | "video" | "audio";
      stories_status: "draft" | "published" | "archived";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
      DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] &
      DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R;
    }
    ? R
    : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I;
    }
    ? I
    : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U;
    }
    ? U
    : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      block_applies_to: ["story", "section", "content"],
      block_applies_to_types: ["map", "passcode", "password"],
      content_types: ["text", "video", "audio"],
      stories_status: ["draft", "published", "archived"],
    },
  },
} as const;
