import { createApp } from "../src/app.ts";
import type { BacklogClient, BacklogGateway, IssueParams, OAuthProvider } from "../src/backlog/client.ts";
import { deriveKey } from "../src/crypto.ts";
import { createBackend } from "../src/backend.ts";
import { openStore } from "../src/node-sqlite.ts";
import { schema } from "./fixtures.ts";

export const APP_URL = "http://localhost";
const HOUR = 60 * 60 * 1000;

// A real in-memory store with a fake Backlog behind it.
export function setup() {
  const store = openStore(":memory:", deriveKey("x".repeat(32), "test"));
  const issues: IssueParams[] = [];
  const uploads: File[] = [];
  const client: BacklogClient = {
    getMyself: async () => ({ id: 1, userId: "alice", name: "Alice" }),
    getProjects: async () => [schema.project],
    findProject: async (id) => (id === schema.project.id ? schema.project : null),
    getIssueTypes: async () => [schema.issueType, { id: 6, projectId: 1, name: "タスク" }],
    getCustomFields: async () => schema.fields,
    getProjectUsers: async () => [{ id: 1, userId: "alice", name: "Alice" }, { id: 2, userId: "bob", name: "Bob" }],
    getCategories: async () => [{ id: 30, name: "画面" }, { id: 31, name: "API" }],
    getMilestones: async () => [
      { id: 40, name: "v1", archived: false },
      { id: 41, name: "v0", archived: true },
    ],
    getPriorities: async () => [
      { id: 2, name: "高" },
      { id: 3, name: "中" },
      { id: 4, name: "低" },
    ],
    uploadAttachment: async (file) => {
      uploads.push(file);
      return { id: 500 + uploads.length };
    },
    addIssue: async (params) => {
      issues.push(params);
      return { id: 1, issueKey: "TEST-1" };
    },
  };
  const gateway: BacklogGateway = { withToken: () => client, forConnection: () => client };
  const oauth: OAuthProvider = {
    authorizationUrl: (host, state) => `https://${host}/OAuth2AccessRequest.action?state=${state}`,
    exchangeCode: async () => ({ accessToken: "access", refreshToken: "refresh", expiresAt: Date.now() + HOUR }),
    refresh: async () => ({ accessToken: "access2", refreshToken: "refresh2", expiresAt: Date.now() + HOUR }),
  };
  // Tests set up and inspect data through the synchronous store directly.
  const app = createApp({ store: createBackend(store, oauth.refresh), gateway, oauth, turnstile: null, appUrl: APP_URL, cookieSecret: "cookie-secret" });
  const connection = store.upsertConnection({
    spaceHost: "example.backlog.com",
    userId: 1,
    userName: "Alice",
    accessToken: "access",
    refreshToken: "refresh",
    expiresAt: Date.now() + HOUR,
  });
  return { store, client, issues, uploads, app, connection };
}

// A same-origin form POST, as a browser would send it.
export function post(path: string, body: Record<string, string | string[]>, cookie?: string) {
  const data = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    for (const v of [value].flat()) data.append(key, v);
  }
  const headers: Record<string, string> = {
    origin: APP_URL,
    "content-type": "application/x-www-form-urlencoded",
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${APP_URL}${path}`, { method: "POST", body: data, headers });
}

// A same-origin multipart POST with files, as a form with a file input sends it.
export function postFiles(path: string, body: Record<string, string>, files: Record<string, File[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(body)) data.append(key, value);
  for (const [key, list] of Object.entries(files)) for (const file of list) data.append(key, file);
  return new Request(`${APP_URL}${path}`, { method: "POST", body: data, headers: { origin: APP_URL } });
}
