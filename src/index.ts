import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { createBacklogClient } from "./backlog/client.ts";
import { loadConfig } from "./config.ts";

const config = loadConfig();
const app = createApp({
  backlog: createBacklogClient(config.backlog),
  turnstile: config.turnstile,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
