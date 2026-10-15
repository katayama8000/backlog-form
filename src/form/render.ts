import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import type { FormSchema } from "../backlog/schema.ts";
import {
  type CustomField,
  CustomFieldType,
  isListField,
  type ListField,
} from "../backlog/types.ts";
import type { FormDefinition } from "../forms.ts";
import { names, type RawInput } from "./input.ts";

type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export type FormView = {
  form: FormDefinition;
  schema: FormSchema;
  input?: RawInput;
  errors?: Record<string, string>;
  turnstileSiteKey?: string | undefined;
};

// `html` escapes every interpolated value, so Backlog-provided labels are safe.
export function layout(title: string, body: Html, head: Html = html``): Html {
  return html`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@2.1.1/css/pico.min.css" />
    <style>
      .hp { position: absolute; left: -9999px; }
      .hint { display: block; color: var(--pico-muted-color); }
    </style>
    ${head}
  </head>
  <body>
    <main class="container">${body}</main>
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
  return required ? html`${text} <span aria-label="必須">*</span>` : html`${text}`;
}

function errorText(error: string | undefined) {
  return error ? html`<small>${error}</small>` : html``;
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
      return html`<select name="${name}" ${multiple ? "multiple" : ""} ${invalid(error)}>
        ${multiple ? "" : html`<option value="">選択してください</option>`}
        ${sortedItems(field).map(
          (item) =>
            html`<option value="${item.id}" ${selected.has(String(item.id)) ? "selected" : ""}>${item.name}</option>`,
        )}
      </select>`;
    }
    default: {
      const type = field.typeId === CustomFieldType.Checkbox ? "checkbox" : "radio";
      return sortedItems(field).map(
        (item) =>
          html`<label><input type="${type}" name="${name}" value="${item.id}" ${selected.has(String(item.id)) ? "checked" : ""} ${invalid(error)} />${item.name}</label>`,
      );
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
      ? html`<input name="${names.other(field)}" value="${single(view.input, names.other(field))}" placeholder="その他" />`
      : html``;
    return html`${listControl(field, view)}${other}`;
  }

  switch (field.typeId) {
    case CustomFieldType.Sentence:
      return html`<textarea name="${name}" rows="5" ${required} ${invalid(error)}>${value}</textarea>`;
    case CustomFieldType.Number:
      return html`<input type="number" step="any" name="${name}" value="${value}" ${field.min != null ? html`min="${field.min}"` : ""} ${field.max != null ? html`max="${field.max}"` : ""} ${required} ${invalid(error)} />${field.unit ? html`<span class="hint">単位: ${field.unit}</span>` : ""}`;
    case CustomFieldType.Date:
      return html`<input type="date" name="${name}" value="${value}" ${field.min ? html`min="${field.min.slice(0, 10)}"` : ""} ${field.max ? html`max="${field.max.slice(0, 10)}"` : ""} ${required} ${invalid(error)} />`;
    default:
      return html`<input type="text" name="${name}" value="${value}" ${required} ${invalid(error)} />`;
  }
}

function fieldRow(field: CustomField, view: FormView) {
  const error = view.errors?.[names.field(field)];
  const hint = field.description
    ? html`<span class="hint">${field.description}</span>`
    : html``;
  // Checkbox and radio groups need a fieldset so the label covers the whole group.
  if (field.typeId === CustomFieldType.Checkbox || field.typeId === CustomFieldType.Radio) {
    return html`<fieldset>
      <legend>${label(field.name, field.required)}</legend>
      ${hint}${fieldControl(field, view)}${errorText(error)}
    </fieldset>`;
  }
  return html`<label>
    ${label(field.name, field.required)}${hint}
    ${fieldControl(field, view)}${errorText(error)}
  </label>`;
}

export function renderForm(view: FormView): Html {
  const { form, schema, input, errors } = view;
  const turnstileHead = view.turnstileSiteKey
    ? html`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : html``;
  const turnstileWidget = view.turnstileSiteKey
    ? html`<div class="cf-turnstile" data-sitekey="${view.turnstileSiteKey}"></div>`
    : html``;
  const formError = errors?.form ? html`<p role="alert">${errors.form}</p>` : html``;

  const body = html`<h1>${form.title}</h1>
    ${formError}
    <form method="post">
      <label>
        ${label("件名", true)}
        <input name="${names.summary}" value="${single(input, names.summary)}" maxlength="255" required ${invalid(errors?.[names.summary])} />
        ${errorText(errors?.[names.summary])}
      </label>
      ${schema.fields.map((field) => fieldRow(field, view))}
      <label>
        詳細
        <textarea name="${names.description}" rows="8">${single(input, names.description)}</textarea>
      </label>
      <input class="hp" name="${names.honeypot}" tabindex="-1" autocomplete="off" aria-hidden="true" />
      ${turnstileWidget}
      <button type="submit">送信する</button>
    </form>`;
  return layout(form.title, body, turnstileHead);
}

export function renderDone(form: FormDefinition): Html {
  return layout(
    form.title,
    html`<h1>送信しました</h1><p>お問い合わせを受け付けました。担当者からの連絡をお待ちください。</p>`,
  );
}

export function renderMessage(title: string, message: string): Html {
  return layout(title, html`<h1>${title}</h1><p>${message}</p>`);
}
