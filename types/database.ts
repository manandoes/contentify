export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent_name: string
          duration_ms: number | null
          finished_at: string | null
          id: string
          input: Json
          output: Json | null
          run_id: string
          started_at: string
          status: string
          step_order: number
        }
        Insert: {
          agent_name: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          input: Json
          output?: Json | null
          run_id: string
          started_at?: string
          status?: string
          step_order: number
        }
        Update: {
          agent_name?: string
          duration_ms?: number | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          run_id?: string
          started_at?: string
          status?: string
          step_order?: number
        }
        Relationships: []
      }
      analytics: {
        Row: {
          clicks: number | null
          comments: number | null
          fetched_at: string
          id: string
          impressions: number | null
          likes: number | null
          published_post_id: string
          saves: number | null
          shares: number | null
        }
        Insert: {
          clicks?: number | null
          comments?: number | null
          fetched_at?: string
          id?: string
          impressions?: number | null
          likes?: number | null
          published_post_id: string
          saves?: number | null
          shares?: number | null
        }
        Update: {
          clicks?: number | null
          comments?: number | null
          fetched_at?: string
          id?: string
          impressions?: number | null
          likes?: number | null
          published_post_id?: string
          saves?: number | null
          shares?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_published_post_id_fkey"
            columns: ["published_post_id"]
            isOneToOne: false
            referencedRelation: "published_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
          voice_profile: Json
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
          voice_profile?: Json
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          voice_profile?: Json
        }
        Relationships: [
          {
            foreignKeyName: "brands_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      briefs: {
        Row: {
          angle_type: string
          brand_id: string
          competitor_note: string | null
          competitor_recency: Database["public"]["Enums"]["competitor_recency"]
          created_at: string
          evidence: Json
          id: string
          opening: string
          rank: number | null
          run_id: string
          score: Json
          status: string
        }
        Insert: {
          angle_type: string
          brand_id: string
          competitor_note?: string | null
          competitor_recency: Database["public"]["Enums"]["competitor_recency"]
          created_at?: string
          evidence?: Json
          id?: string
          opening: string
          rank?: number | null
          run_id: string
          score?: Json
          status?: string
        }
        Update: {
          angle_type?: string
          brand_id?: string
          competitor_note?: string | null
          competitor_recency?: Database["public"]["Enums"]["competitor_recency"]
          created_at?: string
          evidence?: Json
          id?: string
          opening?: string
          rank?: number | null
          run_id?: string
          score?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefs_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      content: {
        Row: {
          analysis: Json | null
          audience: string | null
          brand_id: string
          content_type: string
          created_at: string
          cta: string | null
          goal: string | null
          id: string
          original_content: string
          original_platform: Database["public"]["Enums"]["platform"] | null
          source_brief_id: string | null
          status: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at: string
        }
        Insert: {
          analysis?: Json | null
          audience?: string | null
          brand_id: string
          content_type?: string
          created_at?: string
          cta?: string | null
          goal?: string | null
          id?: string
          original_content: string
          original_platform?: Database["public"]["Enums"]["platform"] | null
          source_brief_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title: string
          updated_at?: string
        }
        Update: {
          analysis?: Json | null
          audience?: string | null
          brand_id?: string
          content_type?: string
          created_at?: string
          cta?: string | null
          goal?: string | null
          id?: string
          original_content?: string
          original_platform?: Database["public"]["Enums"]["platform"] | null
          source_brief_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_source_brief_id_fkey"
            columns: ["source_brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_assets: {
        Row: {
          aspect_ratio: string | null
          asset_type: string
          content_id: string
          created_at: string
          height: number | null
          id: string
          is_original: boolean
          storage_path: string
          width: number | null
        }
        Insert: {
          aspect_ratio?: string | null
          asset_type: string
          content_id: string
          created_at?: string
          height?: number | null
          id?: string
          is_original?: boolean
          storage_path: string
          width?: number | null
        }
        Update: {
          aspect_ratio?: string | null
          asset_type?: string
          content_id?: string
          created_at?: string
          height?: number | null
          id?: string
          is_original?: boolean
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_memory: {
        Row: {
          angle_type: string | null
          brand_id: string
          content_id: string | null
          created_at: string
          embedding: string | null
          id: string
          performance_score: number | null
          topic_summary: string
        }
        Insert: {
          angle_type?: string | null
          brand_id: string
          content_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          performance_score?: number | null
          topic_summary: string
        }
        Update: {
          angle_type?: string | null
          brand_id?: string
          content_id?: string | null
          created_at?: string
          embedding?: string | null
          id?: string
          performance_score?: number | null
          topic_summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_memory_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_memory_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          adapted_content: Json
          caption: Json | null
          content_id: string
          created_at: string
          id: string
          platform: Database["public"]["Enums"]["platform"]
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
          warnings: string[]
        }
        Insert: {
          adapted_content?: Json
          caption?: Json | null
          content_id: string
          created_at?: string
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          warnings?: string[]
        }
        Update: {
          adapted_content?: Json
          caption?: Json | null
          content_id?: string
          created_at?: string
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
          warnings?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content"
            referencedColumns: ["id"]
          },
        ]
      }
      hooks: {
        Row: {
          brief_id: string
          created_at: string
          hook_text: string
          id: string
          rationale: string
          status: string
        }
        Insert: {
          brief_id: string
          created_at?: string
          hook_text: string
          id?: string
          rationale: string
          status?: string
        }
        Update: {
          brief_id?: string
          created_at?: string
          hook_text?: string
          id?: string
          rationale?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hooks_brief_id_fkey"
            columns: ["brief_id"]
            isOneToOne: false
            referencedRelation: "briefs"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reports: {
        Row: {
          brand_id: string
          created_at: string
          id: string
          interpretation: Json
          next_test: string | null
          observed: Json
          recommendations: Json
          run_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          id?: string
          interpretation: Json
          next_test?: string | null
          observed: Json
          recommendations?: Json
          run_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          id?: string
          interpretation?: Json
          next_test?: string | null
          observed?: Json
          recommendations?: Json
          run_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reports_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_connections: {
        Row: {
          access_token_encrypted: string | null
          brand_id: string
          connected_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          platform: Database["public"]["Enums"]["platform"]
          refresh_token_encrypted: string | null
          scopes: string[]
          status: string
          updated_at: string
        }
        Insert: {
          access_token_encrypted?: string | null
          brand_id: string
          connected_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Update: {
          access_token_encrypted?: string | null
          brand_id?: string
          connected_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          refresh_token_encrypted?: string | null
          scopes?: string[]
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_connections_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_connections_platform_fkey"
            columns: ["platform"]
            isOneToOne: false
            referencedRelation: "platforms"
            referencedColumns: ["id"]
          },
        ]
      }
      platforms: {
        Row: {
          created_at: string
          display_name: string
          id: Database["public"]["Enums"]["platform"]
          supports_publishing: boolean
        }
        Insert: {
          created_at?: string
          display_name: string
          id: Database["public"]["Enums"]["platform"]
          supports_publishing?: boolean
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: Database["public"]["Enums"]["platform"]
          supports_publishing?: boolean
        }
        Relationships: []
      }
      published_posts: {
        Row: {
          content_version_id: string
          created_at: string
          id: string
          platform: Database["public"]["Enums"]["platform"]
          platform_post_id: string | null
          published_at: string | null
          scheduled_post_id: string | null
          status: Database["public"]["Enums"]["content_status"]
        }
        Insert: {
          content_version_id: string
          created_at?: string
          id?: string
          platform: Database["public"]["Enums"]["platform"]
          platform_post_id?: string | null
          published_at?: string | null
          scheduled_post_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
        }
        Update: {
          content_version_id?: string
          created_at?: string
          id?: string
          platform?: Database["public"]["Enums"]["platform"]
          platform_post_id?: string | null
          published_at?: string | null
          scheduled_post_id?: string | null
          status?: Database["public"]["Enums"]["content_status"]
        }
        Relationships: [
          {
            foreignKeyName: "published_posts_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "published_posts_scheduled_post_id_fkey"
            columns: ["scheduled_post_id"]
            isOneToOne: false
            referencedRelation: "scheduled_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_signals: {
        Row: {
          competitor_id: string | null
          engagement_score: number | null
          fetched_at: string
          id: string
          keyword_matched: string | null
          raw_content: string | null
          source: string
          source_kind: string
          title: string
          url: string
        }
        Insert: {
          competitor_id?: string | null
          engagement_score?: number | null
          fetched_at?: string
          id?: string
          keyword_matched?: string | null
          raw_content?: string | null
          source: string
          source_kind?: string
          title: string
          url: string
        }
        Update: {
          competitor_id?: string | null
          engagement_score?: number | null
          fetched_at?: string
          id?: string
          keyword_matched?: string | null
          raw_content?: string | null
          source?: string
          source_kind?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_signals_competitor_id_fkey"
            columns: ["competitor_id"]
            isOneToOne: false
            referencedRelation: "tracked_competitors"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          attempts: number
          content_version_id: string
          created_at: string
          id: string
          idempotency_key: string
          last_error: string | null
          platform_connection_id: string | null
          scheduled_for: string
          status: Database["public"]["Enums"]["content_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          content_version_id: string
          created_at?: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          platform_connection_id?: string | null
          scheduled_for: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          content_version_id?: string
          created_at?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          platform_connection_id?: string | null
          scheduled_for?: string
          status?: Database["public"]["Enums"]["content_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_content_version_id_fkey"
            columns: ["content_version_id"]
            isOneToOne: false
            referencedRelation: "content_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_posts_platform_connection_id_fkey"
            columns: ["platform_connection_id"]
            isOneToOne: false
            referencedRelation: "platform_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          level: string
          message: string
          source: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          level: string
          message: string
          source: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          source?: string
        }
        Relationships: []
      }
      tracked_competitors: {
        Row: {
          added_at: string
          brand_id: string
          feed_url: string | null
          handle_or_url: string
          id: string
          manual_only: boolean
          name: string
          platform: Database["public"]["Enums"]["platform"] | null
        }
        Insert: {
          added_at?: string
          brand_id: string
          feed_url?: string | null
          handle_or_url: string
          id?: string
          manual_only?: boolean
          name: string
          platform?: Database["public"]["Enums"]["platform"] | null
        }
        Update: {
          added_at?: string
          brand_id?: string
          feed_url?: string | null
          handle_or_url?: string
          id?: string
          manual_only?: boolean
          name?: string
          platform?: Database["public"]["Enums"]["platform"] | null
        }
        Relationships: [
          {
            foreignKeyName: "tracked_competitors_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      competitor_recency: "clear" | "trending" | "recently_covered"
      content_status:
        | "DRAFT"
        | "READY_FOR_REVIEW"
        | "APPROVED"
        | "SCHEDULED"
        | "PUBLISHED"
        | "FAILED"
        | "READY_TO_POST"
      platform:
        | "instagram"
        | "tiktok"
        | "youtube"
        | "x"
        | "linkedin"
        | "threads"
        | "facebook"
        | "pinterest"
        | "email"
        | "blog"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      competitor_recency: ["clear", "trending", "recently_covered"],
      content_status: [
        "DRAFT",
        "READY_FOR_REVIEW",
        "APPROVED",
        "SCHEDULED",
        "PUBLISHED",
        "FAILED",
        "READY_TO_POST",
      ],
      platform: [
        "instagram",
        "tiktok",
        "youtube",
        "x",
        "linkedin",
        "threads",
        "facebook",
        "pinterest",
        "email",
        "blog",
      ],
    },
  },
} as const

