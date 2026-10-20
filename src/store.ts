import { decrypt, encrypt, randomId, sha256 } from "./crypto.ts";

// A Backlog user who authorized this app via OAuth, in one space.
// Public forms create issues with this user's tokens.
export type Connection = {
  id: string;
  spaceHost: string;
  userId: number;
  userName: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  // Set when the refresh token stopped working (e.g. access was revoked).
  needsReauth: boolean;
};

export type Tokens = Pick<Connection, "accessToken" | "refreshToken" | "expiresAt">;

// Set on every issue a form creates. Ids that no longer exist in Backlog
// make it reject the issue, so submitting falls back to no defaults.
export type IssueDefaults = {
  assigneeId: number | null;
  priorityId: number | null;
  categoryIds: number[];
  milestoneIds: number[];
};

export const NO_DEFAULTS: IssueDefaults = { assigneeId: null, priorityId: null, categoryIds: [], milestoneIds: [] };

export function hasDefaults(defaults: IssueDefaults): boolean {
  return (
    defaults.assigneeId !== null ||
    defaults.priorityId !== null ||
    defaults.categoryIds.length > 0 ||
    defaults.milestoneIds.length > 0
  );
}

export type FormRecord = {
  id: string;
  connectionId: string;
  projectId: number;
  projectName: string;
  issueTypeId: number;
  // Empty for forms created before the name was stored.
  issueTypeName: string;
  title: string;
  // Shown under the title on the public form.
  description: string;
  // Custom fields shown on the form. Required fields are always shown.
  fieldIds: number[];
  // Issues get a generated summary, and the form doesn't ask for one.
  autoSummary: boolean;
  issueDefaults: IssueDefaults;
  enabled: boolean;
  createdAt: number;
};

export type FormInput = Omit<FormRecord, "id" | "createdAt" | "autoSummary" | "issueDefaults"> &
  Partial<Pick<FormRecord, "autoSummary" | "issueDefaults">>;

type Row = Record<string, unknown>;

