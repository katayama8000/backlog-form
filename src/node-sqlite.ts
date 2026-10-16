import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { createStore, type SqlDriver } from "./store.ts";

// node:sqlite, for local development and tests.
export function nodeSqlDriver(path: string): SqlDriver {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  return {
    exec: (sql) => db.exec(sql),
    all: (sql, ...params) => db.prepare(sql).all(...(params as SQLInputValue[])),
  };
}

export function openStore(path: string, encryptionKey: Buffer) {
  return createStore(nodeSqlDriver(path), encryptionKey);
}
