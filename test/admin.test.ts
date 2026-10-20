import assert from "node:assert/strict";
import { test } from "node:test";
import { post, setup } from "./helpers.ts";

// Pulls "name=value" pairs out of Set-Cookie headers for the next request.
function cookies(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

async function signIn(ctx: ReturnType<typeof setup>): Promise<string> {
  const login = await ctx.app.fetch(post("/login", { space: "example" }));
  const state = new URL(login.headers.get("location")!).searchParams.get("state");
  const res = await ctx.app.request(`/oauth/callback?code=abc&state=${state}`, {
    headers: { cookie: cookies(login) },
  });
  assert.equal(res.headers.get("location"), "/forms");
  return cookies(res).split("; ").find((c) => c.startsWith("session="))!;
}

test("login redirects to the space's authorization page", async () => {
  const { app } = setup();
  const res = await app.fetch(post("/login", { space: "https://example.backlog.com/dashboard" }));
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location")!, /^https:\/\/example\.backlog\.com\/OAuth2AccessRequest\.action/);
});

test("login rejects hosts outside Backlog", async () => {
  const { app } = setup();
  const res = await app.fetch(post("/login", { space: "evil.example.com" }));
  assert.equal(res.status, 400);
});

test("callback rejects a mismatched state", async () => {
  const { app } = setup();
  const login = await app.fetch(post("/login", { space: "example" }));
  const res = await app.request("/oauth/callback?code=abc&state=forged", {
    headers: { cookie: cookies(login) },
  });
  assert.equal(res.status, 400);
  assert.equal(res.headers.getSetCookie().some((c) => c.startsWith("session=")), false);
});

test("admin pages require a session", async () => {
  const { app } = setup();
  const res = await app.request("/forms");
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "/");
});

test("creates a form through the wizard", async () => {
  const ctx = setup();
  const session = await signIn(ctx);
  const get = (path: string) => ctx.app.request(path, { headers: { cookie: session } });

  assert.match(await (await get("/forms/new")).text(), /projectId=1/);
  const types = await (await get("/forms/new?projectId=1")).text();
  assert.match(types, /issueTypeId=5/);
  assert.match(types, /カスタム属性 \d+ 件/);
  assert.match(types, /https:\/\/example\.backlog\.com\/ListIssueType\.action\?projectId=1/);
  const editor = await (await get("/forms/new?projectId=1&issueTypeId=5")).text();
  assert.match(editor, /https:\/\/example\.backlog\.com\/ListAttribute\.action\?projectId=1/);
  // Required fields are pre-checked and can't be unchecked.
  assert.match(editor, /value="10" checked\s+disabled/);

  const res = await ctx.app.fetch(
    post("/forms", { projectId: "1", issueTypeId: "5", title: "お問い合わせ", fieldIds: ["12", "999"], enabled: "1" }, session),
  );
  assert.equal(res.status, 302);
  const [form] = ctx.store.listForms(ctx.connection.id);
  assert.ok(form);
  assert.equal(res.headers.get("location"), `/forms/${form.id}`);
  assert.deepEqual(form.fieldIds, [12]); // unknown ids are dropped
  assert.equal(form.enabled, true);
  assert.equal(form.autoSummary, false);
  assert.equal(form.lang, "ja");

  const page = await (await get(`/forms/${form.id}`)).text();
  assert.match(page, new RegExp(`http://localhost/f/${form.id}`));
});

test("rejects a form without a title", async () => {
  const ctx = setup();
  const session = await signIn(ctx);
  const res = await ctx.app.fetch(post("/forms", { projectId: "1", issueTypeId: "5", title: " " }, session));
  assert.equal(res.status, 400);
  assert.equal(ctx.store.listForms(ctx.connection.id).length, 0);
});

