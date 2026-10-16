import type { BacklogClient } from "./client.ts";
import { unmark } from "./marker.ts";
import type { CustomField, IssueType, Project } from "./types.ts";

export type FormSchema = {
  project: Project;
  issueType: IssueType;
  // Issue type name without the marker.
  title: string;
  // Only marked fields, with the marker stripped from their names.
  fields: CustomField[];
};

const TTL_MS = 5 * 60 * 1000;

// Caches schemas in memory to stay well within Backlog's rate limits.
// Misses are cached too, so probing random URLs doesn't hit the API each time.
// Fine for a single process; swap for a shared store if scaled out.
export function createSchemaLoader(client: BacklogClient) {
  const cache = new Map<string, { schema: FormSchema | null; expiresAt: number }>();

  async function fetchSchema(
    projectKey: string,
    issueTypeId: number,
  ): Promise<FormSchema | null> {
    // Check the project first so unmarked projects cost a single request.
    const project = await client.findProject(projectKey);
    if (!project || project.archived || unmark(project.name) === undefined) {
      return null;
    }
    const [issueTypes, customFields] = await Promise.all([
      client.getIssueTypes(projectKey),
      client.getCustomFields(projectKey),
    ]);
    const issueType = issueTypes.find((t) => t.id === issueTypeId);
    const title = issueType && unmark(issueType.name);
    if (!issueType || title === undefined) return null;

    const fields: CustomField[] = [];
    for (const field of customFields) {
      const applies =
        field.applicableIssueTypes.length === 0 ||
        field.applicableIssueTypes.includes(issueType.id);
      if (!applies) continue;
      const name = unmark(field.name);
      if (name !== undefined) {
        fields.push({ ...field, name });
      } else if (field.required) {
        // Backlog would reject every submission, so fail loudly instead.
        throw new Error(
          `Required custom field "${field.name}" on ${projectKey}/${issueType.name} is not marked with [form]`,
        );
      }
    }
    return { project, issueType, title, fields };
  }

  return {
    async load(
      projectKey: string,
      issueTypeId: number,
      { fresh = false }: { fresh?: boolean } = {},
    ): Promise<FormSchema | null> {
      const key = `${projectKey}/${issueTypeId}`;
      const cached = cache.get(key);
      if (!fresh && cached && cached.expiresAt > Date.now()) {
        return cached.schema;
      }
      const schema = await fetchSchema(projectKey, issueTypeId);
      cache.set(key, { schema, expiresAt: Date.now() + TTL_MS });
      return schema;
    },
  };
}

export type SchemaLoader = ReturnType<typeof createSchemaLoader>;
