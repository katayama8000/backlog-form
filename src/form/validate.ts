import {
  type CustomField,
  CustomFieldType,
  isListField,
} from "../backlog/types.ts";
import { names, type RawInput } from "./input.ts";

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
): string | null {
  if (values.length === 0 && otherValue === "") {
    return field.required ? "入力してください" : null;
  }

  if (isListField(field)) {
    const ids = new Set(field.items.map((item) => String(item.id)));
    if (values.some((v) => !ids.has(v))) return "選択肢が不正です";
    if (otherValue !== "" && !field.allowInput) return "選択肢が不正です";
    return null;
  }

  const [value = ""] = values;
  switch (field.typeId) {
    case CustomFieldType.Number: {
      const num = Number(value);
      if (value === "" || !Number.isFinite(num)) return "数値を入力してください";
      if (field.min != null && num < field.min) return `${field.min} 以上で入力してください`;
      if (field.max != null && num > field.max) return `${field.max} 以下で入力してください`;
      return null;
    }
    case CustomFieldType.Date: {
      if (!DATE_PATTERN.test(value)) return "日付を入力してください";
      // Backlog may return min/max with a time part; compare the date only.
      const min = field.min?.slice(0, 10);
      const max = field.max?.slice(0, 10);
      if (min && value < min) return `${min} 以降の日付を入力してください`;
      if (max && value > max) return `${max} 以前の日付を入力してください`;
      return null;
    }
    default:
      return null;
  }
}

// The same CustomField list drives both rendering and validation,
// so the form and its checks always reflect Backlog's current settings.
export function validate(input: RawInput, fields: CustomField[]): ValidationResult {
  const errors: Record<string, string> = {};

  const summary = asArray(input[names.summary])[0] ?? "";
  if (summary === "") errors[names.summary] = "入力してください";
  else if (summary.length > SUMMARY_MAX) {
    errors[names.summary] = `${SUMMARY_MAX} 文字以内で入力してください`;
  }
  const description = asArray(input[names.description])[0] ?? "";

  const values: FieldValue[] = [];
  for (const field of fields) {
    const fieldValues = asArray(input[names.field(field)]);
    const otherValue = asArray(input[names.other(field)])[0] ?? "";
    const error = validateField(field, fieldValues, otherValue);
    if (error) errors[names.field(field)] = error;
    else values.push({ field, values: fieldValues, otherValue });
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, submission: { summary, description, fields: values } };
}