test("updates and deletes a form", async () => {
  const ctx = setup();
  const session = await signIn(ctx);
  const form = ctx.store.createForm({
    connectionId: ctx.connection.id,
    projectId: 1,
    projectName: "Test",
    issueTypeId: 5,
    issueTypeName: "お問い合わせ",
    title: "旧タイトル",
    description: "",
    fieldIds: [],
    enabled: true,
  });

  const editor = await (await ctx.app.request(`/forms/${form.id}`, { headers: { cookie: session } })).text();
  assert.match(editor, /<option value="3" selected>中<\/option>/); // priority defaults to Normal
  assert.match(editor, /name="milestoneIds" value="40"/);
  assert.doesNotMatch(editor, /name="milestoneIds" value="41"/); // archived

  await ctx.app.fetch(
    post(
      `/forms/${form.id}`,
      {
        title: "新タイトル",
        fieldIds: ["11"],
        autoSummary: "1",
        assigneeId: "2",
        priorityId: "4",
        categoryIds: ["31", "999"],
        milestoneIds: ["41"],
        lang: "en",
      },
      session,
    ),
  );
  const updated = ctx.store.getForm(form.id)!;
  assert.equal(updated.title, "新タイトル");
  assert.deepEqual(updated.fieldIds, [11]);
  assert.equal(updated.autoSummary, true);
  assert.equal(updated.lang, "en");
  // Unknown and archived ids are dropped.
  assert.deepEqual(updated.issueDefaults, { assigneeId: 2, priorityId: 4, categoryIds: [31], milestoneIds: [] });
  assert.equal(updated.enabled, false); // unchecked box

  await ctx.app.fetch(post(`/forms/${form.id}/delete`, {}, session));
  assert.equal(ctx.store.getForm(form.id), undefined);
});

test("shows a toast once after saving", async () => {
  const ctx = setup();
  const session = await signIn(ctx);
  const form = ctx.store.createForm({
    connectionId: ctx.connection.id,
    projectId: 1,
    projectName: "Test",
    issueTypeId: 5,
    issueTypeName: "お問い合わせ",
    title: "お問い合わせ",
    description: "",
    fieldIds: [],
    enabled: true,
  });

  const saved = await ctx.app.fetch(post(`/forms/${form.id}`, { title: "お問い合わせ" }, session));
  const flash = cookies(saved);
  const page = await ctx.app.request(`/forms/${form.id}`, { headers: { cookie: `${session}; ${flash}` } });
  assert.match(await page.text(), /class="toast" role="status">保存しました</);
  // The flash cookie is cleared, so a reload shows no toast.
  assert.ok(page.headers.getSetCookie().some((c) => /^flash=;.*Max-Age=0/i.test(c)));

  const forged = await ctx.app.request("/forms", { headers: { cookie: `${session}; flash=<b>x</b>` } });
  assert.doesNotMatch(await forged.text(), /class="toast"/);
});

test("users can't see or edit other users' forms", async () => {
  const ctx = setup();
  const other = ctx.store.upsertConnection({
    spaceHost: "example.backlog.com",
    userId: 2,
    userName: "Bob",
    accessToken: "b",
    refreshToken: "b",
    expiresAt: Date.now() + 3600_000,
  });
  const form = ctx.store.createForm({
    connectionId: other.id,
    projectId: 1,
    projectName: "Test",
    issueTypeId: 5,
    issueTypeName: "お問い合わせ",
    title: "Bob のフォーム",
    description: "",
    fieldIds: [],
    enabled: true,
  });
  const session = await signIn(ctx);
  assert.equal((await ctx.app.request(`/forms/${form.id}`, { headers: { cookie: session } })).status, 404);
  await ctx.app.fetch(post(`/forms/${form.id}/delete`, {}, session));
  assert.ok(ctx.store.getForm(form.id));
  assert.doesNotMatch(await (await ctx.app.request("/forms", { headers: { cookie: session } })).text(), /Bob のフォーム/);
});

test("logout ends the session", async () => {
  const ctx = setup();
  const session = await signIn(ctx);
  await ctx.app.fetch(post("/logout", {}, session));
  const res = await ctx.app.request("/forms", { headers: { cookie: session } });
  assert.equal(res.headers.get("location"), "/");
});

test("lists forms with their issue type and a copy button", async () => {
  const ctx = setup();
  const session = await signIn(ctx);
  const form = ctx.store.createForm({
    connectionId: ctx.connection.id,
    projectId: 1,
    projectName: "Test",
    issueTypeId: 5,
    issueTypeName: "お問い合わせ",
    title: "窓口",
    description: "",
    fieldIds: [],
    enabled: false,
  });
  const body = await (await ctx.app.request("/forms", { headers: { cookie: session } })).text();
  assert.match(body, /Test \/ お問い合わせ/);
  assert.doesNotMatch(body, /data-copy="/); // unpublished forms have nothing to share

  // The preview works even while the form is unpublished, but can't be submitted.
  const preview = await ctx.app.request(`/forms/${form.id}/preview`, { headers: { cookie: session } });
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /<button type="submit"[^>]* disabled>/);

  ctx.store.updateForm(form.id, { ...form, enabled: true });
  const published = await (await ctx.app.request("/forms", { headers: { cookie: session } })).text();
  assert.match(published, new RegExp(`data-copy="http://localhost/f/${form.id}"`));
});
