import type { IssueParams } from "../backlog/client.ts";
import type { FormSchema } from "../backlog/schema.ts";
import { PRIORITY_NORMAL } from "../backlog/types.ts";
import type { IssueDefaults } from "../store.ts";
import type { Submission } from "./validate.ts";


export function toIssueParams(
  schema: FormSchema,
  submission: Submission,
  defaults: IssueDefaults = schema.issueDefaults,
): IssueParams {
  const params: IssueParams = {
    projectId: schema.project.id,
    issueTypeId: schema.issueType.id,
    // Backlog requires a priority on issue creation.
    priorityId: defaults.priorityId ?? PRIORITY_NORMAL,
    summary: submission.summary,
  };
  if (defaults.assigneeId !== null) params.assigneeId = defaults.assigneeId;
  if (defaults.categoryIds.length > 0) params.categoryId = defaults.categoryIds;
  if (defaults.milestoneIds.length > 0) params.milestoneId = defaults.milestoneIds;
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
