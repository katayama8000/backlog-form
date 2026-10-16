import { html } from "hono/html";
import type { CustomField, IssueType, Project } from "../backlog/types.ts";
import { type Html, layout } from "../layout.ts";
import type { Connection, FormRecord } from "../store.ts";

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

function page(title: string, connection: Connection | undefined, body: Html): Html {
  const account = connection
    ? html`<span>${connection.userName}（${connection.spaceHost}）
        <form method="post" action="/logout" style="display:inline"><button class="link" type="submit">ログアウト</button></form></span>`
    : html``;
  return layout(
    `${title} | ${APP_NAME}`,
    html`<div class="topbar"><a href="/forms" class="brand-name" style="text-decoration:none">${APP_NAME}</a>${account}</div>${body}`,
  );
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
    html`<h1>社外からの課題をフォームで受け付ける</h1>
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

export function renderFormList(connection: Connection, forms: FormRecord[]): Html {
  const list = forms.length
    ? html`<ul class="list">${forms.map(
        (form) => html`<li><a class="row" href="/forms/${form.id}">
          <span><span class="row-title">${form.title}</span><span class="row-sub">${form.projectName}</span></span>
          <span class="status ${form.enabled ? "" : "off"}">${form.enabled ? "公開中" : "停止中"}</span>
        </a></li>`,
      )}</ul>`
    : html`<p class="empty">まだフォームがありません</p>`;
  return page(
    "フォーム一覧",
    connection,
    html`<h1>フォーム</h1>
      <p class="lead">社外に公開しているフォームの一覧です。</p>
      <a class="btn" href="/forms/new">新しいフォームを作る</a>
      ${list}`,
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
): Html {
  return page(
    "新しいフォーム",
    connection,
    html`${steps(2)}<h1>課題種別を選ぶ</h1>
      <p class="lead">${project.name} の課題種別です。社外からの送信専用の種別を Backlog で作っておくと、社内の課題と分けて管理できます。</p>
      <ul class="list">${issueTypes.map(
        (t) => html`<li><a class="row" href="/forms/new?projectId=${project.id}&issueTypeId=${t.id}">
          <span class="row-title">${t.name}</span><span class="chevron" aria-hidden="true">›</span>
        </a></li>`,
      )}</ul>
      <a class="btn btn-secondary" href="/forms/new">戻る</a>`,
  );
}

export type EditorView = {
  connection: Connection;
  project: Project;
  issueType: IssueType;
  // Custom fields applicable to the issue type.
  fields: CustomField[];
  values: { title: string; fieldIds: number[]; enabled: boolean };
  errors?: Record<string, string>;
  // Set when editing an existing form.
  form?: { id: string; url: string };
};

function fieldChoices(view: EditorView) {
  if (view.fields.length === 0) {
    return html`<p class="empty">この課題種別にはカスタム属性がありません。フォームには「件名」と「詳細」だけが表示されます。</p>`;
  }
  const selected = new Set(view.values.fieldIds);
  return html`<div class="choice-list">${view.fields.map((field) => {
    // Required fields can't be left out: Backlog rejects issues without them.
    const checked = field.required || selected.has(field.id);
    return html`<label class="choice">
      <input type="checkbox" name="fieldIds" value="${field.id}" ${checked ? "checked" : ""} ${field.required ? "disabled" : ""} />
      ${field.name}${field.required ? html`<span class="req">必須</span>` : ""}
      <span class="meta">${FIELD_TYPES[field.typeId] ?? ""}</span>
    </label>`;
  })}</div>`;
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
          <a href="${form.url}" target="_blank" rel="noopener">開く</a>
        </div>`
    : html`${steps(3)}<h1>フォームの設定</h1>
        <p class="lead">${project.name} / ${issueType.name}</p>`;

  return page(
    "フォームの設定",
    view.connection,
    html`${header}
      ${errors?.form ? html`<p class="alert" role="alert">${errors.form}</p>` : ""}
      <form method="post" action="${action}">
        <input type="hidden" name="projectId" value="${project.id}" />
        <input type="hidden" name="issueTypeId" value="${issueType.id}" />
        <div class="field">
          <label class="label" for="title">タイトル<span class="req">必須</span></label>
          <span class="hint">フォームの見出しとして社外に表示されます</span>
          <input type="text" id="title" name="title" value="${values.title}" maxlength="100" required ${errors?.title ? html`aria-invalid="true"` : ""} />
          ${errors?.title ? html`<small class="error">${errors.title}</small>` : ""}
        </div>
        <fieldset class="field">
          <legend>フォームに表示するカスタム属性</legend>
          <span class="hint">「件名」と「詳細」は常に表示されます。項目名と説明文はそのまま社外に表示されるので、社内向けの属性は選ばないでください。</span>
          ${fieldChoices(view)}
        </fieldset>
        <p class="notice">カスタム属性の追加や選択肢の変更は、Backlog の<a href="https://${view.connection.spaceHost}/projects/${project.projectKey}" target="_blank" rel="noopener">プロジェクト設定</a>で行います。変更は数分でフォームに反映されます。</p>
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
  );
}

export function renderAdminMessage(connection: Connection | undefined, title: string, message: string): Html {
  return page(
    title,
    connection,
    html`<h1>${title}</h1><p>${message}</p><a class="btn btn-secondary" href="/forms">フォーム一覧へ</a>`,
  );
}
