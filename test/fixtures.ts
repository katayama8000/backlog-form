import type { FormSchema } from "../src/backlog/schema.ts";
import { NO_DEFAULTS } from "../src/store.ts";
import type { CustomField } from "../src/backlog/types.ts";

const base = { projectId: 1, description: "", required: false, applicableIssueTypes: [] };

export const textField: CustomField = { ...base, id: 10, typeId: 1, name: "会社名", required: true };
export const numberField: CustomField = { ...base, id: 11, typeId: 3, name: "人数", min: 1, max: 100 };
export const dateField: CustomField = { ...base, id: 12, typeId: 4, name: "希望日", min: "2026-01-01", max: null };
export const checkboxField: CustomField = {
  ...base,
  id: 13,
  typeId: 7,
  name: "対象",
  allowInput: true,
  items: [
    { id: 100, name: "Web", displayOrder: 0 },
    { id: 101, name: "iOS", displayOrder: 1 },
  ],
};

export const fields = [textField, numberField, dateField, checkboxField];

export const schema: FormSchema = {
  project: { id: 1, projectKey: "TEST", name: "Test", archived: false },
  issueType: { id: 5, projectId: 1, name: "お問い合わせ" },
  title: "お問い合わせ",
  description: "",
  autoSummary: false,
  issueDefaults: NO_DEFAULTS,
  fields,
};
