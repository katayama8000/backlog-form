import type { IssueParams } from "../backlog/client.ts";
import type { FormSchema } from "../backlog/schema.ts";
import type { FormDefinition } from "../forms.ts";
import type { Submission } from "./validate.ts";

export function toIssueParams(
  form: FormDefinition,
  schema: FormSchema,
  submission: Submission,
): IssueParams {
  const params: IssueParams = {
    projectId: schema.project.id,
    issueTypeId: schema.issueType.id,
    priorityId: form.priorityId,
    summary: submission.summary,
  };
  if (submission.description !== "") {
    params.description = submission.description;
  }
  for (const { field, values, otherValue } of submission.fields) {
    // backlog-js expands arrays into indexed customField_N[i] keys.
    if (values.length > 0) {
      params[`customField_${field.id}`] = values.length === 1 ? values[0] : values;
    }
    if (otherValue !== "") {
      params[`customField_${field.id}_otherValue`] = otherValue;
    }
  }
  return params;
}
