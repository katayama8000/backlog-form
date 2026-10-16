// The few Cloudflare Workers types worker.ts uses. @cloudflare/workers-types
// would clash with @types/node, which the rest of the code type-checks against.

declare module "cloudflare:workers" {
  export abstract class DurableObject<Env = unknown> {
    protected ctx: DurableObjectState;
    protected env: Env;
    constructor(ctx: DurableObjectState, env: Env);
  }
}

interface SqlStorageCursor {
  toArray(): Record<string, unknown>[];
}

interface DurableObjectState {
  storage: { sql: { exec(query: string, ...bindings: unknown[]): SqlStorageCursor } };
}

interface DurableObjectId {}

// RPC stubs turn every method into an async one.
type DurableObjectStub<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never;
};

interface DurableObjectNamespace<T> {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub<T>;
}
