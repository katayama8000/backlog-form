import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { FormSchema } from "../backlog/schema.ts";
import {
  type CustomField,
  CustomFieldType,
  isListField,
  type ListField,
} from "../backlog/types.ts";
import { names, type RawInput } from "./input.ts";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export type FormView = {
  schema: FormSchema;
  input?: RawInput;
  errors?: Record<string, string>;
  turnstileSiteKey?: string | undefined;
};

// Colors follow Backlog's brand green (#42ce9f). Text on green uses a darker
// shade so buttons keep a 4.5:1 contrast ratio.
const styles = raw(`
:root {
  color-scheme: light dark;
  --brand: #42ce9f;
  --brand-strong: #16805e;
  --brand-strong-hover: #116a4e;
  --on-brand: #ffffff;
  --brand-soft: #e6f8f1;
  --bg: #f2f4f3;
  --surface: #ffffff;
  --text: #262b29;
  --muted: #66706c;
  --border: #ccd3d0;
  --danger: #c62d2d;
  --danger-soft: #fdeeee;
}
@media (prefers-color-scheme: dark) {
  :root {
    --brand-strong: #42ce9f;
    --brand-strong-hover: #6adbb5;
    --on-brand: #0b2a1f;
    --brand-soft: #173a2e;
    --bg: #121614;
    --surface: #1c2220;
    --text: #e6ebe9;
    --muted: #9aa6a1;
    --border: #3a4541;
    --danger: #ff7b7b;
    --danger-soft: #3a1f1f;
  }
}
*, *::before, *::after { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.7 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", "Yu Gothic UI", sans-serif;
}
main { max-width: 680px; margin: 0 auto; padding: 40px 16px 64px; }
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-top: 6px solid var(--brand);
  border-radius: 10px;
  padding: 32px;
}
@media (max-width: 600px) {
  main { padding-top: 16px; }
  .card { padding: 24px 18px; }
}
h1 { font-size: 1.5rem; line-height: 1.4; margin: 0 0 8px; }
.lead { color: var(--muted); font-size: 0.875rem; margin: 0 0 28px; }
.field { margin: 0 0 24px; padding: 0; border: 0; min-width: 0; }
.label, legend {
  display: flex; align-items: center; gap: 8px;
  font-weight: 600; margin: 0 0 6px; padding: 0;
}
.req {
  font-size: 0.6875rem; font-weight: 700; line-height: 1;
  color: var(--on-brand); background: var(--brand-strong);
  border-radius: 4px; padding: 4px 6px;
}
.hint { display: block; color: var(--muted); font-size: 0.8125rem; margin: -2px 0 8px; }
.unit { color: var(--muted); font-size: 0.875rem; margin-left: 8px; }
input[type="text"], input[type="number"], input[type="date"], select, textarea {
  width: 100%;
  font: inherit; color: inherit;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  transition: border-color .15s, box-shadow .15s;
}
input[type="number"] { width: 12rem; max-width: 100%; }
input[type="date"] { width: auto; }
select[multiple] { min-height: 8rem; }
textarea { resize: vertical; }
input:focus, select:focus, textarea:focus {
  outline: none;
  border-color: var(--brand);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 30%, transparent);
}
[aria-invalid="true"] { border-color: var(--danger) !important; }
.choices { display: flex; flex-wrap: wrap; gap: 8px; }
.choice {
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid var(--border); border-radius: 6px;
  padding: 8px 14px; cursor: pointer;
}
.choice:has(input:checked) { border-color: var(--brand); background: var(--brand-soft); }
.choice input { accent-color: var(--brand-strong); margin: 0; width: 1.05em; height: 1.05em; }
.other { margin-top: 10px; }
.error { display: block; color: var(--danger); font-size: 0.8125rem; margin-top: 6px; }
.alert {
  color: var(--danger); background: var(--danger-soft);
  border: 1px solid var(--danger); border-radius: 6px;
  padding: 12px 14px; margin: 0 0 24px;
}
.divider { border: 0; border-top: 1px solid var(--border); margin: 8px 0 24px; }
.hp { position: absolute; left: -9999px; }
.cf-turnstile { margin: 0 0 24px; }
button {
  display: block; width: 100%;
  font: inherit; font-weight: 700;
  color: var(--on-brand); background: var(--brand-strong);
  border: 0; border-radius: 6px;
  padding: 14px; cursor: pointer;
  transition: background .15s;
}
button:hover { background: var(--brand-strong-hover); }
button:focus-visible { outline: 3px solid var(--brand); outline-offset: 2px; }
.done { text-align: center; padding: 16px 0; }
.done-mark {
  display: inline-grid; place-items: center;
  width: 56px; height: 56px; border-radius: 50%;
  background: var(--brand-soft); color: var(--brand-strong);
  font-size: 28px; font-weight: 700; margin-bottom: 12px;
}
.done p { color: var(--muted); margin: 0; }
`);

// `html` escapes every interpolated value, so Backlog-provided labels are safe.
export function layout(title: string, body: Html, head: Html = html``): Html {
  return html`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#42ce9f" />
    <title>${title}</title>
    <style>${styles}</style>
    ${head}
  </head>
  <body>
    <main><div class="card">${body}</div></main>
  </body>
</html>`;
}

