import { DatabaseSync } from "node:sqlite";
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

export type FormRecord = {
  id: string;
  connectionId: string;
  projectId: number;
  projectName: string;
  issueTypeId: number;
  title: string;
  // Custom fields shown on the form. Required fields are always shown.
  fieldIds: number[];
  enabled: boolean;
  createdAt: number;
};

export type FormInput = Omit<FormRecord, "id" | "createdAt">;

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
  title TEXT NOT NULL,
  field_ids TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
`;

type Row = Record<string, string | number | null>;

// Tokens are encrypted at rest; everything else is stored as is.
export function openStore(path: string, encryptionKey: Buffer) {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);

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
      needsReauth: row.needs_reauth === 1,
    };
  }

  function toForm(row: Row): FormRecord {
    return {
      id: String(row.id),
      connectionId: String(row.connection_id),
      projectId: Number(row.project_id),
      projectName: String(row.project_name),
      issueTypeId: Number(row.issue_type_id),
      title: String(row.title),
      fieldIds: JSON.parse(String(row.field_ids)) as number[],
      enabled: row.enabled === 1,
      createdAt: Number(row.created_at),
    };
  }

  function getConnection(id: string): Connection | undefined {
    const row = db.prepare("SELECT * FROM connections WHERE id = ?").get(id) as Row | undefined;
    return row && toConnection(row);
  }

  function getForm(id: string): FormRecord | undefined {
    const row = db.prepare("SELECT * FROM forms WHERE id = ?").get(id) as Row | undefined;
    return row && toForm(row);
  }

  return {
    // Signing in again replaces the tokens of the same Backlog user.
    upsertConnection(input: Omit<Connection, "id" | "needsReauth">): Connection {
      db.prepare(
        `INSERT INTO connections (id, space_host, user_id, user_name, access_token, refresh_token, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (space_host, user_id) DO UPDATE SET
           user_name = excluded.user_name,
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expires_at = excluded.expires_at,
           needs_reauth = 0`,
      ).run(
        randomId(),
        input.spaceHost,
        input.userId,
        input.userName,
        seal(input.accessToken),
        seal(input.refreshToken),
        input.expiresAt,
      );
      const row = db
        .prepare("SELECT * FROM connections WHERE space_host = ? AND user_id = ?")
        .get(input.spaceHost, input.userId) as Row;
      return toConnection(row);
    },

    getConnection,

    updateTokens(id: string, tokens: Tokens): void {
      db.prepare(
        "UPDATE connections SET access_token = ?, refresh_token = ?, expires_at = ?, needs_reauth = 0 WHERE id = ?",
      ).run(seal(tokens.accessToken), seal(tokens.refreshToken), tokens.expiresAt, id);
    },

    markNeedsReauth(id: string): void {
      db.prepare("UPDATE connections SET needs_reauth = 1 WHERE id = ?").run(id);
    },

    // Only a hash of the session token is stored.
    createSession(connectionId: string, ttlMs: number): string {
      const token = randomId(32);
      db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
      db.prepare("INSERT INTO sessions (token_hash, connection_id, expires_at) VALUES (?, ?, ?)").run(
        sha256(token),
        connectionId,
        Date.now() + ttlMs,
      );
      return token;
    },

    findSession(token: string): Connection | undefined {
      const row = db
        .prepare("SELECT connection_id FROM sessions WHERE token_hash = ? AND expires_at > ?")
        .get(sha256(token), Date.now()) as Row | undefined;
      return row ? getConnection(String(row.connection_id)) : undefined;
    },

    deleteSession(token: string): void {
      db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
    },

    listForms(connectionId: string): FormRecord[] {
      const rows = db
        .prepare("SELECT * FROM forms WHERE connection_id = ? ORDER BY created_at DESC")
        .all(connectionId) as Row[];
      return rows.map(toForm);
    },

    getForm,

    createForm(input: FormInput): FormRecord {
      const id = randomId();
      db.prepare(
        `INSERT INTO forms (id, connection_id, project_id, project_name, issue_type_id, title, field_ids, enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.connectionId,
        input.projectId,
        input.projectName,
        input.issueTypeId,
        input.title,
        JSON.stringify(input.fieldIds),
        input.enabled ? 1 : 0,
        Date.now(),
      );
      return getForm(id)!;
    },

    updateForm(id: string, patch: Pick<FormRecord, "title" | "fieldIds" | "enabled">): void {
      db.prepare("UPDATE forms SET title = ?, field_ids = ?, enabled = ? WHERE id = ?").run(
        patch.title,
        JSON.stringify(patch.fieldIds),
        patch.enabled ? 1 : 0,
        id,
      );
    },

    deleteForm(id: string): void {
      db.prepare("DELETE FROM forms WHERE id = ?").run(id);
    },
  };
}

export type Store = ReturnType<typeof openStore>;
