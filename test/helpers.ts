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
  const client: BacklogClient = {
    getMyself: async () => ({ id: 1, userId: "alice", name: "Alice" }),
    getProjects: async () => [schema.project],
    findProject: async (id) => (id === schema.project.id ? schema.project : null),
    getIssueTypes: async () => [schema.issueType, { id: 6, projectId: 1, name: "タスク" }],
    getCustomFields: async () => schema.fields,
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
  return { store, client, issues, app, connection };
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
