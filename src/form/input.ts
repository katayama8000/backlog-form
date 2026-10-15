import { type CustomField, isMultiValue } from "../backlog/types.ts";

// HTML input names. Kept in one place so render and validate never drift.
export const names = {
  summary: "summary",
  description: "description",
  honeypot: "website",
  field: (field: CustomField) => `cf_${field.id}`,
  other: (field: CustomField) => `cf_${field.id}_other`,
};

export type RawInput = Record<string, string | string[]>;

// Normalizes FormData into plain strings, keeping arrays for multi-value fields.
export function readInput(form: FormData, fields: CustomField[]): RawInput {
  const str = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value.trim() : "";
  };
  const input: RawInput = {
    [names.summary]: str(names.summary),
    [names.description]: str(names.description),
    [names.honeypot]: str(names.honeypot),
  };
  for (const field of fields) {
    const name = names.field(field);
    input[name] = isMultiValue(field)
      ? form.getAll(name).filter((v): v is string => typeof v === "string")
      : str(name);
    input[names.other(field)] = str(names.other(field));
  }
  return input;
}
