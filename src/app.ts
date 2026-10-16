import { Hono } from "hono";
import type { BacklogClient } from "./backlog/client.ts";
import { createSchemaLoader } from "./backlog/schema.ts";
import { names, readInput } from "./form/input.ts";
import { renderDone, renderForm, renderMessage } from "./form/render.ts";
import { toIssueParams } from "./form/to-issue.ts";
import { validate } from "./form/validate.ts";
import { verifyTurnstile } from "./turnstile.ts";

export type AppDeps = {
  backlog: BacklogClient;
  turnstile: { siteKey: string; secretKey: string } | null;
};

export function createApp({ backlog, turnstile }: AppDeps) {
  const schemas = createSchemaLoader(backlog);
  const app = new Hono();
  const notFound = renderMessage("Not Found", "フォームが見つかりません");

  // A form is a marked issue type in a marked project: /f/{projectKey}/{issueTypeId}.
  function loadSchema(projectKey: string, issueTypeId: string, fresh = false) {
    if (!/^[A-Z0-9_]+$/i.test(projectKey) || !/^\d+$/.test(issueTypeId)) {
      return Promise.resolve(null);
    }
    return schemas.load(projectKey.toUpperCase(), Number(issueTypeId), { fresh });
  }

  app.get("/f/:projectKey/:issueTypeId", async (c) => {
    const schema = await loadSchema(c.req.param("projectKey"), c.req.param("issueTypeId"));
    if (!schema) return c.html(notFound, 404);
    return c.html(renderForm({ schema, turnstileSiteKey: turnstile?.siteKey }));
  });

  app.post("/f/:projectKey/:issueTypeId", async (c) => {
    // Validate against the latest definition in case Backlog settings changed
    // between rendering and submitting.
    const schema = await loadSchema(c.req.param("projectKey"), c.req.param("issueTypeId"), true);
    if (!schema) return c.html(notFound, 404);

    const formData = await c.req.formData();
    const input = readInput(formData, schema.fields);
    const view = { schema, input, turnstileSiteKey: turnstile?.siteKey };

    // Bots tend to fill every field; pretend success so they don't retry.
    if (input[names.honeypot] !== "") return c.html(renderDone(schema));

    if (turnstile) {
      const token = formData.get("cf-turnstile-response");
      const passed = await verifyTurnstile(
        turnstile.secretKey,
        typeof token === "string" ? token : "",
        c.req.header("CF-Connecting-IP"),
      );
      if (!passed) {
        return c.html(renderForm({ ...view, errors: { form: "認証に失敗しました。もう一度お試しください。" } }), 400);
      }
    }

    const result = validate(input, schema.fields);
    if (!result.ok) return c.html(renderForm({ ...view, errors: result.errors }), 400);

    try {
      await backlog.addIssue(toIssueParams(schema, result.submission));
    } catch (error) {
      console.error("Failed to create issue", error);
      return c.html(
        renderForm({ ...view, errors: { form: "送信に失敗しました。時間をおいて再度お試しください。" } }),
        502,
      );
    }
    return c.html(renderDone(schema));
  });

  app.onError((error, c) => {
    console.error(error);
    return c.html(renderMessage("Error", "エラーが発生しました"), 500);
  });

  return app;
}
