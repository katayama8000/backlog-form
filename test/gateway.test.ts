import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, test } from "node:test";
import { Error as BacklogErrors } from "backlog-js";
import { createBacklogGateway, type OAuthProvider, ReauthRequiredError } from "../src/backlog/client.ts";
import { deriveKey } from "../src/crypto.ts";
import { createBackend } from "../src/backend.ts";
import { openStore } from "../src/node-sqlite.ts";

const HOUR = 60 * 60 * 1000;
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Records the bearer token of each Backlog API call and answers with `body`.
function stubFetch(body: unknown, status = 200) {
  const tokens: string[] = [];
  globalThis.fetch = async (_url, init) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    tokens.push(headers.Authorization ?? "");
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return tokens;
}

function setup(expiresAt: number, refresh: OAuthProvider["refresh"]) {
  const store = openStore(":memory:", deriveKey("x".repeat(32), "test"));
  let refreshes = 0;
  const oauth: OAuthProvider = {
    authorizationUrl: () => "",
    exchangeCode: async () => assert.fail("unexpected"),
    refresh: (...args) => {
      refreshes++;
      return refresh(...args);
    },
  };
  const connection = store.upsertConnection({
    spaceHost: "example.backlog.com",
    userId: 1,
    userName: "Alice",
    accessToken: "old",
    refreshToken: "r1",
    expiresAt,
  });
  return { store, gateway: createBacklogGateway(createBackend(store, oauth.refresh)), connection, refreshes: () => refreshes };
}

test("uses the stored token while it is valid", async () => {
  const { gateway, connection, refreshes } = setup(Date.now() + HOUR, async () => assert.fail("unexpected"));
  const calls = stubFetch({ id: 1, userId: "alice", name: "Alice" });
  await gateway.forConnection(connection).getMyself();
  assert.deepEqual(calls, ["Bearer old"]);
  assert.equal(refreshes(), 0);
});

test("refreshes an expired token once for concurrent requests", async () => {
  const { store, gateway, connection, refreshes } = setup(Date.now() - 1, async () => ({
    accessToken: "new",
    refreshToken: "r2",
    expiresAt: Date.now() + HOUR,
  }));
  const calls = stubFetch({ id: 1, userId: "alice", name: "Alice" });
  const client = gateway.forConnection(connection);
  await Promise.all([client.getMyself(), client.getMyself()]);
  assert.equal(refreshes(), 1);
  assert.deepEqual(calls, ["Bearer new", "Bearer new"]);
  const saved = store.getConnection(connection.id)!;
  assert.equal(saved.accessToken, "new");
  assert.equal(saved.refreshToken, "r2");
});

test("reuses a token another isolate already refreshed", async () => {
  const { store, gateway, connection, refreshes } = setup(Date.now() - 1, async () => ({
    accessToken: "new",
    refreshToken: "r2",
    expiresAt: Date.now() + HOUR,
  }));
  const calls = stubFetch({ id: 1, userId: "alice", name: "Alice" });
  // Each Worker isolate holds its own copy of the expired connection.
  const other = store.getConnection(connection.id)!;
  await gateway.forConnection(connection).getMyself();
  await gateway.forConnection(other).getMyself();
  assert.equal(refreshes(), 1);
  assert.deepEqual(calls, ["Bearer new", "Bearer new"]);
});

test("flags the connection when the refresh token is rejected", async () => {
  const { store, gateway, connection } = setup(Date.now() - 1, async () => {
    throw new BacklogErrors.BacklogApiError(new Response("", { status: 400 }));
  });
  await assert.rejects(gateway.forConnection(connection).getMyself(), ReauthRequiredError);
  assert.equal(store.getConnection(connection.id)!.needsReauth, true);
});

test("stores tokens encrypted", () => {
  const path = join(mkdtempSync(join(tmpdir(), "backlog-form-")), "test.db");
  const store = openStore(path, deriveKey("x".repeat(32), "test"));
  store.upsertConnection({
    spaceHost: "example.backlog.com",
    userId: 1,
    userName: "Alice",
    accessToken: "plain-access-token",
    refreshToken: "plain-refresh-token",
    expiresAt: 0,
  });
  const row = new DatabaseSync(path).prepare("SELECT * FROM connections").get();
  assert.doesNotMatch(JSON.stringify(row), /plain-/);
});
