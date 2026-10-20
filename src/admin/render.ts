import { html } from "hono/html";
import {
  type Category,
  type CustomField,
  type IssueType,
  type Milestone,
  type Priority,
  PRIORITY_NORMAL,
  type Project,
  type User,
} from "../backlog/types.ts";
import { type Html, layout } from "../layout.ts";
import { type Lang, LANGS } from "../form/messages.ts";
import type { Connection, FormRecord, IssueDefaults } from "../store.ts";

const APP_NAME = "Backlog Form";

const FIELD_TYPES: Record<number, string> = {
  1: "文字列",
  2: "文章",
  3: "数値",
  4: "日付",
  5: "単一リスト",
  6: "複数リスト",
  7: "チェックボックス",
  8: "ラジオ",
};

// Messages shown once after a redirect, keyed by the flash cookie's value.
export const TOASTS = {
  created: "フォームを作成しました",
  saved: "保存しました",
  deleted: "フォームを削除しました",
} as const;
export type ToastKey = keyof typeof TOASTS;

function page(title: string, connection: Connection | undefined, body: Html, toast?: ToastKey): Html {
  const account = connection
    ? html`<span>${connection.userName}（${connection.spaceHost}）
        <form method="post" action="/logout" style="display:inline"><button class="link" type="submit">ログアウト</button></form></span>`
    : html``;
  return layout(
    `${title} | ${APP_NAME}`,
    html`<div class="topbar"><a href="/forms" class="brand-name" style="text-decoration:none">${APP_NAME}</a>${account}</div>${body}
      ${toast ? html`<p class="toast" role="status">${TOASTS[toast]}</p>` : ""}`,
  );
}

// Backlog's project settings pages, opened in a new tab.
function backlogLink(connection: Connection, page: "ListIssueType" | "ListAttribute", projectId: number, label: string) {
  return html`<a href="https://${connection.spaceHost}/${page}.action?projectId=${projectId}" target="_blank" rel="noopener">${label}</a>`;
}

function steps(current: 1 | 2 | 3) {
  const labels = ["プロジェクト", "課題種別", "フォームの設定"];
  return html`<ol class="steps">${labels.map(
    (label, i) => html`<li class="${i + 1 === current ? "current" : ""}">${i + 1}. ${label}</li>`,
  )}</ol>`;
}

export function renderLanding(error?: string): Html {
  return page(
    "ログイン",
    undefined,
    html`<h1>Backlog の課題をフォームで受け付ける</h1>
      <p class="lead">Backlog アカウントでログインして、プロジェクトと課題種別を選ぶだけでフォームを公開できます。送信された内容は、カスタム属性の値として課題に登録されます。</p>
      ${error ? html`<p class="alert" role="alert">${error}</p>` : ""}
      <form method="post" action="/login">
        <div class="field">
          <label class="label" for="space">Backlog スペース</label>
          <span class="hint">例：example.backlog.com</span>
          <input type="text" id="space" name="space" placeholder="example.backlog.com" autocomplete="url" required />
        </div>
        <button type="submit">Backlog でログイン</button>
      </form>`,
  );
}

function copyButton(text: string) {
  return html`<button type="button" class="secondary copy" data-copy="${text}">コピー</button>`;
}

export function renderFormList(
  connection: Connection,
  forms: (FormRecord & { url: string })[],
  toast?: ToastKey,
): Html {
  const list = forms.length
    ? html`<ul class="list">${forms.map(
        (form) => html`<li class="form-row"><a class="row" href="/forms/${form.id}">
          <span><span class="row-title">${form.title}</span><span class="row-sub">${form.projectName}${form.issueTypeName ? ` / ${form.issueTypeName}` : ""}</span></span>
          <span class="status ${form.enabled ? "" : "off"}">${form.enabled ? "公開中" : "停止中"}</span>
        </a>${form.enabled ? copyButton(form.url) : ""}</li>`,
      )}</ul>`
    : html`<p class="empty">まだフォームがありません</p>`;
  return page(
    "フォーム一覧",
    connection,
    html`<h1>フォーム</h1>
      <p class="lead">公開しているフォームの一覧です。</p>
      <a class="btn" href="/forms/new">新しいフォームを作る</a>
      ${list}`,
    toast,
  );
}

