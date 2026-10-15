import assert from "node:assert/strict";
import { test } from "node:test";
import { validate } from "../src/form/validate.ts";
import { fields } from "./fixtures.ts";

test("accepts valid input", () => {
  const result = validate(
    { summary: "件名", description: "", cf_10: "Nulab", cf_11: "5", cf_12: "2026-10-15", cf_13: ["100", "101"] },
    fields,
  );
  assert.equal(result.ok, true);
});

test("reports missing required fields", () => {
  const result = validate({ summary: "", cf_10: "" }, fields);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.summary);
  assert.ok(result.errors.cf_10);
  assert.equal(result.errors.cf_11, undefined);
});

test("enforces number and date ranges", () => {
  const result = validate(
    { summary: "x", cf_10: "a", cf_11: "1000", cf_12: "2025-12-31" },
    fields,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.ok(result.errors.cf_11);
  assert.ok(result.errors.cf_12);
});

test("rejects unknown list item ids", () => {
  const result = validate({ summary: "x", cf_10: "a", cf_13: ["999"] }, fields);
  assert.equal(result.ok, false);
});

test("accepts an other value when allowed", () => {
  const result = validate({ summary: "x", cf_10: "a", cf_13_other: "Android" }, fields);
  assert.equal(result.ok, true);
});
