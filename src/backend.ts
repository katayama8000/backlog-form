import { Error as BacklogErrors } from "backlog-js";
import type { Store } from "./store.ts";

// What the rest of the app needs from storage, plus token refresh.
// On Cloudflare it lives in a single Durable Object and is called over RPC,
// so every method is async and only plain data crosses the boundary.
// Keeping refresh here means a connection's tokens are refreshed in one place:
// Backlog rotates refresh tokens, so two concurrent refreshes would sign the
// owner out.
export type Backend = {
  [K in keyof Store]: (...args: Parameters<Store[K]>) => Promise<ReturnType<Store[K]>>;
} & {
  // Returns a fresh access token, or "reauth" when the owner must sign in again.
  // `staleAccessToken` is the token the caller found expired or rejected.
  refreshAccessToken(connectionId: string, staleAccessToken: string): Promise<AccessToken | "reauth">;
};

export type AccessToken = { accessToken: string; expiresAt: number };

export type TokenRefresher = (
  spaceHost: string,
  refreshToken: string,
) => Promise<{ accessToken: string; refreshToken: string; expiresAt: number }>;

// Tokens this close to expiry count as expired, so one doesn't lapse mid-request.
export const EXPIRY_MARGIN_MS = 60 * 1000;

export function createBackend(store: Store, refresh: TokenRefresher): Backend {
  // One refresh per connection at a time; concurrent callers share it.
  const refreshing = new Map<string, Promise<AccessToken | "reauth">>();

  async function refreshAccessToken(connectionId: string, staleAccessToken: string): Promise<AccessToken | "reauth"> {
    const connection = store.getConnection(connectionId);
    if (!connection || connection.needsReauth) return "reauth";
    // Someone else already refreshed it.
    if (connection.accessToken !== staleAccessToken && connection.expiresAt - EXPIRY_MARGIN_MS > Date.now()) {
      return { accessToken: connection.accessToken, expiresAt: connection.expiresAt };
    }
    try {
      const tokens = await refresh(connection.spaceHost, connection.refreshToken);
      store.updateTokens(connection.id, tokens);
      return { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt };
    } catch (error) {
      if (error instanceof BacklogErrors.BacklogError && error.status < 500) {
        store.markNeedsReauth(connection.id);
        return "reauth";
      }
      throw error;
    }
  }

  const backend = {} as Record<string, (...args: never[]) => Promise<unknown>>;
  for (const [name, method] of Object.entries(store)) {
    backend[name] = async (...args: never[]) => (method as (...a: never[]) => unknown)(...args);
  }
  return Object.assign(backend as unknown as Backend, {
    refreshAccessToken(connectionId: string, staleAccessToken: string) {
      const pending = refreshing.get(connectionId);
      if (pending) return pending;
      const task = refreshAccessToken(connectionId, staleAccessToken).finally(() =>
        refreshing.delete(connectionId),
      );
      refreshing.set(connectionId, task);
      return task;
    },
  });
}
