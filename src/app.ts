import { Hono } from "hono";
import type { BacklogClient } from "./backlog/client.ts";
import { createSchemaLoader } from "./backlog/schema.ts";
import { findForm } from "./forms.ts";
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

  app.get("/f/:slug", async (c) => {
    const form = findForm(c.req.param("slug"));
    if (!form) return c.html(renderMessage("Not Found", "フォームが見つかりません"), 404);
    const schema = await schemas.load(form);
    return c.html(renderForm({ form, schema, turnstileSiteKey: turnstile?.siteKey }));
  });

  app.post("/f/:slug", async (c) => {
    const form = findForm(c.req.param("slug"));
    if (!form) return c.html(renderMessage("Not Found", "フォームが見つかりません"), 404);

    const formData = await c.req.formData();
    // Validate against the latest definition in case Backlog settings changed
    // between rendering and submitting.
    const schema = await schemas.load(form, { fresh: true });
    const input = readInput(formData, schema.fields);
    const view = { form, schema, input, turnstileSiteKey: turnstile?.siteKey };

    // Bots tend to fill every field; pretend success so they don't retry.
    if (input[names.honeypot] !== "") return c.html(renderDone(form));

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
      await backlog.addIssue(toIssueParams(form, schema, result.submission));
    } catch (error) {
      console.error("Failed to create issue", error);
      return c.html(
        renderForm({ ...view, errors: { form: "送信に失敗しました。時間をおいて再度お試しください。" } }),
        502,
      );
    }
    return c.html(renderDone(form));
  });

  app.onError((error, c) => {
    console.error(error);
    return c.html(renderMessage("Error", "エラーが発生しました"), 500);
  });

  return app;
}
