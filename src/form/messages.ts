// Text on the public form, in the form's language. Names, descriptions and
// choices of custom fields come from Backlog as they are.

export const LANGS = { ja: "日本語", en: "English" } as const;

export type Lang = keyof typeof LANGS;

export function toLang(value: unknown): Lang {
  return value === "en" ? "en" : "ja";
}

const ja = {
  required: "必須",
  // Wraps the "required" badge in the lead.
  requiredLead: ["", " の項目は入力が必要です。"],
  summary: "件名",
  description: "詳細",
  select: "選択してください",
  other: "その他（自由入力）",
  otherLabel: (name: string) => `${name}（その他）`,
  submit: "送信する",
  submitting: "送信中…",
  preview: "プレビュー（送信はできません）",
  checkInput: (count: number) => `入力内容を確認してください（${count} 件）`,
  done: "送信しました",
  received: (title: string) => `「${title}」の内容を受け付けました。`,
  again: "続けて送信する",
  turnstileFailed: "認証に失敗しました。もう一度お試しください。",
  submitFailed: "送信に失敗しました。時間をおいて再度お試しください。",
  unavailableTitle: "ご利用いただけません",
  unavailable: "このフォームは現在ご利用いただけません。時間をおいて再度お試しください。",
  errors: {
    required: "入力してください",
    tooLong: (max: number) => `${max} 文字以内で入力してください`,
    invalidChoice: "選択肢が不正です",
    number: "数値を入力してください",
    min: (min: number) => `${min} 以上で入力してください`,
    max: (max: number) => `${max} 以下で入力してください`,
    date: "日付を入力してください",
    minDate: (min: string) => `${min} 以降の日付を入力してください`,
    maxDate: (max: string) => `${max} 以前の日付を入力してください`,
  },
};

export type Messages = typeof ja;

const en: Messages = {
  required: "Required",
  requiredLead: ["Fields marked ", " must be filled in."],
  summary: "Subject",
  description: "Details",
  select: "Select one",
  other: "Other (free text)",
  otherLabel: (name) => `${name} (other)`,
  submit: "Submit",
  submitting: "Submitting…",
  preview: "Preview (submitting is disabled)",
  checkInput: (count) => `Please check your entries (${count} ${count === 1 ? "problem" : "problems"})`,
  done: "Submitted",
  received: (title) => `Your response to “${title}” has been received.`,
  again: "Submit another response",
  turnstileFailed: "Verification failed. Please try again.",
  submitFailed: "Couldn't submit your response. Please try again later.",
  unavailableTitle: "Unavailable",
  unavailable: "This form is currently unavailable. Please try again later.",
  errors: {
    required: "Please fill in this field",
    tooLong: (max) => `Please use ${max} characters or fewer`,
    invalidChoice: "Please choose one of the options",
    number: "Please enter a number",
    min: (min) => `Please enter ${min} or more`,
    max: (max) => `Please enter ${max} or less`,
    date: "Please enter a date",
    minDate: (min) => `Please enter ${min} or later`,
    maxDate: (max) => `Please enter ${max} or earlier`,
  },
};

export const MESSAGES: Record<Lang, Messages> = { ja, en };
