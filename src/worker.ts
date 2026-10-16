import { DurableObject } from "cloudflare:workers";
import type { Backend } from "./backend.ts";
import { type EnvVars, loadConfig } from "./config.ts";
import { appFor, backendFor } from "./setup.ts";

// The Cloudflare entry point. Requests run in Workers, which may be many
// isolates at once; all state lives in one Durable Object so there is a
// single writer, like the single Node process locally.

type Env = EnvVars & { BACKEND: DurableObjectNamespace<BackendObject> };

export class BackendObject extends DurableObject<Env> {
  #backend: Backend;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const sql = ctx.storage.sql;
    this.#backend = backendFor(loadConfig(env), {
      exec: (query) => void sql.exec(query),
      all: (query, ...params) => sql.exec(query, ...params).toArray(),
    });
  }

  // One RPC method for the whole Backend keeps this class free of boilerplate.
  call(method: keyof Backend, args: unknown[]): Promise<unknown> {
    return (this.#backend[method] as (...a: unknown[]) => Promise<unknown>)(...args);
  }
}

function remoteBackend(env: Env): Backend {
  return new Proxy({} as Backend, {
    get(_, method) {
      // Not a thenable, so it can be returned from async functions.
      if (method === "then" || typeof method !== "string") return undefined;
      // Stubs are bound to the request that created them, so get one per call.
      return (...args: unknown[]) =>
        env.BACKEND.get(env.BACKEND.idFromName("main")).call(method as keyof Backend, args);
    },
  });
}

let app: ReturnType<typeof appFor> | undefined;

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    app ??= appFor(loadConfig(env), remoteBackend(env));
    return app.fetch(request);
  },
};
