import { html } from "hono/html";
import type { FormSchema } from "../backlog/schema.ts";
import {
  type CustomField,
  CustomFieldType,
  isListField,
  type ListField,
} from "../backlog/types.ts";
import { type Html, layout } from "../layout.ts";
import { names, type RawInput } from "./input.ts";
import { type Lang, MESSAGES, type Messages } from "./messages.ts";

export type FormView = {
  schema: FormSchema;
  input?: RawInput;
  errors?: Record<string, string>;
  turnstileSiteKey?: string | undefined;
  // Shown to the form's creator: submitting is disabled.
  preview?: boolean;
};

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

function label(text: string, required: boolean, t: Messages) {
  return required ? html`${text}<span class="req">${t.required}</span>` : html`${text}`;
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
  const t = MESSAGES[view.schema.lang];
  const name = names.field(field);
  const selected = new Set(many(view.input, name));
  const error = view.errors?.[name];

  switch (field.typeId) {
    case CustomFieldType.SingleList: {
      return html`<select id="${name}" name="${name}" ${invalid(error)}>
        <option value="">${t.select}</option>
        ${sortedItems(field).map(
          (item) =>
            html`<option value="${item.id}" ${selected.has(String(item.id)) ? "selected" : ""}>${item.name}</option>`,
        )}
      </select>`;
    }
    default: {
      // Multiple lists are shown as checkboxes too: <select multiple> needs
      // Ctrl/Cmd-click and is awkward on phones.
      const type = field.typeId === CustomFieldType.Radio ? "radio" : "checkbox";
      return html`<div class="choices">${sortedItems(field).map(
        (item) =>
          html`<label class="choice"><input type="${type}" name="${name}" value="${item.id}" ${selected.has(String(item.id)) ? "checked" : ""} ${invalid(error)} />${item.name}</label>`,
      )}</div>`;
    }
  }
}

function fieldControl(field: CustomField, view: FormView) {
  const t = MESSAGES[view.schema.lang];
  const name = names.field(field);
  const value = single(view.input, name);
  const error = view.errors?.[name];
  const required = field.required ? "required" : "";

  if (isListField(field)) {
    const other = field.allowInput
      ? html`<input type="text" class="other" name="${names.other(field)}" value="${single(view.input, names.other(field))}" placeholder="${t.other}" aria-label="${t.otherLabel(field.name)}" />`
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
  const t = MESSAGES[view.schema.lang];
  const name = names.field(field);
  const error = view.errors?.[name];
  // Checkbox and radio groups need a fieldset so the label covers the whole group.
  if (isListField(field) && field.typeId !== CustomFieldType.SingleList) {
    return html`<fieldset class="field">
      <legend>${label(field.name, field.required, t)}</legend>
      ${hintText(field.description)}${fieldControl(field, view)}${errorText(error)}
    </fieldset>`;
  }
  return html`<div class="field">
    <label class="label" for="${name}">${label(field.name, field.required, t)}</label>
    ${hintText(field.description)}${fieldControl(field, view)}${errorText(error)}
  </div>`;
}

export function renderForm(view: FormView): Html {
  const { schema, input, errors } = view;
  const t = MESSAGES[schema.lang];
  const turnstileHead = view.turnstileSiteKey
    ? html`<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`
    : html``;
  const turnstileWidget = view.turnstileSiteKey
    ? html`<div class="cf-turnstile" data-sitekey="${view.turnstileSiteKey}"></div>`
    : html``;
  const fieldErrors = Object.keys(errors ?? {}).filter((key) => key !== "form").length;
  const formError = errors?.form
    ? html`<p class="alert" role="alert">${errors.form}</p>`
    : fieldErrors
      ? html`<p class="alert" role="alert">${t.checkInput(fieldErrors)}</p>`
      : html``;
  const preview = view.preview
    ? html`<p class="notice preview-banner">${t.preview}</p>`
    : html``;

  const body = html`${preview}<h1>${schema.title}</h1>
    ${schema.description ? html`<p class="form-description">${schema.description}</p>` : ""}
    <p class="lead">${t.requiredLead[0]}<span class="req">${t.required}</span>${t.requiredLead[1]}</p>
    ${formError}
    <form method="post" data-once ${view.preview ? html`onsubmit="return false"` : ""}>
      ${schema.autoSummary
        ? ""
        : html`<div class="field">
            <label class="label" for="${names.summary}">${label(t.summary, true, t)}</label>
            <input type="text" id="${names.summary}" name="${names.summary}" value="${single(input, names.summary)}" maxlength="255" required ${invalid(errors?.[names.summary])} />
            ${errorText(errors?.[names.summary])}
          </div>`}
      ${schema.fields.map((field) => fieldRow(field, view))}
      <div class="field">
        <label class="label" for="${names.description}">${t.description}</label>
        <textarea id="${names.description}" name="${names.description}" rows="8">${single(input, names.description)}</textarea>
      </div>
      <input class="hp" name="${names.honeypot}" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <hr class="divider" />
      ${turnstileWidget}
      <button type="submit" data-busy="${t.submitting}" ${view.preview ? "disabled" : ""}>${t.submit}</button>
    </form>`;
  return layout(schema.title, body, turnstileHead, schema.lang);
}

// formPath links back to an empty form for another submission.
export function renderDone(schema: FormSchema, formPath: string): Html {
  const t = MESSAGES[schema.lang];
  return layout(
    schema.title,
    html`<div class="done">
      <div class="done-mark" aria-hidden="true">✓</div>
      <h1>${t.done}</h1>
      <p>${t.received(schema.title)}</p>
      <p style="margin-top:16px"><a href="${formPath}">${t.again}</a></p>
    </div>`,
    html``,
    schema.lang,
  );
}

export function renderMessage(title: string, message: string, lang: Lang = "ja"): Html {
  return layout(title, html`<h1>${title}</h1><p>${message}</p>`, html``, lang);
}
