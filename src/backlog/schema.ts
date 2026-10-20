import type { Backend } from "../backend.ts";
import type { Lang } from "../form/messages.ts";
import type { FormRecord, IssueDefaults } from "../store.ts";
import type { BacklogGateway } from "./client.ts";
import type { CustomField, IssueType, Project } from "./types.ts";

export type FormSchema = {
  project: Project;
  issueType: IssueType;
  title: string;
  description: string;
  autoSummary: boolean;
  issueDefaults: IssueDefaults;
  lang: Lang;
  fields: CustomField[];
};

// The form exists but can't be shown right now: the owner's access was
// revoked, or the project or issue type is gone.
export class FormUnavailableError extends Error {}

// Custom fields of a project that apply to an issue type, in Backlog's order.
export function applicableFields(fields: CustomField[], issueTypeId: number): CustomField[] {
  return fields.filter(
    (f) => f.applicableIssueTypes.length === 0 || f.applicableIssueTypes.includes(issueTypeId),
  );
}

const TTL_MS = 5 * 60 * 1000;

// Caches schemas in memory to stay well within Backlog's rate limits.
// Each process (or Worker isolate) has its own cache. Entries remember the
// form's settings they were built from, so saving a form takes effect
// everywhere right away; only changes made in Backlog can take up to TTL_MS.
export function createSchemaLoader(store: Backend, gateway: BacklogGateway) {
  const cache = new Map<string, { settings: string; schema: FormSchema; expiresAt: number }>();

  async function fetchSchema(form: FormRecord): Promise<FormSchema> {
    const connection = await store.getConnection(form.connectionId);
    if (!connection) throw new FormUnavailableError(`Connection of form ${form.id} is gone`);
    const client = gateway.forConnection(connection);

    const project = await client.findProject(form.projectId);
    if (!project || project.archived) {
      throw new FormUnavailableError(`Project ${form.projectId} of form ${form.id} is unavailable`);
    }
    const [issueTypes, customFields] = await Promise.all([
      client.getIssueTypes(form.projectId),
      client.getCustomFields(form.projectId),
    ]);
    const issueType = issueTypes.find((t) => t.id === form.issueTypeId);
    if (!issueType) {
      throw new FormUnavailableError(`Issue type ${form.issueTypeId} of form ${form.id} is gone`);
    }
    // Required fields are always shown: Backlog rejects issues without them.
    const selected = new Set(form.fieldIds);
    const fields = applicableFields(customFields, issueType.id).filter(
      (f) => f.required || selected.has(f.id),
    );
    return {
      project,
      issueType,
      title: form.title,
      description: form.description,
      autoSummary: form.autoSummary,
      issueDefaults: form.issueDefaults,
      lang: form.lang,
      fields,
    };
  }

  return {
    async load(form: FormRecord, { fresh = false }: { fresh?: boolean } = {}): Promise<FormSchema> {
      const settings = JSON.stringify([form.title, form.description, form.fieldIds, form.autoSummary, form.issueDefaults, form.lang]);
      const cached = cache.get(form.id);
      if (!fresh && cached && cached.settings === settings && cached.expiresAt > Date.now()) {
        return cached.schema;
      }
      const schema = await fetchSchema(form);
      cache.set(form.id, { settings, schema, expiresAt: Date.now() + TTL_MS });
      return schema;
    },
    invalidate(formId: string): void {
      cache.delete(formId);
    },
  };
}

export type SchemaLoader = ReturnType<typeof createSchemaLoader>;
