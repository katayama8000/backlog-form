import {
  Error as BacklogErrors,
  createClient,
  getCustomFields,
  getIssueTypes,
  getProject,
  type Option,
  postIssue,
} from "backlog-js";
import type { CreatedIssue, CustomField, IssueType, Project } from "./types.ts";

export type IssueParams = Option.Issue.PostIssueParams;

export type BacklogClient = {
  // Resolves to null when the project doesn't exist or isn't visible to the key.
  findProject(projectKey: string): Promise<Project | null>;
  getIssueTypes(projectKey: string): Promise<IssueType[]>;
  getCustomFields(projectKey: string): Promise<CustomField[]>;
  addIssue(params: IssueParams): Promise<CreatedIssue>;
};

// Adapts backlog-js to the endpoints this app needs. Errors surface as
// backlog-js's BacklogApiError / BacklogAuthError.
export function createBacklogClient(options: {
  spaceUrl: string;
  apiKey: string;
}): BacklogClient {
  // backlog-js takes a bare host and always talks HTTPS.
  const client = createClient({
    host: new URL(options.spaceUrl).host,
    apiKey: options.apiKey,
  });
  return {
    findProject: async (projectKey) => {
      try {
        return await getProject(client, projectKey);
      } catch (error) {
        if (
          error instanceof BacklogErrors.BacklogApiError &&
          (error.status === 403 || error.status === 404)
        ) {
          return null;
        }
        throw error;
      }
    },
    getIssueTypes: (projectKey) => getIssueTypes(client, projectKey),
    // Narrow the SDK's loose entity type to our discriminated union.
    getCustomFields: async (projectKey) =>
      (await getCustomFields(client, projectKey)) as unknown as CustomField[],
    addIssue: (params) => postIssue(client, params),
  };
}
