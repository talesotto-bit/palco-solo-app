export interface Database {
  public: {
    Tables: {
      genres: {
        Row: {
          id: string
          name: string
          slug: string
          track_count: number
          created_at: string
        }
        Insert: {
          id: string
          name: string
          slug: string
          track_count?: number
        }
        Update: {
          name?: string
          slug?: string
          track_count?: number
        }
      }
      tracks: {
        Row: {
          id: string
          name: string
          slug: string
          genre_id: string
          genre_label: string
          bpm: number
          key_note: string | null
          key_scale: 'major' | 'minor' | null
          duration_seconds: number
          stem_count: number
          has_stems: boolean
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          name: string
          slug: string
          genre_id: string
          genre_label: string
          bpm?: number
          key_note?: string
          key_scale?: 'major' | 'minor'
          duration_seconds?: number
          stem_count?: number
          has_stems?: boolean
        }
        Update: {
          name?: string
          bpm?: number
          key_note?: string
          key_scale?: 'major' | 'minor'
          duration_seconds?: number
          stem_count?: number
          is_active?: boolean
        }
      }
      stems: {
        Row: {
          id: string
          track_id: string
          name: string
          slug: string
          r2_key: string
          url: string
          format: string
          size_bytes: number
          instrument_type: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          track_id: string
          name: string
          slug: string
          r2_key: string
          url: string
          format?: string
          size_bytes?: number
          instrument_type?: string
          sort_order?: number
        }
        Update: {
          url?: string
          size_bytes?: number
          instrument_type?: string
          sort_order?: number
        }
      }
      setlists: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          name: string
          description?: string
        }
        Update: {
          name?: string
          description?: string
          is_active?: boolean
        }
      }
      setlist_items: {
        Row: {
          id: string
          setlist_id: string
          track_id: string
          position: number
          pitch_offset: number
          speed_factor: number
          notes: string | null
          created_at: string
        }
        Insert: {
          setlist_id: string
          track_id: string
          position: number
          pitch_offset?: number
          speed_factor?: number
          notes?: string
        }
        Update: {
          position?: number
          pitch_offset?: number
          speed_factor?: number
          notes?: string
        }
      }
      favorites: {
        Row: {
          user_id: string
          track_id: string
          created_at: string
        }
        Insert: {
          user_id: string
          track_id: string
        }
        Update: never
      }
    }
  }
}
