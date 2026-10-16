import { OAuth2 } from "backlog-js";
import type { Tokens } from "../store.ts";
import type { OAuthProvider } from "./client.ts";

// Backlog spaces live under these domains. Restricting the host keeps the
// OAuth flow (and the client secret) from being pointed at arbitrary servers.
const SPACE_HOST = /^[a-z0-9][a-z0-9-]*\.(backlog\.com|backlog\.jp|backlogtool\.com)$/;

// Accepts "example", "example.backlog.com" or "https://example.backlog.com/...".
export function parseSpaceHost(input: string): string | undefined {
  let value = input.trim().toLowerCase();
  if (value === "") return undefined;
  if (!value.includes(".")) value = `${value}.backlog.com`;
  try {
    const host = new URL(value.includes("://") ? value : `https://${value}`).host;
    return SPACE_HOST.test(host) ? host : undefined;
  } catch {
    return undefined;
  }
}

export function createOAuthProvider(options: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): OAuthProvider {
  const oauth = new OAuth2({ clientId: options.clientId, clientSecret: options.clientSecret });
  const toTokens = (t: { access_token: string; refresh_token: string; expires_in: number }): Tokens => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
  });

  return {
    authorizationUrl: (spaceHost, state) =>
      oauth.getAuthorizationURL({ host: spaceHost, redirectUri: options.redirectUri, state }),
    exchangeCode: async (spaceHost, code) =>
      toTokens(await oauth.getAccessToken({ host: spaceHost, code, redirectUri: options.redirectUri })),
    refresh: async (spaceHost, refreshToken) =>
      toTokens(await oauth.refreshAccessToken({ host: spaceHost, refreshToken })),
  };
}
