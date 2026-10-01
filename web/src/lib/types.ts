export type CaseStatus = "open" | "under_review" | "closed";

export type CaseRow = {
  id: string;
  title: string;
  description: string | null;
  status: CaseStatus;
  created_at: string;
  created_by: string | null;
};

export type ScriptRow = {
  id: string;
  case_id: string;
  name: string | null;
  source_code: string;
  signed_manifest: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
};

export type AuditLogRow = {
  id: string;
  case_id: string;
  script_id: string | null;
  seq: number;
  action: string;
  detail: Record<string, unknown>;
  ts: string;
  hash: string;
  prev_hash: string;
};

export type Database = {
  public: {
    Tables: {
      analysts: {
        Row: {
          id: string;
          name: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          role?: string;
          created_at?: string;
        };
      };
      cases: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          status: CaseStatus;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          status?: CaseStatus;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          status?: CaseStatus;
          created_at?: string;
          created_by?: string | null;
        };
      };
      case_members: {
        Row: {
          case_id: string;
          analyst_id: string;
          role: string;
          created_at: string;
        };
        Insert: {
          case_id: string;
          analyst_id: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          case_id?: string;
          analyst_id?: string;
          role?: string;
          created_at?: string;
        };
      };
      scripts: {
        Row: {
          id: string;
          case_id: string;
          name: string | null;
          source_code: string;
          signed_manifest: Record<string, unknown> | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          case_id: string;
          name?: string | null;
          source_code: string;
          signed_manifest?: Record<string, unknown> | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          case_id?: string;
          name?: string | null;
          source_code?: string;
          signed_manifest?: Record<string, unknown> | null;
          created_at?: string;
          created_by?: string | null;
        };
      };
      evidence_bundles: {
        Row: {
          id: string;
          case_id: string;
          script_id: string | null;
          storage_path: string;
          sha256: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          script_id?: string | null;
          storage_path: string;
          sha256: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          script_id?: string | null;
          storage_path?: string;
          sha256?: string;
          created_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          case_id: string;
          script_id: string | null;
          seq: number;
          action: string;
          detail: Record<string, unknown>;
          ts: string;
          hash: string;
          prev_hash: string;
        };
        Insert: {
          id?: string;
          case_id: string;
          script_id?: string | null;
          seq: number;
          action: string;
          detail: Record<string, unknown>;
          ts: string;
          hash: string;
          prev_hash: string;
        };
        Update: {
          id?: string;
          case_id?: string;
          script_id?: string | null;
          seq?: number;
          action?: string;
          detail?: Record<string, unknown>;
          ts?: string;
          hash?: string;
          prev_hash?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

/* Shared chain constants (browser-safe). Value = SHA-256("GENESIS"),
   the root every Jocky run's chain starts from. */
export const GENESIS_HASH =
  "901131d838b17aac0f7885b81e03cbdc9f5157a00343d30ab22083685ed1416a";

/* ------- /api/run-script response (from the FastAPI service) ------- */

export type AuditEntry = {
  seq: number;
  ts: string;
  action: string;
  detail: Record<string, unknown>;
  prev_hash: string;
  hash: string;
};

export type EvidenceBundleRow = {
  id: string;
  storage_path: string;
  sha256: string;
  created_at: string;
};

export type RunScriptResult = {
  ok: boolean;
  stdout: string;
  chain_status: "INTACT" | "BROKEN";
  audit_entries: AuditEntry[];
  error?: string;
};

export type GenerateReportResult = {
  ok: boolean;
  chain_status: "INTACT" | "BROKEN";
  audit_entries: AuditEntry[];
  signed_bundle: Record<string, unknown>;
  error?: string;
};
