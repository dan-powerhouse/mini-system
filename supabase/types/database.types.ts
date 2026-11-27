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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          after: Json | null
          at: string
          before: Json | null
          effective_user_id: string | null
          id: string
          metadata: Json
          outcome: string
          request_id: string
          source: string
          target_id: string | null
          target_type: string | null
          workspace_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          after?: Json | null
          at?: string
          before?: Json | null
          effective_user_id?: string | null
          id?: string
          metadata?: Json
          outcome: string
          request_id: string
          source: string
          target_id?: string | null
          target_type?: string | null
          workspace_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          after?: Json | null
          at?: string
          before?: Json | null
          effective_user_id?: string | null
          id?: string
          metadata?: Json
          outcome?: string
          request_id?: string
          source?: string
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      entity: {
        Row: {
          attributes: Json
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"]
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"]
          tags: string[]
          title: string
          type: string
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          created_by: string
          id?: string
          kind: Database["public"]["Enums"]["entity_kind"]
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"]
          tags?: string[]
          title: string
          type: string
          updated_at?: string
          updated_by: string
          version?: number
          workspace_id: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          created_by?: string
          id?: string
          kind?: Database["public"]["Enums"]["entity_kind"]
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"]
          tags?: string[]
          title?: string
          type?: string
          updated_at?: string
          updated_by?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_workspace_id_kind_type_fkey"
            columns: ["workspace_id", "kind", "type"]
            isOneToOne: false
            referencedRelation: "type_templates"
            referencedColumns: ["workspace_id", "kind", "type"]
          },
        ]
      }
      predicate_registry: {
        Row: {
          created_at: string
          created_by: string
          description: string
          directed: boolean
          from_kinds: Database["public"]["Enums"]["entity_kind"][]
          name: string
          symmetric_helper: string | null
          to_kinds: Database["public"]["Enums"]["entity_kind"][]
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description: string
          directed?: boolean
          from_kinds: Database["public"]["Enums"]["entity_kind"][]
          name: string
          symmetric_helper?: string | null
          to_kinds: Database["public"]["Enums"]["entity_kind"][]
          updated_at?: string
          updated_by: string
          version?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string
          directed?: boolean
          from_kinds?: Database["public"]["Enums"]["entity_kind"][]
          name?: string
          symmetric_helper?: string | null
          to_kinds?: Database["public"]["Enums"]["entity_kind"][]
          updated_at?: string
          updated_by?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predicate_registry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predicate_registry_workspace_id_symmetric_helper_fkey"
            columns: ["workspace_id", "symmetric_helper"]
            isOneToOne: false
            referencedRelation: "predicate_registry"
            referencedColumns: ["workspace_id", "name"]
          },
        ]
      }
      process: {
        Row: {
          assigned_agent_id: string | null
          assigned_agent_kind: Database["public"]["Enums"]["entity_kind"]
          assigned_edge_id: string | null
          attempt_count: number
          completed_at: string | null
          created_at: string
          error: Json | null
          heartbeat_at: string | null
          id: string
          idempotency_key: string
          inputs: Json
          max_attempts: number
          outputs: Json | null
          priority: number
          process_kind_id: string
          process_kind_version: number
          progress: number
          requested_by: string
          requested_by_kind: Database["public"]["Enums"]["entity_kind"]
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["process_status"]
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          assigned_agent_id?: string | null
          assigned_agent_kind?: Database["public"]["Enums"]["entity_kind"]
          assigned_edge_id?: string | null
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key: string
          inputs?: Json
          max_attempts?: number
          outputs?: Json | null
          priority?: number
          process_kind_id: string
          process_kind_version: number
          progress?: number
          requested_by: string
          requested_by_kind: Database["public"]["Enums"]["entity_kind"]
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          assigned_agent_id?: string | null
          assigned_agent_kind?: Database["public"]["Enums"]["entity_kind"]
          assigned_edge_id?: string | null
          attempt_count?: number
          completed_at?: string | null
          created_at?: string
          error?: Json | null
          heartbeat_at?: string | null
          id?: string
          idempotency_key?: string
          inputs?: Json
          max_attempts?: number
          outputs?: Json | null
          priority?: number
          process_kind_id?: string
          process_kind_version?: number
          progress?: number
          requested_by?: string
          requested_by_kind?: Database["public"]["Enums"]["entity_kind"]
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["process_status"]
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_workspace_id_assigned_agent_id_assigned_agent_kind_fkey"
            columns: [
              "workspace_id",
              "assigned_agent_id",
              "assigned_agent_kind",
            ]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_assigned_agent_id_assigned_agent_kind_fkey"
            columns: [
              "workspace_id",
              "assigned_agent_id",
              "assigned_agent_kind",
            ]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_assigned_agent_id_assigned_agent_kind_fkey"
            columns: [
              "workspace_id",
              "assigned_agent_id",
              "assigned_agent_kind",
            ]
            isOneToOne: false
            referencedRelation: "entity"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_assigned_agent_id_assigned_agent_kind_fkey"
            columns: [
              "workspace_id",
              "assigned_agent_id",
              "assigned_agent_kind",
            ]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_assigned_agent_id_assigned_agent_kind_fkey"
            columns: [
              "workspace_id",
              "assigned_agent_id",
              "assigned_agent_kind",
            ]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_assigned_agent_id_assigned_agent_kind_fkey"
            columns: [
              "workspace_id",
              "assigned_agent_id",
              "assigned_agent_kind",
            ]
            isOneToOne: false
            referencedRelation: "process_kinds"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_process_kind_id_process_kind_version_fkey"
            columns: ["workspace_id", "process_kind_id", "process_kind_version"]
            isOneToOne: false
            referencedRelation: "process_kind_version"
            referencedColumns: ["workspace_id", "process_kind_id", "version"]
          },
          {
            foreignKeyName: "process_workspace_id_requested_by_requested_by_kind_fkey"
            columns: ["workspace_id", "requested_by", "requested_by_kind"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_requested_by_requested_by_kind_fkey"
            columns: ["workspace_id", "requested_by", "requested_by_kind"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_requested_by_requested_by_kind_fkey"
            columns: ["workspace_id", "requested_by", "requested_by_kind"]
            isOneToOne: false
            referencedRelation: "entity"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_requested_by_requested_by_kind_fkey"
            columns: ["workspace_id", "requested_by", "requested_by_kind"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_requested_by_requested_by_kind_fkey"
            columns: ["workspace_id", "requested_by", "requested_by_kind"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_workspace_id_requested_by_requested_by_kind_fkey"
            columns: ["workspace_id", "requested_by", "requested_by_kind"]
            isOneToOne: false
            referencedRelation: "process_kinds"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
        ]
      }
      process_kind_version: {
        Row: {
          package_path: string
          package_sha256: string
          process_kind_id: string
          published_at: string
          published_by: string
          registry_kind: Database["public"]["Enums"]["entity_kind"]
          specification: Json
          version: number
          workspace_id: string
        }
        Insert: {
          package_path: string
          package_sha256: string
          process_kind_id: string
          published_at?: string
          published_by: string
          registry_kind?: Database["public"]["Enums"]["entity_kind"]
          specification: Json
          version: number
          workspace_id: string
        }
        Update: {
          package_path?: string
          package_sha256?: string
          process_kind_id?: string
          published_at?: string
          published_by?: string
          registry_kind?: Database["public"]["Enums"]["entity_kind"]
          specification?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_kind_version_workspace_id_process_kind_id_registry_fkey"
            columns: ["workspace_id", "process_kind_id", "registry_kind"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_kind_version_workspace_id_process_kind_id_registry_fkey"
            columns: ["workspace_id", "process_kind_id", "registry_kind"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_kind_version_workspace_id_process_kind_id_registry_fkey"
            columns: ["workspace_id", "process_kind_id", "registry_kind"]
            isOneToOne: false
            referencedRelation: "entity"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_kind_version_workspace_id_process_kind_id_registry_fkey"
            columns: ["workspace_id", "process_kind_id", "registry_kind"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_kind_version_workspace_id_process_kind_id_registry_fkey"
            columns: ["workspace_id", "process_kind_id", "registry_kind"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
          {
            foreignKeyName: "process_kind_version_workspace_id_process_kind_id_registry_fkey"
            columns: ["workspace_id", "process_kind_id", "registry_kind"]
            isOneToOne: false
            referencedRelation: "process_kinds"
            referencedColumns: ["workspace_id", "id", "kind"]
          },
        ]
      }
      relation: {
        Row: {
          attributes: Json
          created_at: string
          created_by: string
          from_id: string
          id: string
          predicate: string
          to_id: string
          updated_at: string
          updated_by: string
          valid_from: string | null
          valid_to: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          created_by: string
          from_id: string
          id?: string
          predicate: string
          to_id: string
          updated_at?: string
          updated_by: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          created_by?: string
          from_id?: string
          id?: string
          predicate?: string
          to_id?: string
          updated_at?: string
          updated_by?: string
          valid_from?: string | null
          valid_to?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "relation_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relation_workspace_id_from_id_fkey"
            columns: ["workspace_id", "from_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_from_id_fkey"
            columns: ["workspace_id", "from_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_from_id_fkey"
            columns: ["workspace_id", "from_id"]
            isOneToOne: false
            referencedRelation: "entity"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_from_id_fkey"
            columns: ["workspace_id", "from_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_from_id_fkey"
            columns: ["workspace_id", "from_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_from_id_fkey"
            columns: ["workspace_id", "from_id"]
            isOneToOne: false
            referencedRelation: "process_kinds"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_predicate_fkey"
            columns: ["workspace_id", "predicate"]
            isOneToOne: false
            referencedRelation: "predicate_registry"
            referencedColumns: ["workspace_id", "name"]
          },
          {
            foreignKeyName: "relation_workspace_id_to_id_fkey"
            columns: ["workspace_id", "to_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_to_id_fkey"
            columns: ["workspace_id", "to_id"]
            isOneToOne: false
            referencedRelation: "apps"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_to_id_fkey"
            columns: ["workspace_id", "to_id"]
            isOneToOne: false
            referencedRelation: "entity"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_to_id_fkey"
            columns: ["workspace_id", "to_id"]
            isOneToOne: false
            referencedRelation: "objects"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_to_id_fkey"
            columns: ["workspace_id", "to_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "relation_workspace_id_to_id_fkey"
            columns: ["workspace_id", "to_id"]
            isOneToOne: false
            referencedRelation: "process_kinds"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      saved_view: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"] | null
          name: string
          owner_user_id: string
          query: Json
          updated_at: string
          version: number
          visibility: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          name: string
          owner_user_id: string
          query: Json
          updated_at?: string
          version?: number
          visibility: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          name?: string
          owner_user_id?: string
          query?: Json
          updated_at?: string
          version?: number
          visibility?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_view_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      type_templates: {
        Row: {
          fields: Json
          kind: Database["public"]["Enums"]["entity_kind"]
          type: string
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        Insert: {
          fields?: Json
          kind: Database["public"]["Enums"]["entity_kind"]
          type: string
          updated_at?: string
          updated_by: string
          version?: number
          workspace_id: string
        }
        Update: {
          fields?: Json
          kind?: Database["public"]["Enums"]["entity_kind"]
          type?: string
          updated_at?: string
          updated_by?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "type_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          stale_process_kind_days: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          stale_process_kind_days?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          stale_process_kind_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      workspace_member: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agents: {
        Row: {
          attributes: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          kind: Database["public"]["Enums"]["entity_kind"] | null
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"] | null
          tags: string[] | null
          title: string | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
          workspace_id: string | null
        }
        Insert: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Update: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_workspace_id_kind_type_fkey"
            columns: ["workspace_id", "kind", "type"]
            isOneToOne: false
            referencedRelation: "type_templates"
            referencedColumns: ["workspace_id", "kind", "type"]
          },
        ]
      }
      apps: {
        Row: {
          attributes: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          kind: Database["public"]["Enums"]["entity_kind"] | null
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"] | null
          tags: string[] | null
          title: string | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
          workspace_id: string | null
        }
        Insert: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Update: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_workspace_id_kind_type_fkey"
            columns: ["workspace_id", "kind", "type"]
            isOneToOne: false
            referencedRelation: "type_templates"
            referencedColumns: ["workspace_id", "kind", "type"]
          },
        ]
      }
      objects: {
        Row: {
          attributes: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          kind: Database["public"]["Enums"]["entity_kind"] | null
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"] | null
          tags: string[] | null
          title: string | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
          workspace_id: string | null
        }
        Insert: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Update: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_workspace_id_kind_type_fkey"
            columns: ["workspace_id", "kind", "type"]
            isOneToOne: false
            referencedRelation: "type_templates"
            referencedColumns: ["workspace_id", "kind", "type"]
          },
        ]
      }
      people: {
        Row: {
          attributes: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          kind: Database["public"]["Enums"]["entity_kind"] | null
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"] | null
          tags: string[] | null
          title: string | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
          workspace_id: string | null
        }
        Insert: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Update: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_workspace_id_kind_type_fkey"
            columns: ["workspace_id", "kind", "type"]
            isOneToOne: false
            referencedRelation: "type_templates"
            referencedColumns: ["workspace_id", "kind", "type"]
          },
        ]
      }
      process_kinds: {
        Row: {
          attributes: Json | null
          created_at: string | null
          created_by: string | null
          id: string | null
          kind: Database["public"]["Enums"]["entity_kind"] | null
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"] | null
          tags: string[] | null
          title: string | null
          type: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
          workspace_id: string | null
        }
        Insert: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Update: {
          attributes?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string | null
          kind?: Database["public"]["Enums"]["entity_kind"] | null
          notes?: string | null
          search_vector?: unknown
          status?: Database["public"]["Enums"]["entity_status"] | null
          tags?: string[] | null
          title?: string | null
          type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_workspace_id_kind_type_fkey"
            columns: ["workspace_id", "kind", "type"]
            isOneToOne: false
            referencedRelation: "type_templates"
            referencedColumns: ["workspace_id", "kind", "type"]
          },
        ]
      }
    }
    Functions: {
      audit_for_entity: {
        Args: {
          p_cursor?: string
          p_id: string
          p_limit?: number
          p_workspace_id: string
        }
        Returns: Json
      }
      audit_recent: {
        Args: { p_query?: Json; p_workspace_id: string }
        Returns: Json
      }
      dashboard_summary: { Args: { p_workspace_id: string }; Returns: Json }
      entity_archive: {
        Args: {
          p_expected_version: number
          p_id: string
          p_workspace_id: string
        }
        Returns: {
          attributes: Json
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"]
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"]
          tags: string[]
          title: string
          type: string
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "entity"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      entity_bulk_archive: {
        Args: { p_items: Json; p_workspace_id: string }
        Returns: Json
      }
      entity_bulk_tags: {
        Args: {
          p_items: Json
          p_mode: string
          p_tags: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      entity_create: {
        Args: { p_input: Json; p_workspace_id: string }
        Returns: {
          attributes: Json
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"]
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"]
          tags: string[]
          title: string
          type: string
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "entity"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      entity_get: {
        Args: { p_id: string; p_workspace_id: string }
        Returns: Json
      }
      entity_search: {
        Args: { p_query?: Json; p_workspace_id: string }
        Returns: Json
      }
      entity_update: {
        Args: {
          p_expected_version: number
          p_id: string
          p_patch: Json
          p_workspace_id: string
        }
        Returns: {
          attributes: Json
          created_at: string
          created_by: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"]
          notes: string | null
          search_vector: unknown
          status: Database["public"]["Enums"]["entity_status"]
          tags: string[]
          title: string
          type: string
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "entity"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      exchange_cleanup_candidates: { Args: { p_limit?: number }; Returns: Json }
      exchange_cleanup_finish: {
        Args: { p_upload_id: string }
        Returns: undefined
      }
      exchange_read_export: {
        Args: { p_export_id: string; p_user_id: string }
        Returns: Json
      }
      exchange_stage_upload: {
        Args: {
          p_payload: Json
          p_size_bytes: number
          p_source_hash: string
          p_upload_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      export_create: {
        Args: {
          p_include_archived?: boolean
          p_kinds?: Database["public"]["Enums"]["entity_kind"][]
          p_workspace_id: string
        }
        Returns: Json
      }
      identity_current_person: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      identity_link_person: {
        Args: { p_person_id: string; p_user_id: string; p_workspace_id: string }
        Returns: Json
      }
      identity_unlink_person: {
        Args: { p_link_id: string; p_workspace_id: string }
        Returns: Json
      }
      import_commit: {
        Args: { p_preview_id: string; p_workspace_id: string }
        Returns: Json
      }
      import_preview: {
        Args: { p_upload_id: string; p_workspace_id: string }
        Returns: Json
      }
      mcp_begin: {
        Args: { p_digest: string; p_request_id: string }
        Returns: Json
      }
      mcp_dispatch: {
        Args: {
          p_args: Json
          p_operation: string
          p_request_id: string
          p_token_id: string
        }
        Returns: Json
      }
      mcp_finish: {
        Args: {
          p_method: string
          p_ok: boolean
          p_request_id: string
          p_token_id: string
        }
        Returns: undefined
      }
      member_accept_invitation: {
        Args: { p_token: string }
        Returns: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_member"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      member_invite: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_workspace_id: string
        }
        Returns: Json
      }
      member_remove: {
        Args: { p_user_id: string; p_workspace_id: string }
        Returns: undefined
      }
      member_transfer_owner: {
        Args: { p_new_owner: string; p_workspace_id: string }
        Returns: undefined
      }
      member_update_role: {
        Args: {
          p_role: Database["public"]["Enums"]["workspace_role"]
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_member"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      predicate_delete: {
        Args: { p_name: string; p_workspace_id: string }
        Returns: undefined
      }
      predicate_upsert: {
        Args: {
          p_description: string
          p_directed: boolean
          p_expected_version?: number
          p_from_kinds: Database["public"]["Enums"]["entity_kind"][]
          p_name: string
          p_symmetric_helper?: string
          p_to_kinds: Database["public"]["Enums"]["entity_kind"][]
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          created_by: string
          description: string
          directed: boolean
          from_kinds: Database["public"]["Enums"]["entity_kind"][]
          name: string
          symmetric_helper: string | null
          to_kinds: Database["public"]["Enums"]["entity_kind"][]
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "predicate_registry"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      process_kind_publications: {
        Args: {
          p_before?: number
          p_limit?: number
          p_process_kind_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      process_kind_publish: {
        Args: {
          p_expected_entity_version: number
          p_expected_publication_version: number
          p_process_kind_id: string
          p_sha256: string
          p_specification: Json
          p_upload_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          package_path: string
          package_sha256: string
          process_kind_id: string
          published_at: string
          published_by: string
          registry_kind: Database["public"]["Enums"]["entity_kind"]
          specification: Json
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "process_kind_version"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      registry_direct_session: { Args: never; Returns: boolean }
      registry_path_report: {
        Args: {
          p_max_results?: number
          p_start_id: string
          p_steps: Json
          p_workspace_id: string
        }
        Returns: Json
      }
      registry_traverse: {
        Args: {
          p_depth: number
          p_direction?: string
          p_max_nodes?: number
          p_predicates?: string[]
          p_start_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      relation_create: {
        Args: {
          p_attributes?: Json
          p_from_id: string
          p_predicate: string
          p_to_id: string
          p_valid_from?: string
          p_valid_to?: string
          p_workspace_id: string
        }
        Returns: {
          attributes: Json
          created_at: string
          created_by: string
          from_id: string
          id: string
          predicate: string
          to_id: string
          updated_at: string
          updated_by: string
          valid_from: string | null
          valid_to: string | null
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "relation"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      relation_delete: {
        Args: { p_id: string; p_workspace_id: string }
        Returns: undefined
      }
      relation_update: {
        Args: {
          p_expected_version: number
          p_id: string
          p_patch: Json
          p_workspace_id: string
        }
        Returns: {
          attributes: Json
          created_at: string
          created_by: string
          from_id: string
          id: string
          predicate: string
          to_id: string
          updated_at: string
          updated_by: string
          valid_from: string | null
          valid_to: string | null
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "relation"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      saved_view_create: {
        Args: {
          p_kind: Database["public"]["Enums"]["entity_kind"]
          p_name: string
          p_query: Json
          p_visibility: string
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"] | null
          name: string
          owner_user_id: string
          query: Json
          updated_at: string
          version: number
          visibility: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_view"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      saved_view_delete: {
        Args: { p_id: string; p_workspace_id: string }
        Returns: undefined
      }
      saved_view_update: {
        Args: {
          p_expected_version: number
          p_id: string
          p_patch: Json
          p_workspace_id: string
        }
        Returns: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["entity_kind"] | null
          name: string
          owner_user_id: string
          query: Json
          updated_at: string
          version: number
          visibility: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "saved_view"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      template_upsert: {
        Args: {
          p_expected_version?: number
          p_fields: Json
          p_kind: Database["public"]["Enums"]["entity_kind"]
          p_type: string
          p_workspace_id: string
        }
        Returns: {
          fields: Json
          kind: Database["public"]["Enums"]["entity_kind"]
          type: string
          updated_at: string
          updated_by: string
          version: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "type_templates"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      token_issue: {
        Args: {
          p_expires_at?: string
          p_label: string
          p_scopes: string[]
          p_user_id: string
          p_workspace_id: string
        }
        Returns: Json
      }
      token_list: {
        Args: { p_user_id?: string; p_workspace_id: string }
        Returns: Json[]
      }
      token_revoke: {
        Args: { p_token_id: string; p_workspace_id: string }
        Returns: undefined
      }
      workspace_create: {
        Args: { p_name: string; p_slug: string }
        Returns: {
          created_at: string
          id: string
          name: string
          slug: string
          stale_process_kind_days: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      workspace_update: {
        Args: { p_patch: Json; p_workspace_id: string }
        Returns: {
          created_at: string
          id: string
          name: string
          slug: string
          stale_process_kind_days: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      entity_kind: "person" | "object" | "process_kind" | "agent" | "app"
      entity_status: "active" | "inactive" | "archived"
      process_status:
        | "created"
        | "queued"
        | "running"
        | "retry_waiting"
        | "succeeded"
        | "failed"
        | "cancelled"
      workspace_role: "owner" | "admin" | "editor" | "viewer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      entity_kind: ["person", "object", "process_kind", "agent", "app"],
      entity_status: ["active", "inactive", "archived"],
      process_status: [
        "created",
        "queued",
        "running",
        "retry_waiting",
        "succeeded",
        "failed",
        "cancelled",
      ],
      workspace_role: ["owner", "admin", "editor", "viewer"],
    },
  },
} as const
