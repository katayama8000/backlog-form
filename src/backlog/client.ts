import {
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
  getProject(projectKey: string): Promise<Project>;
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
    getProject: (projectKey) => getProject(client, projectKey),
    getIssueTypes: (projectKey) => getIssueTypes(client, projectKey),
    // Narrow the SDK's loose entity type to our discriminated union.
    getCustomFields: async (projectKey) =>
      (await getCustomFields(client, projectKey)) as unknown as CustomField[],
    addIssue: (params) => postIssue(client, params),
  };
}
