export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cities: {
        Row: {
          country: string | null
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          user_id: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          user_id: string
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      due_reminders: {
        Row: {
          created_at: string
          due_id: string
          id: string
          is_active: boolean
          is_recurring: boolean
          last_notified_at: string | null
          recurring_interval_days: number | null
          remind_before_minutes: number
          reminder_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_id: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          last_notified_at?: string | null
          recurring_interval_days?: number | null
          remind_before_minutes?: number
          reminder_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_id?: string
          id?: string
          is_active?: boolean
          is_recurring?: boolean
          last_notified_at?: string | null
          recurring_interval_days?: number | null
          remind_before_minutes?: number
          reminder_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "due_reminders_due_id_fkey"
            columns: ["due_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_tokens: {
        Row: {
          access_token: string
          calendar_id: string | null
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          calendar_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          calendar_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      imported_events: {
        Row: {
          created_at: string
          description: string | null
          end_time: string | null
          id: string
          import_batch_id: string
          is_completed: boolean
          location: string | null
          source_file: string
          start_time: string
          timer_ended_at: string | null
          timer_seconds: number | null
          timer_started_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          import_batch_id: string
          is_completed?: boolean
          location?: string | null
          source_file: string
          start_time: string
          timer_ended_at?: string | null
          timer_seconds?: number | null
          timer_started_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_time?: string | null
          id?: string
          import_batch_id?: string
          is_completed?: boolean
          location?: string | null
          source_file?: string
          start_time?: string
          timer_ended_at?: string | null
          timer_seconds?: number | null
          timer_started_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      moments: {
        Row: {
          created_at: string
          date: string
          emoji: string | null
          id: string
          is_special: boolean
          location_category: string | null
          location_lat: number | null
          location_lng: number | null
          location_name: string | null
          photos: string[]
          tags: string[]
          text: string | null
          timer_ended_at: string | null
          timer_seconds: number | null
          timer_started_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          emoji?: string | null
          id?: string
          is_special?: boolean
          location_category?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          photos?: string[]
          tags?: string[]
          text?: string | null
          timer_ended_at?: string | null
          timer_seconds?: number | null
          timer_started_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          emoji?: string | null
          id?: string
          is_special?: boolean
          location_category?: string | null
          location_lat?: number | null
          location_lng?: number | null
          location_name?: string | null
          photos?: string[]
          tags?: string[]
          text?: string | null
          timer_ended_at?: string | null
          timer_seconds?: number | null
          timer_started_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      route_points: {
        Row: {
          acc: number | null
          created_at: string
          day: string
          id: number
          lat: number
          lng: number
          t: string
          user_id: string
        }
        Insert: {
          acc?: number | null
          created_at?: string
          day: string
          id?: never
          lat: number
          lng: number
          t: string
          user_id?: string
        }
        Update: {
          acc?: number | null
          created_at?: string
          day?: string
          id?: never
          lat?: number
          lng?: number
          t?: string
          user_id?: string
        }
        Relationships: []
      }
      places: {
        Row: {
          category: string
          city_id: string
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          user_id: string
        }
        Insert: {
          category?: string
          city_id: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          user_id: string
        }
        Update: {
          category?: string
          city_id?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "places_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bedtime_hour: number
          bedtime_minute: number
          created_at: string
          display_name: string | null
          homepage_image_url: string | null
          id: string
          language: string
          settings: Json
          updated_at: string
          user_id: string
          wake_hour: number
          wake_minute: number
        }
        Insert: {
          avatar_url?: string | null
          bedtime_hour?: number
          bedtime_minute?: number
          created_at?: string
          display_name?: string | null
          homepage_image_url?: string | null
          id?: string
          language?: string
          settings?: Json
          updated_at?: string
          user_id: string
          wake_hour?: number
          wake_minute?: number
        }
        Update: {
          avatar_url?: string | null
          bedtime_hour?: number
          bedtime_minute?: number
          created_at?: string
          display_name?: string | null
          homepage_image_url?: string | null
          id?: string
          language?: string
          settings?: Json
          updated_at?: string
          user_id?: string
          wake_hour?: number
          wake_minute?: number
        }
        Relationships: []
      }
      sticky_note_items: {
        Row: {
          created_at: string
          done: boolean
          id: string
          images: string[]
          links: Json
          note_id: string
          sort_order: number
          text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          images?: string[]
          links?: Json
          note_id: string
          sort_order?: number
          text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          images?: string[]
          links?: Json
          note_id?: string
          sort_order?: number
          text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sticky_note_items_note_id_fkey"
            columns: ["note_id"]
            isOneToOne: false
            referencedRelation: "sticky_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      sticky_notes: {
        Row: {
          category: string
          created_at: string
          id: string
          sort_order: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          created_at: string
          description: string | null
          id: string
          interval_days: number
          is_active: boolean
          last_reminded_at: string | null
          next_reminder_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          interval_days?: number
          is_active?: boolean
          last_reminded_at?: string | null
          next_reminder_at: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          interval_days?: number
          is_active?: boolean
          last_reminded_at?: string | null
          next_reminder_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      todos: {
        Row: {
          created_at: string
          date: string
          due_date: string | null
          habit_category: string | null
          id: string
          is_completed: boolean
          is_recurring: boolean
          links: Json | null
          parent_due_id: string | null
          photos: string[]
          plan_ended_at: string | null
          plan_started_at: string | null
          progress: number
          promoted_to_habit_id: string | null
          recurrence_source_id: string | null
          show_in_recap_daily: boolean
          sort_order: number
          tags: string[]
          time_segment: string
          timer_ended_at: string | null
          timer_seconds: number | null
          timer_started_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          due_date?: string | null
          habit_category?: string | null
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          links?: Json | null
          parent_due_id?: string | null
          photos?: string[]
          plan_ended_at?: string | null
          plan_started_at?: string | null
          progress?: number
          promoted_to_habit_id?: string | null
          recurrence_source_id?: string | null
          show_in_recap_daily?: boolean
          sort_order?: number
          tags?: string[]
          time_segment?: string
          timer_ended_at?: string | null
          timer_seconds?: number | null
          timer_started_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          due_date?: string | null
          habit_category?: string | null
          id?: string
          is_completed?: boolean
          is_recurring?: boolean
          links?: Json | null
          parent_due_id?: string | null
          photos?: string[]
          plan_ended_at?: string | null
          plan_started_at?: string | null
          progress?: number
          promoted_to_habit_id?: string | null
          recurrence_source_id?: string | null
          show_in_recap_daily?: boolean
          sort_order?: number
          tags?: string[]
          time_segment?: string
          timer_ended_at?: string | null
          timer_seconds?: number | null
          timer_started_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_parent_due_id_fkey"
            columns: ["parent_due_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          created_at: string
          date: string
          id: string
          moment_id: string | null
          note: string | null
          photos: string[]
          place_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          moment_id?: string | null
          note?: string | null
          photos?: string[]
          place_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          moment_id?: string | null
          note?: string | null
          photos?: string[]
          place_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_moment_id_fkey"
            columns: ["moment_id"]
            isOneToOne: false
            referencedRelation: "moments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_place_id_fkey"
            columns: ["place_id"]
            isOneToOne: false
            referencedRelation: "places"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_google_calendar_connected: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