export function renderPickProject(connection: Connection, projects: Project[]): Html {
  const list = projects.length
    ? html`<ul class="list">${projects.map(
        (p) => html`<li><a class="row" href="/forms/new?projectId=${p.id}">
          <span><span class="row-title">${p.name}</span><span class="row-sub">${p.projectKey}</span></span>
          <span class="chevron" aria-hidden="true">›</span>
        </a></li>`,
      )}</ul>`
    : html`<p class="empty">参加しているプロジェクトがありません</p>`;
  return page(
    "新しいフォーム",
    connection,
    html`${steps(1)}<h1>プロジェクトを選ぶ</h1>
      <p class="lead">フォームから送信された課題を登録するプロジェクトです。</p>
      ${list}
      <a class="btn btn-secondary" href="/forms">キャンセル</a>`,
  );
}

export function renderPickIssueType(
  connection: Connection,
  project: Project,
  issueTypes: IssueType[],
  // Custom fields applicable to each issue type, by issue type id.
  fieldsByType: Map<number, CustomField[]>,
): Html {
  const summary = (t: IssueType) => {
    const fields = fieldsByType.get(t.id) ?? [];
    if (fields.length === 0) return "カスタム属性なし（件名と詳細だけのフォーム）";
    const required = fields.filter((f) => f.required).length;
    return `カスタム属性 ${fields.length} 件${required ? `（うち必須 ${required} 件）` : ""}`;
  };
  const list = issueTypes.length
    ? html`<ul class="list">${issueTypes.map(
        (t) => html`<li><a class="row" href="/forms/new?projectId=${project.id}&issueTypeId=${t.id}">
          <span><span class="row-title">${t.name}</span><span class="row-sub">${summary(t)}</span></span>
          <span class="chevron" aria-hidden="true">›</span>
        </a></li>`,
      )}</ul>`
    : html`<p class="empty">課題種別がありません</p>`;
  return page(
    "新しいフォーム",
    connection,
    html`${steps(2)}<h1>課題種別を選ぶ</h1>
      <p class="lead">フォームから送信された内容は、選んだ種別の課題として ${project.name} に登録されます。フォームに出せる項目は、その種別で使えるカスタム属性です。</p>
      ${list}
      <p class="notice">フォーム用の種別（例：「お問い合わせ」）を作ると、ほかの課題と分けて管理できます。種別は Backlog の${backlogLink(connection, "ListIssueType", project.id, "プロジェクト設定の「種別」")}で追加し、追加したらこのページを再読み込みしてください。</p>
      <a class="btn btn-secondary" href="/forms/new">戻る</a>`,
  );
}

// What a form's issue defaults can be set to, from the project.
export type IssueChoices = {
  users: User[];
  categories: Category[];
  milestones: Milestone[];
  priorities: Priority[];
};

export type EditorView = {
  connection: Connection;
  project: Project;
  issueType: IssueType;
  // Custom fields applicable to the issue type.
  fields: CustomField[];
  choices: IssueChoices;
  values: {
    title: string;
    description: string;
    fieldIds: number[];
    autoSummary: boolean;
    issueDefaults: IssueDefaults;
    lang: Lang;
    allowAttachments: boolean;
    enabled: boolean;
  };
  errors?: Record<string, string>;
  // Set when editing an existing form.
  form?: { id: string; url: string };
  toast?: ToastKey | undefined;
};

