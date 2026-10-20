import {
  type CustomField,
  CustomFieldType,
  isListField,
} from "../backlog/types.ts";
import { names, type RawInput } from "./input.ts";
import { MESSAGES, type Messages } from "./messages.ts";

export type FieldValue = {
  field: CustomField;
  // Item ids for list fields, otherwise the raw string.
  values: string[];
  otherValue: string;
};

export type Submission = {
  summary: string;
  description: string;
  fields: FieldValue[];
};

export type ValidationResult =
  | { ok: true; submission: Submission }
  | { ok: false; errors: Record<string, string> };

const SUMMARY_MAX = 255;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function asArray(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return (Array.isArray(value) ? value : [value]).filter((v) => v !== "");
}

function validateField(
  field: CustomField,
  values: string[],
  otherValue: string,
  t: Messages["errors"],
): string | null {
  if (values.length === 0 && otherValue === "") {
    return field.required ? t.required : null;
  }

  if (isListField(field)) {
    const ids = new Set(field.items.map((item) => String(item.id)));
    if (values.some((v) => !ids.has(v))) return t.invalidChoice;
    if (otherValue !== "" && !field.allowInput) return t.invalidChoice;
    return null;
  }

  const [value = ""] = values;
  switch (field.typeId) {
    case CustomFieldType.Number: {
      const num = Number(value);
      if (value === "" || !Number.isFinite(num)) return t.number;
      if (field.min != null && num < field.min) return t.min(field.min);
      if (field.max != null && num > field.max) return t.max(field.max);
      return null;
    }
    case CustomFieldType.Date: {
      if (!DATE_PATTERN.test(value)) return t.date;
      // Backlog may return min/max with a time part; compare the date only.
      const min = field.min?.slice(0, 10);
      const max = field.max?.slice(0, 10);
      if (min && value < min) return t.minDate(min);
      if (max && value > max) return t.maxDate(max);
      return null;
    }
    default:
      return null;
  }
}

// The same CustomField list drives both rendering and validation,
// so the form and its checks always reflect Backlog's current settings.
export function validate(
  input: RawInput,
  fields: CustomField[],
  t: Messages["errors"] = MESSAGES.ja.errors,
): ValidationResult {
  const errors: Record<string, string> = {};

  const summary = asArray(input[names.summary])[0] ?? "";
  if (summary === "") errors[names.summary] = t.required;
  else if (summary.length > SUMMARY_MAX) {
    errors[names.summary] = t.tooLong(SUMMARY_MAX);
  }
  const description = asArray(input[names.description])[0] ?? "";

  const values: FieldValue[] = [];
  for (const field of fields) {
    const fieldValues = asArray(input[names.field(field)]);
    const otherValue = asArray(input[names.other(field)])[0] ?? "";
    const error = validateField(field, fieldValues, otherValue, t);
    if (error) errors[names.field(field)] = error;
    else values.push({ field, values: fieldValues, otherValue });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, submission: { summary, description, fields: values } };
}

export const MAX_FILES = 5;
export const MAX_FILE_MB = 10;

export function validateFiles(files: File[], t: Messages["errors"] = MESSAGES.ja.errors): string | null {
  if (files.length > MAX_FILES) return t.tooManyFiles(MAX_FILES);
  const large = files.find((file) => file.size > MAX_FILE_MB * 1024 * 1024);
  return large ? t.fileTooLarge(large.name, MAX_FILE_MB) : null;
}
