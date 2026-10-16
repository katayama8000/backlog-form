import { createApp } from "./app.ts";
import { type Backend, createBackend } from "./backend.ts";
import { createBacklogGateway } from "./backlog/client.ts";
import { createOAuthProvider } from "./backlog/oauth.ts";
import type { Config } from "./config.ts";
import { deriveKey } from "./crypto.ts";
import { createStore, type SqlDriver } from "./store.ts";

// Wiring shared by the Node server and the Cloudflare Worker.

function oauthFor(config: Config) {
  return createOAuthProvider({ ...config.backlog, redirectUri: `${config.appUrl}/oauth/callback` });
}

export function backendFor(config: Config, sql: SqlDriver): Backend {
  const store = createStore(sql, deriveKey(config.appSecret, "token-encryption"));
  return createBackend(store, oauthFor(config).refresh);
}

export function appFor(config: Config, backend: Backend) {
  return createApp({
    store: backend,
    gateway: createBacklogGateway(backend),
    oauth: oauthFor(config),
    turnstile: config.turnstile,
    appUrl: config.appUrl,
    cookieSecret: deriveKey(config.appSecret, "cookie-signing").toString("hex"),
  });
}
