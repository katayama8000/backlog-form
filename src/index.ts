import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createBacklogGateway } from "./backlog/client.ts";
import { createOAuthProvider } from "./backlog/oauth.ts";
import { loadConfig } from "./config.ts";
import { deriveKey } from "./crypto.ts";
import { openStore } from "./store.ts";

const config = loadConfig();
mkdirSync(dirname(config.databasePath), { recursive: true });
const store = openStore(config.databasePath, deriveKey(config.appSecret, "token-encryption"));
const oauth = createOAuthProvider({
  ...config.backlog,
  redirectUri: `${config.appUrl}/oauth/callback`,
});
const app = createApp({
  store,
  gateway: createBacklogGateway(store, oauth),
  oauth,
  turnstile: config.turnstile,
  appUrl: config.appUrl,
  cookieSecret: deriveKey(config.appSecret, "cookie-signing").toString("hex"),
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
