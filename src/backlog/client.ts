import type { CreatedIssue, CustomField, IssueType, Project } from "./types.ts";

export class BacklogApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Backlog API responded with ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export type BacklogClient = {
  getProject(projectKey: string): Promise<Project>;
  getIssueTypes(projectKey: string): Promise<IssueType[]>;
  getCustomFields(projectKey: string): Promise<CustomField[]>;
  addIssue(params: URLSearchParams): Promise<CreatedIssue>;
};

// A thin fetch wrapper covering only the endpoints this app needs.
export function createBacklogClient(options: {
  spaceUrl: string;
  apiKey: string;
}): BacklogClient {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = new URL(`/api/v2${path}`, options.spaceUrl);
    url.searchParams.set("apiKey", options.apiKey);
    const res = await fetch(url, init);
    if (!res.ok) throw new BacklogApiError(res.status, await res.text());
    return (await res.json()) as T;
  }

  const key = encodeURIComponent;
  return {
    getProject: (projectKey) => request(`/projects/${key(projectKey)}`),
    getIssueTypes: (projectKey) =>
      request(`/projects/${key(projectKey)}/issueTypes`),
    getCustomFields: (projectKey) =>
      request(`/projects/${key(projectKey)}/customFields`),
    addIssue: (params) =>
      request("/issues", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      }),
  };
}
