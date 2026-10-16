import { type Context, Hono } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import type { CookieOptions } from "hono/utils/cookie";
import type { BacklogClient, BacklogGateway, OAuthProvider } from "../backlog/client.ts";
import { parseSpaceHost } from "../backlog/oauth.ts";
import { applicableFields, type SchemaLoader } from "../backlog/schema.ts";
import { randomId } from "../crypto.ts";
import type { Connection, Store } from "../store.ts";
import {
  type EditorView,
  renderAdminMessage,
  renderEditor,
  renderFormList,
  renderLanding,
  renderPickIssueType,
  renderPickProject,
} from "./render.ts";

export type AdminDeps = {
  store: Store;
  gateway: BacklogGateway;
  oauth: OAuthProvider;
  schemas: SchemaLoader;
  appUrl: string;
  cookieSecret: string;
};

type Env = { Variables: { connection: Connection } };

const SESSION_COOKIE = "session";
const STATE_COOKIE = "oauth_state";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TITLE_MAX = 100;

// Project, issue type and its applicable fields, as visible to the signed-in user.
async function loadTarget(client: BacklogClient, projectId: number, issueTypeId: number) {
  const project = await client.findProject(projectId);
  if (!project || project.archived) return null;
  const [issueTypes, customFields] = await Promise.all([
    client.getIssueTypes(projectId),
    client.getCustomFields(projectId),
  ]);
  const issueType = issueTypes.find((t) => t.id === issueTypeId);
  if (!issueType) return null;
  return { project, issueType, fields: applicableFields(customFields, issueTypeId) };
}

function toId(value: unknown): number | undefined {
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : undefined;
}

// Reads the editor's form body. Unknown field ids are dropped.
function readEditor(data: FormData, applicable: { id: number }[]) {
  const allowed = new Set(applicable.map((f) => f.id));
  const title = String(data.get("title") ?? "").trim();
  const fieldIds = data
    .getAll("fieldIds")
    .map(toId)
    .filter((id): id is number => id !== undefined && allowed.has(id));
  const values = { title, fieldIds, enabled: data.get("enabled") === "1" };
  const errors: Record<string, string> = {};
  if (title === "") errors.title = "入力してください";
  else if (title.length > TITLE_MAX) errors.title = `${TITLE_MAX} 文字以内で入力してください`;
  return { values, errors: Object.keys(errors).length ? errors : undefined };
}

