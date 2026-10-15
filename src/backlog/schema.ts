import type { FormDefinition } from "../forms.ts";
import type { BacklogClient } from "./client.ts";
import type { CustomField, IssueType, Project } from "./types.ts";

export type FormSchema = {
  project: Project;
  issueType: IssueType;
  fields: CustomField[];
};

const TTL_MS = 5 * 60 * 1000;

// Caches schemas in memory to stay well within Backlog's rate limits.
// Fine for a single process; swap for a shared store if scaled out.
export function createSchemaLoader(client: BacklogClient) {
  const cache = new Map<string, { schema: FormSchema; expiresAt: number }>();

  async function fetchSchema(form: FormDefinition): Promise<FormSchema> {
    const [project, issueTypes, customFields] = await Promise.all([
      client.getProject(form.projectKey),
      client.getIssueTypes(form.projectKey),
      client.getCustomFields(form.projectKey),
    ]);
    const issueType = issueTypes.find((t) => t.id === form.issueTypeId);
    if (!issueType) {
      throw new Error(
        `Issue type ${form.issueTypeId} not found in project ${form.projectKey}`,
      );
    }
    const fields = customFields.filter(
      (f) =>
        f.applicableIssueTypes.length === 0 ||
        f.applicableIssueTypes.includes(issueType.id),
    );
    return { project, issueType, fields };
  }

  return {
    async load(
      form: FormDefinition,
      { fresh = false }: { fresh?: boolean } = {},
    ): Promise<FormSchema> {
      const cached = cache.get(form.slug);
      if (!fresh && cached && cached.expiresAt > Date.now()) {
        return cached.schema;
      }
      const schema = await fetchSchema(form);
      cache.set(form.slug, { schema, expiresAt: Date.now() + TTL_MS });
      return schema;
    },
  };
}

export type SchemaLoader = ReturnType<typeof createSchemaLoader>;
