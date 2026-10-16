import assert from "node:assert/strict";
import { test } from "node:test";
import { ReauthRequiredError } from "../src/backlog/client.ts";
import { schema } from "./fixtures.ts";
import { post, setup } from "./helpers.ts";

function withForm(overrides: { fieldIds?: number[]; enabled?: boolean } = {}) {
  const ctx = setup();
  const form = ctx.store.createForm({
    connectionId: ctx.connection.id,
    projectId: 1,
    projectName: "Test",
    issueTypeId: 5,
    title: "お問い合わせ",
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