// The SQLite flavors this store runs on: node:sqlite locally and in tests,
// a Durable Object's storage on Cloudflare.
export type SqlDriver = {
  // Runs one or more statements without parameters.
  exec(sql: string): void;
  all(sql: string, ...params: unknown[]): Row[];
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS connections (
  id TEXT PRIMARY KEY,
  space_host TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  user_name TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  needs_reauth INTEGER NOT NULL DEFAULT 0,
  UNIQUE (space_host, user_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS forms (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES connections(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL,
  project_name TEXT NOT NULL,
  issue_type_id INTEGER NOT NULL,
  issue_type_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  field_ids TEXT NOT NULL,
  auto_summary INTEGER NOT NULL DEFAULT 0,
  issue_defaults TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
`;

// Columns added after the first release, for databases created before them.
const ADDED_FORM_COLUMNS = {
  issue_type_name: "TEXT NOT NULL DEFAULT ''",
  description: "TEXT NOT NULL DEFAULT ''",
  auto_summary: "INTEGER NOT NULL DEFAULT 0",
  issue_defaults: "TEXT NOT NULL DEFAULT '{}'",
};

// Tokens are encrypted at rest; everything else is stored as is.
export function createStore(sql: SqlDriver, encryptionKey: Buffer) {
  sql.exec(SCHEMA);
  for (const [column, type] of Object.entries(ADDED_FORM_COLUMNS)) {
    try {
      sql.exec(`ALTER TABLE forms ADD COLUMN ${column} ${type}`);
    } catch (error) {
      if (!String(error).includes("duplicate column")) throw error;
    }
  }

  const one = (query: string, ...params: unknown[]): Row | undefined => sql.all(query, ...params)[0];
  const run = (query: string, ...params: unknown[]): void => void sql.all(query, ...params);
  const seal = (value: string) => encrypt(encryptionKey, value);
  const open = (value: unknown) => decrypt(encryptionKey, String(value));

  function toConnection(row: Row): Connection {
    return {
      id: String(row.id),
      spaceHost: String(row.space_host),
      userId: Number(row.user_id),
      userName: String(row.user_name),
      accessToken: open(row.access_token),
      refreshToken: open(row.refresh_token),
      expiresAt: Number(row.expires_at),
      needsReauth: Number(row.needs_reauth) === 1,
    };
  }

  function toForm(row: Row): FormRecord {
    return {
      id: String(row.id),
      connectionId: String(row.connection_id),
      projectId: Number(row.project_id),
      projectName: String(row.project_name),
      issueTypeId: Number(row.issue_type_id),
      issueTypeName: String(row.issue_type_name),
      title: String(row.title),
      description: String(row.description),
      fieldIds: JSON.parse(String(row.field_ids)) as number[],
      autoSummary: Number(row.auto_summary) === 1,
      issueDefaults: { ...NO_DEFAULTS, ...(JSON.parse(String(row.issue_defaults)) as Partial<IssueDefaults>) },
      enabled: Number(row.enabled) === 1,
      createdAt: Number(row.created_at),
    };
  }

  function getConnection(id: string): Connection | undefined {
    const row = one("SELECT * FROM connections WHERE id = ?", id);
    return row && toConnection(row);
  }

  function getForm(id: string): FormRecord | undefined {
    const row = one("SELECT * FROM forms WHERE id = ?", id);
    return row && toForm(row);
  }

  return {
    // Signing in again replaces the tokens of the same Backlog user.
    upsertConnection(input: Omit<Connection, "id" | "needsReauth">): Connection {
      run(
        `INSERT INTO connections (id, space_host, user_id, user_name, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (space_host, user_id) DO UPDATE SET
           user_name = excluded.user_name,
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expires_at = excluded.expires_at,
           needs_reauth = 0`,
        randomId(),
        input.spaceHost,
        input.userId,
        input.userName,
        seal(input.accessToken),
        seal(input.refreshToken),
        input.expiresAt,
      );
      const row = one(
        "SELECT * FROM connections WHERE space_host = ? AND user_id = ?",
        input.spaceHost,
        input.userId,
      )!;
      return toConnection(row);
    },

    getConnection,

    updateTokens(id: string, tokens: Tokens): void {
      run(
        "UPDATE connections SET access_token = ?, refresh_token = ?, expires_at = ?, needs_reauth = 0 WHERE id = ?",
        seal(tokens.accessToken),
        seal(tokens.refreshToken),
        tokens.expiresAt,
        id,
      );
    },

    markNeedsReauth(id: string): void {
      run("UPDATE connections SET needs_reauth = 1 WHERE id = ?", id);
    },

    // Only a hash of the session token is stored.
    createSession(connectionId: string, ttlMs: number): string {
      const token = randomId(32);
      run("DELETE FROM sessions WHERE expires_at < ?", Date.now());
      run(
        "INSERT INTO sessions (token_hash, connection_id, expires_at) VALUES (?, ?, ?)",
        sha256(token),
        connectionId,
        Date.now() + ttlMs,
      );
      return token;
    },

    findSession(token: string): Connection | undefined {
      const row = one(
        "SELECT connection_id FROM sessions WHERE token_hash = ? AND expires_at > ?",
        sha256(token),
        Date.now(),
      );
      return row ? getConnection(String(row.connection_id)) : undefined;
    },

    deleteSession(token: string): void {
      run("DELETE FROM sessions WHERE token_hash = ?", sha256(token));
    },

    listForms(connectionId: string): FormRecord[] {
      return sql
        .all("SELECT * FROM forms WHERE connection_id = ? ORDER BY created_at DESC", connectionId)
        .map(toForm);
    },

    getForm,

    createForm(input: FormInput): FormRecord {
      const id = randomId();
      run(
        `INSERT INTO forms (id, connection_id, project_id, project_name, issue_type_id, issue_type_name, title, description, field_ids, auto_summary, issue_defaults, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        input.connectionId,
        input.projectId,
        input.projectName,
        input.issueTypeId,
        input.issueTypeName,
        input.title,
        input.description,
        JSON.stringify(input.fieldIds),
        input.autoSummary ? 1 : 0,
        JSON.stringify(input.issueDefaults ?? NO_DEFAULTS),
        input.enabled ? 1 : 0,
        Date.now(),
      );
      return getForm(id)!;
    },

    updateForm(
      id: string,
      patch: Pick<FormRecord, "issueTypeName" | "title" | "description" | "fieldIds" | "autoSummary" | "issueDefaults" | "enabled">,
    ): void {
      run(
        "UPDATE forms SET issue_type_name = ?, title = ?, description = ?, field_ids = ?, auto_summary = ?, issue_defaults = ?, enabled = ? WHERE id = ?",
        patch.issueTypeName,
        patch.title,
        patch.description,
        JSON.stringify(patch.fieldIds),
        patch.autoSummary ? 1 : 0,
        JSON.stringify(patch.issueDefaults),
        patch.enabled ? 1 : 0,
        id,
      );
    },

    deleteForm(id: string): void {
      run("DELETE FROM forms WHERE id = ?", id);
    },
  };
}

export type Store = ReturnType<typeof createStore>;
