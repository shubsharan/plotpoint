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
      blocks: {
        Row: {
          config: Json;
          content_id: number;
          created_at: string;
          id: number;
          updated_at: string;
        };
        Insert: {
          config: Json;
          content_id: number;
          created_at?: string;
          id?: number;
          updated_at?: string;
        };
        Update: {
          config?: Json;
          content_id?: number;
          created_at?: string;
          id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "blocks_content_id_fkey";
            columns: ["content_id"];
            isOneToOne: false;
            referencedRelation: "content";
            referencedColumns: ["id"];
          }
        ];
      };
      content: {
        Row: {
          content: Json;
          created_at: string;
          id: number;
          position: number;
          story_id: number;
          title: string | null;
          type: Database["public"]["Enums"]["content_types"];
          updated_at: string;
        };
        Insert: {
          content: Json;
          created_at?: string;
          id?: number;
          position?: number;
          story_id: number;
          title?: string | null;
          type: Database["public"]["Enums"]["content_types"];
          updated_at?: string;
        };
        Update: {
          content?: Json;
          created_at?: string;
          id?: number;
          position?: number;
          story_id?: number;
          title?: string | null;
          type?: Database["public"]["Enums"]["content_types"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "content_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          }
        ];
      };
      genres: {
        Row: {
          id: number;
          name: string;
          type: Database["public"]["Enums"]["genre_types"];
        };
        Insert: {
          id?: number;
          name: string;
          type: Database["public"]["Enums"]["genre_types"];
        };
        Update: {
          id?: number;
          name?: string;
          type?: Database["public"]["Enums"]["genre_types"];
        };
        Relationships: [];
      };
      stories: {
        Row: {
          author: string;
          cover_image: string | null;
          created_at: string;
          description: string | null;
          genre: number | null;
          id: number;
          status: Database["public"]["Enums"]["stories_status"];
          title: string;
          updated_at: string;
        };
        Insert: {
          author: string;
          cover_image?: string | null;
          created_at?: string;
          description?: string | null;
          genre?: number | null;
          id?: number;
          status?: Database["public"]["Enums"]["stories_status"];
          title: string;
          updated_at?: string;
        };
        Update: {
          author?: string;
          cover_image?: string | null;
          created_at?: string;
          description?: string | null;
          genre?: number | null;
          id?: number;
          status?: Database["public"]["Enums"]["stories_status"];
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stories_author_fkey";
            columns: ["author"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stories_genre_fkey";
            columns: ["genre"];
            isOneToOne: false;
            referencedRelation: "genres";
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
      genre_types: "fiction" | "non-fiction";
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
      genre_types: ["fiction", "non-fiction"],
      stories_status: ["draft", "published", "archived"],
    },
  },
} as const;
