import {
  Error as BacklogErrors,
  createClient,
  getCustomFields,
  getIssueTypes,
  getMyself,
  getProject,
  getProjects,
  type Option,
  postIssue,
} from "backlog-js";
import type { Connection, Store, Tokens } from "../store.ts";
import type { CreatedIssue, CustomField, IssueType, Project, User } from "./types.ts";

export type IssueParams = Option.Issue.PostIssueParams;

export type BacklogClient = {
  getMyself(): Promise<User>;
  // Projects the user has joined, excluding archived ones.
  getProjects(): Promise<Project[]>;
  // Resolves to null when the project doesn't exist or isn't visible to the user.
  findProject(projectId: number): Promise<Project | null>;
  getIssueTypes(projectId: number): Promise<IssueType[]>;
  getCustomFields(projectId: number): Promise<CustomField[]>;
  addIssue(params: IssueParams): Promise<CreatedIssue>;
};

export type BacklogGateway = {
  // Right after OAuth, before a connection is stored.
  withToken(spaceHost: string, accessToken: string): BacklogClient;
  // Refreshes the connection's access token as needed.
  forConnection(connection: Connection): BacklogClient;
};

export type OAuthProvider = {
  authorizationUrl(spaceHost: string, state: string): string;
  exchangeCode(spaceHost: string, code: string): Promise<Tokens>;
  refresh(spaceHost: string, refreshToken: string): Promise<Tokens>;
};

// Thrown when a connection's tokens no longer work; the owner must sign in again.
export class ReauthRequiredError extends Error {}

function isNotFound(error: unknown): boolean {
  return (
    error instanceof BacklogErrors.BacklogApiError &&
    (error.status === 403 || error.status === 404)
  );
}

function clientFor(spaceHost: string, accessToken: string): BacklogClient {
  const client = createClient({ host: spaceHost, accessToken });
  return {
    getMyself: () => getMyself(client),
    getProjects: () => getProjects(client, { archived: false }),
    findProject: async (projectId) => {
      try {
        return await getProject(client, projectId);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    getIssueTypes: (projectId) => getIssueTypes(client, projectId),
    // Narrow the SDK's loose entity type to our discriminated union.
    getCustomFields: async (projectId) =>
      (await getCustomFields(client, projectId)) as unknown as CustomField[],
    addIssue: (params) => postIssue(client, params),
  };
}

// Refresh a minute early so a token doesn't expire mid-request.
const EXPIRY_MARGIN_MS = 60 * 1000;

export function createBacklogGateway(store: Store, oauth: OAuthProvider): BacklogGateway {
  // One refresh per connection at a time; concurrent requests share it.
  const refreshing = new Map<string, Promise<string>>();

  function refresh(connection: Connection): Promise<string> {
    const pending = refreshing.get(connection.id);
    if (pending) return pending;
    const task = (async () => {
      // Another request may have refreshed already; use the stored tokens.
      const latest = store.getConnection(connection.id) ?? connection;
      if (latest.expiresAt - EXPIRY_MARGIN_MS > Date.now() && latest.accessToken !== connection.accessToken) {
        return latest.accessToken;
      }
      try {
        const tokens = await oauth.refresh(latest.spaceHost, latest.refreshToken);
        store.updateTokens(latest.id, tokens);
        Object.assign(connection, tokens);
        return tokens.accessToken;
      } catch (error) {
        if (error instanceof BacklogErrors.BacklogError && error.status < 500) {
          store.markNeedsReauth(latest.id);
          throw new ReauthRequiredError(`Connection ${latest.id} needs to sign in again`);
        }
        throw error;
      }
    })().finally(() => refreshing.delete(connection.id));
    refreshing.set(connection.id, task);
    return task;
  }

  async function accessToken(connection: Connection): Promise<string> {
    if (connection.needsReauth) {
      throw new ReauthRequiredError(`Connection ${connection.id} needs to sign in again`);
    }
    if (connection.expiresAt - EXPIRY_MARGIN_MS > Date.now()) return connection.accessToken;
    return refresh(connection);
  }

  return {
    withToken: clientFor,
    forConnection(connection) {
      // Runs a call with a valid token, retrying once if Backlog rejects it as expired.
      async function call<T>(fn: (client: BacklogClient) => Promise<T>): Promise<T> {
        const token = await accessToken(connection);
        try {
          return await fn(clientFor(connection.spaceHost, token));
        } catch (error) {
          if (!(error instanceof BacklogErrors.BacklogAuthError)) throw error;
          return fn(clientFor(connection.spaceHost, await refresh(connection)));
        }
      }
      return {
        getMyself: () => call((c) => c.getMyself()),
        getProjects: () => call((c) => c.getProjects()),
        findProject: (id) => call((c) => c.findProject(id)),
        getIssueTypes: (id) => call((c) => c.getIssueTypes(id)),
        getCustomFields: (id) => call((c) => c.getCustomFields(id)),
        addIssue: (params) => call((c) => c.addIssue(params)),
      };
    },
  };
}
