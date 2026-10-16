import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.ts";
import type { BacklogClient, IssueParams } from "../src/backlog/client.ts";
import type { CustomField } from "../src/backlog/types.ts";
import { schema } from "./fixtures.ts";

const url = "/f/test/5";

// Backlog returns marked names; the schema loader strips the marker.
const marked = (field: CustomField): CustomField => ({ ...field, name: `[form] ${field.name}` });

function fakeBacklog() {
  const calls: IssueParams[] = [];
  const client: BacklogClient = {
    findProject: async (key) => (key === "TEST" ? schema.project : null),
    getIssueTypes: async () => [schema.issueType, { id: 6, projectId: 1, name: "タスク" }],
    getCustomFields: async () => schema.fields.map(marked),
    addIssue: async (params) => {
      calls.push(params);
      return { id: 1, issueKey: "TEST-1" };
    },
  };
  return { client, calls };
}

function post(body: Record<string, string | string[]>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(body)) {
    for (const v of [value].flat()) data.append(key, v);
  }
  return new Request(`http://localhost${url}`, { method: "POST", body: data });
}

test("renders a form built from marked custom fields", async () => {
  const app = createApp({ backlog: fakeBacklog().client, turnstile: null });
  const res = await app.request(url);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /<h1>お問い合わせ<\/h1>/);
  assert.match(body, /name="cf_10"/);
  assert.match(body, /会社名/);
  assert.doesNotMatch(body, /\[form\]/);
  assert.match(body, /type="checkbox" name="cf_13" value="100"/);
});

test("hides custom fields without the marker", async () => {
  const backlog = fakeBacklog().client;
  backlog.getCustomFields = async () => [
    marked(schema.fields[0]!),
    { ...schema.fields[1]!, name: "社内メモ" },
  ];
  const app = createApp({ backlog, turnstile: null });
  const body = await (await app.request(url)).text();
  assert.match(body, /name="cf_10"/);
  assert.doesNotMatch(body, /cf_11|社内メモ/);
});

test("returns 404 unless both project and issue type are marked", async () => {
  const unmarkedProject = fakeBacklog().client;
  unmarkedProject.findProject = async () => ({ ...schema.project, name: "Test" });
  const app1 = createApp({ backlog: unmarkedProject, turnstile: null });
  assert.equal((await app1.request(url)).status, 404);

  const app2 = createApp({ backlog: fakeBacklog().client, turnstile: null });
  assert.equal((await app2.request("/f/test/6")).status, 404);
  assert.equal((await app2.request("/f/other/5")).status, 404);
  assert.equal((await app2.request("/f/test/abc")).status, 404);
});

test("returns 404 for archived projects", async () => {
  const backlog = fakeBacklog().client;
  backlog.findProject = async () => ({ ...schema.project, archived: true });
  const app = createApp({ backlog, turnstile: null });
  assert.equal((await app.request(url)).status, 404);
});

test("fails when a required field is not marked", async () => {
  const backlog = fakeBacklog().client;
  backlog.getCustomFields = async () => [{ ...schema.fields[0]!, name: "会社名", required: true }];
  const app = createApp({ backlog, turnstile: null });
  assert.equal((await app.request(url)).status, 500);
});

test("creates an issue with custom field params", async () => {
  const { client, calls } = fakeBacklog();
  const app = createApp({ backlog: client, turnstile: null });
  const res = await app.fetch(post({ summary: "件名", cf_10: "Nulab", cf_13: ["100", "101"] }));
  assert.equal(res.status, 200);
  const params = calls[0];
  assert.ok(params);
  assert.equal(params.projectId, 1);
  assert.equal(params.issueTypeId, 5);
  assert.equal(params.priorityId, 3);
  assert.equal(params.customField_10, "Nulab");
  assert.deepEqual(params.customField_13, ["100", "101"]);
});

test("returns 400 and keeps input on validation errors", async () => {
  const { client, calls } = fakeBacklog();
  const app = createApp({ backlog: client, turnstile: null });
  const res = await app.fetch(post({ summary: "件名", cf_10: "", cf_11: "abc" }));
  assert.equal(res.status, 400);
  assert.match(await res.text(), /value="件名"/);
  assert.equal(calls.length, 0);
});

test("silently drops honeypot submissions", async () => {
  const { client, calls } = fakeBacklog();
  const app = createApp({ backlog: client, turnstile: null });
  const res = await app.fetch(post({ summary: "spam", cf_10: "x", website: "http://spam" }));
  assert.equal(res.status, 200);
  assert.equal(calls.length, 0);
});

test("escapes values coming from Backlog", async () => {
  const backlog = fakeBacklog().client;
  backlog.getCustomFields = async () => [{ ...schema.fields[0]!, name: "[form] <script>x</script>" }];
  const app = createApp({ backlog, turnstile: null });
  const body = await (await app.request(url)).text();
  assert.doesNotMatch(body, /<script>x<\/script>/);
});
