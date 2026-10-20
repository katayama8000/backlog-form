import { type CustomField, isMultiValue } from "../backlog/types.ts";
import type { Lang } from "./messages.ts";

// HTML input names. Kept in one place so render and validate never drift.
export const names = {
  summary: "summary",
  description: "description",
  honeypot: "website",
  field: (field: CustomField) => `cf_${field.id}`,
  other: (field: CustomField) => `cf_${field.id}_other`,
};

export type RawInput = Record<string, string | string[]>;

// Normalizes a submitted FormData, or the query string of a prefilled URL,
// into plain strings, keeping arrays for multi-value fields.
export function readInput(form: Pick<FormData, "get" | "getAll">, fields: CustomField[]): RawInput {
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

const SENT_AT = {
  ja: new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "short", timeStyle: "short" }),
  en: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" }),
};

// The summary of issues from forms that don't ask for one, e.g.
// "お問い合わせ（2026/10/20 14:30）" or "Contact (Oct 20, 2026, 2:30 PM JST)".
export function generatedSummary(title: string, sentAt: Date, lang: Lang): string {
  return lang === "en" ? `${title} (${SENT_AT.en.format(sentAt)} JST)` : `${title}（${SENT_AT.ja.format(sentAt)}）`;
}