function fieldChoices(view: EditorView) {
  if (view.fields.length === 0) {
    return html`<p class="empty">この課題種別で使えるカスタム属性がありません。フォームには「件名」と「詳細」だけが表示されます。</p>`;
  }
  const selected = new Set(view.values.fieldIds);
  return html`<div class="choice-list">${view.fields.map((field) => {
    // Required fields can't be left out: Backlog rejects issues without them.
    const checked = field.required || selected.has(field.id);
    return html`<label class="choice">
      <input type="checkbox" name="fieldIds" value="${field.id}" ${checked ? "checked" : ""} ${field.required ? "disabled" : ""} />
      <span>${field.name}${field.required ? html`<span class="req" style="margin-left:8px">必須</span>` : ""}
        ${field.description ? html`<span class="row-sub">${field.description}</span>` : ""}</span>
      <span class="meta">${FIELD_TYPES[field.typeId] ?? ""}</span>
    </label>`;
  })}</div>`;
}

function defaultChoices(view: EditorView) {
  const { choices } = view;
  const { assigneeId, priorityId, categoryIds, milestoneIds } = view.values.issueDefaults;
  const option = (id: number, name: string, selected: boolean) =>
    html`<option value="${id}" ${selected ? "selected" : ""}>${name}</option>`;
  const checkboxes = (name: string, items: { id: number; name: string }[], selected: number[]) =>
    html`<div class="choice-list">${items.map(
      (item) => html`<label class="choice"><input type="checkbox" name="${name}" value="${item.id}" ${selected.includes(item.id) ? "checked" : ""} />${item.name}</label>`,
    )}</div>`;
  return html`<div class="field">
      <label class="label" for="assigneeId">担当者</label>
      <span class="hint">担当者を決めておくと、送信されたときにその人に通知が届きます</span>
      <select id="assigneeId" name="assigneeId">
        <option value="">なし</option>
        ${choices.users.map((u) => option(u.id, u.name, u.id === assigneeId))}
      </select>
    </div>
    <div class="field">
      <label class="label" for="priorityId">優先度</label>
      <select id="priorityId" name="priorityId">
        ${choices.priorities.map((p) => option(p.id, p.name, p.id === (priorityId ?? PRIORITY_NORMAL)))}
      </select>
    </div>
    ${choices.categories.length
      ? html`<div class="field"><span class="label">カテゴリー</span>${checkboxes("categoryIds", choices.categories, categoryIds)}</div>`
      : ""}
    ${choices.milestones.length
      ? html`<div class="field"><span class="label">マイルストーン</span>${checkboxes("milestoneIds", choices.milestones, milestoneIds)}</div>`
      : ""}`;
}

