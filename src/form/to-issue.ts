import type { FormSchema } from "../backlog/schema.ts";
import type { FormDefinition } from "../forms.ts";
import type { Submission } from "./validate.ts";

export function toIssueParams(
  form: FormDefinition,
  schema: FormSchema,
  submission: Submission,
): URLSearchParams {
  const params = new URLSearchParams({
    projectId: String(schema.project.id),
    issueTypeId: String(schema.issueType.id),
    priorityId: String(form.priorityId),
    summary: submission.summary,
  });
  if (submission.description !== "") {
    params.set("description", submission.description);
  }
  for (const { field, values, otherValue } of submission.fields) {
    // Multi-value fields repeat the same key, one entry per item id.
    for (const value of values) params.append(`customField_${field.id}`, value);
    if (otherValue !== "") {
      params.set(`customField_${field.id}_otherValue`, otherValue);
    }
  }
  return params;
}
