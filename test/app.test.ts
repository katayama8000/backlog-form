import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.ts";
import type { BacklogClient } from "../src/backlog/client.ts";
import { forms } from "../src/forms.ts";
import { form, schema } from "./fixtures.ts";

forms.splice(0, forms.length, form);

function fakeBacklog() {
  const calls: URLSearchParams[] = [];
  const client: BacklogClient = {
    getProject: async () => schema.project,
    getIssueTypes: async () => [schema.issueType],
    getCustomFields: async () => schema.fields,
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
  return new Request("http://localhost/f/support", { method: "POST", body: data });
}

test("renders a form built from custom fields", async () => {
  const app = createApp({ backlog: fakeBacklog().client, turnstile: null });
  const res = await app.request("/f/support");
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /name="cf_10"/);
  assert.match(body, /type="checkbox" name="cf_13" value="100"/);
});

test("creates an issue with custom field params", async () => {
  const { client, calls } = fakeBacklog();
  const app = createApp({ backlog: client, turnstile: null });
  const res = await app.fetch(post({ summary: "件名", cf_10: "Nulab", cf_13: ["100", "101"] }));
  assert.equal(res.status, 200);
  const params = calls[0];
  assert.ok(params);
  assert.equal(params.get("projectId"), "1");
  assert.equal(params.get("issueTypeId"), "5");
  assert.equal(params.get("customField_10"), "Nulab");
  assert.deepEqual(params.getAll("customField_13"), ["100", "101"]);
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
  backlog.getCustomFields = async () => [{ ...schema.fields[0]!, name: "<script>x</script>" }];
  const app = createApp({ backlog, turnstile: null });
  const body = await (await app.request("/f/support")).text();
  assert.doesNotMatch(body, /<script>x<\/script>/);
});
