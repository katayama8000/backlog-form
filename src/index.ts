import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.ts";
import { nodeSqlDriver } from "./node-sqlite.ts";
import { appFor, backendFor } from "./setup.ts";

// The Node server, for local development. See worker.ts for Cloudflare.
const config = loadConfig(process.env);
mkdirSync(dirname(config.databasePath), { recursive: true });
const app = appFor(config, backendFor(config, nodeSqlDriver(config.databasePath)));

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`Listening on http://localhost:${info.port}`);
});
