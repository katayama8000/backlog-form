import assert from "node:assert/strict";
import { test } from "node:test";
import { Error as BacklogErrors } from "backlog-js";
import { ReauthRequiredError } from "../src/backlog/client.ts";
import type { CustomField } from "../src/backlog/types.ts";
import type { FormInput } from "../src/store.ts";
import { schema } from "./fixtures.ts";
import { post, setup } from "./helpers.ts";

function withForm(overrides: Partial<Pick<FormInput, "fieldIds" | "enabled" | "autoSummary" | "issueDefaults">> = {}) {
  const ctx = setup();
  const form = ctx.store.createForm({
    connectionId: ctx.connection.id,
    projectId: 1,
    projectName: "Test",
    issueTypeId: 5,
    issueTypeName: "お問い合わせ",
    title: "お問い合わせ",
    description: "",
    fieldIds: [11, 12, 13],
    enabled: true,
    ...overrides,
  });
  return { ...ctx, form, url: `/f/${form.id}` };
}

test("renders a form built from the selected custom fields", async () => {
  const { app, url } = withForm();
  const res = await app.request(url);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<h1>お問い合わせ<\/h1>/);
  assert.match(body, /name="cf_10"/);
  assert.match(body, /type="checkbox" name="cf_13" value="100"/);
});

test("hides unselected fields but always shows required ones", async () => {
  const { app, url } = withForm({ fieldIds: [12] });
  const body = await (await app.request(url)).text();
  assert.match(body, /name="cf_10"/); // required
  assert.match(body, /name="cf_12"/); // selected
  assert.doesNotMatch(body, /name="cf_11"|name="cf_13"/);
});

test("prefills inputs from the query string", async () => {
  const { app, url } = withForm();
  const query = new URLSearchParams({ summary: "件名です", cf_10: "<b>x</b>" });
  query.append("cf_13", "100");
  const body = await (await app.request(`${url}?${query}`)).text();
  assert.match(body, /name="summary" value="件名です"/);
  assert.match(body, /name="cf_10" value="&lt;b&gt;x&lt;\/b&gt;"/);
  assert.match(body, /type="checkbox" name="cf_13" value="100" checked/);
});

test("returns 404 for unknown and disabled forms", async () => {
  const { app } = withForm();
  assert.equal((await app.request("/f/nope")).status, 404);
  const disabled = withForm({ enabled: false });
  assert.equal((await disabled.app.request(disabled.url)).status, 404);
});

test("returns 503 when the project is no longer available", async () => {
  const { app, client, url } = withForm();
  client.findProject = async () => null;
  assert.equal((await app.request(url)).status, 503);
});

test("returns 503 when the owner must sign in again", async () => {
  const { app, client, url } = withForm();
  client.findProject = async () => {
    throw new ReauthRequiredError("revoked");
  };
  assert.equal((await app.request(url)).status, 503);
});

test("creates an issue with custom field params", async () => {
  const { app, issues, url } = withForm();
  const res = await app.fetch(post(url, { summary: "件名", cf_10: "Nulab", cf_13: ["100", "101"] }));
  assert.equal(res.status, 200);
  const params = issues[0];
  assert.ok(params);
  assert.equal(params.projectId, 1);
  assert.equal(params.issueTypeId, 5);
  assert.equal(params.priorityId, 3);
  assert.equal(params.customField_10, "Nulab");
  assert.deepEqual(params.customField_13, ["100", "101"]);
});

test("generates the summary when the form doesn't ask for one", async () => {
  const { app, issues, url } = withForm({ autoSummary: true });
  const body = await (await app.request(url)).text();
  assert.doesNotMatch(body, /name="summary"/);
  // A summary sent anyway is ignored.
  const res = await app.fetch(post(url, { summary: "無視される", cf_10: "Nulab" }));
  assert.equal(res.status, 200);
  assert.match(String(issues[0]?.summary), /^お問い合わせ（\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}）$/);
});

test("sets the form's issue defaults", async () => {
  const issueDefaults = { assigneeId: 2, priorityId: 2, categoryIds: [30, 31], milestoneIds: [40] };
  const { app, issues, url } = withForm({ issueDefaults });
  await app.fetch(post(url, { summary: "件名", cf_10: "Nulab" }));
  const params = issues[0];
  assert.ok(params);
  assert.equal(params.assigneeId, 2);
  assert.equal(params.priorityId, 2);
  assert.deepEqual(params.categoryId, [30, 31]);
  assert.deepEqual(params.milestoneId, [40]);
});

test("retries without defaults when Backlog rejects them", async () => {
  const issueDefaults = { assigneeId: 99, priorityId: null, categoryIds: [], milestoneIds: [] };
  const { app, client, issues, url } = withForm({ issueDefaults });
  const addIssue = client.addIssue;
  client.addIssue = async (params) => {
    if (params.assigneeId !== undefined) throw new BacklogErrors.BacklogApiError(new Response("", { status: 400 }));
    return addIssue(params);
  };
  const res = await app.fetch(post(url, { summary: "件名", cf_10: "Nulab" }));
  assert.equal(res.status, 200);
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.assigneeId, undefined);
  assert.equal(issues[0]?.priorityId, 3);
});

test("returns 400 and keeps input on validation errors", async () => {
  const { app, issues, url } = withForm();
  const res = await app.fetch(post(url, { summary: "件名", cf_10: "", cf_11: "abc" }));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /value="件名"/);
  assert.equal(issues.length, 0);
});

test("silently drops honeypot submissions", async () => {
  const { app, issues, url } = withForm();
  const res = await app.fetch(post(url, { summary: "spam", cf_10: "x", website: "http://spam" }));
  assert.equal(res.status, 200);
  assert.equal(issues.length, 0);
});

test("rejects cross-site posts", async () => {
  const { app, issues, url } = withForm();
  const req = post(url, { summary: "件名", cf_10: "x" });
  req.headers.set("origin", "https://evil.example");
  assert.equal((await app.fetch(req)).status, 403);
  assert.equal(issues.length, 0);
});

test("escapes values coming from Backlog", async () => {
  const { app, client, url } = withForm();
  client.getCustomFields = async () => [{ ...schema.fields[0]!, name: "<script>x</script>" }];
  const body = await (await app.request(url)).text();
  assert.doesNotMatch(body, /<script>x<\/script>/);
});

test("shows the form's description and a link to submit again", async () => {
  const ctx = withForm();
  ctx.store.updateForm(ctx.form.id, { ...ctx.form, description: "3 営業日以内に回答します" });
  assert.match(await (await ctx.app.request(ctx.url)).text(), /<p class="form-description">3 営業日以内に回答します<\/p>/);
  const done = await (await ctx.app.fetch(post(ctx.url, { summary: "件名", cf_10: "Nulab" }))).text();
  assert.match(done, new RegExp(`href="/f/${ctx.form.id}">続けて送信する`));
});

test("summarizes validation errors at the top", async () => {
  const { app, url } = withForm();
  const body = await (await app.fetch(post(url, { summary: "", cf_10: "" }))).text();
  assert.match(body, /入力内容を確認してください（2 件）/);
});

test("renders multiple lists as checkboxes", async () => {
  const { app, client, url } = withForm({ fieldIds: [13] });
  client.getCustomFields = async () => [{ ...schema.fields[3]!, typeId: 6 } as CustomField];
  const body = await (await app.request(url)).text();
  assert.match(body, /type="checkbox" name="cf_13" value="100"/);
  assert.doesNotMatch(body, /<select[^>]*multiple/);
});