export function adminRoutes(deps: AdminDeps) {
  const { store, gateway, oauth, schemas } = deps;
  const app = new Hono<Env>();
  const cookie: CookieOptions = {
    httpOnly: true,
    secure: deps.appUrl.startsWith("https:"),
    sameSite: "Lax",
    path: "/",
  };
  const formUrl = (id: string) => `${deps.appUrl}/f/${id}`;

  function currentConnection(c: Context): Connection | undefined {
    const token = getCookie(c, SESSION_COOKIE);
    return token ? store.findSession(token) : undefined;
  }

  app.get("/", (c) => (currentConnection(c) ? c.redirect("/forms") : c.html(renderLanding())));

  app.post("/login", async (c) => {
    const data = await c.req.formData();
    const host = parseSpaceHost(String(data.get("space") ?? ""));
    if (!host) {
      return c.html(renderLanding("Backlog スペースの URL を確認してください（例：example.backlog.com）"), 400);
    }
    // The state ties the callback to this browser and remembers which space it was for.
    const state = randomId();
    await setSignedCookie(c, STATE_COOKIE, JSON.stringify({ state, host }), deps.cookieSecret, {
      ...cookie,
      maxAge: 10 * 60,
    });
    return c.redirect(oauth.authorizationUrl(host, state));
  });

  app.get("/oauth/callback", async (c) => {
    const saved = await getSignedCookie(c, deps.cookieSecret, STATE_COOKIE);
    deleteCookie(c, STATE_COOKIE, { path: "/" });
    const { code, state, error } = c.req.query();
    if (error) return c.html(renderLanding("ログインがキャンセルされました"), 400);
    const expected = saved ? (JSON.parse(saved) as { state: string; host: string }) : undefined;
    if (!expected || !code || state !== expected.state) {
      return c.html(renderLanding("ログインに失敗しました。もう一度お試しください。"), 400);
    }

    let connection: Connection;
    try {
      const tokens = await oauth.exchangeCode(expected.host, code);
      const me = await gateway.withToken(expected.host, tokens.accessToken).getMyself();
      connection = store.upsertConnection({
        spaceHost: expected.host,
        userId: me.id,
        userName: me.name,
        ...tokens,
      });
    } catch (err) {
      console.error("OAuth callback failed", err);
      return c.html(renderLanding("ログインに失敗しました。もう一度お試しください。"), 502);
    }
    const token = store.createSession(connection.id, SESSION_TTL_MS);
    setCookie(c, SESSION_COOKIE, token, { ...cookie, maxAge: SESSION_TTL_MS / 1000 });
    return c.redirect("/forms");
  });

  app.post("/logout", (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) store.deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.redirect("/");
  });

  // Everything below requires a session.
  const requireSession = async (c: Context<Env>, next: () => Promise<void>) => {
    const connection = currentConnection(c);
    if (!connection) return c.redirect("/");
    c.set("connection", connection);
    await next();
  };
  app.use("/forms", requireSession);
  app.use("/forms/*", requireSession);

  app.get("/forms", (c) => {
    const connection = c.get("connection");
    return c.html(renderFormList(connection, store.listForms(connection.id)));
  });

  // A three-step wizard driven by query parameters: project → issue type → settings.
  app.get("/forms/new", async (c) => {
    const connection = c.get("connection");
    const client = gateway.forConnection(connection);
    const projectId = toId(c.req.query("projectId"));
    const issueTypeId = toId(c.req.query("issueTypeId"));
    const notFound = () =>
      c.html(renderAdminMessage(connection, "見つかりません", "プロジェクトまたは課題種別が見つかりません。"), 404);

    if (projectId === undefined) {
      return c.html(renderPickProject(connection, await client.getProjects()));
    }
    if (issueTypeId === undefined) {
      const project = await client.findProject(projectId);
      if (!project || project.archived) return notFound();
      return c.html(renderPickIssueType(connection, project, await client.getIssueTypes(projectId)));
    }
    const target = await loadTarget(client, projectId, issueTypeId);
    if (!target) return notFound();
    return c.html(
      renderEditor({
        connection,
        ...target,
        values: { title: target.issueType.name, fieldIds: [], enabled: true },
      }),
    );
  });

  app.post("/forms", async (c) => {
    const connection = c.get("connection");
    const client = gateway.forConnection(connection);
    const data = await c.req.formData();
    const projectId = toId(data.get("projectId"));
    const issueTypeId = toId(data.get("issueTypeId"));
    // Re-check access: the ids come from the browser.
    const target =
      projectId !== undefined && issueTypeId !== undefined
        ? await loadTarget(client, projectId, issueTypeId)
        : null;
    if (!target) {
      return c.html(renderAdminMessage(connection, "見つかりません", "プロジェクトまたは課題種別が見つかりません。"), 404);
    }
    const { values, errors } = readEditor(data, target.fields);
    if (errors) return c.html(renderEditor({ connection, ...target, values, errors }), 400);

    const form = store.createForm({
      connectionId: connection.id,
      projectId: target.project.id,
      projectName: target.project.name,
      issueTypeId: target.issueType.id,
      ...values,
    });
    return c.redirect(`/forms/${form.id}`);
  });

  // Loads a form owned by the signed-in user, or undefined.
  function ownForm(c: Context<Env>) {
    const form = store.getForm(c.req.param("id") ?? "");
    return form && form.connectionId === c.get("connection").id ? form : undefined;
  }

  async function editorFor(c: Context<Env>): Promise<Omit<EditorView, "values"> | Response> {
    const connection = c.get("connection");
    const form = ownForm(c);
    if (!form) {
      return c.html(renderAdminMessage(connection, "見つかりません", "フォームが見つかりません。"), 404);
    }
    const target = await loadTarget(gateway.forConnection(connection), form.projectId, form.issueTypeId);
    if (!target) {
      return c.html(
        renderAdminMessage(
          connection,
          "フォームを表示できません",
          "このフォームのプロジェクトまたは課題種別が見つかりません。削除されたか、アクセスできなくなった可能性があります。",
        ),
        409,
      );
    }
    return { connection, ...target, form: { id: form.id, url: formUrl(form.id) } };
  }

  app.get("/forms/:id", async (c) => {
    const view = await editorFor(c);
    if (view instanceof Response) return view;
    const form = ownForm(c)!;
    return c.html(renderEditor({ ...view, values: form }));
  });

  app.post("/forms/:id", async (c) => {
    const view = await editorFor(c);
    if (view instanceof Response) return view;
    const { values, errors } = readEditor(await c.req.formData(), view.fields);
    if (errors) return c.html(renderEditor({ ...view, values, errors }), 400);
    store.updateForm(view.form!.id, values);
    schemas.invalidate(view.form!.id);
    return c.redirect(`/forms/${view.form!.id}`);
  });

  app.post("/forms/:id/delete", (c) => {
    const form = ownForm(c);
    if (form) {
      store.deleteForm(form.id);
      schemas.invalidate(form.id);
    }
    return c.redirect("/forms");
  });

  return app;
}