function single(input: RawInput | undefined, name: string): string {
  const value = input?.[name];
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function many(input: RawInput | undefined, name: string): string[] {
  const value = input?.[name];
  return Array.isArray(value) ? value : value ? [value] : [];
}

function invalid(error: string | undefined) {
  return error ? html`aria-invalid="true"` : html``;
}

function label(text: string, required: boolean) {
  return required ? html`${text}<span class="req">必須</span>` : html`${text}`;
}

function errorText(error: string | undefined) {
  return error ? html`<small class="error">${error}</small>` : html``;
}

function hintText(text: string) {
  return text ? html`<span class="hint">${text}</span>` : html``;
}

function sortedItems(field: ListField) {
  return [...field.items].sort((a, b) => a.displayOrder - b.displayOrder);
}

function listControl(field: ListField, view: FormView) {
  const name = names.field(field);
  const selected = new Set(many(view.input, name));
  const error = view.errors?.[name];

  switch (field.typeId) {
    case CustomFieldType.SingleList:
    case CustomFieldType.MultipleList: {
      const multiple = field.typeId === CustomFieldType.MultipleList;
      return html`<select id="${name}" name="${name}" ${multiple ? "multiple" : ""} ${invalid(error)}>
        ${multiple ? "" : html`<option value="">選択してください</option>`}
        ${sortedItems(field).map(
          (item) =>
            html`<option value="${item.id}" ${selected.has(String(item.id)) ? "selected" : ""}>${item.name}</option>`,
        )}
      </select>`;
    }
    default: {
      const type = field.typeId === CustomFieldType.Checkbox ? "checkbox" : "radio";
      return html`<div class="choices">${sortedItems(field).map(
        (item) =>
          html`<label class="choice"><input type="${type}" name="${name}" value="${item.id}" ${selected.has(String(item.id)) ? "checked" : ""} ${invalid(error)} />${item.name}</label>`,
      )}</div>`;
    }
  }
}

function fieldControl(field: CustomField, view: FormView) {
  const name = names.field(field);
  const value = single(view.input, name);
  const error = view.errors?.[name];
  const required = field.required ? "required" : "";

  if (isListField(field)) {
    const other = field.allowInput
      ? html`<input type="text" class="other" name="${names.other(field)}" value="${single(view.input, names.other(field))}" placeholder="その他（自由入力）" aria-label="${field.name}（その他）" />`
      : html``;
    return html`${listControl(field, view)}${other}`;
  }

  switch (field.typeId) {
    case CustomFieldType.Sentence:
      return html`<textarea id="${name}" name="${name}" rows="5" ${required} ${invalid(error)}>${value}</textarea>`;
    case CustomFieldType.Number:
      return html`<input type="number" id="${name}" step="any" name="${name}" value="${value}" ${field.min != null ? html`min="${field.min}"` : ""} ${field.max != null ? html`max="${field.max}"` : ""} ${required} ${invalid(error)} />${field.unit ? html`<span class="unit">${field.unit}</span>` : ""}`;
    case CustomFieldType.Date:
      return html`<input type="date" id="${name}" name="${name}" value="${value}" ${field.min ? html`min="${field.min.slice(0, 10)}"` : ""} ${field.max ? html`max="${field.max.slice(0, 10)}"` : ""} ${required} ${invalid(error)} />`;
    default:
      return html`<input type="text" id="${name}" name="${name}" value="${value}" ${required} ${invalid(error)} />`;
  }
}

function fieldRow(field: CustomField, view: FormView) {
  const name = names.field(field);
  const error = view.errors?.[name];
  // Checkbox and radio groups need a fieldset so the label covers the whole group.
  if (field.typeId === CustomFieldType.Checkbox || field.typeId === CustomFieldType.Radio) {
    return html`<fieldset class="field">
      <legend>${label(field.name, field.required)}</legend>
      ${hintText(field.description)}${fieldControl(field, view)}${errorText(error)}
    </fieldset>`;
  }
  return html`<div class="field">
    <label class="label" for="${name}">${label(field.name, field.required)}</label>
    ${hintText(field.description)}${fieldControl(field, view)}${errorText(error)}
  </div>`;
}

export function renderForm(view: FormView): Html {
  const { schema, input, errors } = view;
  const turnstileHead = view.turnstileSiteKey
    ? html`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : html``;
  const turnstileWidget = view.turnstileSiteKey
    ? html`<div class="cf-turnstile" data-sitekey="${view.turnstileSiteKey}"></div>`
    : html``;
  const formError = errors?.form ? html`<p class="alert" role="alert">${errors.form}</p>` : html``;

  const body = html`<h1>${schema.title}</h1>
    <p class="lead">以下のフォームに入力して送信してください。<span class="req">必須</span> の項目は入力が必要です。</p>
    ${formError}
    <form method="post">
      <div class="field">
        <label class="label" for="${names.summary}">${label("件名", true)}</label>
        <input type="text" id="${names.summary}" name="${names.summary}" value="${single(input, names.summary)}" maxlength="255" required ${invalid(errors?.[names.summary])} />
        ${errorText(errors?.[names.summary])}
      </div>
      ${schema.fields.map((field) => fieldRow(field, view))}
      <div class="field">
        <label class="label" for="${names.description}">詳細</label>
        <textarea id="${names.description}" name="${names.description}" rows="8">${single(input, names.description)}</textarea>
      </div>
      <input class="hp" name="${names.honeypot}" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <hr class="divider" />
      ${turnstileWidget}
      <button type="submit">送信する</button>
    </form>`;
  return layout(schema.title, body, turnstileHead);
}

export function renderDone(schema: FormSchema): Html {
  return layout(
    schema.title,
    html`<div class="done">
      <div class="done-mark" aria-hidden="true">✓</div>
      <h1>送信しました</h1>
      <p>お問い合わせを受け付けました。担当者からの連絡をお待ちください。</p>
    </div>`,
  );
}

export function renderMessage(title: string, message: string): Html {
  return layout(title, html`<h1>${title}</h1><p>${message}</p>`);
}
