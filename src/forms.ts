// Each public form maps to one (project, issue type) pair in Backlog.
// Every custom field applicable to that issue type is exposed on the form,
// so use an issue type dedicated to external submissions.
export type FormDefinition = {
  slug: string;
  title: string;
  projectKey: string;
  issueTypeId: number;
  // Backlog requires a priority on issue creation. 3 is "Normal" by default.
  priorityId: number;
};

export const forms: FormDefinition[] = [
  {
    slug: "support",
    title: "お問い合わせ",
    projectKey: "EXAMPLE",
    issueTypeId: 0,
    priorityId: 3,
  },
];

export function findForm(slug: string): FormDefinition | undefined {
  return forms.find((form) => form.slug === slug);
}