export function renderEditor(view: EditorView): Html {
  const { project, issueType, values, errors, form } = view;
  const action = form ? `/forms/${form.id}` : "/forms";
  const header = form
    ? html`<h1>フォームの設定</h1>
        <p class="lead">${project.name} / ${issueType.name}</p>
        <label class="label" for="url">フォームの URL</label>
        <div class="url-box">
          <input type="text" id="url" value="${form.url}" readonly onfocus="this.select()" />
          ${copyButton(form.url)}
          <a href="/forms/${form.id}/preview" target="_blank" rel="noopener">プレビュー</a>
        </div>
        ${values.enabled ? "" : html`<p class="notice">公開していないため、この URL を開いてもフォームは表示されません。</p>`}`
    : html`${steps(3)}<h1>フォームの設定</h1>
        <p class="lead">${project.name} / ${issueType.name}</p>`;

  return page(
    "フォームの設定",
    view.connection,
    html`${header}
      ${errors?.form ? html`<p class="alert" role="alert">${errors.form}</p>` : ""}
      <form method="post" action="${action}" data-once>
        <input type="hidden" name="projectId" value="${project.id}" />
        <input type="hidden" name="issueTypeId" value="${issueType.id}" />
        <div class="field">
          <label class="label" for="title">タイトル<span class="req">必須</span></label>
          <span class="hint">フォームの見出しとして表示されます</span>
          <input type="text" id="title" name="title" value="${values.title}" maxlength="100" required ${errors?.title ? html`aria-invalid="true"` : ""} />
          ${errors?.title ? html`<small class="error">${errors.title}</small>` : ""}
        </div>
        <div class="field">
          <label class="label" for="description">説明</label>
          <span class="hint">タイトルの下に表示されます。何を受け付けるフォームか、回答の目安などを書いておくと親切です</span>
          <textarea id="description" name="description" rows="4" maxlength="1000" ${errors?.description ? html`aria-invalid="true"` : ""}>${values.description}</textarea>
          ${errors?.description ? html`<small class="error">${errors.description}</small>` : ""}
        </div>
        <div class="field">
          <label class="label" for="lang">フォームの言語</label>
          <span class="hint">ボタンや案内、エラーメッセージの言語です。タイトル・説明・項目名・選択肢は、入力したとおりに表示されます</span>
          <select id="lang" name="lang">
            ${Object.entries(LANGS).map(([code, name]) => html`<option value="${code}" ${values.lang === code ? "selected" : ""}>${name}</option>`)}
          </select>
        </div>
        <fieldset class="field">
          <legend>件名</legend>
          <label class="choice"><input type="checkbox" name="autoSummary" value="1" ${values.autoSummary ? "checked" : ""} />件名を自動で付ける</label>
          <span class="hint">フォームに件名の入力欄を出さず、「タイトル（送信日時）」を課題の件名にします。何を書けばいいか迷わせたくないときに使います</span>
        </fieldset>
        <fieldset class="field">
          <legend>フォームに表示するカスタム属性</legend>
          <span class="hint">「詳細」は常に表示されます。項目名と説明文はフォームを開いた人にそのまま表示されるので、見せたくない属性は選ばないでください。</span>
          ${fieldChoices(view)}
        </fieldset>
        <p class="notice">カスタム属性の追加や選択肢の変更は、Backlog の${backlogLink(view.connection, "ListAttribute", project.id, "プロジェクト設定の「カスタム属性」")}で行います。追加したら、この画面を再読み込みしてください。</p>
        <fieldset class="field">
          <legend>ファイル添付</legend>
          <label class="choice"><input type="checkbox" name="allowAttachments" value="1" ${values.allowAttachments ? "checked" : ""} />ファイルの添付を受け付ける</label>
          <span class="hint">送信する人がファイルを 5 個まで（1 個 10 MB まで）添付でき、課題に添付されます。誰でも送信できるフォームなので、開く前にファイルの内容に注意してください</span>
        </fieldset>
        <fieldset class="field">
          <legend>課題の初期値</legend>
          <span class="hint">フォームから作られる課題に設定されます。送信する人には表示されません</span>
          ${defaultChoices(view)}
        </fieldset>
        <fieldset class="field">
          <legend>公開</legend>
          <label class="choice"><input type="checkbox" name="enabled" value="1" ${values.enabled ? "checked" : ""} />フォームを公開する</label>
        </fieldset>
        <div class="actions">
          <button type="submit">${form ? "保存する" : "作成する"}</button>
          <a class="btn btn-secondary" href="${form ? "/forms" : `/forms/new?projectId=${project.id}`}" style="margin:0">${form ? "一覧に戻る" : "戻る"}</a>
        </div>
      </form>
      ${form
        ? html`<hr class="divider" style="margin-top:32px" />
          <form method="post" action="/forms/${form.id}/delete" onsubmit="return confirm('このフォームを削除します。URL は使えなくなります。よろしいですか？')">
            <button type="submit" class="danger">このフォームを削除する</button>
          </form>`
        : ""}`,
    view.toast,
  );
}

export function renderAdminMessage(connection: Connection | undefined, title: string, message: string): Html {
  return page(
    title,
    connection,
    html`<h1>${title}</h1><p>${message}</p><a class="btn btn-secondary" href="/forms">フォーム一覧へ</a>`,
  );
}
